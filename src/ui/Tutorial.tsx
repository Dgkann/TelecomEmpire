import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { residentialSubs } from '../game/simulation';
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
    body: 'Pick POP from the bottom toolbar and drop it on a tile in your home district. POPs are what bring customers onto your network.',
    done: (g) => g.nodes.filter((n) => n.kind === 'pop').length >= 2,
  },
  {
    title: 'Light the fibre',
    body: 'Choose Fibre, click your new POP, then click the core router. Nothing sells until the site has a path home.',
    done: (g) => g.links.length >= 2,
  },
  {
    title: 'Grow to 400 customers',
    body: 'Coverage spreads out from your sites over the next few days. Watch buildings turn cyan as they subscribe.',
    done: (g) => residentialSubs(g) >= 400,
  },
  {
    title: 'Watch the evening peak',
    body: 'Traffic roughly doubles between 18:00 and 23:00. Click a POP and upgrade it before the fibre turns orange.',
    done: (g) => g.nodes.some((n) => n.tier >= 2),
  },
  {
    title: 'Expand to a new district',
    body: 'Click a greyed-out district and buy its licence, then repeat: POP, fibre, capacity. That is the whole game.',
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

  // Advance as soon as the goal is met. This deliberately does not use a
  // timeout: the effect re-runs on every simulation tick, so a pending timer
  // would be cleared before it could ever fire.
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
