import { ActionResult, AvailableAction, Board, Economy, GameState, Move, Player, PlayerConfig, Territory } from '../types';

export const MINE_EFFICIENCY_TABLE = [1, 0.99, 0.98, 0.96, 0.92, 0.84, 0.36];

type Rng = () => number;

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
    options.mineCount,
    rng
  );

  generateFieldBiomes(
    board.territories,
    rng
  );

  generateRiverBiomes(
    board.territories,
    board.dimensions,
    rng
  );

  const mineTerritoryIds = placeMines(
    board.territories,
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
  }));

  const boardWithMines: Board = {
    territories,
    mines: mineTerritoryIds.map((territoryId, index) => ({ id: `mine-${index + 1}`, territoryId, efficiency: 1 })),
    dimensions: board.dimensions,
  };

  const totalGold = 0
  const nonMineTerritoryCount = territories.filter((t) => !t.isMine).length;
  const economy: Economy = {
    totalGold,
    levelOneValue: totalGold / Math.max(1, nonMineTerritoryCount),
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
    },
    settings: {
      territoryCount: options.territoryCount,
      mineCount: options.mineCount,
    },
  };

  const validStartingTerritories = getValidStartingTerritories(state.board);
  if (validStartingTerritories.length < players.length) {
    return createInitialGameState({ ...options, rng });
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

export const getValidStartingTerritories = (board: Board): Territory[] => {
  return board.territories.filter((territory) => {
    if (territory.isMine) {
      return false;
    }
    const hasMineNeighbor = territory.neighbors.some((neighborId) => {
      const neighbor = board.territories.find((entry) => entry.id === neighborId);
      return Boolean(neighbor?.isMine);
    });
    return !hasMineNeighbor;
  });
};

export const isConnectedTerritorySet = (territories: Territory[]): boolean => {
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
    const current = territories.find((territory) => territory.id === currentId);
    current?.neighbors.forEach((neighborId) => {
      if (!visited.has(neighborId)) {
        frontier.push(neighborId);
      }
    });
  }
  return visited.size === territories.length;
};

export const getTerritoryFairValue = (territory: Territory, state: GameState): number => {
  if (territory.isMine) {
    return 100 * state.economy.levelOneValue;
  }
  return territory.level * state.economy.levelOneValue;
};

function getMineProduction(
  state: GameState,
  playerId: string
): number {
  const playerMineCount = state.board.territories.filter(
    (territory) =>
      territory.owner === playerId && territory.isMine
  ).length;

  const baseProduction =
    (10000 * state.economy.mineEfficiency) /
    state.settings.mineCount;

  const mineBonus = 1 + 0.10 * (playerMineCount - 1);

  return Math.round(baseProduction * mineBonus);
}

function updateTotalGold(state: GameState): void {
  state.economy.totalGold = state.players.reduce(
    (total, player) => total + player.gold,
    0
  );
}

function getEligibleBuyers(
  state: GameState,
  territory: Territory,
  currentPlayerId: string
): Player[] {
  const buyerIds = new Set<string>();

  territory.neighbors.forEach((neighborId) => {
    const neighbor = state.board.territories.find(
      (territory) => territory.id === neighborId
    );

    if (
      neighbor?.owner &&
      neighbor.owner !== currentPlayerId
    ) {
      buyerIds.add(neighbor.owner);
    }
  });

  return state.players.filter((player) =>
    buyerIds.has(player.id)
  );
}

export const getAvailableActions = (state: GameState, territoryId: string): AvailableAction[] => {
  const currentPlayerId = state.turn.order[state.turn.currentPlayerIndex];
  const currentPlayer = state.players.find((player) => player.id === currentPlayerId);
  const territory = state.board.territories.find((entry) => entry.id === territoryId);
  if (!currentPlayer || !territory) {
    return [];
  }

  const actions: AvailableAction[] = [];
  if (!territory.owner) {
    const isStartingTurn = currentPlayer.territoryIds.length === 0;
    const canClaim = isStartingTurn ? !territory.isMine : territory.neighbors.some((neighborId) => currentPlayer.territoryIds.includes(neighborId));
    if (canClaim) {
      actions.push({ type: 'claim', label: 'Claim territory' });
    }
    return actions;
  }

  if (territory.owner && territory.owner !== currentPlayer.id && !territory.isMine) {
    const buyCost = state.economy.levelOneValue * territory.level;

    if (currentPlayer.gold >= buyCost && buyCost > 0) {
      actions.push({
        type: 'buy',
        label: `Buy territory (Asking Price: ${buyCost} Gold)`
      });
    }

    return actions;
  }

  if (territory.owner === currentPlayer.id && !territory.isMine) {
    const upgradeCost = state.economy.levelOneValue;

    if (currentPlayer.gold >= upgradeCost) {
      actions.push({
        type: 'upgrade',
        label: `Upgrade territory (Cost: ${upgradeCost} Gold)`
      });
    }

    const adjacentOwned = state.board.territories.filter((entry) => entry.owner === currentPlayer.id && entry.id !== territory.id && territory.neighbors.includes(entry.id));
    if (adjacentOwned.length > 0) {
      actions.push({ type: 'sell', label: `Sell territory (Price: ${state.economy.levelOneValue * territory.level} Gold)` });
    }
    return actions;
  }

  if (territory.owner === currentPlayer.id && territory.isMine) {
    actions.push({ type: 'produce', label: `Produce from mine (Production: ${getMineProduction(state, currentPlayerId)})` });
  }

  actions.push({ type: 'skip', label: 'Skip turn' });
  return actions;
};

