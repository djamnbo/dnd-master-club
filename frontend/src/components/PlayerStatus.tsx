import { Player } from '../store/useGameStore';

function PlayerStatus({ player }: { player: Player }) {
  return (
    <div className="player-status-widget character-sheet">
      <div className="sheet-header">
        <img src={player.avatar} alt={player.name} className="character-portrait" />
        <div className="character-info">
          <div className="character-name">{player.name}</div>
          <div className="character-class">Level 1 {player.characterClass}</div>
        </div>
      </div>

      {/* (추후 확장 영역: HP, AC) */}
      <div className="combat-stats">
        <div className="stat-box">
          <span className="label">HP</span>
          <span className="value">10/10</span> {/* 임시 값 */}
        </div>
        <div className="stat-box">
          <span className="label">AC</span>
          <span className="value">12</span> {/* 임시 값 */}
        </div>
      </div>

      <div className="ability-scores">
        <div className="score-item">
          <span className="label">STR</span>
          <span className="value">{player.stats?.STR}</span>
        </div>
        <div className="score-item">
          <span className="label">DEX</span>
          <span className="value">{player.stats?.DEX}</span>
        </div>
        <div className="score-item">
          <span className="label">CON</span>
          <span className="value">{player.stats?.CON}</span>
        </div>
        <div className="score-item">
          <span className="label">INT</span>
          <span className="value">{player.stats?.INT}</span>
        </div>
        <div className="score-item">
          <span className="label">WIS</span>
          <span className="value">{player.stats?.WIS}</span>
        </div>
        <div className="score-item">
          <span className="label">CHA</span>
          <span className="value">{player.stats?.CHA}</span>
        </div>
      </div>
    </div>
  );
}

export default PlayerStatus;