import { create } from 'zustand';
import axios from 'axios';
import { db, auth, googleProvider } from '../lib/firebaseConfig';
import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  onSnapshot,
  orderBy,
  serverTimestamp,
  updateDoc,
  Timestamp,
  writeBatch,
  deleteField
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';

const OLLAMA_API_URL = "/api/chat";

// 🚨 GM 프롬프트 대폭 수정: 주사위 요청(roll_request) 규칙 추가
const GM_JSON_SYSTEM_PROMPT = `You are a professional Dungeons & Dragons (5e) Game Master.
Your role is to manage the game for 4 players.
You MUST ONLY respond in standard JSON format.

JSON Format Structure:
{
  "narrative": "Description of the scene...",
  // OPTIONAL: Use ONLY when a player's action outcome is uncertain (attacks, skill checks).
  "roll_request": {
    "targetClassName": "Class Name of the player who needs to roll",
    "diceType": "d20", // e.g., "d20", "d6", "d8"
    "reason": "Reason for the roll (e.g., Attack Goblin, Perception Check)"
  },
  // OPTIONAL: Provide choices only if NO roll is currently pending.
  "choices": {
    "ClassName": ["Choice 1", "Choice 2"]
  }
}

Rules:
1. If a roll is needed, provide "narrative" AND "roll_request", but NO "choices".
2. If no roll is needed, provide "narrative" AND "choices".
3. "narrative" must always be in English.
`;

// --- 타입 정의 ---
export interface Player {
  id: string;
  name: string;
  avatar?: string;
  characterClass?: string;
  stats?: Record<string, number>;
  isReady: boolean;
  choices?: string[] | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  senderName?: string;
  timestamp: Timestamp;
}

// 🚨 주사위 요청 타입 정의
export interface RollRequest {
  playerId: string;      // 굴려야 하는 사람의 ID
  playerName: string;    // 굴려야 하는 사람의 이름
  diceType: string;      // 굴릴 주사위 (예: d20)
  reason: string;        // 굴리는 이유
}

export interface GameRoom {
  id: string;
  hostId: string;
  gameStatus: 'lobby' | 'playing';
  activeRoll?: RollRequest | null; // 🚨 현재 진행 중인 주사위 요청
}

interface GameState {
  user: User | null;       // Firebase 유저 객체
  room: GameRoom | null;
  players: Player[];
  chatHistory: ChatMessage[];
  playerId: string | null; // user.uid와 동일하게 유지됨
  isLoading: boolean;
  isAuthLoading: boolean;  // 초기 인증 로딩 상태
  lastHandledMessageId: string | null;
  unsubscribeRoom: () => void;
  unsubscribePlayers: () => void;
  unsubscribeMessages: () => void;
}

interface GameActions {
  initAuth: () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  createRoom: () => Promise<string>;
  joinRoom: (roomId: string) => Promise<void>;
  createCharacter: (charData: Omit<Player, 'id' | 'isReady' | 'choices'>) => Promise<void>;
  setReadyState: (isReady: boolean) => Promise<void>;
  startGame: () => Promise<void>;
  sendMessage: (prompt: string, isChoice?: boolean) => Promise<void>;
  performRoll: (rollReq: RollRequest) => Promise<void>; // 🚨 주사위 굴리기 액션 추가
  cleanup: () => void;
  _triggerGmResponse: (messages: ChatMessage[]) => Promise<void>;
}

