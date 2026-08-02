import { describe, expect, it } from 'vitest';
import { createInitialGameState, executeGameAction, getTerritoryFairValue, getValidStartingTerritories, isConnectedTerritorySet } from './game';

function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('Empire of Gold engine', () => {
  it('generates a connected irregular landmass with valid adjacency', () => {
    const gameState = createInitialGameState({
      playerConfigs: [{ name: 'A', color: 'Red' }, { name: 'B', color: 'Blue' }],
      territoryCount: 200,
      mineCount: 4,
      rng: makeRng(42),
    });

    expect(gameState.board.territories).toHaveLength(200);
    expect(isConnectedTerritorySet(gameState.board.territories)).toBe(true);
    expect(gameState.board.territories.every((territory) => territory.neighbors.length > 0)).toBe(true);
    expect(gameState.board.territories.length < gameState.board.dimensions.rows * gameState.board.dimensions.cols).toBe(true);
  });

  it('places mines with at least two adjacent non-mine territories', () => {
    const gameState = createInitialGameState({
      playerConfigs: [{ name: 'A', color: 'Red' }, { name: 'B', color: 'Blue' }],
      territoryCount: 200,
      mineCount: 4,
      rng: makeRng(7),
    });

    for (const mine of gameState.board.mines) {
      const territory = gameState.board.territories.find((entry) => entry.id === mine.territoryId)!;
      const adjacentNonMine = territory.neighbors.filter((neighborId) => {
        const neighbor = gameState.board.territories.find((entry) => entry.id === neighborId)!;
        return !gameState.board.mines.some((entry) => entry.territoryId === neighbor.id);
      });
      expect(adjacentNonMine.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('creates enough valid starting locations for all players', () => {
    const gameState = createInitialGameState({
      playerConfigs: [{ name: 'A', color: 'Red' }, { name: 'B', color: 'Blue' }, { name: 'C', color: 'Green' }],
      territoryCount: 240,
      mineCount: 6,
      rng: makeRng(9),
    });

    const validStarting = getValidStartingTerritories(gameState.board);
    expect(validStarting.length).toBeGreaterThanOrEqual(gameState.players.length);
  });

  it('allows a player to claim an adjacent territory and advances the turn', () => {
    const gameState = createInitialGameState({
      playerConfigs: [{ name: 'A', color: 'Red' }, { name: 'B', color: 'Blue' }],
      territoryCount: 220,
      mineCount: 4,
      rng: makeRng(11),
    });

    const currentPlayerId = gameState.turn.order[gameState.turn.currentPlayerIndex];
    const player = gameState.players.find((entry) => entry.id === currentPlayerId)!;
    const target = gameState.board.territories.find((territory) => {
      return territory.owner === null && territory.isMine === false && territory.neighbors.some((neighborId) => player.territoryIds.includes(neighborId));
    });

    expect(target).toBeDefined();

    const result = executeGameAction(gameState, { type: 'claim', targetTerritoryId: target!.id });
    expect(result.success).toBe(true);
    expect(result.state.players.find((entry) => entry.id === currentPlayerId)?.territoryIds).toContain(target!.id);
    expect(result.state.turn.currentPlayerIndex).not.toBe(gameState.turn.currentPlayerIndex);
  });

  it('calculates fair values and upgrade costs from the economy', () => {
    const gameState = createInitialGameState({
      playerConfigs: [{ name: 'A', color: 'Red' }, { name: 'B', color: 'Blue' }],
      territoryCount: 200,
      mineCount: 4,
      rng: makeRng(13),
    });

    const territory = gameState.board.territories[0];
    const levelOneValue = gameState.economy.levelOneValue;
    expect(getTerritoryFairValue(territory, gameState)).toBe(levelOneValue * territory.level);
    expect(levelOneValue).toBeGreaterThanOrEqual(0);
  });
});
