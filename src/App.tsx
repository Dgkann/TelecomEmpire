import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { STEP_MS } from './game/constants';
import { useGame } from './store/gameStore';
import BuildBar from './ui/BuildBar';
import ContextPanel from './ui/ContextPanel';
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

function CornerToasts() {
  const toasts = useGame((s) => s.toasts).filter((t) => t.gx === undefined);
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className={`panel px-3 py-2 text-xs font-medium ${
              t.tone === 'good' ? 'border-neon-lime/40 text-neon-lime' : t.tone === 'bad' ? 'border-neon-red/40 text-neon-red' : ''
            }`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function GameShell() {
  useGameClock();
  useHotkeys();

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative min-h-0 flex-1">
        <MapView />
        <ContextPanel />
        <BuildBar />

        <CornerToasts />
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