// --- Zustand 스토어 ---
const useGameStore = create<GameState & GameActions>((set, get) => ({
  user: null,
  room: null,
  players: [],
  chatHistory: [],
  playerId: null,
  isLoading: false,
  isAuthLoading: true,
  lastHandledMessageId: null,
  unsubscribeRoom: () => {},
  unsubscribePlayers: () => {},
  unsubscribeMessages: () => {},

  // --- 인증 초기화 (앱 시작 시 1회 호출) ---
  initAuth: () => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        set({ user, playerId: user.uid, isAuthLoading: false });
      } else {
        set({ user: null, playerId: null, isAuthLoading: false });
      }
    });
  },

  // --- 로그인 액션 ---
  login: async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed. Please try again.");
    }
  },

  // --- 로그아웃 액션 ---
  logout: async () => {
    try {
      await signOut(auth);
      get().cleanup(); // 로그아웃 시 스토어 데이터 정리
    } catch (error) {
      console.error("Logout failed:", error);
    }
  },

  createRoom: async () => {
    const { playerId } = get();
    if (!playerId) throw new Error('Login required.');

    set({ isLoading: true });
    const roomDocRef = await addDoc(collection(db, 'rooms'), {
      hostId: playerId,
      gameStatus: 'lobby',
      createdAt: serverTimestamp()
    });
    set({ isLoading: false });
    return roomDocRef.id;
  },

  joinRoom: async (roomId: string) => {
    const { playerId, cleanup } = get();
    if (!playerId) return; // 비로그인 상태면 무시

    cleanup(); // 기존 방 리스너 정리
    set({ isLoading: true });

    const roomRef = doc(db, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
      set({ isLoading: false });
      throw new Error('Room not found');
    }

    // 방 상태 구독
    const unsubRoom = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        set({ room: { id: docSnap.id, ...docSnap.data() } as GameRoom });
      } else {
        get().cleanup();
        alert("Room has been closed.");
        window.location.href = "/";
      }
    });

    // 플레이어 목록 구독
    const unsubPlayers = onSnapshot(collection(db, 'rooms', roomId, 'players'), (qSnap) => {
      set({ players: qSnap.docs.map(d => d.data() as Player) });
    });

    // 채팅 메시지 구독
    const q = query(collection(db, 'rooms', roomId, 'messages'), orderBy('timestamp', 'asc'));
    const unsubMessages = onSnapshot(q, (qSnap) => {
      const msgs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
      set({ chatHistory: msgs });

      const lastMsg = msgs[msgs.length - 1];
      const { room, playerId: myPid, isLoading, lastHandledMessageId } = get();

      // 방장에게만 GM 호출 권한 부여 (중복 호출 방지 조건 포함)
      // 🚨 조건 추가: 현재 진행 중인 주사위 요청(activeRoll)이 없을 때만 AI 호출
      if (
        lastMsg &&
        lastMsg.role === 'user' &&
        room &&
        !room.activeRoll && // 주사위 굴리는 중엔 AI 부르지 않음
        room.hostId === myPid &&
        !isLoading &&
        lastMsg.id !== lastHandledMessageId
      ) {
        set({ lastHandledMessageId: lastMsg.id });
        get()._triggerGmResponse(msgs);
      }
    });

    set({ isLoading: false, unsubscribeRoom: unsubRoom, unsubscribePlayers: unsubPlayers, unsubscribeMessages: unsubMessages });
  },

  createCharacter: async (charData) => {
    const { room, playerId, players } = get();
    if (!room || !playerId) return;
    if (players.length >= 4 && !players.find(p => p.id === playerId)) {
      alert('Room is full (max 4 players).');
      return;
    }

    const newPlayer: Player = {
      ...charData,
      id: playerId,
      isReady: false,
      // 간단한 D&D 스탯 랜덤 생성 예시
      stats: {
        STR: Math.floor(Math.random() * 16) + 3, DEX: Math.floor(Math.random() * 16) + 3,
        CON: Math.floor(Math.random() * 16) + 3, INT: Math.floor(Math.random() * 16) + 3,
        WIS: Math.floor(Math.random() * 16) + 3, CHA: Math.floor(Math.random() * 16) + 3,
      }
    };
    await setDoc(doc(db, 'rooms', room.id, 'players', playerId), newPlayer);

    // 최초 입장 시 시스템 메시지 전송
    if (!players.find(p => p.id === playerId)) {
      await addDoc(collection(db, 'rooms', room.id, 'messages'), {
        role: 'system',
        content: `${newPlayer.name} has joined the party.`,
        timestamp: serverTimestamp()
      });
    }
  },

  setReadyState: async (isReady) => {
    const { room, playerId } = get();
    if (!room || !playerId) return;
    await updateDoc(doc(db, 'rooms', room.id, 'players', playerId), { isReady });
  },

  startGame: async () => {
    const { room } = get();
    if (!room) return;
    await updateDoc(doc(db, 'rooms', room.id), { gameStatus: 'playing' });
    // 게임 시작 시 빈 배열을 보내 초기 오프닝 멘트 유도
    get()._triggerGmResponse([]);
  },

  sendMessage: async (prompt) => {
    const { room, playerId, players } = get();
    if (!room || !playerId || !prompt.trim()) return;
    const me = players.find(p => p.id === playerId);
    await addDoc(collection(db, 'rooms', room.id, 'messages'), {
      role: 'user',
      content: prompt,
      senderName: me?.name || 'Player',
      senderId: playerId,
      timestamp: serverTimestamp()
    });
  },

  // 🚨 주사위 굴리기 액션
  performRoll: async (rollReq: RollRequest) => {
    const { room, playerId } = get();
    if (!room || !playerId) return;

    // 1. 주사위 굴림 (간단하게 d20 가정, 추후 파싱 로직 추가 가능)
    // 예: 'd20' -> 1~20 랜덤
    const max = parseInt(rollReq.diceType.replace('d', '')) || 20;
    const result = Math.floor(Math.random() * max) + 1;

    // 2. 결과를 시스템 메시지로 전송 (이것이 다시 _triggerGmResponse를 유발하여 스토리가 진행됨)
    await addDoc(collection(db, 'rooms', room.id, 'messages'), {
      role: 'user', // 'user'로 보내서 GM이 이 결과에 반응하도록 유도
      content: `[Dice Roll] ${rollReq.reason}: Rolled a ${result} (${rollReq.diceType})`,
      senderName: 'System',
      timestamp: serverTimestamp()
    });

    // 3. 활성 주사위 요청 제거
    await updateDoc(doc(db, 'rooms', room.id), {
      activeRoll: deleteField()
    });
  },

  _triggerGmResponse: async (currentChatHistory: ChatMessage[]) => {
    const { room, players } = get();
    if (!room) return;
    set({ isLoading: true });

    try {
      const playerClasses = players.map(p => p.characterClass).filter(Boolean).join(', ');
      const contextPrompt = `Current party classes: [${playerClasses}]. Provide choices for these EXACT classes in JSON.`;

      let ollamaMessages = currentChatHistory
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }));

      if (ollamaMessages.length === 0) {
        ollamaMessages.push({ role: 'user', content: 'Start the game intro.' });
      }

      // 🚨 JSON 포맷 강제
      const result = await axios.post(OLLAMA_API_URL, {
        model: "llama3:8b",
        format: "json",
        messages: [
          { role: 'system', content: GM_JSON_SYSTEM_PROMPT },
          { role: 'system', content: contextPrompt },
          ...ollamaMessages
        ],
        stream: false
      });

      // 🚨 JSON 파싱 및 분배
      let gmResponse;
      try {
        gmResponse = JSON.parse(result.data.message.content);
      } catch (e) {
        console.error("JSON Parsing Failed:", result.data.message.content);
        // JSON 파싱 실패 시 일반 텍스트로라도 보여주기 위한 폴백
        gmResponse = { narrative: result.data.message.content };
      }

      if (gmResponse.narrative) {
        await addDoc(collection(db, 'rooms', room.id, 'messages'), {
          role: 'assistant',
          content: gmResponse.narrative,
          senderName: 'GM',
          timestamp: serverTimestamp()
        });
      }

      if (gmResponse.choices) {
        const batch = writeBatch(db);
        players.forEach(player => {
          if (player.characterClass && gmResponse.choices[player.characterClass]) {
            const playerRef = doc(db, 'rooms', room.id, 'players', player.id);
            batch.update(playerRef, { choices: gmResponse.choices[player.characterClass] });
          }
        });
        await batch.commit();
      }

    } catch (error) {
      console.error("GM Error:", error);
      await addDoc(collection(db, 'rooms', room.id, 'messages'), {
        role: 'system', content: '(GM Error: Failed to generate valid response)', timestamp: serverTimestamp()
      });
    } finally {
      set({ isLoading: false });
    }
  },

  // 스토어 상태 초기화 및 리스너 해제
  cleanup: () => {
    get().unsubscribeRoom();
    get().unsubscribePlayers();
    get().unsubscribeMessages();
    set({
      unsubscribeRoom: () => {},
      unsubscribePlayers: () => {},
      unsubscribeMessages: () => {},
      room: null,
      players: [],
      chatHistory: []
    });
  },
}));

export default useGameStore;