export const executeGameAction = (state: GameState, move: Move): ActionResult => {
  const currentPlayerId = state.turn.order[state.turn.currentPlayerIndex];
  const currentPlayer = state.players.find((player) => player.id === currentPlayerId);
  if (!currentPlayer) {
    return { success: false, reason: 'Missing current player', state };
  }

  if (move.type === 'claim' && move.targetTerritoryId) {
    const target = state.board.territories.find((territory) => territory.id === move.targetTerritoryId);
    if (!target || target.owner) {
      return { success: false, reason: 'Invalid territory claim', state };
    }
    const isStartingTurn = currentPlayer.territoryIds.length === 0;
    const validClaim = isStartingTurn ? !target.isMine : target.neighbors.some((neighborId) => currentPlayer.territoryIds.includes(neighborId));
    if (!validClaim) {
      return { success: false, reason: 'Territory must be adjacent to owned territory', state };
    }

    const nextState = cloneState(state);
    nextState.board.territories = nextState.board.territories.map((territory) => (territory.id === target.id ? { ...territory, owner: currentPlayer.id } : territory));
    nextState.players = nextState.players.map((player) => (player.id === currentPlayer.id ? { ...player, territoryIds: [...player.territoryIds, target.id] } : player));
    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
    return { success: true, state: nextState };
  }

  if (move.type === 'buy' && move.targetTerritoryId) {
    const target = state.board.territories.find((territory) => territory.id === move.targetTerritoryId);
    if (!target || !target.owner || target.owner === currentPlayer.id || target.isMine) {
      return { success: false, reason: 'Invalid buy action', state };
    }
    const isAdjacent = target.neighbors.some((neighborId) => currentPlayer.territoryIds.includes(neighborId));
    if (!isAdjacent) {
      return { success: false, reason: 'Territory must be adjacent to your territory', state };
    }
    const buyPrice = state.economy.levelOneValue * target.level;
    if (currentPlayer.gold < buyPrice) {
      return {
        success: false,
        reason: 'Not enough gold to buy territory',
        state,
      };
    }
    const nextState = cloneState(state);
    nextState.board.territories = nextState.board.territories.map((territory) => (territory.id === target.id ? { ...territory, owner: currentPlayer.id } : territory));
    nextState.players = nextState.players.map((player) => {
      if (player.id === currentPlayer.id) {
        return {
          ...player,
          gold: player.gold - buyPrice,
          territoryIds: [...player.territoryIds, target.id],
        };
      }
      if (player.id === target.owner) {
        return {
          ...player,
          gold: player.gold + buyPrice,
          territoryIds: player.territoryIds.filter(
            (territoryId) => territoryId !== target.id
          ),
        };
      }
      return player;
    });
    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
    return { success: true, state: nextState };
  }

  if (move.type === 'upgrade' && move.targetTerritoryId) {
    const target = state.board.territories.find(
      (territory) => territory.id === move.targetTerritoryId
    );

    if (!target || target.owner !== currentPlayer.id || target.isMine) {
      return { success: false, reason: 'Invalid upgrade action', state };
    }

    const upgradeCost = state.economy.levelOneValue;

    if (currentPlayer.gold < upgradeCost) {
      return {
        success: false,
        reason: 'Not enough gold to upgrade',
        state,
      };
    }

    const nextState = cloneState(state);

    // Upgrade the territory
    nextState.board.territories = nextState.board.territories.map((territory) =>
      territory.id === target.id
        ? { ...territory, level: territory.level + 1 }
        : territory
    );

    // Deduct the gold
    const player = nextState.players.find(
      (player) => player.id === currentPlayer.id
    );

    if (player) {
      player.gold -= upgradeCost;
    }

    updateTotalGold(nextState);

    nextState.turn.currentPlayerIndex =
      (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;

    return { success: true, state: nextState };
  }

  if (move.type === 'produce' && move.targetTerritoryId) {
    const target = state.board.territories.find((territory) => territory.id === move.targetTerritoryId);
    if (!target || target.owner !== currentPlayer.id || !target.isMine) {
      return { success: false, reason: 'Invalid produce action', state };
    }
    const nextState = cloneState(state);
    const goldProduced = getMineProduction(nextState, currentPlayerId);
    // Add gold to the current player
    const player = nextState.players.find(
      (player) => player.id === currentPlayer.id
    );

    if (player) {
      player.gold += goldProduced;
    }

    // Total gold is the sum of all player gold
    updateTotalGold(nextState);

    // Recalculate level one territory value
    const nonMineTerritoryCount = nextState.board.territories.filter(
      (territory) => !territory.isMine
    ).length;
    nextState.economy.levelOneValue = Math.round(
      nextState.economy.totalGold / Math.max(1, nonMineTerritoryCount)
    );

    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
    return { success: true, state: nextState };
  }

  if (move.type === 'sell' && move.targetTerritoryId) {
    const target = state.board.territories.find(
      (territory) => territory.id === move.targetTerritoryId
    );

    if (!target || target.owner !== currentPlayer.id || target.isMine) {
      return { success: false, reason: 'Invalid sell action', state };
    }

    const buyerPlayerId = move.payload?.buyerPlayerId;

    if (typeof buyerPlayerId !== 'string') {
      return { success: false, reason: 'No buyer selected', state };
    }

    const buyer = state.players.find(
      (player) => player.id === buyerPlayerId
    );

    if (!buyer) {
      return { success: false, reason: 'Buyer not found', state };
    }

    const eligibleBuyers = getEligibleBuyers(
      state,
      target,
      currentPlayer.id
    );

    if (!eligibleBuyers.some((player) => player.id === buyerPlayerId)) {
      return { success: false, reason: 'Buyer is not adjacent', state };
    }

    const salePrice = state.economy.levelOneValue * target.level;

    if (buyer.gold < salePrice) {
      return { success: false, reason: 'Buyer cannot afford territory', state };
    }

    const nextState = cloneState(state);

    // Transfer ownership
    nextState.board.territories = nextState.board.territories.map(
      (territory) =>
        territory.id === target.id
          ? { ...territory, owner: buyerPlayerId }
          : territory
    );

    // Transfer gold and update territory lists
    nextState.players = nextState.players.map((player) => {
      if (player.id === currentPlayer.id) {
        return {
          ...player,
          gold: player.gold + salePrice,
          territoryIds: player.territoryIds.filter(
            (territoryId) => territoryId !== target.id
          ),
        };
      }

      if (player.id === buyerPlayerId) {
        return {
          ...player,
          gold: player.gold - salePrice,
          territoryIds: [
            ...player.territoryIds,
            target.id,
          ],
        };
      }

      return player;
    });

    nextState.turn.currentPlayerIndex =
      (nextState.turn.currentPlayerIndex + 1) %
      nextState.players.length;

    return { success: true, state: nextState };
  }

  if (move.type === 'skip') {
    const nextState = cloneState(state);
    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
    return { success: true, state: nextState };
  }

  return { success: true, state: advanceTurn(state) };
};

function advanceTurn(state: GameState): GameState {
  const nextState = cloneState(state);
  nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
  return nextState;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    turn: { ...state.turn },
    economy: { ...state.economy},
    players: state.players.map((player) => ({ 
      ...player, 
      territoryIds: [...player.territoryIds],
    })),
    board: {
      ...state.board,
      territories: state.board.territories.map((territory) => ({ 
        ...territory,
        neighbors: [...territory.neighbors],
      })),
      mines: state.board.mines.map((mine) => ({ ...mine })),
    },
  };
}

