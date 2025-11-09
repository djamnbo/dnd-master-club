import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
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

// 🚨 GM 프롬프트 강화: 시작 시 행동 강요 규칙 추가
const GM_JSON_SYSTEM_PROMPT = `[CRITICAL] YOU MUST RESPOND ONLY WITH VALID JSON.

You are a professional Dungeons & Dragons (5e) Game Master.
YOUR PLAYSTYLE: Aggressive, Fast-paced, Dice-heavy.
NEVER repeat the same description. ALWAYS drive the action forward.

JSON Format Structure:
{
  "narrative": "Vivid description...",
  "scene_image_prompt": "visual description...",
  // MANDATORY: ONE OF THESE TWO MUST BE PRESENT
  "roll_request": { "targetClassName": "...", "diceType": "d20", "reason": "..." },
  "choices": { "Fighter": ["..."], "Wizard": ["..."] }
}

STRICT RULES:
1. "narrative": Must end with a call to action.
2. MANDATORY: You MUST provide EITHER "roll_request" OR "choices".
3. FIRST TURN: You MUST provide immediate "choices" for ALL players to start the adventure. Do not just describe the scene.
4. AGGRESSIVELY use "roll_request" for uncertain actions.
5. If NO roll needed, provide AT LEAST 2 distinct "choices" for EVERY class.
`;

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
  isAction?: boolean;
  timestamp: Timestamp;
}

export interface RollRequest {
  playerId: string;
  playerName: string;
  diceType: string;
  reason: string;
}

export interface GameRoom {
  id: string;
  hostId: string;
  gameStatus: 'lobby' | 'playing';
  activeRoll?: RollRequest | null;
  currentScene?: string | null;
}

interface GameState {
  user: User | null;
  room: GameRoom | null;
  players: Player[];
  chatHistory: ChatMessage[];
  playerId: string | null;
  isLoading: boolean;
  isAiThinking: boolean;
  isAuthLoading: boolean;
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
  sendMessage: (prompt: string, isAction?: boolean) => Promise<void>;
  performRoll: (rollReq: RollRequest) => Promise<void>;
  cleanup: () => void;
  _triggerGmResponse: (messages: ChatMessage[]) => Promise<void>;
}

