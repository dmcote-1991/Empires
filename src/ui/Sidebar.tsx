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
  const [showSellWaterForm, setShowSellWaterForm] = useState(false);

  const [sellWoodQuantity, setSellWoodQuantity] = useState('');
  const [sellWoodPrice, setSellWoodPrice] = useState('');

  const [sellWaterQuantity, setSellWaterQuantity] = useState('');
  const [sellWaterPrice, setSellWaterPrice] = useState('');

  const [buyingListingId, setBuyingListingId] = useState<string | null>(null);
  const [buyQuantityInput, setBuyQuantityInput] = useState('');

  const marketplaceListings = getMarketplaceListings(gameState);

  const currentPlayer =
    gameState.players[
      gameState.turn.currentPlayerIndex
    ];

  const buyingListing = marketplaceListings.find(
    (listing) => listing.id === buyingListingId
  );

  const buyQuantity = Number(buyQuantityInput);

  const buyTotalCost =
    buyingListing
      ? buyQuantity * buyingListing.pricePerUnit
      : 0;

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
          <span>Marketplace</span>
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

            <button
              onClick={() =>
                setShowSellWaterForm(
                  (showing) => !showing
                )
              }
            >
              Sell Water
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

            {showSellWaterForm && (
              <div className="marketplace-sell-form">
                <div>
                  Available Water:{' '}
                  {gameState.players.find(
                    (player) =>
                      player.id ===
                      gameState.turn.order[
                        gameState.turn.currentPlayerIndex
                      ]
                  )?.water ?? 0}
                </div>

                <label>
                  Quantity:
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={sellWaterQuantity}
                    onChange={(event) =>
                      setSellWaterQuantity(
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
                    value={sellWaterPrice}
                    onChange={(event) =>
                      setSellWaterPrice(
                        event.target.value
                      )
                    }
                  />
                </label>

                <button
                  onClick={() => {
                    const quantity =
                      Number(sellWaterQuantity);

                    const pricePerUnit =
                      Number(sellWaterPrice);

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
                        itemType: 'water',
                        quantity,
                        pricePerUnit,
                      },
                    });

                    setSellWaterQuantity('');
                    setSellWaterPrice('');
                    setShowSellWaterForm(false);
                  }}
                >
                  List on Marketplace
                </button>
              </div>
            )}

            {marketplaceListings.length > 0 && (
              <div className="marketplace-listings">
                {marketplaceListings.map((listing) => {
                  const seller = gameState.players.find(
                    (player) => player.id === listing.sellerPlayerId
                  );

                  const isOwnListing =
                    listing.sellerPlayerId === currentPlayer.id;

                  const firstBuyableListing = marketplaceListings.find(
                    (entry) =>
                      entry.sellerPlayerId !== currentPlayer.id
                  );

                  const isAvailable =
                    listing.id === firstBuyableListing?.id;

                  const isBuying =
                    buyingListingId === listing.id;

                  return (
                    <div
                      key={listing.id}
                      className={`marketplace-listing ${
                        isAvailable
                          ? 'marketplace-listing-available'
                          : 'marketplace-listing-waiting'
                      } ${
                        isBuying
                          ? 'marketplace-listing-selected'
                          : ''
                      }`}
                      onClick={() => {
                        if (
                          isAvailable &&
                          !isOwnListing &&
                          !isBuying
                        ) {
                          setBuyingListingId(listing.id);
                          setBuyQuantityInput('');
                        }
                      }}
                    >
                      <div className="marketplace-listing-status">
                        {isAvailable
                          ? isOwnListing
                            ? 'YOUR LISTING'
                            : 'AVAILABLE TO BUY'
                          : 'WAITING'}
                      </div>

                      <div className="marketplace-listing-main">
                        <strong>
                          {listing.quantity}{' '}
                          {listing.item === 'water' ? 'Water' : 'Wood'}
                        </strong>

                        <span className="marketplace-price">
                          {listing.pricePerUnit} Gold /{' '}
                          {listing.item === 'water' ? 'Water' : 'Wood'}
                        </span>
                      </div>

                      <div className="marketplace-listing-seller">
                        Seller: {seller?.name ?? 'Unknown'}
                      </div>

                      {isBuying && (
                        <div
                          className="marketplace-buy-form"
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                        >
                          <div className="marketplace-buy-available">
                            Available: {listing.quantity}{' '}
                            {listing.item === 'water' ? 'Water' : 'Wood'}
                          </div>

                          <label>
                            Quantity:
                            <input
                              type="number"
                              min="1"
                              max={listing.quantity}
                              step="1"
                              value={buyQuantityInput}
                              onChange={(event) =>
                                setBuyQuantityInput(
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <div className="marketplace-buy-total">
                            <span>Total Cost:</span>
                            <strong>
                              {buyTotalCost} Gold
                            </strong>
                          </div>

                          <div className="marketplace-buy-balance">
                            Your Gold: {currentPlayer.gold}
                          </div>

                          <div className="marketplace-buy-buttons">
                            <button
                              className="marketplace-buy-button"
                              disabled={
                                !Number.isInteger(buyQuantity) ||
                                buyQuantity <= 0 ||
                                buyQuantity > listing.quantity ||
                                buyTotalCost > currentPlayer.gold
                              }
                              onClick={() => {
                                if (
                                  !Number.isInteger(buyQuantity) ||
                                  buyQuantity <= 0 ||
                                  buyQuantity > listing.quantity ||
                                  buyTotalCost > currentPlayer.gold
                                ) {
                                  return;
                                }

                                onMarketplaceAction({
                                  type: 'buyMarketplaceListing',
                                  payload: {
                                    listingId: listing.id,
                                    quantity: buyQuantity,
                                  },
                                });

                                setBuyingListingId(null);
                                setBuyQuantityInput('');
                              }}
                            >
                              Buy
                            </button>

                            <button
                              className="marketplace-cancel-button"
                              onClick={() => {
                                setBuyingListingId(null);
                                setBuyQuantityInput('');
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {(gameState.marketplace?.length ?? 0) === 0 &&
              !showSellWoodForm &&
              !showSellWaterForm && (
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

              <div>Gold: {player.gold ?? 0}</div>

              <div>Wood: {player.wood ?? 0}</div>

              <div>Water: {player.water ?? 0}</div>

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
