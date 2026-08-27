import { AnimatePresence, motion } from 'framer-motion';
import { fmtMoney, fmtNum } from '../game/economy';
import { totalDebt } from '../game/finance';
import { fmtDate, totalCustomers } from '../game/simulation';
import { useGame } from '../store/gameStore';
import { useDialogAccessibility } from './useDialogAccessibility';

export default function GameOverOverlay() {
  const game = useGame((s) => s.game)!;
  const quit = useGame((s) => s.quitToMenu);
  const over = game.gameOver;
  const dialogRef = useDialogAccessibility(Boolean(over));

  return (
    <AnimatePresence>
      {over && (
        <motion.div
          className="absolute inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Game over"
            tabIndex={-1}
            className="panel max-h-[calc(100dvh-2rem)] w-[440px] max-w-[calc(100%-2rem)] overflow-y-auto border-neon-red/40"
            initial={{ scale: 0.94, y: 14 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div className="border-b border-neon-red/25 bg-neon-red/10 px-6 py-5">
              <div className="text-[10px] uppercase tracking-[0.25em] text-neon-red">Insolvent</div>
              <div className="text-2xl font-bold">{game.companyName} is finished</div>
              <div className="num mt-1 text-[11px] text-white/50">{fmtDate(over.at)}</div>
            </div>

            <div className="space-y-4 p-6">
              <p className="text-sm leading-relaxed text-white/70">{over.reason}</p>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="chip py-2">
                  <div className="stat-label">Customers at the end</div>
                  <div className="num text-lg">{fmtNum(totalCustomers(game))}</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">Owed</div>
                  <div className="num text-lg text-neon-red">{fmtMoney(totalDebt(game))}</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">Cash</div>
                  <div className="num text-lg text-neon-red">{fmtMoney(game.money)}</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">Reputation</div>
                  <div className="num text-lg">{Math.round(game.reputation)}</div>
                </div>
              </div>

              <p className="text-[11px] leading-snug text-white/40">
                Borrowing buys time to build. It does not pay for itself unless the network you build with it carries
                more customers than the interest costs.
              </p>

              <button className="btn-primary w-full" onClick={quit}>
                Back to the menu
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
