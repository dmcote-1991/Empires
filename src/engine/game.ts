import { 
  ActionResult, 
  AvailableAction, 
  Board, 
  Economy, 
  GameState, 
  Move, 
  Player, 
  PlayerConfig, 
  Settlement, 
  Territory 
} from '../types';

import {
  generateBoard,
  generateMountainBiomes,
  generateFieldBiomes,
  fillEnclosedBoardHoles,
  generateRiverBiomes,
  placeMines,
} from './board';


// ============================================================
// #region CONSTANTS / TYPES
// ============================================================

export const MINE_EFFICIENCY_TABLE = [1, 0.99, 0.98, 0.96, 0.92, 0.84, 0.36];

export const MAX_MOVEMENT = 4;

type Rng = () => number;

// //#endregion

// ============================================================
// #region GAME INITIALIZATION
// ============================================================

export const createInitialGameState = (options: {
  playerConfigs: PlayerConfig[];
  territoryCount: number;
  mineCount: number;
  rng?: Rng;
}): GameState => {
  const rng = options.rng ?? Math.random;
  const board = generateBoard(options.territoryCount, rng);

  generateMountainBiomes(
    board.territories,
    board.dimensions,
    options.mineCount,
    rng
  );

  generateFieldBiomes(
    board.territories,
    rng
  );

  fillEnclosedBoardHoles(
    board.territories,
    board.dimensions
  );

  generateRiverBiomes(
    board.territories,
    board.dimensions,
    rng
  );

  const mineTerritoryIds = placeMines(
    board.territories,
    board.dimensions,
    options.mineCount,
    rng
  );

  const territories = board.territories.map((territory) => {
    const isMine = mineTerritoryIds.includes(territory.id);

    return {
      ...territory,
      isMine,
      level: 1,
      owner: null,
    } satisfies Territory;
  });

  const players: Player[] = options.playerConfigs.map((playerConfig, index) => ({
    id: `player-${index + 1}`,
    name: playerConfig.name,
    color: playerConfig.color,
    gold: 0,
    eliminated: false,
    territoryIds: [],
    capitalSettlementId: null,
  }));

  const boardWithMines: Board = {
    territories,
    mines: mineTerritoryIds.map((territoryId, index) => ({
      id: `mine-${index + 1}`,
      territoryId,
      efficiency: 1
    })),
    settlements: [],
    dimensions: board.dimensions,
  };

  const totalGold = 0;
  const nonMineTerritoryCount = territories.filter(
    (t) => !t.isMine
  ).length;

  const economy: Economy = {
    totalGold,
    levelOneValue:
      totalGold / Math.max(1, nonMineTerritoryCount),
    mineEfficiency: 1,
  };

  const state: GameState = {
    board: boardWithMines,
    players,
    economy,
    turn: {
      currentPlayerIndex: 0,
      round: 1,
      order: players.map((player) => player.id),
      phase: 'action',
      movementRemaining: 4,
    },
    settings: {
      territoryCount: options.territoryCount,
      mineCount: options.mineCount,
    },
  };

  const validStartingTerritories =
    getValidStartingTerritories(state.board);

  if (validStartingTerritories.length < players.length) {
    return createInitialGameState({
      ...options,
      rng,
    });
  }

  return state;
};

export const getGameSummary = (state: GameState) => ({
  players: state.players.length,
  territories: state.board.territories.length,
  mines: state.board.mines.length,
  totalGold: state.economy.totalGold,
  currentTurn: state.turn.currentPlayerIndex,
});

// //#endregion

// ============================================================
// #region TERRITORY / BOARD VALIDATION
// ============================================================

export const getBiomeMovementCost = (
  biome: Territory['biome']
): number => {
  switch (biome) {
    case 'field':
      return 1;
    case 'forest':
      return 2;
    case 'mountain':
      return 4;
    case 'river':
      return Infinity;
  }
};

export const getValidStartingTerritories = (
  board: Board
): Territory[] => {
  return board.territories.filter((territory) => {
    if (territory.isMine) {
      return false;
    }

    if (!canPlaceSettlement(board, territory)) {
      return false;
    }

    const hasMineNeighbor = territory.neighbors.some(
      (neighborId) => {
        const neighbor = board.territories.find(
          (entry) => entry.id === neighborId
        );

        return Boolean(neighbor?.isMine);
      }
    );

    return !hasMineNeighbor;
  });
};

