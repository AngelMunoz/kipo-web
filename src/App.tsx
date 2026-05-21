import { createSignal, onMount } from 'solid-js';

function App() {
  const [gameReady, setGameReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const gameContainer = document.getElementById('game-container');
      if (!gameContainer) {
        setError('Game container not found');
        return;
      }

      const [{ bootstrapGame }, { createGameplayScene }] = await Promise.all([
        import('./renderer/bootstrap'),
        import('./renderer/gameplay-scene'),
      ]);

      const bootstrap = await bootstrapGame();

      createGameplayScene(
        gameContainer,
        bootstrap.world,
        bootstrap.env,
        bootstrap.gameplayLoop,
        bootstrap.particleStore
      );

      setGameReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      background: '#111',
      overflow: 'hidden',
    }}>
      <div id="game-container" style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }} />

      {!gameReady() && !error() && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'z-index': 10,
        }}>
          <p style={{ color: '#fff' }}>Loading game...</p>
        </div>
      )}

      {error() && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'z-index': 10,
        }}>
          <p style={{ color: 'red' }}>Error: {error()}</p>
        </div>
      )}

      {gameReady() && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          'text-align': 'center',
          padding: '8px 12px',
          background: 'rgba(26, 26, 46, 0.85)',
          color: '#fff',
          'font-size': '12px',
          'z-index': 10,
          'pointer-events': 'none',
        }}>
          WASD to move | 1-8 for skills | Click to target | Right-click to cancel
        </div>
      )}
    </div>
  );
}

export default App;
