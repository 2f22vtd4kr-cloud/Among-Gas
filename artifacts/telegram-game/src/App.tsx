import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotFound from '@/pages/not-found';
import GameMap from '@/pages/GameMap';
import CollisionEditor from '@/pages/CollisionEditor';
import Lobby from '@/pages/Lobby';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { GameProvider, useGameState } from '@/context/GameContext';

const queryClient = new QueryClient();

/**
 * Routes the user to the lobby or the game map depending on their phase.
 * The lobby is the entry point; game map is shown once gameplay begins.
 * The /game route is phase-gated — navigating there before the server
 * has started the game just falls back to the lobby.
 */
function GameRouter() {
  const { phase } = useGameState();

  return (
    <Switch>
      {/* Collision editor is a dev tool — always accessible */}
      <Route path="/collision-editor" component={CollisionEditor} />
      {/* Game map only when actively playing */}
      <Route path="/game">
        {phase === 'playing' ? <GameMap /> : <Lobby />}
      </Route>
      {/* Default: lobby (handles connecting / lobby / error states) */}
      <Route component={Lobby} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <GameProvider>
          <GameRouter />
        </GameProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
