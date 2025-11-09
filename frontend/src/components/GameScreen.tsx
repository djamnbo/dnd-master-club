import React, { useState, useEffect, useRef } from 'react';
import useGameStore, { Player, GameRoom } from '../store/useGameStore';
import PlayerStatus from './PlayerStatus';

interface Props {
  room: GameRoom;
  players: Player[];
  myPlayerId: string | null;
}

function GameScreen({ room, players, myPlayerId }: Props) {
  // 🚨 isAiThinking 가져오기
  const { chatHistory, isLoading, sendMessage, performRoll, isAiThinking } = useGameStore();
  const [prompt, setPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const me = players.find(p => p.id === myPlayerId);
  const activeRoll = room.activeRoll;
  const isMyRoll = activeRoll?.playerId === myPlayerId;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  // 🚨 일반 채팅 전송 (AI 트리거 X)
  const handleTalk = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(prompt, false); // isAction = false
    setPrompt('');
  };

  // 🚨 행동 선언 전송 (AI 트리거 O)
  const handleAct = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(prompt, true); // isAction = true
    setPrompt('');
  };

  const handleChoiceClick = (choiceText: string) => {
    sendMessage(choiceText, true); // 선택지는 당연히 Action
  };

  const handleRollClick = () => {
    if (activeRoll && isMyRoll) performRoll(activeRoll);
  }

  // const currentStageImage = "https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070&auto=format&fit=crop";
  // 🚨 핵심: 동적 이미지 URL 생성 (Pollinations AI 활용)
  // room.currentScene이 있으면 그것을 기반으로 생성, 없으면 기본 이미지 사용
  console.log('room.currentScene', room.currentScene)
  const baseImageUrl = room.currentScene
    ? `https://image.pollinations.ai/prompt/${encodeURIComponent(room.currentScene + ", fantasy digital art, detailed, atmospheric, 8k")}`
    : "https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070&auto=format&fit=crop";

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
          <div className="stage-image" style={{ backgroundImage: `url(${baseImageUrl})` }} />
          {/* 🚨 AI 생각 중 표시를 여기에 은은하게 오버레이 */}
          {isAiThinking && (
            <div className="ai-thinking-overlay">
              <span className="blinking">GM is weaving the story...</span>
            </div>
          )}
          <div className="stage-overlay">Dungeon Entrance</div>
        </div>

        <div className="session-log">
          {chatHistory.map((msg) => (
            <div key={msg.id} className={`message ${msg.role} ${msg.isAction ? 'action-msg' : ''}`}>
              <strong>{msg.senderName || 'System'}</strong>
              <pre>{msg.content}</pre>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* 🚨 선택지 영역 (내게 할당된 선택지가 있을 때만 표시) */}
        {!activeRoll && me?.choices && me.choices.length > 0 && !isAiThinking && (
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

        {/* 🚨 입력 폼 변경: 버튼 2개 */}
        <form className="input-form-dual">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Chat with party OR Declare custom action..."
            disabled={!!activeRoll}
          />
          <div className="button-group">
            {/* 일반 대화 버튼 */}
            <button className="talk-btn" onClick={handleTalk} disabled={!prompt.trim()}>
              💬 Talk
            </button>
            {/* 행동 선언 버튼 (AI 트리거) */}
            <button className="act-btn" onClick={handleAct} disabled={isAiThinking || !!activeRoll || !prompt.trim()}>
              ⚔️ Act
            </button>
          </div>
        </form>
      </main>

      <aside className="player-sidebar right">{players.slice(2, 4).map(p => <PlayerStatus key={p.id} player={p} />)}</aside>
    </div>
  );
}

export default GameScreen;