function generateBoard(territoryCount: number, rng: Rng): Board {
  const temporaryCellCount = territoryCount * 2;

  const cols = Math.ceil(Math.sqrt(temporaryCellCount));
  const rows = Math.ceil(temporaryCellCount / cols);

  const remaining = new Set<number>();

  // Start with a small irregular seed instead of one
  // single center cell. This gives the map an organic
  // starting shape.
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);

  const seedCandidates = [
    centerRow * cols + centerCol,
    (centerRow - 1) * cols + centerCol,
    (centerRow + 1) * cols + centerCol,
    centerRow * cols + centerCol - 1,
    centerRow * cols + centerCol + 1,
  ];

  for (const index of seedCandidates) {
    if (
      index >= 0 &&
      index < rows * cols
    ) {
      remaining.add(index);
    }
  }

  while (remaining.size < territoryCount) {
    const frontier = getFrontierCells(
      remaining,
      rows,
      cols
    );

    if (frontier.length === 0) {
      break;
    }

    // Randomize the frontier instead of sorting it by
    // neighbor count. This is what gives the coastline
    // its irregular character.
    for (
      let index = frontier.length - 1;
      index > 0;
      index -= 1
    ) {
      const randomIndex = Math.floor(
        rng() * (index + 1)
      );

      [
        frontier[index],
        frontier[randomIndex],
      ] = [
        frontier[randomIndex],
        frontier[index],
      ];
    }

    let selectedIndex: number | null = null;

    // Examine the randomized candidates.
    for (const candidate of frontier) {
      const neighbors = getCellNeighbors(
        candidate,
        remaining,
        rows,
        cols
      );

      // A candidate with 2+ existing neighbors naturally
      // connects to the body of the map.
      if (neighbors.length >= 2) {
        selectedIndex = candidate;
        break;
      }

      // One-neighbor cells are allowed, but only if they
      // don't extend an existing narrow section.
      if (
        neighbors.length === 1 &&
        !wouldCreateLongArm(
          candidate,
          remaining,
          rows,
          cols
        )
      ) {
        selectedIndex = candidate;
        break;
      }
    }

    // If every candidate was rejected, use a random
    // frontier cell as a safety fallback.
    if (selectedIndex === null) {
      selectedIndex =
        frontier[
          Math.floor(rng() * frontier.length)
        ];
    }

    remaining.add(selectedIndex);
  }

  const territories: Territory[] = [];

  for (const index of remaining) {
    territories.push({
      id: `t-${index + 1}`,
      owner: null,
      level: 1,
      neighbors: [],
      isMine: false,
      biome: 'forest',
    });
  }

  // Build neighbors.
  for (const territory of territories) {
    const index =
      Number(territory.id.slice(2)) - 1;

    territory.neighbors = getCellNeighbors(
      index,
      remaining,
      rows,
      cols
    ).map(
      (neighborIndex) =>
        `t-${neighborIndex + 1}`
    );
  }

  return {
    territories,
    mines: [],
    dimensions: { rows, cols },
  };
}

function getFrontierCells(
  remaining: Set<number>,
  rows: number,
  cols: number
): number[] {
  const frontier = new Set<number>();

  for (const index of remaining) {
    const row = Math.floor(index / cols);
    const col = index % cols;

    const neighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.row < 0 ||
        neighbor.row >= rows ||
        neighbor.col < 0 ||
        neighbor.col >= cols
      ) {
        continue;
      }

      const neighborIndex =
        neighbor.row * cols + neighbor.col;

      if (!remaining.has(neighborIndex)) {
        frontier.add(neighborIndex);
      }
    }
  }

  return Array.from(frontier);
}

function getCellNeighbors(
  index: number,
  remaining: Set<number>,
  rows: number,
  cols: number
): number[] {
  const row = Math.floor(index / cols);
  const col = index % cols;

  const possibleNeighbors = [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ];

  const neighbors: number[] = [];

  for (const neighbor of possibleNeighbors) {
    if (
      neighbor.row < 0 ||
      neighbor.row >= rows ||
      neighbor.col < 0 ||
      neighbor.col >= cols
    ) {
      continue;
    }

    const neighborIndex =
      neighbor.row * cols + neighbor.col;

    if (remaining.has(neighborIndex)) {
      neighbors.push(neighborIndex);
    }
  }

  return neighbors;
}

