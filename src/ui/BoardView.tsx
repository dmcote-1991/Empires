import { useState } from 'react';
import { GameState, Territory } from '../types';
import {
  getAvailableActions,
  canPlaceSettlement,
  getAffordablePopulationGrowthOptions,
  getTerritoryPrice,
} from '../engine/game';
interface BoardViewProps {
  gameState: GameState;
  selectedTerritoryId: string | null;
  availableActions: ReturnType<typeof getAvailableActions>;
  onSelectTerritory?: (territoryId: string) => void;

  onEstablishSettlement: (
    territoryId: string,
    settlementName: string
  ) => void;

  onAction: (
    type:
      | 'claim'
      | 'endClaiming'
      | 'buy'
      | 'sell'
      | 'listMarketplaceItem'
      | 'buyMarketplaceListing'
      | 'removeMarketplaceListing'
      | 'produce'
      | 'produceWood'
      | 'establishSettlement'
      | 'growSettlement'
      | 'evacuateSettlement'
      | 'tearDownSettlement'
      | 'establishLumberYard'
      | 'establishWaterProcessingPlant'
      | 'buildBridge'
      | 'skip',
    territoryId: string,
    buyerPlayerId?: string,
    payload?: Record<string, unknown>
  ) => void;

  getSellBuyers: (territoryId: string) => {
    id: string;
    name: string;
    color: string;
    gold: number;
  }[];

