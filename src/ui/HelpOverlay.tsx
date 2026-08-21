import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../store/gameStore';

const SECTIONS = [
  {
    title: 'The loop',
    lines: [
      'Build a POP in a district, run fibre back to a core router, and customers start signing up.',
      'Revenue funds more capacity. More capacity carries more customers. Repeat in the next district.',
    ],
  },
  {
    title: 'Reading the map',
    lines: [
      'Fibre colour is utilisation: green under 50%, yellow to 75%, orange to 90%, red above that.',
      'Buildings turn cyan as their households subscribe. A glowing dot means they are on your network.',
      'Traffic roughly doubles between 18:00 and 23:00, so a span that looks fine at noon can be red by 20:00.',
    ],
  },
  {
    title: 'When it goes wrong',
    lines: [
      'Incidents take sites or spans out of service. Click the alert to send a crew.',
      'Emergency repairs cost far more but cut the outage to a fraction of the time.',
      'A site with only one fibre path goes dark the moment that span is cut. A second path costs money and prevents that.',
    ],
  },
  {
    title: 'Controls',
    lines: [
      'Drag to pan, scroll to zoom, click anything for its panel.',
      'Space pauses. 1 / 2 / 3 set the game speed. Esc cancels a build.',
    ],
  },
];

export default function HelpOverlay() {
  const show = useGame((s) => s.showHelp);
  const setShow = useGame((s) => s.setShowHelp);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShow(false)}
        >
          <motion.div
            className="panel max-h-[calc(100dvh-2rem)] w-[560px] max-w-[calc(100%-2rem)] overflow-y-auto p-4 sm:p-6"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold">How to play</h2>
            <div className="mt-4 space-y-5">
              {SECTIONS.map((s) => (
                <div key={s.title}>
                  <div className="text-[11px] uppercase tracking-widest text-neon-cyan">{s.title}</div>
                  <ul className="mt-1.5 space-y-1.5">
                    {s.lines.map((l) => (
                      <li key={l} className="text-[13px] leading-snug text-white/60">
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button className="btn-primary mt-6 w-full" onClick={() => setShow(false)}>
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
