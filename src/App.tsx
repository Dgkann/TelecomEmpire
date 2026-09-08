import MarketScreen from './ui/screens/MarketScreen';
import ProjectsScreen from './ui/screens/ProjectsScreen';
import { SmartPauseBanner } from './ui/SmartPause';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { STEP_MS } from './game/constants';
import { useGame } from './store/gameStore';
import AuctionModal from './ui/AuctionModal';
import BuildBar from './ui/BuildBar';
import ContextPanel from './ui/ContextPanel';
import GameOverOverlay from './ui/GameOverOverlay';
import VictoryOverlay from './ui/VictoryOverlay';
import HelpOverlay from './ui/HelpOverlay';
import IncidentModal from './ui/IncidentModal';
import MainMenu from './ui/MainMenu';
import MapView from './ui/MapView';
import NavigationRail from './ui/NavigationRail';
import SidePanel from './ui/SidePanel';
import TopBar from './ui/TopBar';
import Tutorial from './ui/Tutorial';
import CompanyScreen from './ui/screens/CompanyScreen';
import NetworkScreen from './ui/screens/NetworkScreen';
import ResearchScreen from './ui/screens/ResearchScreen';
import { playSound, prepareAudio } from './ui/sound';
import SaveManager from './ui/SaveManager';

function useGameClock() {
  const tick = useGame((s) => s.tick);
  useEffect(() => {
    const id = setInterval(tick, STEP_MS);
    return () => clearInterval(id);
  }, [tick]);
}

function useIncidentSound() {
  const incidents = useGame((s) => s.game?.incidents.filter((i) => !i.resolved).length ?? 0);
  const soundOn = useGame((s) => s.soundOn);
  const prev = useRef(incidents);
  useEffect(() => {
    if (incidents > prev.current) playSound('alert', soundOn);
    prev.current = incidents;
  }, [incidents, soundOn]);
}

function useActionSounds() {
  const nodes = useGame((s) => s.game?.nodes.length ?? 0);
  const links = useGame((s) => s.game?.links.length ?? 0);
  const tiers = useGame(
    (s) =>
      (s.game?.nodes.reduce((sum, n) => sum + n.tier, 0) ?? 0) +
      (s.game?.links.reduce((sum, l) => sum + l.tier, 0) ?? 0),
  );
  const contracts = useGame((s) => s.game?.contracts.length ?? 0);
  const soundOn = useGame((s) => s.soundOn);
  const prev = useRef({ nodes, links, tiers, contracts });
  useEffect(() => {
    if (nodes > prev.current.nodes || tiers > prev.current.tiers) playSound('build', soundOn);
    else if (links > prev.current.links) playSound('connect', soundOn);
    else if (contracts > prev.current.contracts) playSound('cash', soundOn);
    prev.current = { nodes, links, tiers, contracts };
  }, [nodes, links, tiers, contracts, soundOn]);
}

function useHotkeys() {
  const setSpeed = useGame((s) => s.setSpeed);
  const cancelBuild = useGame((s) => s.cancelBuild);
  const select = useGame((s) => s.select);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'Escape') {
        useGame.getState().endFailureDrill();
        cancelBuild();
        select(null);
        return;
      }
      if (target.isContentEditable || target.closest('input, textarea, select, button, a, [role="button"]')) return;
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
    <div
      className="pointer-events-none absolute bottom-4 right-4 z-40 flex flex-col items-end gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className={`panel px-3 py-2 text-xs font-medium ${
              t.tone === 'good'
                ? 'border-neon-lime/40 text-neon-lime'
                : t.tone === 'bad'
                  ? 'border-neon-red/40 text-neon-red'
                  : ''
            }`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CriticalEventFlash() {
  const latest = useGame((s) => s.game?.log[0] ?? null);
  const previousId = useRef(latest?.id);
  const timeoutRef = useRef<number | null>(null);
  const [event, setEvent] = useState<typeof latest>(null);
  const tr = useGame((s) => s.locale) === 'tr';

  useEffect(() => {
    if (!latest || latest.id === previousId.current) return;
    previousId.current = latest.id;
    if (latest.tone !== 'bad') return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setEvent(latest);
    timeoutRef.current = window.setTimeout(() => {
      setEvent(null);
      timeoutRef.current = null;
    }, 3900);
  }, [latest]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  return (
    <AnimatePresence>
      {event && (
        <div
          key={event.id}
          role="alert"
          className="critical-event pointer-events-none absolute left-1/2 top-3 z-50 w-[min(520px,calc(100%-24px))] -translate-x-1/2 rounded-md border border-neon-red/55 bg-[#281319]/95 px-4 py-3 shadow-2xl backdrop-blur"
        >
          <div className="text-[11px] font-semibold text-neon-red">{tr ? 'Önemli gelişme' : 'Critical event'}</div>
          <div className="mt-0.5 text-sm font-semibold text-white/90">{event.text}</div>
        </div>
      )}
    </AnimatePresence>
  );
}

function GameShell() {
  const screen = useGame((s) => s.screen);
  const drillTarget = useGame((s) => s.drillTarget);
  const persistenceError = useGame((s) => s.persistenceError);
  useGameClock();
  useHotkeys();
  useIncidentSound();
  useActionSounds();

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <SmartPauseBanner />
      {persistenceError && (
        <div
          className="z-50 border-b border-neon-red/40 bg-[#35151d] px-3 py-2 text-center text-xs font-medium text-neon-red"
          role="alert"
        >
          {persistenceError}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <NavigationRail />
        <div className="relative order-1 min-h-0 min-w-0 flex-1 sm:order-none">
          {screen === 'map' && (
            <>
              <MapView />
              {!drillTarget && (
                <>
                  <SidePanel />
                  <ContextPanel />
                  <BuildBar />
                  <Tutorial />
                </>
              )}
            </>
          )}
          {screen === 'network' && <NetworkScreen />}
          {screen === 'company' && <CompanyScreen />}
          {screen === 'research' && <ResearchScreen />}
          {screen === 'projects' && <ProjectsScreen />}
          {screen === 'market' && <MarketScreen />}

          <IncidentModal />
          <AuctionModal />
          <HelpOverlay />
          <GameOverOverlay />
          <VictoryOverlay />
          <SaveManager />
          <CornerToasts />
          <CriticalEventFlash />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const started = useGame((s) => s.started);
  const hasGame = useGame((s) => s.game !== null);
  useEffect(() => {
    const warm = (event: Event) => {
      if (event.isTrusted && useGame.getState().soundOn) prepareAudio();
    };
    document.addEventListener('pointerdown', warm, { passive: true });
    document.addEventListener('keydown', warm);
    return () => {
      document.removeEventListener('pointerdown', warm);
      document.removeEventListener('keydown', warm);
    };
  }, []);
  return <div className="h-full w-full">{started && hasGame ? <GameShell /> : <MainMenu />}</div>;
}
