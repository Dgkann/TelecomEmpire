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
        className="panel absolute bottom-28 left-4 z-20 w-[268px] border-neon-cyan/30 p-4"
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-neon-cyan">
            Step {stepIndex + 1} of {STEPS.length}
          </div>
          <button className="text-[10px] text-white/35 hover:text-white" onClick={skip}>
            skip
          </button>
        </div>
        <div className="mt-1 text-sm font-semibold">{step.title}</div>
        <p className="mt-1 text-[12px] leading-snug text-white/55">{step.body}</p>
        <div className="mt-3 flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i < stepIndex ? 'bg-neon-cyan' : i === stepIndex ? 'bg-neon-cyan/50' : 'bg-white/10'}`}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
