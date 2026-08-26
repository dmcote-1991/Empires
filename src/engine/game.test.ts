import { describe, expect, it } from 'vitest';
import { createInitialGameState, executeGameAction, getValidStartingTerritories, isConnectedTerritorySet } from './game';

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

  it('does not assign starting territories automatically', () => {
    const gameState = createInitialGameState({
      playerConfigs: [{ name: 'A', color: 'Red' }, { name: 'B', color: 'Blue' }],
      territoryCount: 220,
      mineCount: 4,
      rng: makeRng(11),
    });

    expect(gameState.players.every((player) => player.territoryIds.length === 0)).toBe(true);
    expect(gameState.board.territories.every((territory) => territory.owner === null)).toBe(true);
  });

  it('allows a player to claim a starting territory on their first turn', () => {
    const gameState = createInitialGameState({
      playerConfigs: [{ name: 'A', color: 'Red' }, { name: 'B', color: 'Blue' }],
      territoryCount: 220,
      mineCount: 4,
      rng: makeRng(11),
    });

    const currentPlayerId = gameState.turn.order[gameState.turn.currentPlayerIndex];
    const target = gameState.board.territories.find((territory) => territory.owner === null && territory.isMine === false);

    expect(target).toBeDefined();

    const result = executeGameAction(gameState, { type: 'claim', targetTerritoryId: target!.id });
    expect(result.success).toBe(true);
    expect(result.state.players.find((entry) => entry.id === currentPlayerId)?.territoryIds).toContain(target!.id);
    expect(result.state.turn.currentPlayerIndex).not.toBe(gameState.turn.currentPlayerIndex);
  });

  it('allows a player to claim an adjacent mine territory after starting', () => {
    const state: any = {
      board: {
        territories: [
          { id: 'a', owner: 'player-1', level: 1, neighbors: ['b'], isMine: false },
          { id: 'b', owner: null, level: 1, neighbors: ['a'], isMine: true },
        ],
        mines: [{ id: 'mine-1', territoryId: 'b', efficiency: 1 }],
        dimensions: { rows: 1, cols: 2 },
      },
      players: [
        { id: 'player-1', name: 'A', color: 'Red', gold: 0, eliminated: false, territoryIds: ['a'], mineIds: [] },
        { id: 'player-2', name: 'B', color: 'Blue', gold: 0, eliminated: false, territoryIds: [], mineIds: [] },
      ],
      economy: { totalGold: 0, baseTerritoryValue: 1, mineEfficiency: 1 },
      turn: { currentPlayerIndex: 0, round: 1, order: ['player-1', 'player-2'] },
      settings: { territoryCount: 2, mineCount: 1 },
    };

    const result = executeGameAction(state, { type: 'claim', targetTerritoryId: 'b' });
    expect(result.success).toBe(true);
    expect(result.state.board.territories.find((territory: any) => territory.id === 'b')?.owner).toBe('player-1');
  });

  it('allows a player to buy an adjacent territory owned by another player', () => {
    const gameState = createInitialGameState({
      playerConfigs: [{ name: 'A', color: 'Red' }, { name: 'B', color: 'Blue' }],
      territoryCount: 220,
      mineCount: 4,
      rng: makeRng(17),
    });

    const playerA = gameState.players[0];
    const playerB = gameState.players[1];
    const ownedTerritory = gameState.board.territories.find((territory) => territory.owner === playerA.id)!;
    const target = gameState.board.territories.find((territory) => territory.owner === playerB.id && territory.neighbors.includes(ownedTerritory.id));

    expect(target).toBeDefined();

    const result = executeGameAction(gameState, { type: 'buy', targetTerritoryId: target!.id });
    expect(result.success).toBe(true);
    expect(result.state.board.territories.find((territory) => territory.id === target!.id)?.owner).toBe(playerA.id);
  });
});
