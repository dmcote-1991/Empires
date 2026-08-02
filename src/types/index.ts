export type PlayerColor = 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Blue' | 'Purple';

export interface PlayerConfig {
  name: string;
  color: PlayerColor;
}

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  gold: number;
  eliminated: boolean;
  territoryIds: string[];
  mineIds: string[];
}

export interface Territory {
  id: string;
  owner: string | null;
  level: number;
  neighbors: string[];
  isMine: boolean;
}

export interface Mine {
  id: string;
  territoryId: string;
  efficiency: number;
}

export interface Board {
  territories: Territory[];
  mines: Mine[];
  dimensions: {
    rows: number;
    cols: number;
  };
}

export interface Economy {
  totalGold: number;
  levelOneValue: number;
  mineEfficiency: number;
}

export interface Turn {
  currentPlayerIndex: number;
  round: number;
  order: string[];
}

export interface GameState {
  board: Board;
  players: Player[];
  economy: Economy;
  turn: Turn;
  settings: {
    territoryCount: number;
    mineCount: number;
  };
}

export interface Move {
  type: 'claim' | 'buy' | 'forceBuy' | 'sell' | 'upgrade' | 'produce' | 'skip';
  targetTerritoryId?: string;
  payload?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  reason?: string;
  state: GameState;
}
