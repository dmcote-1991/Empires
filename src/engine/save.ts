import { GameState } from '../types';

export const SAVE_KEY = 'empire-of-gold-save';

export function saveGameState(gameState: GameState): void {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
}

export function loadGameState(): GameState | null {
  const raw = window.localStorage.getItem(SAVE_KEY);

  if (!raw) {
    return null;
  }

  const savedState = JSON.parse(raw) as GameState;

  return {
    ...savedState,
    marketplace: savedState.marketplace ?? [],
  };
}

export function clearSavedGame(): void {
  window.localStorage.removeItem(SAVE_KEY);
}
