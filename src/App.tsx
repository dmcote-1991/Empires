import { useEffect, useMemo, useState } from 'react';
import {
  createInitialGameState,
  executeGameAction,
  getAvailableActions,
  getGameSummary,
  getTerritoryPrice,
} from './engine/game';
import { loadGameState, saveGameState } from './engine/save';
import { BoardView } from './ui/BoardView';
import { Sidebar } from './ui/Sidebar';
import { GameState, PlayerConfig } from './types';

const COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

const defaultPlayerConfigs = (): PlayerConfig[] => [
  { name: 'Player 1', color: 'Red' },
  { name: 'Player 2', color: 'Orange' },
];

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>(defaultPlayerConfigs());
  const [playerCount, setPlayerCount] = useState(2);
  const [territoryCount, setTerritoryCount] = useState(200);
  const [mineCount, setMineCount] = useState(4);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [settlementName, setSettlementName] = useState('');
  const [pendingSale, setPendingSale] = useState<{
    territoryId: string;
    buyerPlayerId: string;
    sellerPlayerId: string;
  } | null>(null);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Keep the menu open when clicking the selected territory
      // or anything inside its action menu.
      if (
        target.closest('.tile-wrapper') ||
        target.closest('.action-menu')
      ) {
        return;
      }

      setSelectedTerritoryId(null);
    };

    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

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
    if (
      gameState?.turn.phase === 'claiming'
    ) {
      setSelectedTerritoryId(territoryId);
      return;
    }
    setSelectedTerritoryId(territoryId);
    setSettlementName('');
  };

  const handleAction = (
    type:
      | 'claim'
      | 'endClaiming'
      | 'buy'
      | 'sell'
      | 'listMarketplaceItem'
      | 'buyMarketplaceListing'
      | 'removeMarketplaceListing'
      | 'produce'
      | 'produceWood'
      | 'establishSettlement'
      | 'growSettlement'
      | 'evacuateSettlement'
      | 'tearDownSettlement'
      | 'establishLumberYard'
      | 'establishWaterProcessingPlant'
      | 'buildBridge'
      | 'skip',
    territoryId: string,
    buyerPlayerId?: string,
    payload?: Record<string, unknown>
  ) => {
    if (!gameState) {
      return;
    }

    if (type === 'buy') {
      const territory = gameState.board.territories.find(
        (territory) => territory.id === territoryId
      );

      if (!territory?.owner) {
        return;
      }

      const buyerPlayerId =
        gameState.turn.order[
          gameState.turn.currentPlayerIndex
        ];

      const sellerPlayerId = territory.owner;

      // Confirm the purchase.
      if (
        pendingSale?.territoryId === territoryId &&
        pendingSale.buyerPlayerId === buyerPlayerId &&
        pendingSale.sellerPlayerId === sellerPlayerId
      ) {
        const result = executeGameAction(gameState, {
          type: 'buy',
          targetTerritoryId: territoryId,
        });

        if (result.success) {
          setGameState(result.state);
          setPendingSale(null);
          setSelectedTerritoryId(null);
        }

        return;
      }

      // First click: show the purchase confirmation.
      setPendingSale({
        territoryId,
        buyerPlayerId,
        sellerPlayerId,
      });

      return;
    }

    const result = executeGameAction(gameState, {
      type,
      targetTerritoryId: territoryId,
      payload: {
        ...(buyerPlayerId
          ? { buyerPlayerId }
          : {}),
        ...(payload ?? {}),
      },
    });

    if (result.success) {
      setGameState(result.state);

      if (type === 'claim') {
        /*
        * Stay selected while claiming so the player can
        * immediately continue expanding.
        */
        return;
      }

      setSelectedTerritoryId(null);
    }
  };

  const getSellBuyers = (territoryId: string) => {
    if (!gameState) {
      return [];
    }

    const territory = gameState.board.territories.find(
      (territory) => territory.id === territoryId
    );

    if (!territory) {
      return [];
    }

    const buyerIds = new Set<string>();

    territory.neighbors.forEach((neighborId) => {
      const neighbor = gameState.board.territories.find(
        (territory) => territory.id === neighborId
      );

      if (
        neighbor?.owner &&
        neighbor.owner !== gameState.players[gameState.turn.currentPlayerIndex].id
      ) {
        buyerIds.add(neighbor.owner);
      }
    });

    return gameState.players.filter((player) =>
      buyerIds.has(player.id)
    );
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
        <div className="board-column">
          <BoardView
            gameState={gameState}
            selectedTerritoryId={selectedTerritoryId}
            availableActions={
              selectedTerritoryId
                ? getAvailableActions(
                    gameState,
                    selectedTerritoryId
                  )
                : []
            }
            onSelectTerritory={handleSelectTerritory}
            settlementName={settlementName}
            setSettlementName={setSettlementName}
            onEstablishSettlement={(territoryId, name) => {
              handleAction(
                'claim',
                territoryId,
                undefined,
                {
                  settlementName: name,
                }
              );

              setSettlementName('');
            }}
            onAction={handleAction}
            getSellBuyers={getSellBuyers}
          />

          {pendingSale && (
            <div>
              {(() => {
                const buyer = gameState.players.find(
                  (player) => player.id === pendingSale.buyerPlayerId
                );

                const territory = gameState.board.territories.find(
                  (territory) => territory.id === pendingSale.territoryId
                );

                const price = territory
                  ? getTerritoryPrice(gameState)
                  : 0;

                return (
                  <>
                    <p>
                      {buyer?.name} wants to buy this territory for {price} Gold.
                      Accept?
                    </p>

                    <button
                      onClick={() => {
                        handleAction(
                          'buy',
                          pendingSale.territoryId
                        );
                      }}
                    >
                      Accept
                    </button>

                    <button
                      onClick={() => setPendingSale(null)}
                    >
                      Deny
                    </button>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <Sidebar
          gameState={gameState}
          onNewGame={() => setGameState(null)}
          onSaveGame={() => saveGameState(gameState)}
          onLoadGame={() => {
            const saved = loadGameState();

            if (saved) {
              setGameState(saved);
            }
          }}
          onMarketplaceAction={(move) => {
            const result = executeGameAction(
              gameState,
              move
            );

            if (result.success) {
              setGameState(result.state);
            }
          }}
        />

      </main>
    </div>
  );
}

export default App;
