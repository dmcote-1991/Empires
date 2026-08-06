import { ActionResult, AvailableAction, Board, Economy, GameState, Move, Player, PlayerConfig, Territory } from '../types';

export const MINE_EFFICIENCY_TABLE = [1, 0.99, 0.98, 0.96, 0.92, 0.84, 0.36];

type Rng = () => number;

const DEFAULT_ROWS = 20;
const DEFAULT_COLS = 20;

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
      level: isMine ? 1 : 1,
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
    mineIds: [],
  }));

  const boardWithMines: Board = {
    territories,
    mines: mineTerritoryIds.map((territoryId, index) => ({ id: `mine-${index + 1}`, territoryId, efficiency: 1 })),
    dimensions: board.dimensions,
  };

  const economy: Economy = {
    totalGold: 0,
    levelOneValue: 1,
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
    actions.push({ type: 'buy', label: 'Buy territory' });
    actions.push({ type: 'forceBuy', label: 'Force buy territory' });
    return actions;
  }

  if (territory.owner === currentPlayer.id && !territory.isMine) {
    actions.push({ type: 'upgrade', label: 'Upgrade territory' });
    const adjacentOwned = state.board.territories.filter((entry) => entry.owner === currentPlayer.id && entry.id !== territory.id && territory.neighbors.includes(entry.id));
    if (adjacentOwned.length > 0) {
      actions.push({ type: 'sell', label: 'Sell to adjacent player' });
    }
    return actions;
  }

  if (territory.owner === currentPlayer.id && territory.isMine) {
    actions.push({ type: 'produce', label: 'Produce from mine' });
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
    const nextState = cloneState(state);
    nextState.board.territories = nextState.board.territories.map((territory) => (territory.id === target.id ? { ...territory, owner: currentPlayer.id } : territory));
    nextState.players = nextState.players.map((player) => {
      if (player.id === currentPlayer.id) {
        return { ...player, territoryIds: [...player.territoryIds, target.id] };
      }
      if (player.id === target.owner) {
        return { ...player, territoryIds: player.territoryIds.filter((territoryId) => territoryId !== target.id) };
      }
      return player;
    });
    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
    return { success: true, state: nextState };
  }

  if (move.type === 'forceBuy' && move.targetTerritoryId) {
    const target = state.board.territories.find((territory) => territory.id === move.targetTerritoryId);
    if (!target || !target.owner || target.owner === currentPlayer.id || target.isMine) {
      return { success: false, reason: 'Invalid force buy action', state };
    }
    const nextState = cloneState(state);
    nextState.board.territories = nextState.board.territories.map((territory) => (territory.id === target.id ? { ...territory, owner: currentPlayer.id } : territory));
    nextState.players = nextState.players.map((player) => {
      if (player.id === currentPlayer.id) {
        return { ...player, territoryIds: [...player.territoryIds, target.id] };
      }
      if (player.id === target.owner) {
        return { ...player, territoryIds: player.territoryIds.filter((territoryId) => territoryId !== target.id) };
      }
      return player;
    });
    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
    return { success: true, state: nextState };
  }

  if (move.type === 'upgrade' && move.targetTerritoryId) {
    const target = state.board.territories.find((territory) => territory.id === move.targetTerritoryId);
    if (!target || target.owner !== currentPlayer.id || target.isMine) {
      return { success: false, reason: 'Invalid upgrade action', state };
    }
    const nextState = cloneState(state);
    nextState.board.territories = nextState.board.territories.map((territory) => (territory.id === target.id ? { ...territory, level: territory.level + 1 } : territory));
    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
    return { success: true, state: nextState };
  }

  if (move.type === 'produce' && move.targetTerritoryId) {
    const target = state.board.territories.find((territory) => territory.id === move.targetTerritoryId);
    if (!target || target.owner !== currentPlayer.id || !target.isMine) {
      return { success: false, reason: 'Invalid produce action', state };
    }
    const nextState = cloneState(state);
    nextState.economy.totalGold += 10000 * nextState.economy.mineEfficiency;
    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
    return { success: true, state: nextState };
  }

  if (move.type === 'sell' && move.targetTerritoryId) {
    const target = state.board.territories.find((territory) => territory.id === move.targetTerritoryId);
    if (!target || target.owner !== currentPlayer.id || target.isMine) {
      return { success: false, reason: 'Invalid sell action', state };
    }
    const nextState = cloneState(state);
    nextState.board.territories = nextState.board.territories.map((territory) => (territory.id === target.id ? { ...territory, owner: null } : territory));
    nextState.players = nextState.players.map((player) => (player.id === currentPlayer.id ? { ...player, territoryIds: player.territoryIds.filter((territoryId) => territoryId !== target.id) } : player));
    nextState.turn.currentPlayerIndex = (nextState.turn.currentPlayerIndex + 1) % nextState.players.length;
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
      mineIds: [...player.mineIds], 
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
  const rows = DEFAULT_ROWS;
  const cols = DEFAULT_COLS;
  const territories: Territory[] = [];
  for (let index = 0; index < territoryCount; index += 1) {
    territories.push({
      id: `t-${index + 1}`,
      owner: null,
      level: 1,
      neighbors: [],
      isMine: false,
    });
  }

  for (let index = 0; index < territories.length; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const neighbors: string[] = [];
    const possibleNeighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];

    for (const candidate of possibleNeighbors) {
      if (candidate.row < 0 || candidate.row >= rows || candidate.col < 0 || candidate.col >= cols) {
        continue;
      }
      const nextIndex = candidate.row * cols + candidate.col;
      if (nextIndex < territories.length) {
        neighbors.push(territories[nextIndex].id);
      }
    }

    const jitter = Math.floor(rng() * 3);
    if (jitter > 0 && neighbors.length > 0) {
      const extra = neighbors.slice(0, jitter);
      territories[index].neighbors = [...new Set([...neighbors, ...extra])];
    } else {
      territories[index].neighbors = neighbors;
    }
  }

  const connected = territories.filter((territory) => territory.neighbors.length > 0);
  return {
    territories: connected,
    mines: [],
    dimensions: { rows, cols },
  };
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
