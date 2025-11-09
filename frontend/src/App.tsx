import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import useGameStore from './store/useGameStore';
import Home from './pages/Home';
import Room from './pages/Room';
import './App.scss';

useGameStore.getState().initAuth();

function App() {
  return (
    <Router>
      <Routes>
        {/* 메인 로비 (방 만들기/참가) */}
        <Route path="/" element={<Home />} />

        {/* 특정 방 입장 (대기실 + 게임화면 통합 관리) */}
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </Router>
  );
}

export default App;