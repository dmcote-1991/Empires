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
  const mineTerritoryIds = placeMines(board.territories, options.mineCount, rng);
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
  // Generate a temporary board that is 5x larger than the
  // number of territories the player requested.
  const temporaryCellCount = territoryCount * 2;

  // Make the temporary board as close to square as possible.
  const cols = Math.ceil(Math.sqrt(temporaryCellCount));
  const rows = Math.ceil(temporaryCellCount / cols);

  const totalCells = rows * cols;

  // Every cell starts as part of the temporary board.
  const remaining = new Set<number>();

  for (let index = 0; index < totalCells; index += 1) {
    remaining.add(index);
  }

  // Keep removing cells from the outside inward until we
  // have exactly the number of territories the player requested.
  while (remaining.size > territoryCount) {
    const perimeter = getPerimeterCells(remaining, rows, cols);

    if (perimeter.length === 0) {
      break;
    }

    // Shuffle the perimeter so that we get a random
    // deletion order rather than always checking cells
    // in the same order.
    for (let index = perimeter.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(rng() * (index + 1));

      [perimeter[index], perimeter[randomIndex]] = [
        perimeter[randomIndex],
        perimeter[index],
      ];
    }

    let removed = false;

    for (const selectedIndex of perimeter) {
      const row = Math.floor(selectedIndex / cols);
      const col = selectedIndex % cols;

      const neighboringIndexes = [
        { row: row - 1, col },
        { row: row + 1, col },
        { row, col: col - 1 },
        { row, col: col + 1 },
      ]
        .filter(
          (candidate) =>
            candidate.row >= 0 &&
            candidate.row < rows &&
            candidate.col >= 0 &&
            candidate.col < cols
        )
        .map(
          (candidate) =>
            candidate.row * cols + candidate.col
        )
        .filter((neighborIndex) => remaining.has(neighborIndex));

      // A cell with zero or one remaining neighbor
      // cannot be holding two parts of the board together.
      if (neighboringIndexes.length <= 1) {
        remaining.delete(selectedIndex);
        removed = true;
        break;
      }

      // Temporarily remove the cell and make sure the
      // remaining board is still connected.
      remaining.delete(selectedIndex);

      if (
        isConnectedCellSet(remaining, rows, cols) &&
        !hasLongThinArm(remaining, rows, cols)
      ) {
        // Keep the irregular/random shape.
        if (rng() < 0.75) {
          removed = true;
          break;
        }
      }

      // Removing this cell would disconnect the board,
      // or would create a long thin arm.
      remaining.add(selectedIndex);
    }

    // Safety fallback: find a perimeter cell whose removal
    // preserves connectivity.
    if (!removed) {
      for (const selectedIndex of perimeter) {
        remaining.delete(selectedIndex);

        if (isConnectedCellSet(remaining, rows, cols)) {
          removed = true;
          break;
        }

        remaining.add(selectedIndex);
      }
    }
  }

  const territories: Territory[] = [];

  // Create territories using their original grid position.
  // The ID preserves the cell's position in the temporary grid.
  for (const index of remaining) {
    territories.push({
      id: `t-${index + 1}`,
      owner: null,
      level: 1,
      neighbors: [],
      isMine: false,
    });
  }

  // Rebuild neighbors using only the cells that survived
  // the erosion process.
  for (const territory of territories) {
    const index = Number(territory.id.slice(2)) - 1;
    const row = Math.floor(index / cols);
    const col = index % cols;

    const possibleNeighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];

    const neighbors: string[] = [];

    for (const candidate of possibleNeighbors) {
      if (
        candidate.row < 0 ||
        candidate.row >= rows ||
        candidate.col < 0 ||
        candidate.col >= cols
      ) {
        continue;
      }

      const neighborIndex =
        candidate.row * cols + candidate.col;

      if (remaining.has(neighborIndex)) {
        neighbors.push(`t-${neighborIndex + 1}`);
      }
    }

    territory.neighbors = neighbors;
  }

  return {
    territories,
    mines: [],
    dimensions: { rows, cols },
  };
}

function isConnectedCellSet(
  remaining: Set<number>,
  rows: number,
  cols: number
): boolean {
  if (remaining.size === 0) {
    return true;
  }

  const start = remaining.values().next().value;

  if (start === undefined) {
    return true;
  }

  const visited = new Set<number>();
  const frontier = [start];

  while (frontier.length > 0) {
    const current = frontier.pop()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    const row = Math.floor(current / cols);
    const col = current % cols;

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

      if (
        remaining.has(neighborIndex) &&
        !visited.has(neighborIndex)
      ) {
        frontier.push(neighborIndex);
      }
    }
  }

  return visited.size === remaining.size;
}

function hasLongThinArm(
  remaining: Set<number>,
  rows: number,
  cols: number
): boolean {
  const visited = new Set<number>();

  for (const start of remaining) {
    if (visited.has(start)) {
      continue;
    }

    const startNeighbors = getCellNeighbors(
      start,
      remaining,
      rows,
      cols
    );

    // Only investigate cells that are part of a thin section.
    if (startNeighbors.length !== 2) {
      continue;
    }

    const chain = [start];
    const frontier = [start];
    const chainVisited = new Set<number>([start]);

    while (frontier.length > 0) {
      const current = frontier.pop()!;

      const neighbors = getCellNeighbors(
        current,
        remaining,
        rows,
        cols
      );

      for (const neighbor of neighbors) {
        if (chainVisited.has(neighbor)) {
          continue;
        }

        const neighborCount = getCellNeighbors(
          neighbor,
          remaining,
          rows,
          cols
        ).length;

        if (neighborCount === 2) {
          chainVisited.add(neighbor);
          chain.push(neighbor);
          frontier.push(neighbor);
        }
      }
    }

    chain.forEach((cell) => visited.add(cell));

    // A chain of 2-neighbor cells this long is
    // considered an arm.
    if (chain.length >= 4) {
      return true;
    }
  }

  return false;
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

function getPerimeterCells(
  remaining: Set<number>,
  rows: number,
  cols: number
): number[] {
  const perimeter: number[] = [];

  for (const index of remaining) {
    const row = Math.floor(index / cols);
    const col = index % cols;

    const hasOutsideNeighbor =
      row === 0 ||
      row === rows - 1 ||
      col === 0 ||
      col === cols - 1;

    if (hasOutsideNeighbor) {
      perimeter.push(index);
      continue;
    }

    const neighboringIndexes = [
      index - cols,
      index + cols,
      index - 1,
      index + 1,
    ];

    const hasMissingNeighbor = neighboringIndexes.some(
      (neighborIndex) => !remaining.has(neighborIndex)
    );

    if (hasMissingNeighbor) {
      perimeter.push(index);
    }
  }

  return perimeter;
}

function placeMines(territories: Territory[], mineCount: number, rng: Rng): string[] {
  const mineTerritoryIds: string[] = [];
  const candidateTerritories = territories.filter((territory) => territory.neighbors.length >= 2);
  while (mineTerritoryIds.length < mineCount && candidateTerritories.length > 0) {
    const randomIndex = Math.floor(rng() * candidateTerritories.length);
    const selected = candidateTerritories[randomIndex];
    if (!mineTerritoryIds.includes(selected.id)) {
      mineTerritoryIds.push(selected.id);
    }
    candidateTerritories.splice(randomIndex, 1);
  }
  return mineTerritoryIds;
}