export function canPlaceSettlement(
  board: Board,
  territory: Territory
): boolean {
  // Settlement itself must be forest or field.
  if (
    territory.biome !== 'forest' &&
    territory.biome !== 'field'
  ) {
    return false;
  }

  const index =
    Number(territory.id.slice(2)) - 1;

  const row = Math.floor(
    index / board.dimensions.cols
  );

  const col =
    index % board.dimensions.cols;

  /*
   * Check all 8 surrounding cells:
   *
   * NW  N  NE
   *  W  X   E
   * SW  S  SE
   *
   * A settlement needs one full territory of space
   * from mountains, rivers, and the outer water.
   */
  for (
    let rowOffset = -1;
    rowOffset <= 1;
    rowOffset += 1
  ) {
    for (
      let colOffset = -1;
      colOffset <= 1;
      colOffset += 1
    ) {
      // Skip the territory itself.
      if (
        rowOffset === 0 &&
        colOffset === 0
      ) {
        continue;
      }

      const neighborRow =
        row + rowOffset;

      const neighborCol =
        col + colOffset;

      /*
       * Outside the board grid represents outer water.
       * Therefore, a settlement cannot be placed directly
       * against the edge of the map.
       */
      if (
        neighborRow < 0 ||
        neighborRow >= board.dimensions.rows ||
        neighborCol < 0 ||
        neighborCol >= board.dimensions.cols
      ) {
        return false;
      }

      const neighborIndex =
        neighborRow * board.dimensions.cols +
        neighborCol;

      const neighbor =
        board.territories.find(
          (entry) =>
            Number(entry.id.slice(2)) - 1 ===
            neighborIndex
        );

      /*
       * A missing territory represents the outer water.
       * Mountains and rivers also prevent settlement placement.
       */
      if (
        !neighbor ||
        (
          neighbor.biome !== 'forest' &&
          neighbor.biome !== 'field'
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

export function canEstablishSettlement(
  board: Board,
  territory: Territory,
  playerId: string
): boolean {
  if (!canPlaceSettlement(board, territory)) {
    return false;
  }

  if (territory.owner !== playerId) {
    return false;
  }

  for (const neighborId of territory.neighbors) {
    const neighbor = board.territories.find(
      (entry) => entry.id === neighborId
    );

    if (!neighbor || neighbor.owner !== playerId) {
      return false;
    }

    const hasSite =
      board.settlements.some(
        (settlement) =>
          settlement.territoryId === neighbor.id
      ) ||
      board.mines.some(
        (mine) =>
          mine.territoryId === neighbor.id
      );

    if (hasSite) {
      return false;
    }
  }

  return true;
}

export const isConnectedTerritorySet = (
  territories: Territory[]
): boolean => {
  if (territories.length === 0) {
    return true;
  }

  const visited = new Set<string>();
  const frontier = [territories[0].id];

  while (frontier.length > 0) {
    const currentId = frontier.pop()!;

    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);

    const current = territories.find(
      (territory) =>
        territory.id === currentId
    );

    current?.neighbors.forEach(
      (neighborId) => {
        if (!visited.has(neighborId)) {
          frontier.push(neighborId);
        }
      }
    );
  }

  return visited.size === territories.length;
};

// //#endregion

// ============================================================
// #region ECONOMY
// ============================================================

export const getTerritoryFairValue = (
  territory: Territory,
  state: GameState
): number => {
  if (territory.isMine) {
    return 100 * state.economy.levelOneValue;
  }

  return (
    territory.level *
    state.economy.levelOneValue
  );
};

function getMineProduction(
  state: GameState,
  playerId: string
): number {
  const playerMineCount =
    state.board.territories.filter(
      (territory) =>
        territory.owner === playerId &&
        territory.isMine
    ).length;

  const baseProduction =
    (
      10000 *
      state.economy.mineEfficiency
    ) /
    state.settings.mineCount;

  const mineBonus =
    1 + 0.10 * (playerMineCount - 1);

  return Math.round(
    baseProduction * mineBonus
  );
}

function updateTotalGold(
  state: GameState
): void {
  state.economy.totalGold =
    state.players.reduce(
      (total, player) =>
        total + player.gold,
      0
    );
}

// //#endregion

// ============================================================
// #region ACTION HELPERS
// ============================================================

function getEligibleBuyers(
  state: GameState,
  territory: Territory,
  currentPlayerId: string
): Player[] {
  const buyerIds = new Set<string>();

  territory.neighbors.forEach(
    (neighborId) => {
      const neighbor =
        state.board.territories.find(
          (territory) =>
            territory.id === neighborId
        );

      if (
        neighbor?.owner &&
        neighbor.owner !== currentPlayerId
      ) {
        buyerIds.add(neighbor.owner);
      }
    }
  );

  return state.players.filter(
    (player) =>
      buyerIds.has(player.id)
  );
}

// //#endregion

// ============================================================
// #region TURN / STATE HELPERS
// ============================================================

function advanceTurn(
  state: GameState
): GameState {
  const nextState = cloneState(state);

  nextState.turn.currentPlayerIndex =
    (
      nextState.turn.currentPlayerIndex + 1
    ) %
    nextState.players.length;

  nextState.turn.phase = 'action';

  nextState.turn.movementRemaining =
    MAX_MOVEMENT;

  return nextState;
}

function cloneState(
  state: GameState
): GameState {
  return {
    ...state,

    turn: {
      ...state.turn
    },

    economy: {
      ...state.economy
    },

    players:
      state.players.map(
        (player) => ({
          ...player,
          territoryIds: [
            ...player.territoryIds
          ],
        })
      ),

    board: {
      ...state.board,

      territories:
        state.board.territories.map(
          (territory) => ({
            ...territory,
            neighbors: [
              ...territory.neighbors
            ],
          })
        ),

      mines:
        state.board.mines.map(
          (mine) => ({
            ...mine,
          })
        ),

      settlements:
        state.board.settlements.map(
          (settlement) => ({
            ...settlement,
          })
        ),
    },
  };
}

// //#endregion

// ============================================================
// #region AVAILABLE ACTIONS
// ============================================================

export const getAvailableActions = (
  state: GameState,
  territoryId: string
): AvailableAction[] => {
  const currentPlayerId =
    state.turn.order[
      state.turn.currentPlayerIndex
    ];

  const currentPlayer =
    state.players.find(
      (player) =>
        player.id === currentPlayerId
    );

  const territory =
    state.board.territories.find(
      (entry) =>
        entry.id === territoryId
    );

  if (!currentPlayer || !territory) {
    return [];
  }

  /*
   * --------------------------------------------------------
   * CLAIMING PHASE
   * --------------------------------------------------------
   *
   * Once the player has chosen Claim, claiming is the only
   * thing they can do until they finish or end claiming.
   */
  if (
    state.turn.phase === 'claiming'
  ) {
    const actions: AvailableAction[] = [
      {
        type: 'endClaiming',
        label: 'End claiming',
      },
    ];

    if (territory.owner) {
      return actions;
    }

    if (
      territory.biome === 'river'
    ) {
      return actions;
    }

    const isAdjacent =
      territory.neighbors.some(
        (neighborId) =>
          currentPlayer.territoryIds.includes(
            neighborId
          )
      );

    if (!isAdjacent) {
      return actions;
    }

    const movementCost =
      getBiomeMovementCost(
        territory.biome
      );

    if (
      movementCost >
      state.turn.movementRemaining
    ) {
      return actions;
    }

    actions.unshift({
      type: 'claim',
      label: `Claim territory (${movementCost} movement)`,
    });

    return actions;
  }

  /*
   * --------------------------------------------------------
   * NORMAL ACTION PHASE
   * --------------------------------------------------------
   */

  const actions: AvailableAction[] = [];

  if (!territory.owner) {
    // Rivers can never be owned.
    if (
      territory.biome === 'river'
    ) {
      return [];
    }

    const isStartingTurn =
      currentPlayer.territoryIds.length === 0;

    const canClaim =
      isStartingTurn
        ? !territory.isMine
        : territory.neighbors.some(
            (neighborId) =>
              currentPlayer.territoryIds.includes(
                neighborId
              )
          );

    if (canClaim) {
      actions.push({
        type: 'claim',
        label: 'Begin claiming',
      });
    }

    return actions;
  }

  if (
    territory.owner &&
    territory.owner !== currentPlayer.id &&
    !territory.isMine
  ) {
    const buyCost =
      state.economy.levelOneValue *
      territory.level;

    if (
      currentPlayer.gold >= buyCost &&
      buyCost > 0
    ) {
      actions.push({
        type: 'buy',
        label:
          `Buy territory (Asking Price: ${buyCost} Gold)`,
      });
    }

    return actions;
  }

  if (
    territory.owner === currentPlayer.id &&
    !territory.isMine
  ) {
    const settlement =
      state.board.settlements.find(
        (entry) =>
          entry.territoryId === territory.id
      );

    if (settlement) {
      actions.push({
        type: 'evacuateSettlement',
        label: 'Evacuate settlement',
      });

      if (
        !settlement.isCapital &&
        settlement.population <= 100
      ) {
        actions.push({
          type: 'tearDownSettlement',
          label: 'Tear down settlement',
        });
      }

      return actions;
    }

    if (
      canEstablishSettlement(
        state.board,
        territory,
        currentPlayer.id
      )
    ) {
      actions.push({
        type: 'establishSettlement',
        label: 'Establish Settlement',
      });
    }

    const upgradeCost =
      state.economy.levelOneValue;

    if (
      currentPlayer.gold >=
      upgradeCost
    ) {
      actions.push({
        type: 'upgrade',
        label:
          `Upgrade territory (Cost: ${upgradeCost} Gold)`,
      });
    }

    const adjacentOwned =
      state.board.territories.filter(
        (entry) =>
          entry.owner ===
            currentPlayer.id &&
          entry.id !== territory.id &&
          territory.neighbors.includes(
            entry.id
          )
      );

    if (
      adjacentOwned.length > 0
    ) {
      actions.push({
        type: 'sell',
        label:
          `Sell territory (Price: ${
            state.economy.levelOneValue *
            territory.level
          } Gold)`,
      });
    }

    return actions;
  }

  if (
    territory.owner === currentPlayer.id &&
    territory.isMine
  ) {
    actions.push({
      type: 'produce',
      label:
        `Produce from mine (Production: ${
          getMineProduction(
            state,
            currentPlayerId
          )
        })`,
    });
  }

  actions.push({
    type: 'skip',
    label: 'Skip turn',
  });

  return actions;
};

// //#endregion

// ============================================================
// #region EXECUTE GAME ACTIONS
// ============================================================

export const executeGameAction = (
  state: GameState,
  move: Move
): ActionResult => {
  const currentPlayerId =
    state.turn.order[
      state.turn.currentPlayerIndex
    ];

  const currentPlayer =
    state.players.find(
      (player) =>
        player.id === currentPlayerId
    );

  if (!currentPlayer) {
    return {
      success: false,
      reason: 'Missing current player',
      state,
    };
  }

  if (
    move.type === 'claim' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id ===
          move.targetTerritoryId
      );

    if (
      !target ||
      target.owner ||
      target.biome === 'river'
    ) {
      return {
        success: false,
        reason:
          'Invalid territory claim',
        state,
      };
    }

    const isStartingTurn =
      currentPlayer.territoryIds.length === 0;

    /*
     * --------------------------------------------------------
     * START CLAIMING
     * --------------------------------------------------------
     *
     * The first Claim click changes the turn into claiming
     * mode. It does NOT claim a territory yet.
     */
    if (
      state.turn.phase === 'action'
    ) {
      const canStartClaiming =
        isStartingTurn
          ? !target.isMine &&
            canPlaceSettlement(
              state.board,
              target
            )
          : target.neighbors.some(
              (neighborId) =>
                currentPlayer.territoryIds.includes(
                  neighborId
                )
            );

      if (!canStartClaiming) {
        return {
          success: false,
          reason:
            isStartingTurn
              ? 'Settlement must be placed on forest or field with no mountain or river touching it'
              : 'Territory must be adjacent to your territory',
          state,
        };
      }

      const nextState =
        cloneState(state);

      nextState.turn.phase =
        'claiming';

      nextState.turn.movementRemaining =
        MAX_MOVEMENT;

      return {
        success: true,
        state: nextState,
      };
    }

    /*
     * --------------------------------------------------------
     * ALREADY CLAIMING
     * --------------------------------------------------------
     */

    if (
      state.turn.phase !== 'claiming'
    ) {
      return {
        success: false,
        reason:
          'Invalid claiming phase',
        state,
      };
    }

    if (isStartingTurn) {
      if (
        target.isMine ||
        !canPlaceSettlement(
          state.board,
          target
        )
      ) {
        return {
          success: false,
          reason:
            'Invalid settlement location',
          state,
        };
      }
    } else {
      const validClaim =
        target.neighbors.some(
          (neighborId) =>
            currentPlayer.territoryIds.includes(
              neighborId
            )
        );

      if (!validClaim) {
        return {
          success: false,
          reason:
            'Territory must be adjacent to your territory',
          state,
        };
      }
    }

    const movementCost =
      getBiomeMovementCost(
        target.biome
      );

    if (
      movementCost >
      state.turn.movementRemaining
    ) {
      return {
        success: false,
        reason:
          'Not enough movement to claim this territory',
        state,
      };
    }

    const nextState =
      cloneState(state);

    /*
     * --------------------------------------------------------
     * STARTING SETTLEMENT
     * --------------------------------------------------------
     */

    if (isStartingTurn) {
      const settlementName =
        typeof move.payload?.settlementName ===
        'string'
          ? move.payload.settlementName.trim()
          : '';

      if (!settlementName) {
        return {
          success: false,
          reason:
            'Settlement name is required',
          state,
        };
      }

      const settlement: Settlement = {
        id:
          `settlement-${currentPlayer.id}`,
        territoryId: target.id,
        owner: currentPlayer.id,
        name: settlementName,
        population: 100,
        isCapital: true,
      };

      nextState.board.settlements.push(
        settlement
      );

      nextState.players =
        nextState.players.map(
          (player) =>
            player.id ===
            currentPlayer.id
              ? {
                  ...player,
                  territoryIds: [
                    ...player.territoryIds,
                    target.id,
                  ],
                  capitalSettlementId:
                    settlement.id,
                }
              : player
        );
    } else {
      /*
       * Normal territory claim.
       */
      nextState.players =
        nextState.players.map(
          (player) =>
            player.id ===
            currentPlayer.id
              ? {
                  ...player,
                  territoryIds: [
                    ...player.territoryIds,
                    target.id,
                  ],
                }
              : player
        );
    }

    /*
     * Give the territory to the current player.
     */
    nextState.board.territories =
      nextState.board.territories.map(
        (territory) =>
          territory.id === target.id
            ? {
                ...territory,
                owner:
                  currentPlayer.id,
              }
            : territory
      );

    /*
     * Spend movement.
     */
    nextState.turn.movementRemaining -=
      movementCost;

    /*
     * If no movement remains, automatically end
     * the claiming phase and advance the turn.
     */
    if (
      nextState.turn.movementRemaining <= 0
    ) {
      return {
        success: true,
        state: advanceTurn(nextState),
      };
    }

    /*
     * Otherwise stay in claiming mode.
     */
    return {
      success: true,
      state: nextState,
    };
  }

  if (
    move.type === 'establishSettlement' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id ===
          move.targetTerritoryId
      );

    if (
      !target ||
      !canEstablishSettlement(
        state.board,
        target,
        currentPlayer.id
      ) ||
      state.board.settlements.some(
        (settlement) =>
          settlement.territoryId === target.id
      )
    ) {
      return {
        success: false,
        reason:
          'Invalid settlement location',
        state,
      };
    }

    const settlementName =
      typeof move.payload?.settlementName ===
      'string'
        ? move.payload.settlementName.trim()
        : '';

    if (!settlementName) {
      return {
        success: false,
        reason:
          'Settlement name is required',
        state,
      };
    }

    const settlement: Settlement = {
      id:
        `settlement-${currentPlayer.id}-${Date.now()}`,
      territoryId: target.id,
      owner: currentPlayer.id,
      name: settlementName,
      population: 100,
      isCapital: false,
    };

    const nextState =
      cloneState(state);

    nextState.board.settlements.push(
      settlement
    );

    return {
      success: true,
      state: advanceTurn(nextState),
    };
  }

  if (
    move.type === 'evacuateSettlement' &&
    move.targetTerritoryId
  ) {
    const settlement =
      state.board.settlements.find(
        (entry) =>
          entry.territoryId ===
          move.targetTerritoryId
      );

    if (
      !settlement ||
      settlement.owner !== currentPlayer.id
    ) {
      return {
        success: false,
        reason:
          'Invalid settlement',
        state,
      };
    }

    const percentage =
      move.payload?.percentage;

    if (
      percentage !== 25 &&
      percentage !== 50 &&
      percentage !== 75
    ) {
      return {
        success: false,
        reason:
          'Invalid evacuation percentage',
        state,
      };
    }

    const nextState =
      cloneState(state);

    const nextSettlement =
      nextState.board.settlements.find(
        (entry) =>
          entry.id === settlement.id
      );

    if (!nextSettlement) {
      return {
        success: false,
        reason:
          'Settlement not found',
        state,
      };
    }

    const evacuated =
      Math.floor(
        nextSettlement.population *
        (percentage / 100)
      );

    nextSettlement.population -=
      evacuated;

    return {
      success: true,
      state: advanceTurn(nextState),
    };
  }

  if (
    move.type === 'tearDownSettlement' &&
    move.targetTerritoryId
  ) {
    const settlement =
      state.board.settlements.find(
        (entry) =>
          entry.territoryId ===
          move.targetTerritoryId
      );

    if (
      !settlement ||
      settlement.owner !== currentPlayer.id
    ) {
      return {
        success: false,
        reason:
          'Invalid settlement',
        state,
      };
    }

    if (settlement.isCapital) {
      return {
        success: false,
        reason:
          'Capital settlements cannot be torn down',
        state,
      };
    }

    if (
      settlement.population > 100
    ) {
      return {
        success: false,
        reason:
          'Settlement population must be 100 or less',
        state,
      };
    }

    const nextState =
      cloneState(state);

    nextState.board.settlements =
      nextState.board.settlements.filter(
        (entry) =>
          entry.id !== settlement.id
      );

    return {
      success: true,
      state: advanceTurn(nextState),
    };
  }

  if (
    move.type === 'buy' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id ===
          move.targetTerritoryId
      );

    const hasSettlement =
      state.board.settlements.some(
        (settlement) =>
          settlement.territoryId ===
          target?.id
      );

    if (
      !target ||
      !target.owner ||
      target.owner === currentPlayer.id ||
      target.isMine ||
      target.biome === 'river' ||
      hasSettlement
    ) {
      return {
        success: false,
        reason: 'Invalid buy action',
        state,
      };
    }

    const isAdjacent =
      target.neighbors.some(
        (neighborId) =>
          currentPlayer.territoryIds.includes(
            neighborId
          )
      );

    if (!isAdjacent) {
      return {
        success: false,
        reason:
          'Territory must be adjacent to your territory',
        state,
      };
    }

    const buyPrice =
      state.economy.levelOneValue *
      target.level;

    if (
      currentPlayer.gold <
      buyPrice
    ) {
      return {
        success: false,
        reason:
          'Not enough gold to buy territory',
        state,
      };
    }

    const nextState =
      cloneState(state);

    nextState.board.territories =
      nextState.board.territories.map(
        (territory) =>
          territory.id === target.id
            ? {
                ...territory,
                owner:
                  currentPlayer.id,
              }
            : territory
      );

    nextState.players =
      nextState.players.map(
        (player) => {
          if (
            player.id ===
            currentPlayer.id
          ) {
            return {
              ...player,
              gold:
                player.gold -
                buyPrice,
              territoryIds: [
                ...player.territoryIds,
                target.id,
              ],
            };
          }

          if (
            player.id ===
            target.owner
          ) {
            return {
              ...player,
              gold:
                player.gold +
                buyPrice,
              territoryIds:
                player.territoryIds.filter(
                  (territoryId) =>
                    territoryId !==
                    target.id
                ),
            };
          }

          return player;
        }
      );

    nextState.turn.currentPlayerIndex =
      (
        nextState.turn.currentPlayerIndex +
        1
      ) %
      nextState.players.length;

    return {
      success: true,
      state: nextState,
    };
  }

  if (
    move.type === 'upgrade' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id ===
          move.targetTerritoryId
      );

    const hasSettlement =
      state.board.settlements.some(
        (settlement) =>
          settlement.territoryId ===
          target?.id
      );

    if (
      !target ||
      target.owner !==
        currentPlayer.id ||
      target.isMine ||
      hasSettlement
    ) {
      return {
        success: false,
        reason:
          'Invalid upgrade action',
        state,
      };
    }

    const upgradeCost =
      state.economy.levelOneValue;

    if (
      currentPlayer.gold <
      upgradeCost
    ) {
      return {
        success: false,
        reason:
          'Not enough gold to upgrade',
        state,
      };
    }

    const nextState =
      cloneState(state);

    nextState.board.territories =
      nextState.board.territories.map(
        (territory) =>
          territory.id === target.id
            ? {
                ...territory,
                level:
                  territory.level + 1,
              }
            : territory
      );

    const player =
      nextState.players.find(
        (player) =>
          player.id ===
          currentPlayer.id
      );

    if (player) {
      player.gold -=
        upgradeCost;
    }

    updateTotalGold(nextState);

    nextState.turn.currentPlayerIndex =
      (
        nextState.turn.currentPlayerIndex +
        1
      ) %
      nextState.players.length;

    return {
      success: true,
      state: nextState,
    };
  }

  if (
    move.type === 'produce' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id ===
          move.targetTerritoryId
      );

    if (
      !target ||
      target.owner !==
        currentPlayer.id ||
      !target.isMine
    ) {
      return {
        success: false,
        reason:
          'Invalid produce action',
        state,
      };
    }

    const nextState =
      cloneState(state);

    const goldProduced =
      getMineProduction(
        nextState,
        currentPlayerId
      );

    const player =
      nextState.players.find(
        (player) =>
          player.id ===
          currentPlayer.id
      );

    if (player) {
      player.gold +=
        goldProduced;
    }

    updateTotalGold(nextState);

    const nonMineTerritoryCount =
      nextState.board.territories.filter(
        (territory) =>
          !territory.isMine
      ).length;

    nextState.economy.levelOneValue =
      Math.round(
        nextState.economy.totalGold /
          Math.max(
            1,
            nonMineTerritoryCount
          )
      );

    nextState.turn.currentPlayerIndex =
      (
        nextState.turn.currentPlayerIndex +
        1
      ) %
      nextState.players.length;

    return {
      success: true,
      state: nextState,
    };
  }

  if (
    move.type === 'sell' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id ===
          move.targetTerritoryId
      );

    const hasSettlement =
      state.board.settlements.some(
        (settlement) =>
          settlement.territoryId ===
          target?.id
      );

    if (
      !target ||
      target.owner !==
        currentPlayer.id ||
      target.isMine ||
      target.biome === 'river' ||
      hasSettlement
    ) {
      return {
        success: false,
        reason:
          'Invalid sell action',
        state,
      };
    }

    const buyerPlayerId =
      move.payload?.buyerPlayerId;

    if (
      typeof buyerPlayerId !==
      'string'
    ) {
      return {
        success: false,
        reason:
          'No buyer selected',
        state,
      };
    }

    const buyer =
      state.players.find(
        (player) =>
          player.id ===
          buyerPlayerId
      );

    if (!buyer) {
      return {
        success: false,
        reason:
          'Buyer not found',
        state,
      };
    }

    const eligibleBuyers =
      getEligibleBuyers(
        state,
        target,
        currentPlayer.id
      );

    if (
      !eligibleBuyers.some(
        (player) =>
          player.id ===
          buyerPlayerId
      )
    ) {
      return {
        success: false,
        reason:
          'Buyer is not adjacent',
        state,
      };
    }

    const salePrice =
      state.economy.levelOneValue *
      target.level;

    if (
      buyer.gold <
      salePrice
    ) {
      return {
        success: false,
        reason:
          'Buyer cannot afford territory',
        state,
      };
    }

    const nextState =
      cloneState(state);

    nextState.board.territories =
      nextState.board.territories.map(
        (territory) =>
          territory.id === target.id
            ? {
                ...territory,
                owner:
                  buyerPlayerId,
              }
            : territory
      );

    nextState.players =
      nextState.players.map(
        (player) => {
          if (
            player.id ===
            currentPlayer.id
          ) {
            return {
              ...player,
              gold:
                player.gold +
                salePrice,
              territoryIds:
                player.territoryIds.filter(
                  (territoryId) =>
                    territoryId !==
                    target.id
                ),
            };
          }

          if (
            player.id ===
            buyerPlayerId
          ) {
            return {
              ...player,
              gold:
                player.gold -
                salePrice,
              territoryIds: [
                ...player.territoryIds,
                target.id,
              ],
            };
          }

          return player;
        }
      );

    nextState.turn.currentPlayerIndex =
      (
        nextState.turn.currentPlayerIndex +
        1
      ) %
      nextState.players.length;

    return {
      success: true,
      state: nextState,
    };
  }

  if (
    move.type === 'endClaiming'
  ) {
    if (
      state.turn.phase !==
      'claiming'
    ) {
      return {
        success: false,
        reason:
          'Not currently claiming',
        state,
      };
    }

    return {
      success: true,
      state:
        advanceTurn(state),
    };
  }

  if (
    move.type === 'skip'
  ) {
    return {
      success: true,
      state:
        advanceTurn(state),
    };
  }

  return {
    success: true,
    state:
      advanceTurn(state),
  };
};

// //#endregion
