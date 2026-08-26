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
  wood: number;
  eliminated: boolean;
  territoryIds: string[];
  capitalSettlementId: string | null;
}

export interface Territory {
  id: string;
  owner: string | null;
  neighbors: string[];
  isMine: boolean;
  isSite: boolean;
  hasBridge: boolean;
  biome: 'forest' | 'field' | 'mountain' | 'river';
}

export interface Mine {
  id: string;
  territoryId: string;
  efficiency: number;
}

export interface Settlement {
  id: string;
  territoryId: string;
  owner: string;
  name: string;
  population: number;
  isCapital: boolean;
}

export interface LumberYard {
  id: string;
  territoryId: string;
  owner: string;
}

export interface Board {
  territories: Territory[];
  mines: Mine[];
  settlements: Settlement[];
  lumberYards: LumberYard[];
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
  phase: 'action' | 'claiming';
  movementRemaining: number;
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
  type:
    | 'claim'
    | 'endClaiming'
    | 'buy'
    | 'sell'
    | 'produce'
    | 'produceWood'
    | 'establishSettlement'
    | 'growSettlement'
    | 'evacuateSettlement'
    | 'tearDownSettlement'
    | 'establishLumberYard'
    | 'buildBridge'
    | 'skip';
  targetTerritoryId?: string;
  payload?: Record<string, unknown>;
}

export type ActionName =
  | 'claim'
  | 'endClaiming'
  | 'buy'
  | 'sell'
  | 'produce'
  | 'produceWood'
  | 'establishSettlement'
  | 'growSettlement'
  | 'evacuateSettlement'
  | 'tearDownSettlement'
  | 'establishLumberYard'
  | 'buildBridge'
  | 'skip';
  
export interface AvailableAction {
  type: ActionName;
  label: string;
}

export interface ActionResult {
  success: boolean;
  reason?: string;
  state: GameState;
}
