import { GameState } from '../types';

export const SAVE_KEY = 'empire-of-gold-save';

export function saveGameState(gameState: GameState): void {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
}

export function loadGameState(): GameState | null {
  const raw = window.localStorage.getItem(SAVE_KEY);
  return raw ? (JSON.parse(raw) as GameState) : null;
}

export function clearSavedGame(): void {
  window.localStorage.removeItem(SAVE_KEY);
}
