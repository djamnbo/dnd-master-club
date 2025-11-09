import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useGameStore from '../store/useGameStore';
import LobbyScreen from '../components/LobbyScreen';
import GameScreen from '../components/GameScreen';

function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { joinRoom, cleanup, room, players, playerId, isLoading, user, isAuthLoading } = useGameStore();

  useEffect(() => {
    if (isAuthLoading) return;

    if (!user) {
      alert("Please sign in to join the room.");
      navigate('/');
      return;
    }

    if (roomId) {
      joinRoom(roomId).catch((error) => {
        console.error(error);
        alert("Failed to join room. Check the ID.");
        navigate('/');
      });
    }

    return () => { cleanup(); };
  }, [roomId, user, isAuthLoading, navigate]); // joinRoom, cleanup은 제외 (무한 루프 방지)

  if (isAuthLoading || isLoading || !room) {
    return (
      <div className="App-header">
        <h2>{isAuthLoading ? 'Checking Guild Pass...' : 'Traveling to Realm...'}</h2>
      </div>
    );
  }

  // 🚨 핵심 수정: 내 캐릭터가 플레이어 목록에 있는지 확인
  const amIMember = players.some(p => p.id === playerId);

  // 1. 내가 아직 멤버가 아니라면, 방 상태와 상관없이 무조건 로비(캐릭터 생성 화면)를 보여준다.
  if (!amIMember) {
    return <LobbyScreen room={room} players={players} myPlayerId={playerId} />;
  }

  // 2. 멤버라면, 방 상태에 따라 적절한 화면을 보여준다.
  if (room.gameStatus === 'lobby') {
    return <LobbyScreen room={room} players={players} myPlayerId={playerId} />;
  }

  if (room.gameStatus === 'playing') {
    return <GameScreen room={room} players={players} myPlayerId={playerId} />;
  }

  return <div>Unknown Game State</div>;
}

export default Room;
