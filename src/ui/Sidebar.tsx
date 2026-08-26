import { useState } from 'react';
import { GameState } from '../types';

interface SidebarProps {
  gameState: GameState;
  onNewGame: () => void;
  onSaveGame: () => void;
  onLoadGame: () => void;
}

export function Sidebar({
  gameState,
  onNewGame,
  onSaveGame,
  onLoadGame,
}: SidebarProps) {
  const [marketplaceExpanded, setMarketplaceExpanded] = useState(false);

  return (
    <aside className="sidebar">
      <h3>Empire Summary</h3>

      <div className="stat-list">
        <div>Total Gold: {gameState.economy.totalGold}</div>

        <div>
          Players Remaining:{' '}
          {gameState.players.filter((player) => !player.eliminated).length}
        </div>

        <div>Level-1 Value: {gameState.economy.baseTerritoryValue}</div>
      </div>

      {/* Marketplace */}
      <div className="marketplace">
        <button
          className="marketplace-header"
          onClick={() => setMarketplaceExpanded((expanded) => !expanded)}
        >
          <strong>Marketplace</strong>
          <span>{marketplaceExpanded ? '▼' : '▶'}</span>
        </button>

        {marketplaceExpanded && (
          <div className="marketplace-content">
            <div className="marketplace-empty">
              Nothing is currently being sold.
            </div>
          </div>
        )}
      </div>

      <div className="button-row">
        <button onClick={onSaveGame}>Save Game</button>
        <button onClick={onLoadGame}>Load Game</button>
        <button onClick={onNewGame}>New Game</button>
      </div>

      <div className="player-list">
        {gameState.players.map((player) => {
          const settlement = gameState.board.settlements.find(
            (settlement) =>
              settlement.id === player.capitalSettlementId
          );

          return (
            <div key={player.id} className="player-card">
              <strong>{player.name}</strong>

              <div>Color: {player.color}</div>

              <div>Gold: {player.gold}</div>

              <div>Wood: {player.wood}</div>

              <div>
                Territories: {player.territoryIds.length}
              </div>

              {settlement && (
                <>
                  <div>Settlement: {settlement.name}</div>

                  <div>
                    Population: {settlement.population}
                  </div>
                </>
              )}

              <div>
                Mines:{' '}
                {
                  gameState.board.territories.filter(
                    (territory) =>
                      territory.owner === player.id &&
                      territory.isMine
                  ).length
                }
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
