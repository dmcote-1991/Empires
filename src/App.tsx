import { useEffect, useMemo, useState } from 'react';
import { createInitialGameState, executeGameAction, getGameSummary } from './engine/game';
import { loadGameState, saveGameState } from './engine/save';
import { BoardView } from './ui/BoardView';
import { Sidebar } from './ui/Sidebar';
import { GameState, PlayerConfig } from './types';

const COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

const defaultPlayerConfigs = (): PlayerConfig[] => [
  { name: 'Player 1', color: 'Red' },
  { name: 'Player 2', color: 'Blue' },
];

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>(defaultPlayerConfigs());
  const [playerCount, setPlayerCount] = useState(2);
  const [territoryCount, setTerritoryCount] = useState(200);
  const [mineCount, setMineCount] = useState(4);

  const normalizedPlayerConfigs = useMemo(() => {
    const nextConfigs = Array.from({ length: playerCount }, (_, index) => ({
      name: playerConfigs[index]?.name?.trim() || `Player ${index + 1}`,
      color: playerConfigs[index]?.color ?? COLORS[index % COLORS.length],
    } as PlayerConfig));
    return nextConfigs;
  }, [playerCount, playerConfigs]);

  const summary = useMemo(() => (gameState ? getGameSummary(gameState) : null), [gameState]);

  useEffect(() => {
    const saved = loadGameState();
    if (saved) {
      setGameState(saved);
    }
  }, []);

  useEffect(() => {
    if (gameState) {
      saveGameState(gameState);
    }
  }, [gameState]);

  const startGame = () => {
    const validPlayers = normalizedPlayerConfigs.map((player, index) => ({
      ...player,
      name: player.name.trim() || `Player ${index + 1}`,
    }));
    const nextState = createInitialGameState({
      playerConfigs: validPlayers,
      territoryCount,
      mineCount,
    });
    setGameState(nextState);
  };

  const updatePlayer = (index: number, field: keyof PlayerConfig, value: string) => {
    setPlayerConfigs((current) => {
      const next = Array.from({ length: Math.max(current.length, playerCount) }, (_, playerIndex) => {
        const existing = current[playerIndex];
        if (playerIndex < current.length) {
          return { ...existing, [field]: playerIndex === index ? value : existing[field] };
        }
        return { name: `Player ${playerIndex + 1}`, color: COLORS[playerIndex % COLORS.length], [field]: playerIndex === index ? value : undefined } as PlayerConfig;
      });
      return next.filter((player): player is PlayerConfig => Boolean(player));
    });
  };

  const handleSelectTerritory = (territoryId: string) => {
    if (!gameState) {
      return;
    }
    const result = executeGameAction(gameState, { type: 'claim', targetTerritoryId: territoryId });
    if (result.success) {
      setGameState(result.state);
    }
  };

  const renderSetup = () => (
    <div className="setup-screen">
      <h1>Empire of Gold</h1>
      <p>Build a deterministic empire through turn-based expansion and production.</p>
      <div className="panel">
        <label>
          Players
          <input type="number" min={2} max={6} value={playerCount} onChange={(event) => setPlayerCount(Number(event.target.value))} />
        </label>
        <label>
          Territories
          <input type="number" min={200} max={10000} value={territoryCount} onChange={(event) => setTerritoryCount(Number(event.target.value))} />
        </label>
        <label>
          Mines
          <input type="number" min={2} max={100} value={mineCount} onChange={(event) => setMineCount(Number(event.target.value))} />
        </label>
      </div>
      <div className="panel">
        {Array.from({ length: playerCount }).map((_, index) => (
          <div key={index} className="player-config">
            <input value={playerConfigs[index]?.name ?? `Player ${index + 1}`} onChange={(event) => updatePlayer(index, 'name', event.target.value)} />
            <select value={playerConfigs[index]?.color ?? COLORS[index % COLORS.length]} onChange={(event) => updatePlayer(index, 'color', event.target.value)}>
              {COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button onClick={startGame}>Start Game</button>
    </div>
  );

  if (!gameState) {
    return <div className="app-shell">{renderSetup()}</div>;
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h2>Empire of Gold</h2>
        <div className="top-bar-stats">
          <span>Turn: {summary?.currentTurn ?? 0}</span>
          <span>Total Gold: {gameState.economy.totalGold}</span>
        </div>
      </header>
      <main className="main-layout">
        <BoardView gameState={gameState} onSelectTerritory={handleSelectTerritory} />
        <Sidebar gameState={gameState} onNewGame={() => setGameState(null)} onSaveGame={() => saveGameState(gameState)} onLoadGame={() => {
          const saved = loadGameState();
          if (saved) {
            setGameState(saved);
          }
        }} />
      </main>
    </div>
  );
}

export default App;