function wouldCreateLongArm(
  index: number,
  remaining: Set<number>,
  rows: number,
  cols: number
): boolean {
  const testSet = new Set(remaining);
  testSet.add(index);

  let current = index;
  let previous = -1;
  let length = 0;

  while (length < 4) {
    const neighbors = getCellNeighbors(
      current,
      testSet,
      rows,
      cols
    ).filter(
      (neighbor) => neighbor !== previous
    );

    // We've reached the body of the map.
    if (neighbors.length !== 1) {
      break;
    }

    previous = current;
    current = neighbors[0];
    length += 1;
  }

  return length >= 3;
}

const MAX_MOUNTAIN_PERCENT = 0.30;
const MIN_MOUNTAIN_PERCENT = 0.20;
const MAX_MOUNTAIN_ATTEMPTS = 20;

function generateMountainBiomes(
  territories: Territory[],
  mineCount: number,
  rng: Rng
): void {
  if (territories.length === 0) {
    return;
  }

  const targetMountainCount = Math.max(
    Math.ceil(territories.length * MIN_MOUNTAIN_PERCENT),
    mineCount * 5
  );

  const maxMountainCount = Math.floor(
    territories.length * MAX_MOUNTAIN_PERCENT
  );

  const mountainTarget = Math.min(
    targetMountainCount,
    maxMountainCount
  );

  for (let attempt = 0; attempt < MAX_MOUNTAIN_ATTEMPTS; attempt += 1) {
    for (const territory of territories) {
      territory.biome = 'forest';
    }

    const mountainIds = new Set<string>();

    const rangeCount = Math.max(
      2,
      Math.min(4, Math.ceil(territories.length / 250))
    );

    // Pick random starting points.
    const shuffled = [...territories];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(rng() * (index + 1));

      [shuffled[index], shuffled[randomIndex]] = [
        shuffled[randomIndex],
        shuffled[index],
      ];
    }

    for (let index = 0; index < rangeCount; index += 1) {
      mountainIds.add(shuffled[index].id);
    }

    while (mountainIds.size < mountainTarget) {
      const frontier = territories.filter(
        (territory) =>
          !mountainIds.has(territory.id) &&
          territory.neighbors.some((neighborId) =>
            mountainIds.has(neighborId)
          )
      );

      if (frontier.length === 0) {
        break;
      }

      const scored = frontier.map((territory) => {
        const mountainNeighbors =
          territory.neighbors.filter((neighborId) =>
            mountainIds.has(neighborId)
          ).length;

        let score = rng();

        /*
        * Prefer 2-3 mountain neighbors.
        *
        * One neighbor extends the range too aggressively.
        * Four+ neighbors usually means we're filling a hole
        * and creating a rectangular shape.
        */
        if (mountainNeighbors === 1) {
          score -= 4.5;
        } else if (mountainNeighbors === 2) {
          score += 6;
        } else if (mountainNeighbors === 3) {
          score += 4.5;
        } else if (mountainNeighbors >= 4) {
          score += 3;
        }

        return {
          territory,
          score,
        };
      });

      scored.sort((a, b) => b.score - a.score);

      /*
      * Choose randomly from the strongest candidates.
      * This keeps the edge irregular without creating
      * lots of holes inside the mountain range.
      */
      const candidateCount = Math.min(
        90,
        scored.length
      );

      const selected =
        scored[
          Math.floor(rng() * candidateCount)
        ].territory;

      mountainIds.add(selected.id);
    }

    for (const territory of territories) {
      if (mountainIds.has(territory.id)) {
        territory.biome = 'mountain';
      }
    }

    const mineCandidates = territories.filter(
      (territory) =>
        territory.biome === 'mountain' &&
        countMountainNeighbors(
          territory,
          territories
        ) >= 3
    );

    if (mineCandidates.length >= mineCount) {
      return;
    }
  }

  expandMountainsForMines(
    territories,
    mineCount
  );
}

const FIELD_PERCENT_OF_FOREST = 0.15;

