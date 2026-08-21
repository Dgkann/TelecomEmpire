import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { residentialSubs } from '../game/simulation';
import { computeRoutes, isRedundant } from '../game/network';
import { useGame } from '../store/gameStore';
import type { GameState } from '../game/types';

interface TutorialStep {
  title: string;
  body: string;
  done: (g: GameState) => boolean;
}

const STEPS: TutorialStep[] = [
  {
    title: 'Place a second POP',
    body: 'Pick POP and move over the city until the preview turns green, then place the new T1 site inside your licensed district.',
    done: (g) => g.nodes.filter((n) => n.kind === 'pop').length >= 2,
  },
  {
    title: 'Light the fibre',
    body: 'Choose Fibre, click the new POP, then click the core router; eligible endpoints glow cyan and the route shows its price before you build.',
    done: (g) => g.links.length >= 2,
  },
  {
    title: 'Grow to 400 customers',
    body: 'Coverage spreads out from your sites over the next few days. Watch buildings turn cyan as they subscribe.',
    done: (g) => residentialSubs(g) >= 400,
  },
  {
    title: 'Watch the evening peak',
    body: 'Traffic roughly doubles between 18:00 and 23:00; upgrade a POP from T1 to T2 and watch its map badge and capacity change.',
    done: (g) => g.nodes.some((n) => n.tier >= 2),
  },
  {
    title: 'Protect a customer site',
    body: 'Add a second fibre route to a POP or access site so one cut cannot isolate it; protected sites qualify for stricter contracts and audits.',
    done: (g) => {
      const sites = g.nodes.filter((node) => node.kind === 'pop' || node.kind === 'access');
      const routes = computeRoutes(g);
      return sites.some((site) => isRedundant(g, site.id, routes));
    },
  },
  {
    title: 'Expand to a new district',
    body: 'Click a greyed-out district and buy its licence, then plan coverage, capacity and a resilient path back to the core.',
    done: (g) => g.districts.filter((d) => d.unlocked).length >= 2,
  },
];

export default function Tutorial() {
  const game = useGame((s) => s.game)!;
  const advance = useGame((s) => s.advanceTutorial);
  const skip = useGame((s) => s.skipTutorial);
  const selection = useGame((s) => s.selection);
  const stepIndex = game.tutorialStep;
  const step = STEPS[stepIndex];

  // Advance as soon as the goal is met.
  useEffect(() => {
    if (step && step.done(game)) advance(stepIndex);
  }, [game, step, stepIndex, advance]);

  useEffect(() => {
    if (stepIndex >= STEPS.length && !game.tutorialDone) skip();
  }, [stepIndex, game.tutorialDone, skip]);

  if (game.tutorialDone || !step) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepIndex}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`panel absolute right-4 top-4 z-20 w-[400px] max-w-[calc(100%-32px)] border-neon-cyan/25 px-4 py-3 xl:w-[520px] ${selection ? 'hidden' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-neon-cyan/35 bg-neon-cyan/10 font-mono text-xs font-semibold text-neon-cyan">
            {stepIndex + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-neon-cyan">Commissioning guide</div>
                <div className="text-sm font-semibold">{step.title}</div>
              </div>
              <button className="shrink-0 text-[11px] text-white/35 hover:text-white" onClick={skip}>Skip guide</button>
            </div>
            <p className="mt-0.5 text-[12px] leading-snug text-white/55">{step.body}</p>
            <div className="mt-2 flex gap-1">
              {STEPS.map((_, i) => (
                <div key={i} className={`h-0.5 flex-1 rounded-full ${i < stepIndex ? 'bg-neon-cyan' : i === stepIndex ? 'bg-neon-cyan/55' : 'bg-white/10'}`} />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