  settlementName: string;
  setSettlementName: React.Dispatch<
    React.SetStateAction<string>
  >;
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
  onEstablishSettlement,
  onAction,
  getSellBuyers,
  settlementName,
  setSettlementName,
}: BoardViewProps) {
  const [showEvacuationOptions, setShowEvacuationOptions] =
    useState(false);

  const [showPopulationGrowthOptions, setShowPopulationGrowthOptions] =
    useState(false);

  const [settlementInputTerritoryId, setSettlementInputTerritoryId] =
    useState<string | null>(null);

  const currentPlayerId = gameState.turn.order[gameState.turn.currentPlayerIndex];

  const isClaiming =
    gameState.turn.phase === 'claiming';

  const movementRemaining =
    gameState.turn.movementRemaining;

  const currentPlayer = gameState.players.find(
    (player) => player.id === currentPlayerId
  );

  const isStartingTurn =
    currentPlayer?.territoryIds.length === 0;

    const renderWater = (index: number) => {
    return (
      <div
        key={`water-${index}`}
        className="tile-wrapper"
      >
        <div className="tile river-map-water" />
      </div>
    );
  };

  const territoryByIndex = new Map(
    gameState.board.territories.map((territory) => {
      const index =
        Number(territory.id.slice(2)) - 1;

      return [index, territory];
    })
  );

  const renderTerritory = (territory: Territory) => {
    const owner = gameState.players.find(
      (player) => player.id === territory.owner
    );

    const settlement =
      gameState.board.settlements.find(
        (settlement) =>
          settlement.territoryId === territory.id
      );

    const lumberYard =
      gameState.board.lumberYards.find(
        (lumberYard) =>
          lumberYard.territoryId === territory.id
      );

    const waterProcessingPlant =
      gameState.board.waterProcessingPlants.find(
        (waterProcessingPlant) =>
          waterProcessingPlant.territoryId === territory.id
      );

    const isSettlementOption =
      isStartingTurn &&
      canPlaceSettlement(
        gameState.board,
        territory
      );

    const territoryIndex = Number(territory.id.slice(2)) - 1;

    const territoryRow = Math.floor(
      territoryIndex / gameState.board.dimensions.cols
    );

    const territoryCol =
      territoryIndex % gameState.board.dimensions.cols;

    const getNeighbor = (
      row: number,
      col: number
    ): Territory | null => {
      if (
        row < 0 ||
        row >= gameState.board.dimensions.rows ||
        col < 0 ||
        col >= gameState.board.dimensions.cols
      ) {
        return null;
      }

      const neighborIndex =
        row * gameState.board.dimensions.cols + col;

      const neighborId = `t-${neighborIndex + 1}`;

      return (
        gameState.board.territories.find(
          (entry) => entry.id === neighborId
        ) ?? null
      );
    };

    const hasDifferentOwner = (
      row: number,
      col: number
    ): boolean => {
      if (
        row < 0 ||
        row >= gameState.board.dimensions.rows ||
        col < 0 ||
        col >= gameState.board.dimensions.cols
      ) {
        return true;
      }

      const neighborIndex =
        row * gameState.board.dimensions.cols + col;

      const neighborId = `t-${neighborIndex + 1}`;

      const neighbor = gameState.board.territories.find(
        (entry) => entry.id === neighborId
      );

      return !neighbor || neighbor.owner !== territory.owner;
    };

    const hasTopOwnerBoundary =
      territory.owner !== null &&
      hasDifferentOwner(
        territoryRow - 1,
        territoryCol
      );

    const hasBottomOwnerBoundary =
      territory.owner !== null &&
      hasDifferentOwner(
        territoryRow + 1,
        territoryCol
      );

    const hasLeftOwnerBoundary =
      territory.owner !== null &&
      hasDifferentOwner(
        territoryRow,
        territoryCol - 1
      );

    const hasRightOwnerBoundary =
      territory.owner !== null &&
      hasDifferentOwner(
        territoryRow,
        territoryCol + 1
      );

    const topNeighbor = getNeighbor(
      territoryRow - 1,
      territoryCol
    );

    const bottomNeighbor = getNeighbor(
      territoryRow + 1,
      territoryCol
    );

    const leftNeighbor = getNeighbor(
      territoryRow,
      territoryCol - 1
    );

    const rightNeighbor = getNeighbor(
      territoryRow,
      territoryCol + 1
    );


    const hasTopBiomeBoundary =
      topNeighbor === null ||
      topNeighbor.biome !== territory.biome;


    const hasBottomBiomeBoundary =
      bottomNeighbor === null ||
      bottomNeighbor.biome !== territory.biome;


    const hasLeftBiomeBoundary =
      leftNeighbor === null ||
      leftNeighbor.biome !== territory.biome;


    const hasRightBiomeBoundary =
      rightNeighbor === null ||
      rightNeighbor.biome !== territory.biome;

    return (
      <div key={territory.id} className="tile-wrapper">
        <button
          className={`tile ${territory.biome} ${
            territory.isMine ? 'mine' : ''
          } ${
            territory.isSite ? 'site' : ''
          } ${territory.owner ? 'owned' : ''} ${
            hasTopOwnerBoundary ? 'owner-border-top' : ''
          } ${
            hasBottomOwnerBoundary ? 'owner-border-bottom' : ''
          } ${
            hasLeftOwnerBoundary ? 'owner-border-left' : ''
          } ${
            hasRightOwnerBoundary ? 'owner-border-right' : ''
          } ${
            selectedTerritoryId === territory.id ? 'selected' : ''
          } ${
            isSettlementOption ? 'settlement-option' : ''
          }`}
          style={{
            ...(owner
              ? {
                  '--owner-color': colorMap[owner.color],
                }
              : {}),

            borderTopColor:
              hasTopOwnerBoundary && owner
                ? colorMap[owner.color]
                : undefined,

            borderBottomColor:
              hasBottomOwnerBoundary && owner
                ? colorMap[owner.color]
                : undefined,

            borderLeftColor:
              hasLeftOwnerBoundary && owner
                ? colorMap[owner.color]
                : undefined,

            borderRightColor:
              hasRightOwnerBoundary && owner
                ? colorMap[owner.color]
                : undefined,
          } as React.CSSProperties}
          onClick={() =>
            onSelectTerritory?.(territory.id)
          }
        >
          {hasTopBiomeBoundary && (
            <span className="biome-border biome-border-top" />
          )}

          {hasBottomBiomeBoundary && (
            <span className="biome-border biome-border-bottom" />
          )}

          {hasLeftBiomeBoundary && (
            <span className="biome-border biome-border-left" />
          )}

          {hasRightBiomeBoundary && (
            <span className="biome-border biome-border-right" />
          )}

          {territory.hasBridge
            ? '🌉'
            : settlement
              ? '🏘️'
              : lumberYard
                ? '🪵'
                : waterProcessingPlant
                  ? '💧'
                  : territory.isMine
                    ? '⛏️'
                    : ''}
        </button>

        {(territory.isSite || territory.hasBridge) && (
          <div className="site-tooltip">
            {territory.hasBridge && (
              <>
                <strong>Bridge</strong>
              </>
            )}

            {settlement && (
              <>
                <strong>Settlement: {settlement.name}</strong>
                <span>Population: {settlement.population}</span>
                {settlement.isCapital && (
                  <span>Capital Settlement</span>
                )}
              </>
            )}

            {lumberYard && (
              <>
                <strong>Lumber Yard</strong>
                <span>Owner: {owner?.name}</span>
              </>
            )}

            {territory.isMine && (
              <>
                <strong>Mine</strong>
                <span>Efficiency: {
                  gameState.board.mines.find(
                    (mine) =>
                      mine.territoryId === territory.id
                  )?.efficiency ?? 0
                }</span>
              </>
            )}
          </div>
        )}

        {selectedTerritoryId === territory.id && (
          <div className="action-menu">
            {gameState.players.find(
              (player) => player.id === currentPlayerId
            )?.territoryIds.length === 0 ? (
              <>
                <div className="action-menu-title">
                  Establish Settlement
                </div>

                <input
                  type="text"
                  placeholder="Settlement name"
                  value={settlementName}
                  onChange={(event) =>
                    setSettlementName(event.target.value)
                  }
                  onClick={(event) =>
                    event.stopPropagation()
                  }
                />

                <button
                  disabled={!settlementName.trim()}
                  onClick={() =>
                    onEstablishSettlement(
                      territory.id,
                      settlementName
                    )
                  }
                >
                  Establish Settlement
                </button>
              </>
            ) : (
              <>
                <div className="action-menu-title">
                  {isClaiming
                    ? 'Claiming Territory'
                    : 'Actions'}
                </div>

                {isClaiming && (
                  <div className="movement-display">
                    Movement: {movementRemaining} / 4
                  </div>
                )}

                {isClaiming && (
                  <div className="movement-rules">
                    <div>🌾 Field: 1</div>
                    <div>🌲 Forest: 2</div>
                    <div>⛰️ Mountain: 4</div>
                    <div>🌊 River: impassable (unless bridged)</div>
                  </div>
                )}

                {showPopulationGrowthOptions && settlement ? (
                  <div className="action-group">
                    <div className="action-menu-title">
                      Grow Population
                    </div>

                    {getAffordablePopulationGrowthOptions(
                      settlement.population,
                      currentPlayer?.wood ?? 0
                    ).map((option) => (
                      <button
                        key={option.percentage}
                        onClick={() => {
                          onAction(
                            'growSettlement',
                            territory.id,
                            undefined,
                            {
                              percentage:
                                option.percentage,
                            }
                          );

                          setShowPopulationGrowthOptions(false);
                        }}
                      >
                        +{option.percentage}% Population
                        {' — '}
                        +{option.populationIncrease}
                        {' — '}
                        {option.woodCost} Wood
                      </button>
                    ))}

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowPopulationGrowthOptions(false);
                        onSelectTerritory?.(territory.id);
                      }}
                    >
                      Back
                    </button>
                  </div>
                ) : showEvacuationOptions ? (
                  <div className="action-group">
                    <div className="action-menu-title">
                      Evacuate Population
                    </div>

                    {[25, 50, 75].map((percentage) => (
                      <button
                        key={percentage}
                        onClick={() => {
                          onAction(
                            'evacuateSettlement',
                            territory.id,
                            undefined,
                            { percentage }
                          );

                          setShowEvacuationOptions(false);
                        }}
                      >
                        Evacuate {percentage}%
                      </button>
                    ))}

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowEvacuationOptions(false);
                        onSelectTerritory?.(territory.id);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    {/* NORMAL ACTION MENU GOES HERE */}
                  </>
                )}

                {settlementInputTerritoryId === territory.id && (
                  <div className="action-group">
                    <div className="action-menu-title">
                      Establish Settlement
                    </div>

                    <input
                      type="text"
                      placeholder="Settlement name"
                      value={settlementName}
                      onChange={(event) =>
                        setSettlementName(event.target.value)
                      }
                      onClick={(event) =>
                        event.stopPropagation()
                      }
                    />

                    <button
                      disabled={!settlementName.trim()}
                      onClick={() => {
                        onAction(
                          'establishSettlement',
                          territory.id,
                          undefined,
                          {
                            settlementName:
                              settlementName.trim(),
                          }
                        );

                        setSettlementName('');
                        setSettlementInputTerritoryId(null);
                      }}
                    >
                      Establish Settlement
                    </button>

                    <button
                      onClick={() =>
                        setSettlementInputTerritoryId(null)
                      }
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {!showPopulationGrowthOptions &&
                  !showEvacuationOptions &&
                  settlementInputTerritoryId !== territory.id &&
                  availableActions.map((action) =>
                    action.type === 'sell' ? (
                      <div
                        key={action.type}
                        className="action-group"
                      >
                        {getSellBuyers(territory.id)
                          .filter((player) => {
                            const price = getTerritoryPrice(gameState);

                            return player.gold >= price;
                          })
                          .map((player) => {
                            const price = getTerritoryPrice(gameState);

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
                        onClick={(event) => {
                          if (action.type === 'evacuateSettlement') {
                            event.stopPropagation();
                            setShowEvacuationOptions(true);
                            setShowPopulationGrowthOptions(false);
                            return;
                          }

                          if (action.type === 'growSettlement') {
                            event.stopPropagation();
                            setShowPopulationGrowthOptions(true);
                            setShowEvacuationOptions(false);
                            return;
                          }

                          if (action.type === 'establishSettlement') {
                            event.stopPropagation();
                            setSettlementInputTerritoryId(territory.id);
                            return;
                          }

                          onAction(
                            action.type,
                            territory.id
                          );
                        }}
                      >
                        {action.label}
                      </button>
                    )
                  )}
              </>
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
          gridTemplateRows: `repeat(${gameState.board.dimensions.rows}, minmax(0, 1fr))`,
        }}
      >
        {Array.from(
          {
            length:
              gameState.board.dimensions.rows *
              gameState.board.dimensions.cols,
          },
          (_, index) => {
            const territory =
              territoryByIndex.get(index);

            const row = Math.floor(
              index /
                gameState.board.dimensions.cols
            );

            const col =
              index %
              gameState.board.dimensions.cols;

            return (
              <div
                key={territory?.id ?? `water-${index}`}
                className="tile-wrapper"
                style={{
                  gridColumn: col + 1,
                  gridRow: row + 1,
                }}
              >
                {territory
                  ? renderTerritory(territory)
                  : renderWater(index)}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}
