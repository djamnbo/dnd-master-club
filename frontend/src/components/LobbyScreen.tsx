import { useState, useEffect } from 'react';
import useGameStore, { Player, GameRoom } from '../store/useGameStore';

interface Props {
  room: GameRoom;
  players: Player[];
  myPlayerId: string | null;
}

function LobbyScreen({ room, players, myPlayerId }: Props) {
  const { user, createCharacter, setReadyState, startGame, isLoading } = useGameStore();
  const [name, setName] = useState('');
  const [charClass, setCharClass] = useState('Fighter');

  const me = players.find(p => p.id === myPlayerId);
  const isHost = room.hostId === myPlayerId;
  const allReady = players.length > 0 && players.every(p => p.isReady);

  // 구글 로그인 정보로 이름 자동 채우기 (최초 1회)
  useEffect(() => {
    if (user?.displayName && !name) {
      setName(user.displayName.split(' ')[0]);
    }
  }, [user]);

  const handleCreate = async () => {
    if (!name.trim()) return alert('Please enter a character name');
    await createCharacter({
      name,
      characterClass: charClass,
      // 구글 프로필 사진이 있으면 그것을 아바타로 사용
      avatar: user?.photoURL || `https://placehold.co/64x64/EEE/31343C?text=${name.charAt(0).toUpperCase()}`
    });
  };

  // --- 1. 입장 전 (Newcomer) ---
  if (!me) {
    return (
      <div className="App-header lobby-mode newcomer">
        <h2>You are entering Room: <span className="highlight">{room.id.slice(0, 5)}...</span></h2>
        <p>Create your character to join this party!</p>

        <div className="newcomer-layout">
          <div className="character-creator-card">
            <h3>Who are you?</h3>
            {/* 유저 프로필 사진 미리보기 */}
            {user?.photoURL && (
              <div className="avatar-preview-container">
                <img src={user.photoURL} alt="Me" className="google-avatar-preview" />
                <span className="avatar-label">Using Google Avatar</span>
              </div>
            )}
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                placeholder="e.g., Aragorn"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={12}
              />
            </div>
            <div className="form-group">
              <label>Class</label>
              <select value={charClass} onChange={e => setCharClass(e.target.value)}>
                <option value="Fighter">⚔️ Fighter</option>
                <option value="Wizard">🔮 Wizard</option>
                <option value="Rogue">🗡️ Rogue</option>
                <option value="Cleric">🛡️ Cleric</option>
              </select>
            </div>
            <button
              className="join-button"
              onClick={handleCreate}
              disabled={isLoading || players.length >= 4}
            >
              {players.length >= 4 ? 'Party is Full' : 'Create & JOIN'}
            </button>
          </div>

          {/* 현재 파티원 현황 (참고용) */}
          <div className="current-party-preview">
            <h3>Current Party ({players.length}/4)</h3>
            {players.length === 0 ? (
              <p className="empty-party-msg">No adventurers yet. Be the first!</p>
            ) : (
              <div className="mini-player-list">
                {players.map(p => (
                  <div key={p.id} className="mini-player">
                    <img src={p.avatar} alt={p.name} />
                    <span>{p.name} ({p.characterClass})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- 2. 입장 후 (Member) ---
  return (
    <div className="App-header lobby-mode member">
      <div className="lobby-info">
        <h2>Adventure Lobby</h2>
        <div className="room-code-box">
          <span>Room ID:</span>
          <strong>{room.id}</strong>
          <button className="copy-btn" onClick={() => navigator.clipboard.writeText(room.id)}>Copy</button>
        </div>
      </div>

      <div className="player-list-section">
        <h3>Adventurers Assembled ({players.length}/4)</h3>
        <div className="player-grid big">
          {players.map(p => (
            <div key={p.id} className={`player-card ${p.isReady ? 'ready' : ''} ${p.id === myPlayerId ? 'me' : ''}`}>
              <div className="card-inner">
                <img src={p.avatar} alt={p.name} />
                <div className="player-info">
                  <strong className="name">{p.name} {p.id === room.hostId && '👑'}</strong>
                  <span className="class">{p.characterClass}</span>
                  {/* 내 캐릭터의 스탯 미리보기 */}
                  {p.id === myPlayerId && p.stats && (
                    <div className="my-stats-preview">
                      STR:{p.stats.STR} DEX:{p.stats.DEX} INT:{p.stats.INT}
                    </div>
                  )}
                </div>
              </div>
              <div className={`status-badge ${p.isReady ? 'ready' : 'waiting'}`}>
                {p.isReady ? 'READY' : 'WAITING'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lobby-actions fixed-bottom">
        {/* 일반 플레이어: 준비 버튼 */}
        <button
          className={`ready-toggle ${me.isReady ? 'cancel' : 'confirm'}`}
          onClick={() => setReadyState(!me.isReady)}
          disabled={isLoading}
        >
          {me.isReady ? 'NOT READY' : 'I AM READY!'}
        </button>

        {/* 방장 전용: 시작 버튼 */}
        {isHost && (
          <button
            className="start-game-btn"
            onClick={startGame}
            disabled={isLoading || !allReady || players.length === 0}
          >
            {players.length < 1
              ? 'Need Players...'
              : allReady
                ? '🚀 START ADVENTURE'
                : 'Waiting for ALL to be Ready...'}
          </button>
        )}
      </div>
    </div>
  );
}

export default LobbyScreen;
