import { useEffect } from 'react';
import { STEP_MS } from './game/constants';
import { useGame } from './store/gameStore';
import MapView from './ui/MapView';
import TopBar from './ui/TopBar';

function useGameClock() {
  const tick = useGame((s) => s.tick);
  useEffect(() => {
    const id = setInterval(tick, STEP_MS);
    return () => clearInterval(id);
  }, [tick]);
}

function useHotkeys() {
  const setSpeed = useGame((s) => s.setSpeed);
  const cancelBuild = useGame((s) => s.cancelBuild);
  const select = useGame((s) => s.select);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const g = useGame.getState().game;
      if (!g) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpeed(g.speed === 0 ? 1 : 0);
      } else if (e.key === '1') setSpeed(1);
      else if (e.key === '2') setSpeed(2);
      else if (e.key === '3') setSpeed(4);
      else if (e.key === 'Escape') {
        cancelBuild();
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSpeed, cancelBuild, select]);
}

function GameShell() {
  useGameClock();
  useHotkeys();

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative min-h-0 flex-1">
        <MapView />
      </div>
    </div>
  );
}

export default function App() {
  const game = useGame((s) => s.game);
  const newGame = useGame((s) => s.newGame);

  // No menu yet, so drop straight into a default company.
  useEffect(() => {
    if (!game) newGame({ companyName: 'CoreLink', logo: '📡', difficulty: 'standard', cityName: 'Marmara' });
  }, [game, newGame]);

  if (!game) return null;
  return <GameShell />;
}
