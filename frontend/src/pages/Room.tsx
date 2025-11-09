import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useGameStore from '../store/useGameStore';
import LobbyScreen from '../components/LobbyScreen';
import GameScreen from '../components/GameScreen';

function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // 글로벌 상태 가져오기
  const {
    joinRoom,
    cleanup,
    room,
    players,
    playerId,
    isAuthLoading
  } = useGameStore();

  // 1. 방 접속 시도 (roomId가 변경될 때마다)
  useEffect(() => {
    if (roomId && !isAuthLoading) {
      joinRoom(roomId).catch((err) => {
        console.error("Join Room Error:", err);
        alert("Failed to join room. It might not exist or you don't have permission.");
        navigate('/'); // 실패 시 홈으로 이동
      });
    }

    // 언마운트 시 리스너 정리
    return () => {
      cleanup();
    };
  }, [roomId, isAuthLoading]); // 인증 로딩이 끝난 후 실행되도록 의존성 추가

  // 2. 로딩 상태 처리
  if (isAuthLoading || !room) {
    return (
      <div className="App-header">
        {/* 인증 확인 중이거나 방 정보를 불러오는 중 */}
        <h2>{isAuthLoading ? 'Checking Guild Pass...' : 'Traveling to Realm...'}</h2>
      </div>
    );
  }

  // 3. 내 캐릭터가 이 방에 존재하는지 확인
  const amIMember = players.some(p => p.id === playerId);

  // 4. 라우팅 로직
  // 내가 아직 멤버가 아니라면, 방 상태가 무엇이든 무조건 로비(캐릭터 생성 화면)를 보여준다.
  if (!amIMember) {
    return <LobbyScreen room={room} players={players} myPlayerId={playerId} />;
  }

  // 내가 멤버라면, 방의 상태에 따라 화면을 전환한다.
  if (room.gameStatus === 'lobby') {
    return <LobbyScreen room={room} players={players} myPlayerId={playerId} />;
  }

  if (room.gameStatus === 'playing') {
    return <GameScreen room={room} players={players} myPlayerId={playerId} />;
  }

  return <div>Unknown Game State</div>;
}

export default Room;