function generateFieldBiomes(
  territories: Territory[],
  rng: Rng
): void {
  const forestTerritories = territories.filter(
    (territory) => territory.biome === 'forest'
  );

  if (forestTerritories.length === 0) {
    return;
  }

  const targetFieldCount = Math.floor(
    forestTerritories.length * FIELD_PERCENT_OF_FOREST
  );

  if (targetFieldCount <= 0) {
    return;
  }

  const fieldIds = new Set<string>();

  /*
   * Use several independent seeds instead of one seed.
   *
   * This creates scattered clearings throughout the forest
   * instead of one giant connected field.
   */
  const blobCount = Math.max(
    2,
    Math.round(targetFieldCount / 10)
  );

  const shuffled = [...forestTerritories];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(
      rng() * (index + 1)
    );

    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  const seedCount = Math.min(
    blobCount,
    shuffled.length,
    targetFieldCount
  );

  /*
   * Pick seeds that are reasonably separated from
   * existing field seeds.
   */
  for (const territory of shuffled) {
    if (fieldIds.size >= seedCount) {
      break;
    }

    const tooClose = territory.neighbors.some(
      (neighborId) => fieldIds.has(neighborId)
    );

    if (!tooClose) {
      fieldIds.add(territory.id);
    }
  }

  /*
   * If the map is small and we couldn't find enough
   * separated seeds, fill the remaining seed slots.
   */
  if (fieldIds.size < seedCount) {
    for (const territory of shuffled) {
      if (fieldIds.size >= seedCount) {
        break;
      }

      fieldIds.add(territory.id);
    }
  }

  /*
   * Grow each clearing organically.
   *
   * Unlike mountains, we don't reward long chains.
   * Territories with several field neighbors are favored,
   * which causes each clearing to become a compact blob.
   */
  while (fieldIds.size < targetFieldCount) {
    const frontier = forestTerritories.filter(
      (territory) =>
        !fieldIds.has(territory.id) &&
        territory.neighbors.some((neighborId) =>
          fieldIds.has(neighborId)
        )
    );

    if (frontier.length === 0) {
      break;
    }

    const scored = frontier.map((territory) => {
      const fieldNeighbors = territory.neighbors.filter(
        (neighborId) => fieldIds.has(neighborId)
      ).length;

      let score = rng();

      /*
       * Prefer 2-3 field neighbors.
       *
       * 1 neighbor tends to create narrow extensions.
       * 2-3 creates rounded, natural clearings.
       * 4+ tends to fill holes and become too geometric.
       */
      if (fieldNeighbors === 1) {
        score -= 3;
      } else if (fieldNeighbors === 2) {
        score += 5;
      } else if (fieldNeighbors === 3) {
        score += 4;
      } else if (fieldNeighbors >= 4) {
        score += 1;
      }

      /*
       * Very large blobs are discouraged so that fields
       * remain scattered around the forest.
       */
      const nearbyFieldCount = territory.neighbors.filter(
        (neighborId) => fieldIds.has(neighborId)
      ).length;

      score += nearbyFieldCount * 0.5;

      return {
        territory,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    /*
     * Choose randomly from the strongest candidates rather
     * than always choosing the single strongest one.
     *
     * This keeps the clearing edges irregular.
     */
    const candidateCount = Math.min(
      20,
      scored.length
    );

    const selected =
      scored[
        Math.floor(rng() * candidateCount)
      ].territory;

    fieldIds.add(selected.id);
  }

  /*
   * Convert the selected forest territories into fields.
   *
   * Mountains were already generated, so only forest
   * territories could have reached this function's lists.
   */
  for (const territory of territories) {
    if (fieldIds.has(territory.id)) {
      territory.biome = 'field';
    }
  }
}

const MAX_RIVER_SOURCES = 10;

function generateRiverBiomes(
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  rng: Rng
): void {
  if (territories.length === 0) {
    return;
  }

  /*
   * --------------------------------------------------------
   * FIND VALID MOUNTAIN SOURCES
   * --------------------------------------------------------
   *
   * A source must:
   *
   * 1. Be inside a mountain range.
   * 2. Have at least 3 mountain neighbors.
   * 3. Have at least one non-mountain neighbor.
   *
   * The source itself stays mountain. The river emerges
   * from one of its non-mountain neighbors.
   */
  const mountainSources = territories.filter(
    (territory) => {
      if (
        territory.biome !== 'mountain'
      ) {
        return false;
      }

      const mountainNeighbors =
        countMountainNeighbors(
          territory,
          territories
        );

      const hasExit =
        territory.neighbors.some(
          (neighborId) => {
            const neighbor =
              territories.find(
                (entry) =>
                  entry.id ===
                  neighborId
              );

            return (
              neighbor &&
              neighbor.biome !==
                'mountain'
            );
          }
        );

      return (
        mountainNeighbors >= 3 &&
        hasExit
      );
    }
  );

  if (
    mountainSources.length === 0
  ) {
    return;
  }

  shuffleArray(
    mountainSources,
    rng
  );

  /*
   * We want a few major rivers, not dozens of little streams.
   */
  const sourceCount = Math.min(
    MAX_RIVER_SOURCES,
    mountainSources.length,
    Math.max(
      1,
      Math.ceil(
        territories.length / 300
      )
    )
  );

  /*
   * These are the actual river territories.
   */
  const riverIds =
    new Set<string>();

  /*
   * Sources remain mountains.
   */
  const sourceIds =
    new Set<string>();

  /*
   * --------------------------------------------------------
   * CREATE RIVERS
   * --------------------------------------------------------
   */
  for (
    let sourceIndex = 0;
    sourceIndex < sourceCount;
    sourceIndex += 1
  ) {
    const source =
      mountainSources[
        sourceIndex
      ];

    sourceIds.add(
      source.id
    );

    /*
     * ------------------------------------------------------
     * FIND A COMPLETE PATH FROM THE MOUNTAIN TO THE COAST
     * ------------------------------------------------------
     *
     * This is the important change.
     *
     * We don't greedily walk until we get stuck anymore.
     *
     * Instead, we search the map for an actual route to the
     * coast.
     */
    const path =
      findRiverPathToCoast(
        source,
        territories,
        dimensions,
        riverIds,
        rng
      );

    /*
     * If there is no route from this source to the coast,
     * simply try the next mountain source.
     */
    if (
      path.length === 0
    ) {
      continue;
    }

    /*
     * Add the complete path to the river system.
     */
    for (
      const territoryId of path
    ) {
      /*
       * Never turn the mountain source itself into river.
       */
      if (
        sourceIds.has(
          territoryId
        )
      ) {
        continue;
      }

      riverIds.add(
        territoryId
      );
    }
  }

  /*
   * --------------------------------------------------------
   * APPLY RIVER BIOME
   * --------------------------------------------------------
   *
   * Only the actual path becomes river.
   *
   * Mountain sources remain mountains.
   */
  for (
    const territory of territories
  ) {
    if (
      riverIds.has(
        territory.id
      ) &&
      !sourceIds.has(
        territory.id
      )
    ) {
      territory.biome =
        'river';
    }
  }
}

function findRiverPathToCoast(
  source: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  riverIds: Set<string>,
  rng: Rng
): string[] {
  /*
   * --------------------------------------------------------
   * FIND POSSIBLE STARTING EXITS
   * --------------------------------------------------------
   *
   * The river starts by leaving the mountain range.
   */
  const exits =
    source.neighbors
      .map((neighborId) =>
        territories.find(
          (territory) =>
            territory.id ===
            neighborId
        )
      )
      .filter(
        (
          territory
        ): territory is Territory =>
          Boolean(territory)
      )
      .filter(
        (territory) =>
          territory.biome !==
          'mountain'
      );

  if (
    exits.length === 0
  ) {
    return [];
  }

  /*
   * Randomize the exits so maps don't always use the same
   * mountain outlet.
   */
  shuffleArray(
    exits,
    rng
  );

  /*
   * Try each possible mountain exit.
   *
   * If one exit gets trapped, try another.
   */
  const rankedExits =
    exits
      .map((territory) => ({
        territory,
        score:
          getRiverDirectionScore(
            source,
            territory,
            dimensions,
            null,
            rng
          ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

  /*
   * Try the best exits first.
   */
  for (
    const exit of rankedExits
  ) {
    const path =
      searchRiverPath(
        source,
        exit.territory,
        territories,
        dimensions,
        riverIds,
        rng
      );

    if (
      path.length > 0
    ) {
      return path;
    }
  }

  return [];
}

function searchRiverPath(
  source: Territory,
  start: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number },
  riverIds: Set<string>,
  rng: Rng
): string[] {
  /*
   * --------------------------------------------------------
   * DEPTH-FIRST SEARCH WITH BACKTRACKING
   * --------------------------------------------------------
   *
   * This is deliberately NOT a simple greedy walk.
   *
   * If the river goes down a dead-end:
   *
   *     R
   *     R
   *     R
   *    M M
   *
   * the algorithm backs up and tries another route.
   *
   * Therefore a river does not simply die after 7 or 8
   * territories because of one bad local choice.
   */

  const visited =
    new Set<string>();

  const path: string[] = [];

  /*
   * Keep the source visited so the river can never travel
   * back into the mountain source.
   */
  visited.add(
    source.id
  );

  const search = (
    current: Territory,
    previous: Territory | null,
    direction:
      | 'north'
      | 'south'
      | 'east'
      | 'west'
      | null
  ): boolean => {
    /*
    * ------------------------------------------------------
    * CONNECT TO EXISTING RIVER FIRST
    * ------------------------------------------------------
    *
    * If the current territory is directly adjacent to an
    * existing river, connect immediately.
    *
    * This MUST happen before the coast check so a river
    * doesn't stop at the coast when it could connect to
    * another river.
    */
    const adjacentRiver = current.neighbors
      .map((neighborId) =>
        territories.find(
          (territory) =>
            territory.id === neighborId
        )
      )
      .find(
        (territory) =>
          territory !== undefined &&
          riverIds.has(territory.id)
      );

    if (adjacentRiver) {
      path.push(current.id);
      path.push(adjacentRiver.id);

      return true;
    }

    /*
    * ------------------------------------------------------
    * COAST REACHED
    * ------------------------------------------------------
    *
    * If there is no river to connect to, the river can
    * terminate at the edge of the map.
    */
    if (
      isCoastTerritory(
        current,
        territories,
        dimensions
      )
    ) {
      path.push(current.id);

      return true;
    }

    /*
    * Mark this territory as visited for this search.
    */
    visited.add(
      current.id
    );

    /*
     * ------------------------------------------------------
     * GET CANDIDATES
     * ------------------------------------------------------
     */
    const candidates =
      current.neighbors
        .map((neighborId) =>
          territories.find(
            (territory) =>
              territory.id ===
              neighborId
          )
        )
        .filter(
          (
            territory
          ): territory is Territory =>
            Boolean(territory)
        )
        /*
         * Don't go backwards.
         */
        .filter(
          (territory) =>
            territory.id !==
            previous?.id
        )
        /*
         * Don't enter mountains.
         */
        .filter(
          (territory) =>
            territory.biome !==
            'mountain'
        )
        /*
         * Don't revisit territory while searching this path.
         */
        .filter(
          (territory) =>
            !visited.has(
              territory.id
            )
        );

    /*
     * If there are no candidates, this is a dead end.
     *
     * Returning false causes the caller to backtrack.
     */
    if (
      candidates.length === 0
    ) {
      return false;
    }

    /*
     * ------------------------------------------------------
     * SCORE CANDIDATES
     * ------------------------------------------------------
     *
     * South is preferred.
     * Continuing in the same direction is preferred.
     * East/west movement is allowed for meandering.
     * North is strongly discouraged.
     */
    const scored =
      candidates.map(
        (territory) => {
          let score =
            getRiverDirectionScore(
              current,
              territory,
              dimensions,
              direction,
              rng,
              territories,
              riverIds
            );

          /*
          * ----------------------------------------------------
          * RIVER BRIDGE PRIORITY
          * ----------------------------------------------------
          *
          * If this candidate is directly adjacent to an
          * existing river, this territory is the bridge.
          *
          * Example:
          *
          *     R . R
          *
          * If the river is currently at the left R, the "."
          * becomes extremely attractive because claiming it
          * will allow the next step to connect to the right R.
          *
          * This is intentionally a very large bonus.
          * It makes connecting to another river effectively
          * mandatory once the bridge is available.
          */
          const hasAdjacentRiver =
            territory.neighbors.some(
              (neighborId) =>
                riverIds.has(
                  neighborId
                )
            );

          if (hasAdjacentRiver) {
            score += 25;
          }

          return {
            territory,
            score,
          };
        }
      );

    /*
    * Sort primarily by score.
    */
    scored.sort(
      (a, b) =>
        b.score - a.score
    );

    /*
    * Shuffle candidates whose scores are close together.
    *
    * Without this, the best candidate almost always wins.
    *
    * With this, if:
    *
    *   south = 8.2
    *   east  = 7.9
    *   west  = 7.7
    *
    * the river has a real chance to choose east or west.
    */
    for (
      let index = 0;
      index < scored.length - 1;
      index += 1
    ) {
      const currentScore =
        scored[index].score;

      const nextScore =
        scored[index + 1].score;

      if (
        Math.abs(
          currentScore -
            nextScore
        ) <= 2
      ) {
        if (rng() < 0.45) {
          [
            scored[index],
            scored[index + 1],
          ] = [
            scored[index + 1],
            scored[index],
          ];
        }
      }
    }

    /*
     * ------------------------------------------------------
     * TRY EACH ROUTE
     * ------------------------------------------------------
     *
     * Otherwise, continue searching normally.
     *
     * Backtracking still allows the river to abandon a bad
     * route and try another route toward the coast.
     */
    for (
      const candidate of scored
    ) {
      const nextDirection =
        getDirection(
          current,
          candidate.territory,
          dimensions
        );

      if (
        search(
          candidate.territory,
          current,
          nextDirection
        )
      ) {
        path.push(
          current.id
        );

        return true;
      }
    }

    /*
     * None of the routes from this territory reached the
     * coast.
     *
     * Backtrack.
     */
    return false;
  };

  const success =
    search(
      start,
      source,
      null
    );

  if (!success) {
    return [];
  }

  /*
   * The recursive search builds the path backwards.
   *
   * Reverse it so it runs:
   *
   * mountain -> coast
   */
  return path.reverse();
}

function getRiverDirectionScore(
  current: Territory,
  next: Territory,
  dimensions: { rows: number; cols: number },
  previousDirection:
    | 'north'
    | 'south'
    | 'east'
    | 'west'
    | null,
  rng: Rng,
  territories?: Territory[],
  riverIds?: Set<string>
): number {
  const direction = getDirection(
    current,
    next,
    dimensions
  );

  let score = 0;

  /*
   * ========================================================
   * 1. SOUTHWARD MOVEMENT
   * ========================================================
   *
   * This is one third of the river's behavior.
   *
   * South should be preferred, but not overwhelmingly so.
   */
  if (direction === 'south') {
    score += 3;
  }

  /*
   * East/west movement is almost as desirable as south.
   *
   * This gives the river room to meander.
   */
  if (
    direction === 'east' ||
    direction === 'west'
  ) {
    score += 2.5;
  }

  /*
   * North is allowed because terrain may require the river
   * to temporarily move north.
   */
  if (direction === 'north') {
    score -= 2;
  }

  /*
   * ========================================================
   * 2. CONTINUE THE CURRENT DIRECTION
   * ========================================================
   *
   * This prevents the river from looking like:
   *
   *     ↓ → ↓ → ↓ → ↓
   *
   * and encourages broader bends:
   *
   *     → → → ↓
   *             ↓
   *             ↓
   *             ← ←
   */
  if (
    previousDirection &&
    direction === previousDirection
  ) {
    score += 2.5;
  }

  /*
   * Encourage a change from south into a horizontal bend.
   */
  if (
    previousDirection === 'south' &&
    (
      direction === 'east' ||
      direction === 'west'
    )
  ) {
    score += 2;
  }

  /*
   * Encourage returning south after a horizontal bend.
   */
  if (
    (
      previousDirection === 'east' ||
      previousDirection === 'west'
    ) &&
    direction === 'south'
  ) {
    score += 2;
  }

  /*
   * ========================================================
   * 3. AVOID SHARP REVERSALS
   * ========================================================
   */
  if (
    previousDirection === 'south' &&
    direction === 'north'
  ) {
    score -= 8;
  }

  if (
    previousDirection === 'north' &&
    direction === 'south'
  ) {
    score -= 8;
  }

  if (
    previousDirection === 'east' &&
    direction === 'west'
  ) {
    score -= 8;
  }

  if (
    previousDirection === 'west' &&
    direction === 'east'
  ) {
    score -= 8;
  }

  /*
   * ========================================================
   * 4. MOUNTAIN AVOIDANCE
   * ========================================================
   *
   * This is another one third of the behavior.
   *
   * We don't simply ask:
   *
   * "Does this territory touch a mountain?"
   *
   * Instead we calculate the distance to nearby mountains.
   *
   * The farther away the territory is, the better.
   *
   * When there are mountains on BOTH sides, the center
   * between them naturally becomes attractive.
   */
  if (territories) {
    const mountainDistance =
      getMountainDistance(
        next,
        territories,
        dimensions
      );

    /*
     * Cap the effect so mountain avoidance doesn't become
     * more important than the other two factors.
     */
    const mountainScore =
      Math.min(
        mountainDistance / 6,
        1
      );

    score +=
      mountainScore * 3;
  }

  /*
   * ========================================================
   * 5. RIVER ATTRACTION
   * ========================================================
   *
   * This is the final third.
   *
   * Existing rivers should attract the new river.
   *
   * This allows tributaries to eventually converge.
   */
  if (
    territories &&
    riverIds
  ) {
    const riverDistance =
      getRiverDistance(
        next,
        territories,
        riverIds,
        dimensions
      );

    /*
     * Closer existing rivers = stronger attraction.
     */
    const riverAttraction =
      Math.max(
        0,
        1 -
          riverDistance / 6
      );

    score +=
      riverAttraction * 3;
  }

  /*
  * ========================================================
  * DIRECT RIVER CONNECTION
  * ========================================================
  *
  * If this territory is immediately adjacent to an existing
  * river, strongly prefer it.
  *
  * This prevents rivers from stopping one territory short
  * when there is an actual connection available.
  */
    if (
      territories &&
      riverIds
    ) {
      const riverDistance =
        getRiverDistance(
          next,
          territories,
          riverIds,
          dimensions
        );

      if (riverDistance === 1) {
        score += 6;
      }
    }

  /*
   * ========================================================
   * RANDOMNESS
   * ========================================================
   *
   * Small randomness prevents identical paths while keeping
   * the three major geographic forces dominant.
   */
  score +=
    rng() * 2;

  return score;
}

function getMountainDistance(
  territory: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number }
): number {
  const territoryIndex =
    Number(
      territory.id.slice(2)
    ) - 1;

  const territoryRow =
    Math.floor(
      territoryIndex /
        dimensions.cols
    );

  const territoryCol =
    territoryIndex %
    dimensions.cols;

  let closestDistance =
    Infinity;

  for (
    const candidate of territories
  ) {
    if (
      candidate.biome !==
      'mountain'
    ) {
      continue;
    }

    const candidateIndex =
      Number(
        candidate.id.slice(2)
      ) - 1;

    const candidateRow =
      Math.floor(
        candidateIndex /
          dimensions.cols
      );

    const candidateCol =
      candidateIndex %
      dimensions.cols;

    const distance =
      Math.abs(
        territoryRow -
          candidateRow
      ) +
      Math.abs(
        territoryCol -
          candidateCol
      );

    if (
      distance <
      closestDistance
    ) {
      closestDistance =
        distance;
    }
  }

  return closestDistance;
}

function getRiverDistance(
  territory: Territory,
  territories: Territory[],
  riverIds: Set<string>,
  dimensions: { rows: number; cols: number }
): number {
  const territoryIndex =
    Number(
      territory.id.slice(2)
    ) - 1;

  const territoryRow =
    Math.floor(
      territoryIndex /
        dimensions.cols
    );

  const territoryCol =
    territoryIndex %
    dimensions.cols;

  let closestDistance =
    Infinity;

  for (
    const riverId of riverIds
  ) {
    const riverTerritory =
      territories.find(
        (entry) =>
          entry.id === riverId
      );

    if (!riverTerritory) {
      continue;
    }

    const riverIndex =
      Number(
        riverTerritory.id.slice(2)
      ) - 1;

    const riverRow =
      Math.floor(
        riverIndex /
          dimensions.cols
      );

    const riverCol =
      riverIndex %
      dimensions.cols;

    const distance =
      Math.abs(
        territoryRow -
          riverRow
      ) +
      Math.abs(
        territoryCol -
          riverCol
      );

    if (
      distance <
      closestDistance
    ) {
      closestDistance =
        distance;
    }
  }

  return closestDistance;
}

function isCoastTerritory(
  territory: Territory,
  territories: Territory[],
  dimensions: { rows: number; cols: number }
): boolean {
  const index =
    Number(
      territory.id.slice(2)
    ) - 1;

  const row =
    Math.floor(
      index /
        dimensions.cols
    );

  const col =
    index %
    dimensions.cols;

  if (
    row === 0 ||
    row === dimensions.rows - 1 ||
    col === 0 ||
    col === dimensions.cols - 1
  ) {
    return true;
  }

  const possibleNeighbors = [
    {
      row: row - 1,
      col,
    },
    {
      row: row + 1,
      col,
    },
    {
      row,
      col: col - 1,
    },
    {
      row,
      col: col + 1,
    },
  ];

  for (
    const neighbor of possibleNeighbors
  ) {
    if (
      neighbor.row < 0 ||
      neighbor.row >= dimensions.rows ||
      neighbor.col < 0 ||
      neighbor.col >= dimensions.cols
    ) {
      return true;
    }

    const neighborIndex =
      neighbor.row *
        dimensions.cols +
      neighbor.col;

    const neighborId =
      `t-${neighborIndex + 1}`;

    const exists =
      territories.some(
        (entry) =>
          entry.id === neighborId
      );

    if (!exists) {
      return true;
    }
  }

  return false;
}

function getDirection(
  current: Territory,
  next: Territory,
  dimensions: { rows: number; cols: number }
):
  | 'north'
  | 'south'
  | 'east'
  | 'west' {
  const currentIndex =
    Number(
      current.id.slice(2)
    ) - 1;

  const nextIndex =
    Number(
      next.id.slice(2)
    ) - 1;

  const currentRow =
    Math.floor(
      currentIndex /
        dimensions.cols
    );

  const currentCol =
    currentIndex %
    dimensions.cols;

  const nextRow =
    Math.floor(
      nextIndex /
        dimensions.cols
    );

  const nextCol =
    nextIndex %
    dimensions.cols;

  if (
    nextRow > currentRow
  ) {
    return 'south';
  }

  if (
    nextRow < currentRow
  ) {
    return 'north';
  }

  if (
    nextCol > currentCol
  ) {
    return 'east';
  }

  return 'west';
}

function shuffleArray<T>(
  array: T[],
  rng: Rng
): void {
  for (
    let index = array.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      Math.floor(
        rng() *
          (index + 1)
      );

    [
      array[index],
      array[randomIndex],
    ] = [
      array[randomIndex],
      array[index],
    ];
  }
}

function countMountainNeighbors(
  territory: Territory,
  territories: Territory[]
): number {
  return territory.neighbors.filter((neighborId) => {
    const neighbor = territories.find(
      (entry) => entry.id === neighborId
    );

    return neighbor?.biome === 'mountain';
  }).length;
}


function expandMountainsForMines(
  territories: Territory[],
  mineCount: number
): void {
  while (
    territories.filter(
      (territory) =>
        territory.biome === 'mountain' &&
        countMountainNeighbors(territory, territories) >= 3
    ).length < mineCount
  ) {
    const candidate = territories
      .filter((territory) => territory.biome === 'field')
      .sort((a, b) => {
        const aMountainNeighbors = countMountainNeighbors(
          a,
          territories
        );

        const bMountainNeighbors = countMountainNeighbors(
          b,
          territories
        );

        return bMountainNeighbors - aMountainNeighbors;
      })[0];

    if (!candidate) {
      break;
    }

    candidate.biome = 'mountain';
  }
}

function placeMines(
  territories: Territory[],
  mineCount: number,
  rng: Rng
): string[] {
  const mineTerritoryIds: string[] = [];

  const candidateTerritories = territories.filter(
    (territory) =>
      territory.biome === 'mountain' &&
      countMountainNeighbors(territory, territories) >= 3
  );

  // Shuffle candidates.
  for (
    let index = candidateTerritories.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex = Math.floor(
      rng() * (index + 1)
    );

    [
      candidateTerritories[index],
      candidateTerritories[randomIndex],
    ] = [
      candidateTerritories[randomIndex],
      candidateTerritories[index],
    ];
  }

  for (
    const territory of candidateTerritories
  ) {
    if (mineTerritoryIds.length >= mineCount) {
      break;
    }

    mineTerritoryIds.push(territory.id);
  }

  return mineTerritoryIds;
}
