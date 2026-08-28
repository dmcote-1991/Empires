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
  LumberYard,
  WaterProcessingPlant,
  MarketplaceListing,
  Territory 
} from '../types';

import {
  generateBoard,
  generateMountainBiomes,
  generateFieldBiomes,
  fillEnclosedBoardHoles,
  generateRiverBiomes,
  placeMines,
  getEightNeighbors,
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
      isSite: isMine,
      hasBridge: false,
      owner: null,
    } satisfies Territory;
  });

  const players: Player[] = options.playerConfigs.map((playerConfig, index) => ({
    id: `player-${index + 1}`,
    name: playerConfig.name,
    color: playerConfig.color,
    gold: 0,
    wood: 0,
    water: 0,
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
    lumberYards: [],
    waterProcessingPlants: [],
    dimensions: board.dimensions,
  };

  const totalGold = 0;
  const nonMineTerritoryCount = territories.filter(
    (t) => !t.isMine
  ).length;

  const economy: Economy = {
    totalGold,
    baseTerritoryValue:
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
    marketplace: [],
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
  territory: Territory
): number => {
  switch (territory.biome) {
    case 'field':
      return 1;
    case 'forest':
      return 2;
    case 'mountain':
      return 4;
    case 'river':
      return territory.hasBridge ? 1 : Infinity;
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

  const neighbors = getEightNeighbors(
    territory,
    board.territories,
    board.dimensions
  );

  // Must have all 8 surrounding territories.
  if (neighbors.length !== 8) {
    return false;
  }

  // All 8 surrounding territories must be forest or field.
  return neighbors.every(
    (neighbor) =>
      neighbor.biome === 'forest' ||
      neighbor.biome === 'field'
  );
}

export function hasMineInEightNeighbors(
  board: Board,
  territory: Territory
): boolean {
  const neighbors = getEightNeighbors(
    territory,
    board.territories,
    board.dimensions
  );

  return neighbors.some(
    (neighbor) => neighbor.isMine
  );
}

export function hasSite(
  board: Board,
  territoryId: string
): boolean {
  return (
    board.territories.some(
      (territory) =>
        territory.id === territoryId &&
        territory.isSite
    )
  );
}

export type SiteType =
  | 'settlement'
  | 'lumberYard'
  | 'waterProcessingPlant';

export function canEstablishSite(
  board: Board,
  territory: Territory,
  playerId: string,
  siteType: SiteType
): boolean {
  // Target must be owned by the player.
  if (territory.owner !== playerId) {
    return false;
  }

  // A territory can only contain one site.
  if (territory.isSite) {
    return false;
  }

  const neighbors = getEightNeighbors(
    territory,
    board.territories,
    board.dimensions
  );

  // --------------------------------------------------------
  // WATER PROCESSING PLANT
  // --------------------------------------------------------

  if (siteType === 'waterProcessingPlant') {
    /*
    * The Water Processing Plant must be placed
    * on forest or field.
    */
    if (
      territory.biome !== 'forest' &&
      territory.biome !== 'field'
    ) {
      return false;
    }

    /*
    * All 8 surrounding territories must exist.
    *
    * This prevents Water Processing Plants from
    * being placed along the edge of the board.
    */
    if (neighbors.length !== 8) {
      return false;
    }

    /*
    * The plant must touch a river cardinally.
    *
    * territory.neighbors contains only cardinal
    * neighbors, so diagonal rivers do not count.
    */
    const touchesRiverCardinally =
      territory.neighbors.some((neighborId) => {
        const neighbor = board.territories.find(
          (entry) => entry.id === neighborId
        );

        return neighbor?.biome === 'river';
      });

    if (!touchesRiverCardinally) {
      return false;
    }

    /*
    * All 8 surrounding territories must be owned
    * by the player.
    *
    * River biomes are allowed here.
    */
    if (
      neighbors.some(
        (neighbor) =>
          (
            neighbor.biome !== 'river' &&
            neighbor.owner !== playerId
          ) ||
          neighbor.hasBridge ||
          neighbor.isSite
      )
    ) {
      return false;
    }

    return true;
  }

  // --------------------------------------------------------
  // SETTLEMENT / LUMBER YARD
  // --------------------------------------------------------

  // Target biome requirement.
  if (
    siteType === 'settlement' &&
    territory.biome !== 'forest' &&
    territory.biome !== 'field'
  ) {
    return false;
  }

  if (
    siteType === 'lumberYard' &&
    territory.biome !== 'forest'
  ) {
    return false;
  }

  // All 8 surrounding territories must exist.
  if (neighbors.length !== 8) {
    return false;
  }

  for (const neighbor of neighbors) {
    // All 8 must be owned by the player.
    if (neighbor.owner !== playerId) {
      return false;
    }

    // All 8 must satisfy the site's biome requirement.
    if (
      siteType === 'settlement' &&
      neighbor.biome !== 'forest' &&
      neighbor.biome !== 'field'
    ) {
      return false;
    }

    if (
      siteType === 'lumberYard' &&
      neighbor.biome !== 'forest'
    ) {
      return false;
    }

    // No site may exist in any of the 8 surrounding territories.
    if (neighbor.isSite) {
      return false;
    }
  }

  return true;
}

export function canEstablishSettlement(
  board: Board,
  territory: Territory,
  playerId: string
): boolean {
  return canEstablishSite(
    board,
    territory,
    playerId,
    'settlement'
  );
}

export function canEstablishLumberYard(
  board: Board,
  territory: Territory,
  playerId: string
): boolean {
  return canEstablishSite(
    board,
    territory,
    playerId,
    'lumberYard'
  );
}

export function canEstablishWaterProcessingPlant(
  board: Board,
  territory: Territory,
  playerId: string
): boolean {
  return canEstablishSite(
    board,
    territory,
    playerId,
    'waterProcessingPlant'
  );
}

export const isConnectedTerritorySet = (
  territories: Territory[]
): boolean => {
  if (territories.length === 0) {
    return true;
  }

  const territoryIds = new Set(
    territories.map(
      (territory) => territory.id
    )
  );

  const visited = new Set<string>();
  const frontier = [territories[0].id];

  while (frontier.length > 0) {
    const currentId = frontier.pop()!;

    if (
      visited.has(currentId) ||
      !territoryIds.has(currentId)
    ) {
      continue;
    }

    visited.add(currentId);

    const current = territories.find(
      (territory) =>
        territory.id === currentId
    );

    current?.neighbors.forEach(
      (neighborId) => {
        if (
          territoryIds.has(neighborId) &&
          !visited.has(neighborId)
        ) {
          frontier.push(neighborId);
        }
      }
    );
  }

  return (
    visited.size === territories.length
  );
};

// //#endregion

// ============================================================
// #region ECONOMY
// ============================================================
function getMineProduction(
  state: GameState,
  playerId: string
): number {
  if (state.settings.mineCount <= 0) {
    return 0;
  }
  
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

const LUMBER_YARD_BASE_PRODUCTION = 100;
const LUMBER_YARD_BONUS = 1.5;
const LUMBER_YARD_COST = 1000;

const WATER_PROCESSING_PLANT_BASE_PRODUCTION = 100;
const WATER_PROCESSING_PLANT_BONUS = 1.5;

const SETTLEMENT_COST = 2000;

function getLumberYardCount(
  state: GameState,
  playerId: string
): number {
  return state.board.lumberYards.filter(
    (lumberYard) =>
      lumberYard.owner === playerId
  ).length;
}

function getWaterProcessingPlantCount(
  state: GameState,
  playerId: string
): number {
  return state.board.waterProcessingPlants.filter(
    (waterProcessingPlant) =>
      waterProcessingPlant.owner === playerId
  ).length;
}

function getLumberYardCost(
  state: GameState,
  playerId: string
): number {
  return getLumberYardCount(state, playerId) === 0
    ? 0
    : LUMBER_YARD_COST;
}

function getLumberYardProduction(
  state: GameState,
  playerId: string
): number {
  const lumberYardCount =
    getLumberYardCount(state, playerId);

  if (lumberYardCount <= 0) {
    return 0;
  }

  const production =
    LUMBER_YARD_BASE_PRODUCTION *
    Math.pow(
      LUMBER_YARD_BONUS,
      lumberYardCount - 1
    );

  return Math.round(production);
}

function getWaterProcessingPlantProduction(
  state: GameState,
  playerId: string
): number {
  const waterProcessingPlantCount =
    getWaterProcessingPlantCount(
      state,
      playerId
    );

  if (waterProcessingPlantCount <= 0) {
    return 0;
  }

  const production =
    WATER_PROCESSING_PLANT_BASE_PRODUCTION *
    Math.pow(
      WATER_PROCESSING_PLANT_BONUS,
      waterProcessingPlantCount - 1
    );

  return Math.round(production);
}

const POPULATION_GROWTH_BASE_WOOD = 10;
export function getPopulationGrowthCost(
  currentPopulation: number,
  populationIncrease: number
): number {
  let totalCost = 0;

  for (let i = 0; i < populationIncrease; i++) {
    const population = currentPopulation + i;

    totalCost += Math.max(
      1,
      Math.ceil(
        POPULATION_GROWTH_BASE_WOOD *
        Math.sqrt(population / 100)
      )
    );
  }

  return totalCost;
}

export function getAffordablePopulationGrowthOptions(
  population: number,
  wood: number
): {
  percentage: 1 | 5 | 10;
  populationIncrease: number;
  woodCost: number;
}[] {
  const percentages: (1 | 5 | 10)[] = [1, 5, 10];

  return percentages
    .map((percentage) => {
      const populationIncrease = Math.max(
        1,
        Math.ceil(
          population * (percentage / 100)
        )
      );

      const woodCost =
        getPopulationGrowthCost(
          population,
          populationIncrease
        );

      return {
        percentage,
        populationIncrease,
        woodCost,
      };
    })
    .filter(
      (option) =>
        option.woodCost <= wood
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

export function getTerritoryPrice(
  state: GameState,
): number {
  return state.economy.baseTerritoryValue;
}

// //#endregion

// ============================================================
// #region ACTION HELPERS
// ============================================================


const BRIDGE_COST = 1000;
export function canBuildBridge(
  state: GameState,
  territory: Territory,
  playerId: string
): boolean {
  if (territory.biome !== 'river') {
    return false;
  }

  if (territory.hasBridge) {
    return false;
  }

  // Bridges cannot be built if any of the surrounding
  // 8 territories contains another bridge or site.
  const surroundingSiteOrBridge =
    getEightNeighbors(
      territory,
      state.board.territories,
      state.board.dimensions
    ).some(
      (neighbor) =>
        neighbor.hasBridge ||
        neighbor.isSite
    );

  if (surroundingSiteOrBridge) {
    return false;
  }

  const player = state.players.find(
    (entry) => entry.id === playerId
  );

  if (!player || player.wood < BRIDGE_COST) {
    return false;
  }

  // A bridge must touch territory owned by the player.
  const ownedCardinalNeighbor = territory.neighbors.some(
    (neighborId) =>
      player.territoryIds.includes(neighborId)
  );

  if (!ownedCardinalNeighbor) {
    return false;
  }

  const index =
    Number(territory.id.slice(2)) - 1;

  const row =
    Math.floor(index / state.board.dimensions.cols);

  const col =
    index % state.board.dimensions.cols;

  const { rows, cols } = state.board.dimensions;

  const getTerritoryAt = (
    targetRow: number,
    targetCol: number
  ): Territory | undefined => {
    if (
      targetRow < 0 ||
      targetRow >= rows ||
      targetCol < 0 ||
      targetCol >= cols
    ) {
      return undefined;
    }

    const targetId =
      `t-${targetRow * cols + targetCol + 1}`;

    return state.board.territories.find(
      (entry) => entry.id === targetId
    );
  };

  /*
   * Determine the river's local flow direction.
   * Rivers are generated using cardinal neighbors.
   */
  const north = getTerritoryAt(row - 1, col);
  const south = getTerritoryAt(row + 1, col);
  const east = getTerritoryAt(row, col + 1);
  const west = getTerritoryAt(row, col - 1);

    /*
   * A bridge can only be built when the selected river
   * territory is part of a 3-territory straight river.
   *
   * Horizontal:
   *
   *   F  F  F
   *   R  X  R
   *   F  F  F
   *
   * Vertical:
   *
   *   F  R  F
   *   F  X  F
   *   F  R  F
   *
   * The six non-river territories surrounding X must
   * all be field or forest.
   */

  const horizontalRiver =
    east?.biome === 'river' &&
    west?.biome === 'river';

  const verticalRiver =
    north?.biome === 'river' &&
    south?.biome === 'river';

  if (!horizontalRiver && !verticalRiver) {
    return false;
  }

  /*
   * Get the six territories that are not part of the
   * three-territory cardinal river line.
   */
  const surroundingTerritories: (
    Territory | undefined
  )[] = horizontalRiver
    ? [
        getTerritoryAt(row - 1, col - 1),
        getTerritoryAt(row - 1, col),
        getTerritoryAt(row - 1, col + 1),
        getTerritoryAt(row + 1, col - 1),
        getTerritoryAt(row + 1, col),
        getTerritoryAt(row + 1, col + 1),
      ]
    : [
        getTerritoryAt(row - 1, col - 1),
        getTerritoryAt(row - 1, col + 1),
        getTerritoryAt(row, col - 1),
        getTerritoryAt(row, col + 1),
        getTerritoryAt(row + 1, col - 1),
        getTerritoryAt(row + 1, col + 1),
      ];

  /*
   * All six surrounding territories must exist and
   * must be either field or forest.
   */
  return surroundingTerritories.every(
    (entry) =>
      entry &&
      (
        entry.biome === 'field' ||
        entry.biome === 'forest'
      )
  );
}

// function getEligibleBuyers(
//   state: GameState,
//   territory: Territory,
//   currentPlayerId: string
// ): Player[] {
//   const buyerIds = new Set<string>();

//   territory.neighbors.forEach(
//     (neighborId) => {
//       const neighbor =
//         state.board.territories.find(
//           (entry) =>
//             entry.id === neighborId
//         );

//       if (
//         neighbor?.owner &&
//         neighbor.owner !== currentPlayerId
//       ) {
//         buyerIds.add(neighbor.owner);
//       }
//     }
//   );

//   return state.players.filter(
//     (player) =>
//       buyerIds.has(player.id)
//   );
// }

// //#endregion

// ============================================================
// #region MARKETPLACE HELPERS
// ============================================================

export function getMarketplaceListing(
  state: GameState,
  listingId: string
): MarketplaceListing | undefined {
  return state.marketplace.find(
    (listing) => listing.id === listingId
  );
}

export function getMarketplaceListings(
  state: GameState,
  itemType?: string
): MarketplaceListing[] {
  const listings = itemType
    ? state.marketplace.filter(
        (listing) => listing.item === itemType
      )
    : [...state.marketplace];

  return listings.sort(
    (a, b) => {
      // Cheapest price per unit comes first.
      if (a.pricePerUnit !== b.pricePerUnit) {
        return a.pricePerUnit - b.pricePerUnit;
      }

      // If prices are identical, oldest listing comes first.
      return a.listedAt - b.listedAt;
    }
  );
}

export function canRemoveMarketplaceListing(
  state: GameState,
  listing: MarketplaceListing
): boolean {
  return (
    state.turn.round >=
    listing.listedRound + 5 // Requires 5 full turn rounds before player can remove their listing
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

  const previousPlayerIndex =
    nextState.turn.currentPlayerIndex;

  nextState.turn.currentPlayerIndex =
    (
      previousPlayerIndex + 1
    ) %
    nextState.players.length;

  if (
    nextState.turn.currentPlayerIndex === 0
  ) {
    nextState.turn.round += 1;
  }

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

    marketplace:
      state.marketplace.map(
        (listing) => ({
          ...listing,
        })
      ),

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

      lumberYards:
        state.board.lumberYards.map(
          (lumberYard) => ({
            ...lumberYard,
          })
        ),

      waterProcessingPlants:
        (state.board.waterProcessingPlants ?? []).map(
          (waterProcessingPlant) => ({
            ...waterProcessingPlant,
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
      territory.biome === 'river' &&
      !territory.hasBridge
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
        territory
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

  if (
    canBuildBridge(
      state,
      territory,
      currentPlayer.id
    )
  ) {
    actions.push({
      type: 'buildBridge',
      label: `Build Bridge (Cost: ${BRIDGE_COST} Wood)`,
    });
  }

  if (!territory.owner) {
    // Rivers without bridges cannot be owned.
    if (
      territory.biome === 'river' &&
      !territory.hasBridge
    ) {
      return actions;
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
      state.economy.baseTerritoryValue;

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

      const affordableGrowthOptions =
        getAffordablePopulationGrowthOptions(
          settlement.population,
          currentPlayer.wood
        );

      if (affordableGrowthOptions.length > 0) {
        actions.push({
          type: 'growSettlement',
          label: 'Grow Population',
        });
      }

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
      currentPlayer.wood >= SETTLEMENT_COST &&
      canEstablishSettlement(
        state.board,
        territory,
        currentPlayer.id
      )
    ) {
      actions.push({
        type: 'establishSettlement',
        label: `Establish Settlement (Cost: ${SETTLEMENT_COST} Wood)`,
      });
    }

    const lumberYardCost =
      getLumberYardCost(
        state,
        currentPlayer.id
      );

    if (
      currentPlayer.wood >= lumberYardCost &&
      canEstablishLumberYard(
        state.board,
        territory,
        currentPlayer.id
      )
    ) {
      actions.push({
        type: 'establishLumberYard',
        label:
          lumberYardCost === 0
            ? 'Establish Lumber Yard (Free)'
            : `Establish Lumber Yard (Cost: ${lumberYardCost} Wood)`,
      });
    }

    if (
      canEstablishWaterProcessingPlant(
        state.board,
        territory,
        currentPlayer.id
      )
    ) {
      actions.push({
        type: 'establishWaterProcessingPlant',
        label: 'Establish Water Processing Plant',
      });
    }

    const lumberYard =
      state.board.lumberYards.find(
        (lumberYard) =>
          lumberYard.territoryId === territory.id &&
          lumberYard.owner === currentPlayer.id
      );

    if (lumberYard) {
      actions.push({
        type: 'produceWood',
        label:
          `Produce Wood (+${
            getLumberYardProduction(
              state,
              currentPlayerId
            )
          } Wood)`,
      });
    }

    const waterProcessingPlant =
      state.board.waterProcessingPlants.find(
        (waterProcessingPlant) =>
          waterProcessingPlant.territoryId === territory.id &&
          waterProcessingPlant.owner === currentPlayer.id
      );

    if (waterProcessingPlant) {
      actions.push({
        type: 'produceWater',
        label:
          `Produce Water (+${
            getWaterProcessingPlantProduction(
              state,
              currentPlayerId
            )
          } Water)`,
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
            state.economy.baseTerritoryValue
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
      (
        target.biome === 'river' &&
        !target.hasBridge
      )
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
            !hasMineInEightNeighbors(
              state.board,
              target
            ) &&
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

      /*
      * The first placement is special:
      * it is both the player's first claimed territory
      * and their capital settlement.
      *
      * Do NOT enter claiming mode first.
      * The settlement name is supplied with this same action.
      */
      if (isStartingTurn) {
        const settlementName =
          typeof move.payload?.settlementName === 'string'
            ? move.payload.settlementName.trim()
            : '';

        if (!settlementName) {
          return {
            success: false,
            reason: 'Settlement name is required',
            state,
          };
        }

        const nextState =
          cloneState(state);

        const settlement: Settlement = {
          id: `settlement-${currentPlayer.id}`,
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
              player.id === currentPlayer.id
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

        nextState.board.territories =
          nextState.board.territories.map(
            (territory) =>
              territory.id === target.id
                ? {
                    ...territory,
                    owner: currentPlayer.id,
                    isSite: true,
                  }
                : territory
          );

        /*
        * The capital placement consumes movement just like
        * any other claim.
        */
        const movementCost =
          getBiomeMovementCost(target);

        nextState.turn.movementRemaining -=
          movementCost;

        /*
        * If movement remains, the player can continue claiming.
        * Otherwise advance the turn.
        */
        if (
          nextState.turn.movementRemaining <= 0
        ) {
          return {
            success: true,
            state: advanceTurn(nextState),
          };
        }

        nextState.turn.phase =
          'claiming';

        return {
          success: true,
          state: nextState,
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
        target
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
                owner: currentPlayer.id,
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
        reason: 'Invalid settlement location',
        state,
      };
    }

    if (currentPlayer.wood < SETTLEMENT_COST) {
      return {
        success: false,
        reason: 'Not enough wood to establish settlement',
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

    const player =
      nextState.players.find(
        (player) =>
          player.id === currentPlayer.id
      );

    if (!player) {
      return {
        success: false,
        reason: 'Player not found',
        state,
      };
    }

    player.wood -= SETTLEMENT_COST;

    nextState.board.settlements.push(
      settlement
    );

    nextState.board.territories =
      nextState.board.territories.map(
        (territory) =>
          territory.id === target.id
            ? {
                ...territory,
                isSite: true,
              }
            : territory
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
    move.type === 'growSettlement' &&
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
        reason: 'Invalid settlement',
        state,
      };
    }

    const percentage =
      move.payload?.percentage;

    if (
      percentage !== 1 &&
      percentage !== 5 &&
      percentage !== 10
    ) {
      return {
        success: false,
        reason: 'Invalid population growth percentage',
        state,
      };
    }

    const populationIncrease =
      Math.max(
        1,
        Math.ceil(
          settlement.population *
          (percentage / 100)
        )
      );

    const growthCost =
      getPopulationGrowthCost(
        settlement.population,
        populationIncrease
      );

    if (
      currentPlayer.wood < growthCost
    ) {
      return {
        success: false,
        reason:
          'Not enough wood to grow population',
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

    const player =
      nextState.players.find(
        (player) =>
          player.id === currentPlayer.id
      );

    if (!nextSettlement || !player) {
      return {
        success: false,
        reason:
          'Settlement or player not found',
        state,
      };
    }

    player.wood -= growthCost;

    nextSettlement.population +=
      populationIncrease;

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
    
    nextState.board.territories =
      nextState.board.territories.map(
        (territory) =>
          territory.id === settlement.territoryId
            ? {
                ...territory,
                isSite: false,
              }
            : territory
      );

    return {
      success: true,
      state: advanceTurn(nextState),
    };
  }

  if (
    move.type === 'establishLumberYard' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id === move.targetTerritoryId
      );

    if (
      !target ||
      !canEstablishLumberYard(
        state.board,
        target,
        currentPlayer.id
      )
    ) {
      return {
        success: false,
        reason:
          'Invalid lumber yard location',
        state,
      };
    }

    const lumberYardCost =
      getLumberYardCost(
        state,
        currentPlayer.id
      );

    if (currentPlayer.wood < lumberYardCost) {
      return {
        success: false,
        reason:
          'Not enough wood to establish lumber yard',
        state,
      };
    }

    const lumberYard: LumberYard = {
      id:
        `lumber-yard-${currentPlayer.id}-${Date.now()}`,
      territoryId: target.id,
      owner: currentPlayer.id,
    };

    const nextState = cloneState(state);

    const player =
      nextState.players.find(
        (player) =>
          player.id === currentPlayer.id
      );

    if (!player) {
      return {
        success: false,
        reason: 'Player not found',
        state,
      };
    }

    player.wood -= lumberYardCost;

    nextState.board.lumberYards.push(
      lumberYard
    );

    nextState.board.territories =
      nextState.board.territories.map(
        (territory) =>
          territory.id === target.id
            ? {
                ...territory,
                isSite: true,
              }
            : territory
      );

    return {
      success: true,
      state: advanceTurn(nextState),
    };
  }

  if (
    move.type === 'establishWaterProcessingPlant' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id === move.targetTerritoryId
      );

    if (
      !target ||
      !canEstablishWaterProcessingPlant(
        state.board,
        target,
        currentPlayer.id
      )
    ) {
      return {
        success: false,
        reason:
          'Invalid water processing plant location',
        state,
      };
    }

    const waterProcessingPlant:
      WaterProcessingPlant = {
      id:
        `water-processing-plant-${currentPlayer.id}-${Date.now()}`,
      territoryId: target.id,
      owner: currentPlayer.id,
    };

    const nextState =
      cloneState(state);

    nextState.board.waterProcessingPlants.push(
      waterProcessingPlant
    );

    nextState.board.territories =
      nextState.board.territories.map(
        (territory) =>
          territory.id === target.id
            ? {
                ...territory,
                isSite: true,
              }
            : territory
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
    // TODO: Replace direct territory buying with Marketplace purchase logic.

    return {
      success: false,
      reason: 'Direct territory buying has been replaced by the Marketplace',
      state,
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

    nextState.economy.baseTerritoryValue =
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
    move.type === 'produceWood' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id === move.targetTerritoryId
      );

    const lumberYard =
      state.board.lumberYards.find(
        (entry) =>
          entry.territoryId === move.targetTerritoryId
      );

    if (
      !target ||
      target.owner !== currentPlayer.id ||
      !target.isSite ||
      !lumberYard ||
      lumberYard.owner !== currentPlayer.id
    ) {
      return {
        success: false,
        reason: 'Invalid produce wood action',
        state,
      };
    }

    const nextState =
      cloneState(state);

    const woodProduced =
      getLumberYardProduction(
        nextState,
        currentPlayerId
      );

    const player =
      nextState.players.find(
        (player) =>
          player.id === currentPlayer.id
      );

    if (player) {
      player.wood += woodProduced;
    }

    return {
      success: true,
      state: advanceTurn(nextState),
    };
  }

  if (
    move.type === 'produceWater' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id === move.targetTerritoryId
      );

    const waterProcessingPlant =
      state.board.waterProcessingPlants.find(
        (entry) =>
          entry.territoryId === move.targetTerritoryId
      );

    if (
      !target ||
      target.owner !== currentPlayer.id ||
      !target.isSite ||
      !waterProcessingPlant ||
      waterProcessingPlant.owner !== currentPlayer.id
    ) {
      return {
        success: false,
        reason: 'Invalid produce water action',
        state,
      };
    }

    const nextState =
      cloneState(state);

    const waterProduced =
      getWaterProcessingPlantProduction(
        nextState,
        currentPlayerId
      );

    const player =
      nextState.players.find(
        (player) =>
          player.id === currentPlayer.id
      );

    if (player) {
      player.water += waterProduced;
    }

    return {
      success: true,
      state: advanceTurn(nextState),
    };
  }

  if (
    move.type === 'sell' &&
    move.targetTerritoryId
  ) {
    // TODO: Replace direct territory selling with Marketplace listing logic.

    return {
      success: false,
      reason: 'Direct territory selling has been replaced by the Marketplace',
      state,
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
    move.type === 'buildBridge' &&
    move.targetTerritoryId
  ) {
    const target =
      state.board.territories.find(
        (territory) =>
          territory.id === move.targetTerritoryId
      );

    if (
      !target ||
      !canBuildBridge(
        state,
        target,
        currentPlayer.id
      )
    ) {
      return {
        success: false,
        reason: 'Invalid bridge location',
        state,
      };
    }

    if (currentPlayer.wood < BRIDGE_COST) {
      return {
        success: false,
        reason: 'Not enough wood to build bridge',
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
                hasBridge: true,
                owner: currentPlayer.id,
              }
            : territory
      );

    const player =
      nextState.players.find(
        (player) =>
          player.id === currentPlayer.id
      );

    if (player) {
      player.wood -= BRIDGE_COST;

      player.territoryIds.push(
        target.id
      );
    }

    return {
      success: true,
      state: advanceTurn(nextState),
    };
  }

    if (
      move.type === 'listMarketplaceItem'
    ) {
      const itemType =
        move.payload?.itemType;

      const quantity =
        move.payload?.quantity;

      const pricePerUnit =
        move.payload?.pricePerUnit;

      if (
        itemType !== 'wood' &&
        itemType !== 'water'
      ) {
        return {
          success: false,
          reason: 'Invalid marketplace item',
          state,
        };
      }

      if (
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return {
          success: false,
          reason: 'Invalid marketplace quantity',
          state,
        };
      }

      if (
        typeof pricePerUnit !== 'number' ||
        !Number.isFinite(pricePerUnit) ||
        pricePerUnit <= 0
      ) {
        return {
          success: false,
          reason: 'Invalid marketplace price',
          state,
        };
      }

      const availableItemQuantity =
        itemType === 'wood'
          ? currentPlayer.wood
          : currentPlayer.water;

      if (availableItemQuantity < quantity) {
        return {
          success: false,
          reason: `Not enough ${itemType}`,
          state,
        };
      }

      const nextState =
        cloneState(state);

      const player =
        nextState.players.find(
          (player) =>
            player.id === currentPlayer.id
        );

      if (!player) {
        return {
          success: false,
          reason: 'Player not found',
          state,
        };
      }

      /*
      * Remove the listed items from the player's inventory.
      *
      * These items now belong to the marketplace
      * until the listing is purchased.
      */
      if (itemType === 'wood') {
        player.wood -= quantity;
      } else {
        player.water -= quantity;
      }

      const listing: MarketplaceListing = {
        id:
          `listing-${currentPlayer.id}-${Date.now()}-${Math.random()}`,
        sellerPlayerId:
          currentPlayer.id,
        item: itemType as 'wood' | 'water',
        quantity,
        pricePerUnit,
        listedRound: state.turn.round,
        listedAt: Date.now(),
      };

      nextState.marketplace.push(
        listing
      );

      /*
      * Marketplace actions NEVER end the turn.
      */
      return {
        success: true,
        state: nextState,
      };
    }

    if (
      move.type === 'buyMarketplaceListing'
    ) {
      const listingId =
        move.payload?.listingId;

      const quantity =
        move.payload?.quantity;

      if (
        typeof listingId !== 'string'
      ) {
        return {
          success: false,
          reason: 'Invalid marketplace listing',
          state,
        };
      }

      if (
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return {
          success: false,
          reason: 'Invalid marketplace quantity',
          state,
        };
      }

      const listing =
        state.marketplace.find(
          (entry) =>
            entry.id === listingId
        );

      if (!listing) {
        return {
          success: false,
          reason: 'Marketplace listing not found',
          state,
        };
      }

      if (
        listing.sellerPlayerId ===
        currentPlayer.id
      ) {
        return {
          success: false,
          reason: 'You cannot buy your own listing',
          state,
        };
      }

      if (
        quantity > listing.quantity
      ) {
        return {
          success: false,
          reason: 'Not enough items in listing',
          state,
        };
      }

      const totalCost =
        quantity * listing.pricePerUnit;

      if (
        currentPlayer.gold < totalCost
      ) {
        return {
          success: false,
          reason: 'Not enough gold',
          state,
        };
      }

      const nextState =
        cloneState(state);

      const buyer =
        nextState.players.find(
          (player) =>
            player.id === currentPlayer.id
        );

      const seller =
        nextState.players.find(
          (player) =>
            player.id === listing.sellerPlayerId
        );

      if (!buyer || !seller) {
        return {
          success: false,
          reason: 'Buyer or seller not found',
          state,
        };
      }

      buyer.gold -= totalCost;

      if (listing.item === 'wood') {
        buyer.wood += quantity;
      } else {
        buyer.water += quantity;
      }

      seller.gold += totalCost;

      const nextListing =
        nextState.marketplace.find(
          (entry) =>
            entry.id === listing.id
        );

      if (!nextListing) {
        return {
          success: false,
          reason: 'Marketplace listing not found',
          state,
        };
      }

      nextListing.quantity -= quantity;

      /*
      * Remove the listing when all items
      * have been purchased.
      */
      if (
        nextListing.quantity <= 0
      ) {
        nextState.marketplace =
          nextState.marketplace.filter(
            (entry) =>
              entry.id !== listing.id
          );
      }

      updateTotalGold(nextState);

      /*
      * Marketplace actions NEVER end the turn.
      */
      return {
        success: true,
        state: nextState,
      };
    }

    if (
      move.type === 'removeMarketplaceListing'
    ) {
      const listingId =
        move.payload?.listingId;

      if (
        typeof listingId !== 'string'
      ) {
        return {
          success: false,
          reason: 'Invalid marketplace listing',
          state,
        };
      }

      const listing =
        state.marketplace.find(
          (entry) =>
            entry.id === listingId
        );

      if (!listing) {
        return {
          success: false,
          reason: 'Marketplace listing not found',
          state,
        };
      }

      if (
        listing.sellerPlayerId !==
        currentPlayer.id
      ) {
        return {
          success: false,
          reason:
            'You can only remove your own listings',
          state,
        };
      }

      if (
        !canRemoveMarketplaceListing(
          state,
          listing
        )
      ) {
        return {
          success: false,
          reason:
            'This listing is locked for 5 full rounds',
          state,
        };
      }

      const nextState =
        cloneState(state);

      const nextListing =
        nextState.marketplace.find(
          (entry) =>
            entry.id === listing.id
        );

      if (!nextListing) {
        return {
          success: false,
          reason:
            'Marketplace listing not found',
          state,
        };
      }

      const seller =
        nextState.players.find(
          (player) =>
            player.id === currentPlayer.id
        );

      if (!seller) {
        return {
          success: false,
          reason: 'Player not found',
          state,
        };
      }

      /*
      * Return the remaining items to the seller.
      */
      if (
        nextListing.item === 'wood'
      ) {
        seller.wood += nextListing.quantity;
      }

      nextState.marketplace =
        nextState.marketplace.filter(
          (entry) =>
            entry.id !== nextListing.id
        );

      /*
      * Marketplace actions NEVER end the turn.
      */
      return {
        success: true,
        state: nextState,
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
