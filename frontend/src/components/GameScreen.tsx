import React, { useState, useEffect, useRef } from 'react';
import useGameStore, { Player, GameRoom } from '../store/useGameStore';
import PlayerStatus from './PlayerStatus';

interface Props {
  room: GameRoom;
  players: Player[];
  myPlayerId: string | null;
}

function GameScreen({ room, players, myPlayerId }: Props) {
  // 🚨 room prop을 추가로 받아서 activeRoll 상태를 확인합니다.
  const { chatHistory, isLoading, sendMessage, performRoll } = useGameStore();
  const [prompt, setPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const me = players.find(p => p.id === myPlayerId);
  // 🚨 현재 주사위 요청이 있는지, 그리고 그 대상이 나인지 확인
  const activeRoll = room.activeRoll;
  const isMyRoll = activeRoll?.playerId === myPlayerId;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(prompt);
    setPrompt('');
  };

  const handleChoiceClick = (choiceText: string) => {
    sendMessage(choiceText, true);
  };

  // 🚨 주사위 굴리기 핸들러
  const handleRollClick = () => {
    if (activeRoll && isMyRoll) {
      performRoll(activeRoll);
    }
  }

  // 임시 배경 이미지 (추후 GM이 변경 가능하게 확장 가능)
  const currentStageImage = "https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070&auto=format&fit=crop";

  return (
    <div className="game-layout">
      {/* 🚨 주사위 굴림 오버레이 */}
      {activeRoll && (
        <div className="roll-overlay">
          <div className="roll-card">
            <h3>🎲 Fate Awaits...</h3>
            <p className="reason">{activeRoll.reason}</p>

            {isMyRoll ? (
              <button className="roll-button" onClick={handleRollClick}>
                ROLL {activeRoll.diceType.toUpperCase()}
              </button>
            ) : (
              <div className="waiting-message">
                <span className="blinking">Waiting for <strong>{activeRoll.playerName}</strong> to roll...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <aside className="player-sidebar left">{players.slice(0, 2).map(p => <PlayerStatus key={p.id} player={p} />)}</aside>

      <main className="game-main">
        <div className="stage-viewport">
          <div className="stage-image" style={{ backgroundImage: `url(${currentStageImage})` }} />
          <div className="stage-overlay">Dungeon Entrance</div>
        </div>

        <div className="session-log">
          {chatHistory.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <strong>{msg.senderName || 'System'}</strong><pre>{msg.content}</pre>
            </div>
          ))}
          {isLoading && <div className="message assistant"><strong>GM</strong><span className="blinking"> is thinking...</span></div>}
          <div ref={messagesEndRef} />
        </div>

        {/* 선택지 영역 (주사위 굴림 중에는 숨김) */}
        {!activeRoll && me?.choices && me.choices.length > 0 && !isLoading && (
          <div className="choices-container">
            <p>What will <strong>{me.name}</strong> do?</p>
            <div className="choices-grid">
              {me.choices.map((choice, idx) => (
                <button key={idx} className="choice-btn" onClick={() => handleChoiceClick(choice)}>
                  {choice}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="input-form">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isLoading ? "Waiting..." : "Action..."}
            disabled={isLoading || !!activeRoll} // 주사위 중엔 입력 비활성화
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }}}
          />
          <button type="submit" disabled={isLoading || !prompt.trim() || !!activeRoll}>Send</button>
        </form>
      </main>

      <aside className="player-sidebar right">{players.slice(2, 4).map(p => <PlayerStatus key={p.id} player={p} />)}</aside>
    </div>
  );
}

export default GameScreen;
