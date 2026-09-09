import { AnimatePresence, motion } from 'framer-motion';
import { Stars } from './shared';
import type { SideModel } from './model';

export default function PostsSection({ sp }: { sp: SideModel }) {
  const { game, tr, activeSection } = sp;
  return (
    <>
      {activeSection === 'posts' && game.posts.length > 0 && (
        <div className="pointer-events-auto panel p-3">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-white/40">
            {tr ? 'Şehrin sesi' : 'Word on the street'}
          </div>
          <div className="flex flex-col divide-y divide-white/[0.07]">
            <AnimatePresence initial={false}>
              {game.posts.slice(0, 6).map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-neon-blue">{p.handle}</span>
                    <Stars n={p.stars} />
                  </div>
                  <div className="text-[11px] leading-snug text-white/60">{p.text}</div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
      {activeSection === 'posts' && game.posts.length === 0 && (
        <div className="panel p-4 text-center">
          <div className="text-xs font-semibold text-white/70">{tr ? 'Şehir sakin' : 'The city is quiet'}</div>
          <div className="mt-1 text-[10px] text-white/40">
            {tr ? 'Müşteri yorumları burada görünecek.' : 'Customer reactions will appear here.'}
          </div>
        </div>
      )}
    </>
  );
}
