import { GameState, Territory } from '../types';
import { getAvailableActions } from '../engine/game';

interface BoardViewProps {
  gameState: GameState;
  selectedTerritoryId: string | null;
  availableActions: ReturnType<typeof getAvailableActions>;
  onSelectTerritory?: (territoryId: string) => void;
  onAction: (
    type: 'claim' | 'buy' | 'sell' | 'upgrade' | 'produce' | 'skip',
    territoryId: string,
    buyerPlayerId?: string
  ) => void;
  getSellBuyers: (territoryId: string) => {
    id: string;
    name: string;
    color: string;
    gold: number;
  }[];
}

const colorMap: Record<string, string> = {
  Red: '#ef4444',
  Orange: '#f59e0b',
  Yellow: '#facc15',
  Green: '#22c55e',
  Blue: '#3b82f6',
  Purple: '#8b5cf6',
};

export function BoardView({
  gameState,
  selectedTerritoryId,
  availableActions,
  onSelectTerritory,
  onAction,
  getSellBuyers,
}: BoardViewProps) {
  const currentPlayerId = gameState.turn.order[gameState.turn.currentPlayerIndex];

  const renderTerritory = (territory: Territory) => {
    const owner = gameState.players.find((player) => player.id === territory.owner);
    return (
      <div key={territory.id} className="tile-wrapper">
        <button
          className={`tile ${territory.biome} ${
            territory.isMine ? 'mine' : ''
          } ${territory.owner ? 'owned' : ''} ${
            selectedTerritoryId === territory.id ? 'selected' : ''
          }`}
          style={{
            borderColor: owner
              ? colorMap[owner.color]
              : undefined,
          }}
          onClick={() =>
            onSelectTerritory?.(territory.id)
          }
        >
          {territory.isMine
            ? '⛏️'
            : territory.owner
              ? territory.level
              : ''}
        </button>

        {selectedTerritoryId === territory.id && (
          <div className="action-menu">
            <div className="action-menu-title">
              Actions
            </div>

            {availableActions.map((action) =>
              action.type === 'sell' ? (
                <div
                  key={action.type}
                  className="action-group"
                >
                  {getSellBuyers(territory.id)
                    .filter((player) => {
                      const price =
                        gameState.economy.levelOneValue *
                        territory.level;

                      return player.gold >= price;
                    })
                    .map((player) => {
                      const price =
                        gameState.economy.levelOneValue *
                        territory.level;

                      return (
                        <button
                          key={`${action.type}-${player.id}`}
                          onClick={() =>
                            onAction(
                              'sell',
                              territory.id,
                              player.id
                            )
                          }
                        >
                          Sell to {player.name} (Price: {price}{' '}
                          Gold)
                        </button>
                      );
                    })}
                </div>
              ) : (
                <button
                  key={action.type}
                  onClick={() =>
                    onAction(
                      action.type,
                      territory.id
                    )
                  }
                >
                  {action.label}
                </button>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="board-panel">
      <div className="board-toolbar">
        <strong>Current turn</strong>
        <span>{gameState.players.find((player) => player.id === currentPlayerId)?.name}</span>
      </div>
      <div
        className="board-grid"
        style={{
          gridTemplateColumns: `repeat(${gameState.board.dimensions.cols}, minmax(0, 1fr))`,
        }}
      >
  {gameState.board.territories.map((territory) => {
          const index = Number(territory.id.slice(2)) - 1;
          const row = Math.floor(index / gameState.board.dimensions.cols);
          const col = index % gameState.board.dimensions.cols;

          return (
            <div
              key={territory.id}
              className="tile-wrapper"
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
              }}
            >
              {renderTerritory(territory)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
