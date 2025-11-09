import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/useGameStore';

function Home() {
  const [roomIdInput, setRoomIdInput] = useState('');
  const navigate = useNavigate();
  const { user, login, logout, createRoom, isLoading, isAuthLoading } = useGameStore();

  const handleCreateRoom = async () => {
    if (!user) return alert("Please sign in first.");
    try {
      const newRoomId = await createRoom();
      navigate(`/room/${newRoomId}`);
    } catch (error) {
      alert('Failed to create room.');
    }
  };

  const handleJoinRoom = () => {
    if (!user) return alert("Please sign in first.");
    if (roomIdInput.trim()) navigate(`/room/${roomIdInput.trim()}`);
  };

  if (isAuthLoading) return <div className="App-header"><h2>Checking Guild Membership...</h2></div>;

  return (
    <div className="App-header">
      <h1>D&D Master Club 🐲</h1>
      {!user ? (
        <div className="lobby-entrance">
          <h2>Welcome, Adventurer!</h2>
          <p style={{ color: '#a0a0a0', marginBottom: '2rem' }}>Sign in to join the realms.</p>
          <button onClick={login} className="google-login-btn"><span style={{ marginRight: '10px' }}>🛡️</span> Sign in with Google</button>
        </div>
      ) : (
        <div className="lobby-entrance">
          <div className="user-profile-header">
            <div className="user-info">
              {user.photoURL && <img src={user.photoURL} alt="Profile" className="user-avatar-small" />}
              <span>Hail, <strong>{user.displayName}</strong>!</span>
            </div>
            <button onClick={logout} className="logout-text-btn">Logout</button>
          </div>
          <hr />
          <h2>Create New World</h2>
          <button onClick={handleCreateRoom} disabled={isLoading}>{isLoading ? 'Creating...' : 'Create Room'}</button>
          <hr />
          <h2>Join Existing World</h2>
          <input type="text" placeholder="Enter Room ID..." value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()} />
          <button onClick={handleJoinRoom} disabled={isLoading || !roomIdInput}>Join Room</button>
        </div>
      )}
    </div>
  );
}

export default Home;
