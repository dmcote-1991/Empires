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

type MarketplaceTab = 'wood' | 'water' | 'food';

export function Sidebar({
  gameState,
  onNewGame,
  onSaveGame,
  onLoadGame,
  onMarketplaceAction,
}: SidebarProps) {
  const [marketplaceExpanded, setMarketplaceExpanded] = useState(false);

  const [marketplaceTab, setMarketplaceTab] =
    useState<MarketplaceTab>('wood');

  const [showSellWoodForm, setShowSellWoodForm] = useState(false);
  const [showSellWaterForm, setShowSellWaterForm] = useState(false);
  const [showSellFoodForm, setShowSellFoodForm] = useState(false);

  const [sellWoodQuantity, setSellWoodQuantity] = useState('');
  const [sellWoodPrice, setSellWoodPrice] = useState('');

  const [sellWaterQuantity, setSellWaterQuantity] = useState('');
  const [sellWaterPrice, setSellWaterPrice] = useState('');

  const [sellFoodQuantity, setSellFoodQuantity] = useState('');
  const [sellFoodPrice, setSellFoodPrice] = useState('');

  const [buyingListingId, setBuyingListingId] = useState<string | null>(null);
  const [buyQuantityInput, setBuyQuantityInput] = useState('');

  const marketplaceListings = getMarketplaceListings(gameState);

  const currentPlayer =
    gameState.players[
      gameState.turn.currentPlayerIndex
    ];

  /*
   * Only show listings belonging to the currently selected tab.
   */
  const currentTabListings = marketplaceListings.filter(
    (listing) => listing.item === marketplaceTab
  );

  /*
   * The cheapest listing belonging to another player is the one
   * available to buy.
   */
  const firstBuyableListing = currentTabListings.find(
    (listing) => listing.sellerPlayerId !== currentPlayer.id
  );

  const buyingListing = currentTabListings.find(
    (listing) => listing.id === buyingListingId
  );

  const buyQuantity = Number(buyQuantityInput);

  const buyTotalCost =
    buyingListing
      ? buyQuantity * buyingListing.pricePerUnit
      : 0;

  const switchMarketplaceTab = (tab: MarketplaceTab) => {
    setMarketplaceTab(tab);

    // Close any open forms when switching tabs.
    setShowSellWoodForm(false);
    setShowSellWaterForm(false);
    setShowSellFoodForm(false);
    setBuyingListingId(null);
    setBuyQuantityInput('');
  };

  return (
    <aside className="sidebar">
      <h3>Empire Summary</h3>

      <div className="stat-list">
        <div>Total Gold: {gameState.economy.totalGold}</div>

        <div>
          Players Remaining:{' '}
          {gameState.players.filter((player) => !player.eliminated).length}
        </div>

        <div>
          Level-1 Value: {gameState.economy.baseTerritoryValue}
        </div>
      </div>

      {/* Marketplace */}
      <div className="marketplace">
        <button
          className="marketplace-header"
          onClick={() =>
            setMarketplaceExpanded((expanded) => !expanded)
          }
        >
          <span>Marketplace</span>
          <span>{marketplaceExpanded ? '▼' : '▶'}</span>
        </button>

        {marketplaceExpanded && (
          <div className="marketplace-content">

            {/* Marketplace Tabs */}
            <div className="marketplace-tabs">
              <button
                className={
                  marketplaceTab === 'wood'
                    ? 'marketplace-tab marketplace-tab-active'
                    : 'marketplace-tab'
                }
                onClick={() => switchMarketplaceTab('wood')}
              >
                Wood
              </button>

              <button
                className={
                  marketplaceTab === 'water'
                    ? 'marketplace-tab marketplace-tab-active'
                    : 'marketplace-tab'
                }
                onClick={() => switchMarketplaceTab('water')}
              >
                Water
              </button>

              <button
                className={
                  marketplaceTab === 'food'
                    ? 'marketplace-tab marketplace-tab-active'
                    : 'marketplace-tab'
                }
                onClick={() => switchMarketplaceTab('food')}
              >
                Food
              </button>
            </div>

            {/* ==================== WOOD TAB ==================== */}

            {marketplaceTab === 'wood' && (
              <>
                <button
                  onClick={() =>
                    setShowSellWoodForm((showing) => !showing)
                  }
                >
                  Sell Wood
                </button>

                {showSellWoodForm && (
                  <div className="marketplace-sell-form">
                    <div>
                      Available Wood:{' '}
                      {currentPlayer.wood ?? 0}
                    </div>

                    <label>
                      Quantity:
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={sellWoodQuantity}
                        onChange={(event) =>
                          setSellWoodQuantity(event.target.value)
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
                          setSellWoodPrice(event.target.value)
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
              </>
            )}

            {/* ==================== WATER TAB ==================== */}

            {marketplaceTab === 'water' && (
              <>
                <button
                  onClick={() =>
                    setShowSellWaterForm((showing) => !showing)
                  }
                >
                  Sell Water
                </button>

                {showSellWaterForm && (
                  <div className="marketplace-sell-form">
                    <div>
                      Available Water:{' '}
                      {currentPlayer.water ?? 0}
                    </div>

                    <label>
                      Quantity:
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={sellWaterQuantity}
                        onChange={(event) =>
                          setSellWaterQuantity(event.target.value)
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
                          setSellWaterPrice(event.target.value)
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
              </>
            )}

            {/* ==================== FOOD TAB ==================== */}

            {marketplaceTab === 'food' && (
              <>
                <button
                  onClick={() =>
                    setShowSellFoodForm((showing) => !showing)
                  }
                >
                  Sell Food
                </button>

                {showSellFoodForm && (
                  <div className="marketplace-sell-form">
                    <div>
                      Available Food:{' '}
                      {currentPlayer.food ?? 0}
                    </div>

                    <label>
                      Quantity:
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={sellFoodQuantity}
                        onChange={(event) =>
                          setSellFoodQuantity(event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Gold per unit:
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={sellFoodPrice}
                        onChange={(event) =>
                          setSellFoodPrice(event.target.value)
                        }
                      />
                    </label>

                    <button
                      onClick={() => {
                        const quantity =
                          Number(sellFoodQuantity);

                        const pricePerUnit =
                          Number(sellFoodPrice);

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
                            itemType: 'food',
                            quantity,
                            pricePerUnit,
                          },
                        });

                        setSellFoodQuantity('');
                        setSellFoodPrice('');
                        setShowSellFoodForm(false);
                      }}
                    >
                      List on Marketplace
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ==================== LISTINGS ==================== */}

            {currentTabListings.length > 0 && (
              <div className="marketplace-listings">
                {currentTabListings.map((listing) => {
                  const seller = gameState.players.find(
                    (player) =>
                      player.id === listing.sellerPlayerId
                  );

                  const isOwnListing =
                    listing.sellerPlayerId === currentPlayer.id;

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
                          ? 'AVAILABLE TO BUY'
                          : isOwnListing
                            ? 'YOUR LISTING'
                            : 'WAITING'}
                      </div>

                      <div className="marketplace-listing-main">
                        <strong>
                          {listing.quantity}{' '}
                          {listing.item === 'water'
                            ? 'Water'
                            : listing.item === 'food'
                              ? 'Food'
                              : 'Wood'}
                        </strong>

                        <span className="marketplace-price">
                          {listing.pricePerUnit} Gold /{' '}
                          {listing.item === 'water'
                            ? 'Water'
                            : listing.item === 'food'
                              ? 'Food'
                              : 'Wood'}
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
                            {listing.item === 'water'
                              ? 'Water'
                              : listing.item === 'food'
                                ? 'Food'
                                : 'Wood'}
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

            {/* Empty state for the CURRENT tab */}
            {currentTabListings.length === 0 &&
              !(
                marketplaceTab === 'wood'
                  ? showSellWoodForm
                  : marketplaceTab === 'water'
                    ? showSellWaterForm
                    : showSellFoodForm
              ) && (
                <div className="marketplace-empty">
                  No {marketplaceTab} is currently being sold.
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
            <div
              key={player.id}
              className="player-card"
            >
              <strong>{player.name}</strong>

              <div>Color: {player.color}</div>

              <div>Gold: {player.gold ?? 0}</div>

              <div>Wood: {player.wood ?? 0}</div>

              <div>Water: {player.water ?? 0}</div>

              <div>Food: {player.food ?? 0}</div>

              <div>
                Territories: {player.territoryIds.length}
              </div>

              {settlement && (
                <>
                  <div>
                    Settlement: {settlement.name}
                  </div>

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
