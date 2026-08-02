import { GameState, Territory } from '../types';

interface BoardViewProps {
  gameState: GameState;
  onSelectTerritory?: (territoryId: string) => void;
}

const colorMap: Record<string, string> = {
  Red: '#ef4444',
  Orange: '#f59e0b',
  Yellow: '#facc15',
  Green: '#22c55e',
  Blue: '#3b82f6',
  Purple: '#8b5cf6',
};

export function BoardView({ gameState, onSelectTerritory }: BoardViewProps) {
  const currentPlayerId = gameState.turn.order[gameState.turn.currentPlayerIndex];

  const renderTerritory = (territory: Territory) => {
    const owner = gameState.players.find((player) => player.id === territory.owner);
    return (
      <button
        key={territory.id}
        className={`tile ${territory.isMine ? 'mine' : ''} ${territory.owner ? 'owned' : ''}`}
        style={{ borderColor: owner ? colorMap[owner.color] : undefined }}
        onClick={() => onSelectTerritory?.(territory.id)}
      >
        <span>{territory.isMine ? '⛏️' : territory.owner ? territory.level : ''}</span>
      </button>
    );
  };

  return (
    <div className="board-panel">
      <div className="board-toolbar">
        <strong>Current turn</strong>
        <span>{gameState.players.find((player) => player.id === currentPlayerId)?.name}</span>
      </div>
      <div className="board-grid">
        {gameState.board.territories.map(renderTerritory)}
      </div>
    </div>
  );
}
