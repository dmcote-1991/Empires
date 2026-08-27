import { useState } from 'react';
import {
  GameState,
  Move,
} from '../types';
import { getMarketplaceListings } from '../engine/game';

interface SidebarProps {
  gameState: GameState;
  onNewGame: () => void;
  onSaveGame: () => void;
  onLoadGame: () => void;
  onMarketplaceAction: (move: Move) => void;
}

export function Sidebar({
  gameState,
  onNewGame,
  onSaveGame,
  onLoadGame,
  onMarketplaceAction,
}: SidebarProps) {
  const [marketplaceExpanded, setMarketplaceExpanded] = useState(false);
  const [showSellWoodForm, setShowSellWoodForm] = useState(false);
  const [sellWoodQuantity, setSellWoodQuantity] = useState('');
  const [sellWoodPrice, setSellWoodPrice] = useState('');

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
            <button
              onClick={() =>
                setShowSellWoodForm(
                  (showing) => !showing
                )
              }
            >
              Sell Wood
            </button>

            {showSellWoodForm && (
              <div className="marketplace-sell-form">
                <div>
                  Available Wood:{' '}
                  {gameState.players.find(
                    (player) =>
                      player.id ===
                      gameState.turn.order[
                        gameState.turn.currentPlayerIndex
                      ]
                  )?.wood ?? 0}
                </div>

                <label>
                  Quantity:
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={sellWoodQuantity}
                    onChange={(event) =>
                      setSellWoodQuantity(
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Gold per unit:
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={sellWoodPrice}
                    onChange={(event) =>
                      setSellWoodPrice(
                        event.target.value
                      )
                    }
                  />
                </label>

                <button
                  onClick={() => {
                    const quantity =
                      Number(sellWoodQuantity);

                    const pricePerUnit =
                      Number(sellWoodPrice);

                    if (
                      !Number.isInteger(quantity) ||
                      quantity <= 0
                    ) {
                      return;
                    }

                    if (
                      !Number.isFinite(pricePerUnit) ||
                      pricePerUnit <= 0
                    ) {
                      return;
                    }

                    onMarketplaceAction({
                      type: 'listMarketplaceItem',
                      payload: {
                        itemType: 'wood',
                        quantity,
                        pricePerUnit,
                      },
                    });

                    setSellWoodQuantity('');
                    setSellWoodPrice('');
                    setShowSellWoodForm(false);
                  }}
                >
                  List on Marketplace
                </button>
              </div>
            )}

            {gameState.marketplace.length > 0 && (
              <div className="marketplace-listings">
                {getMarketplaceListings(gameState).map((listing) => {
                  const seller = gameState.players.find(
                    (player) => player.id === listing.sellerPlayerId
                  );

                  return (
                    <div
                      key={listing.id}
                      className="marketplace-listing"
                    >
                      <div>
                        <strong>
                          {listing.quantity} Wood
                        </strong>
                      </div>

                      <div>
                        {listing.pricePerUnit} Gold per unit
                      </div>

                      <div>
                        Seller: {seller?.name ?? 'Unknown'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(gameState.marketplace?.length ?? 0) === 0 &&
              !showSellWoodForm && (
                <div className="marketplace-empty">
                  Nothing is currently being sold.
                </div>
              )}
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