// --- Zustand 스토어 ---
const useGameStore = create<GameState & GameActions, [["zustand/devtools", never]]>(
  devtools(
    (set, get) => ({
      user: null,
      room: null,
      players: [],
      chatHistory: [],
      playerId: null,
      isLoading: false,
      isAiThinking: false,
      isAuthLoading: true,
      lastHandledMessageId: null,
      unsubscribeRoom: () => {},
      unsubscribePlayers: () => {},
      unsubscribeMessages: () => {},

      initAuth: () => {
        onAuthStateChanged(auth, (user) => {
          if (user) {
            set({ user, playerId: user.uid, isAuthLoading: false });
          } else {
            set({ user: null, playerId: null, isAuthLoading: false });
          }
        });
      },

      login: async () => {
        try { await signInWithPopup(auth, googleProvider); } catch (e) { alert("Login failed."); }
      },

      logout: async () => {
        try { await signOut(auth); get().cleanup(); } catch (e) { console.error(e); }
      },

      createRoom: async () => {
        const { playerId } = get();
        if (!playerId) throw new Error('Login required.');
        set({ isLoading: true });
        const roomDocRef = await addDoc(collection(db, 'rooms'), {
          hostId: playerId,
          gameStatus: 'lobby',
          createdAt: serverTimestamp(),
          currentScene: "ancient mysterious map, parchment, table top view, dnd mood"
        });
        set({ isLoading: false });
        return roomDocRef.id;
      },

      joinRoom: async (roomId: string) => {
        const { playerId, cleanup } = get();
        if (!playerId) return;
        cleanup();
        set({ isLoading: true });

        const roomRef = doc(db, 'rooms', roomId);
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
          set({ isLoading: false });
          throw new Error('Room not found');
        }

        const unsubRoom = onSnapshot(roomRef, (docSnap) => {
          if (docSnap.exists()) {
            set({ room: { id: docSnap.id, ...docSnap.data() } as GameRoom });
          } else {
            get().cleanup();
            alert("Room has been closed.");
            window.location.href = "/";
          }
        });

        const unsubPlayers = onSnapshot(collection(db, 'rooms', roomId, 'players'), (qSnap) => {
          set({ players: qSnap.docs.map(d => d.data() as Player) });
        });

        const q = query(collection(db, 'rooms', roomId, 'messages'), orderBy('timestamp', 'asc'));
        const unsubMessages = onSnapshot(q, (qSnap) => {
          const msgs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
          set({ chatHistory: msgs });

          const lastMsg = msgs[msgs.length - 1];
          const { room, playerId: myPid, isAiThinking, lastHandledMessageId } = get();

          if (
            lastMsg && lastMsg.role === 'user' && lastMsg.isAction &&
            room && !room.activeRoll && room.hostId === myPid &&
            !isAiThinking && lastMsg.id !== lastHandledMessageId
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
        if (players.length >= 4 && !players.find(p => p.id === playerId)) { return alert('Room is full.'); }

        const newPlayer: Player = {
          ...charData,
          id: playerId,
          isReady: false,
          choices: null,
          stats: {
            STR: Math.floor(Math.random() * 16) + 3, DEX: Math.floor(Math.random() * 16) + 3,
            CON: Math.floor(Math.random() * 16) + 3, INT: Math.floor(Math.random() * 16) + 3,
            WIS: Math.floor(Math.random() * 16) + 3, CHA: Math.floor(Math.random() * 16) + 3,
          }
        };
        await setDoc(doc(db, 'rooms', room.id, 'players', playerId), newPlayer);
        if (!players.find(p => p.id === playerId)) {
          await addDoc(collection(db, 'rooms', room.id, 'messages'), {
            role: 'system', content: `${newPlayer.name} (${newPlayer.characterClass}) has joined.`, timestamp: serverTimestamp()
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
        get()._triggerGmResponse([]);
      },

      sendMessage: async (prompt, isAction = false) => {
        const { room, playerId, players } = get();
        if (!room || !playerId || !prompt.trim()) return;
        const me = players.find(p => p.id === playerId);

        await addDoc(collection(db, 'rooms', room.id, 'messages'), {
          role: 'user',
          content: prompt,
          senderName: me?.name || 'Player',
          isAction: isAction,
          timestamp: serverTimestamp()
        });

        if (isAction) {
          await updateDoc(doc(db, 'rooms', room.id, 'players', playerId), { choices: null });
        }
      },

      performRoll: async (rollReq: RollRequest) => {
        const { room, playerId } = get();
        if (!room || !playerId) return;

        const max = parseInt(rollReq.diceType.replace('d', '')) || 20;
        const result = Math.floor(Math.random() * max) + 1;

        await addDoc(collection(db, 'rooms', room.id, 'messages'), {
          role: 'user',
          content: `[Dice Roll] ${rollReq.reason}: Rolled a ${result} (${rollReq.diceType})`,
          senderName: 'System',
          isAction: true,
          timestamp: serverTimestamp()
        });

        await updateDoc(doc(db, 'rooms', room.id), {
          activeRoll: deleteField()
        });
      },

      _triggerGmResponse: async (currentChatHistory: ChatMessage[]) => {
        const { room, players } = get();
        if (!room) return;
        set({ isAiThinking: true });

        try {
          const playerClasses = players.map(p => p.characterClass).filter(Boolean).join(', ');
          // 🚨 컨텍스트 프롬프트도 더 구체적으로 변경하여 다양한 스킬 체크 유도
          const contextPrompt = `Current party: [${playerClasses}]. 
      REMINDER: Request 'd20' rolls for ANY uncertain outcome (Searching, Lockpicking, Arcana checks, Persuasion, etc.). Do not just give information for free.`;

          let ollamaMessages = currentChatHistory
            .filter(msg => msg.role === 'user' || msg.role === 'assistant')
            .map(msg => ({ role: msg.role as 'user' | 'assistant' | 'system', content: msg.content }));

          if (ollamaMessages.length === 0) {
            ollamaMessages.push({ role: 'user', content: 'Start the game with an engaging hook.' });
          }

          // 🚨 핵심 수정: 마지막 메시지가 주사위 굴림인지 확인하고, 맞다면 강력한 해결 지시를 주입
          const lastUserMessage = ollamaMessages[ollamaMessages.length - 1];
          let instructionContent = `[GM INSTRUCTION]
        Current party: [${playerClasses}].
        Based on the last action, what happens next?
        CRITICAL: You MUST now provide either a 'roll_request' (if uncertain) OR 'choices' for ALL players to advance the story.`;

          if (lastUserMessage && lastUserMessage.role === 'user' && lastUserMessage.content.includes('[Dice Roll]')) {
            instructionContent = `[GM INSTRUCTION]
          CRITICAL: The player has ROLLED DICE as requested.
          READ the last '[Dice Roll]' message carefully.
          RESOLVE the outcome of this roll immediately based on D&D 5e rules (high is good, low is bad).
          ADVANCE the story based on this result. DO NOT repeat the previous scene description.`;
          }

          // 🚨 핵심 변경: AI에게 보내는 마지막 메시지로 '강제 명령'을 추가합니다.
          // 이렇게 하면 AI는 이전 대화 내용을 다 읽은 후, 마지막으로 이 명령을 보게 되어 따를 확률이 매우 높아집니다.
          ollamaMessages.push({
            role: 'system', // system 역할로 가장 마지막에 주입
            content: instructionContent
          });

          const result = await axios.post(OLLAMA_API_URL, {
            model: "llama3:8b",
            format: "json",
            messages: [
              { role: 'system', content: GM_JSON_SYSTEM_PROMPT },
              ...ollamaMessages
            ],
            stream: false
          });

          let gmResponse;
          const rawContent = result.data.message.content;
          try {
            gmResponse = JSON.parse(rawContent);
          } catch (e1) {
            console.warn("Initial JSON parse failed, trying regex extraction...");
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                gmResponse = JSON.parse(jsonMatch[0]);
              } catch (e2) {
                console.error("Regex JSON parse also failed:", e2);
                throw new Error("Unrecoverable JSON error");
              }
            } else {
              throw new Error("No JSON object found in response");
            }
          }

          // 🚨 2중 안전장치 강화: 주사위 요청이 없을 때, 선택지가 부족하면 강제로 채워넣음
          if (!gmResponse.roll_request) {
            if (!gmResponse.choices) gmResponse.choices = {};

            players.forEach(p => {
              const pClass = p.characterClass;
              if (!pClass) return;

              let choiceKey = Object.keys(gmResponse.choices).find(k => k.toLowerCase() === pClass.toLowerCase());
              if (!choiceKey) {
                choiceKey = pClass;
                gmResponse.choices[choiceKey] = [];
              }

              // 선택지가 2개 미만이면 강제로 기본 행동 추가
              const currentChoices = gmResponse.choices[choiceKey];
              if (currentChoices.length < 2) {
                const defaults = ["Observe surroundings", "Ready weapon", "Discuss with party", "Search area"];
                while (currentChoices.length < 2) {
                  const nextDefault = defaults.find(d => !currentChoices.includes(d)) || "Wait";
                  currentChoices.push(nextDefault);
                }
              }
            });
          }

          if (gmResponse.narrative) {
            await addDoc(collection(db, 'rooms', room.id, 'messages'), {
              role: 'assistant',
              content: gmResponse.narrative,
              senderName: 'GM',
              timestamp: serverTimestamp()
            });
          }

          const batch = writeBatch(db);
          const roomRef = doc(db, 'rooms', room.id);

          if (gmResponse.scene_image_prompt) {
            batch.update(roomRef, { currentScene: gmResponse.scene_image_prompt });
          }

          if (gmResponse.roll_request?.targetClassName) {
            const targetPlayer = players.find(p => p.characterClass === gmResponse.roll_request.targetClassName);
            if (targetPlayer) {
              batch.update(roomRef, {
                activeRoll: {
                  playerId: targetPlayer.id,
                  playerName: targetPlayer.name,
                  diceType: gmResponse.roll_request.diceType || 'd20',
                  reason: gmResponse.roll_request.reason || 'Check'
                }
              });
              players.forEach(p => {
                batch.update(doc(db, 'rooms', room.id, 'players', p.id), { choices: null });
              });
            }
          } else if (gmResponse.choices) {
            if (room.activeRoll) {
              batch.update(roomRef, { activeRoll: deleteField() });
            }
            players.forEach(player => {
              const playerClass = player.characterClass;
              if (!playerClass) return;
              const choiceKey = Object.keys(gmResponse.choices).find(
                key => key.toLowerCase() === playerClass.toLowerCase()
              );
              const choicesToUpdate = choiceKey ? gmResponse.choices[choiceKey] : ["Look around", "Wait"];
              const playerRef = doc(db, 'rooms', room.id, 'players', player.id);
              batch.update(playerRef, { choices: choicesToUpdate });
            });
          }

          await batch.commit();

        } catch (error) {
          console.error("GM Processing Error:", error);
          await addDoc(collection(db, 'rooms', room.id, 'messages'), {
            role: 'system',
            content: `(GM Error: The spirits are confused. Please try acting again.)`,
            timestamp: serverTimestamp()
          });
        } finally {
          set({ isAiThinking: false });
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
    })
  ),
);

export default useGameStore;
