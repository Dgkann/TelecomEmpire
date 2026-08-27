import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SPECTRUM_BANDS } from '../game/constants';
import { fmtMoney, fmtMoneyExact } from '../game/economy';
import { useGame } from '../store/gameStore';
import { useDialogAccessibility } from './useDialogAccessibility';

// Sealed bid: one number, no second chances, no idea what the others wrote down.
export default function AuctionModal() {
  const game = useGame((s) => s.game)!;
  const placeBid = useGame((s) => s.placeBid);
  const dismiss = useGame((s) => s.dismissAuction);
  const auction = game.auction;

  const [bid, setBid] = useState(0);
  const [open, setOpen] = useState(false);
  const dialogRef = useDialogAccessibility(Boolean(auction && open), () => setOpen(false));

  const spec = auction ? SPECTRUM_BANDS[auction.band] : null;

  useEffect(() => {
    if (auction && auction.playerBid === null && !auction.result) {
      setBid(Math.round(auction.reserve * 1.15));
      setOpen(true);
    }
    if (auction?.result) setOpen(true);
  }, [auction]);

  if (!auction || !spec || !open) return null;

  const result = auction.result;
  const won = result?.winnerId === 'player';
  const hoursLeft = Math.max(0, Math.round((auction.closesAt - game.minutes) / 60));
  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-40 grid place-items-center bg-black/55 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Spectrum auction"
          tabIndex={-1}
          className="panel max-h-[calc(100dvh-2rem)] w-[470px] max-w-[calc(100%-2rem)] overflow-y-auto"
          initial={{ scale: 0.94, y: 14 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 330, damping: 28 }}
        >
          <div className="border-b border-neon-violet/25 bg-neon-violet/10 px-5 py-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-neon-violet">Spectrum auction</div>
            <div className="text-xl font-bold">
              {spec.label} · {auction.blocks} block{auction.blocks > 1 ? 's' : ''}
            </div>
            <div className="num mt-1 text-[11px] text-white/50">
              {result ? 'Lot closed' : `Bids close in ${hoursLeft}h`}
            </div>
          </div>

          <div className="space-y-4 p-5">
            <p className="text-sm leading-relaxed text-white/70">{spec.note}</p>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="chip py-2">
                <div className="stat-label">Coverage</div>
                <div className="num text-sm text-neon-cyan">{spec.radius.toFixed(2)}x</div>
              </div>
              <div className="chip py-2">
                <div className="stat-label">Capacity</div>
                <div className="num text-sm text-neon-cyan">{spec.capacity.toFixed(1)}x</div>
              </div>
              <div className="chip py-2">
                <div className="stat-label">Reserve</div>
                <div className="num text-sm text-white">{fmtMoney(auction.reserve)}</div>
              </div>
            </div>

            {!result ? (
              <>
                {auction.playerBid === null ? (
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="stat-label">Your sealed bid</span>
                      <span className="num text-lg font-semibold text-neon-cyan">{fmtMoneyExact(bid)}</span>
                    </div>
                    <input
                      type="range"
                      aria-label="Spectrum auction bid"
                      min={auction.reserve}
                      max={Math.max(auction.reserve * 4, 100000)}
                      step={5000}
                      value={bid}
                      onChange={(e) => setBid(Number(e.target.value))}
                      className="mt-2 w-full"
                    />
                    <div className="num mt-1 flex justify-between text-[10px] text-white/35">
                      <span>reserve {fmtMoney(auction.reserve)}</span>
                      <span>cash {fmtMoney(game.money)}</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-white/45">
                      You only pay if you win. Bid high and you overpay, bid low and a rival gets the band.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button className="btn flex-1" onClick={() => setOpen(false)}>
                        Sit this one out
                      </button>
                      <button
                        className="btn-primary flex-[2]"
                        disabled={bid > game.money}
                        onClick={() => {
                          placeBid(bid);
                          setOpen(false);
                        }}
                      >
                        {bid > game.money ? 'More than you have' : 'Submit bid'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                    Bid of <span className="num text-neon-cyan">{fmtMoneyExact(auction.playerBid)}</span> is in.
                    <button className="btn mt-3 w-full" onClick={() => setOpen(false)}>
                      Close
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div
                  className={`rounded-lg border p-3 ${won ? 'border-neon-lime/40 bg-neon-lime/10' : 'border-white/10 bg-white/5'}`}
                >
                  <div className={`text-sm font-semibold ${won ? 'text-neon-lime' : 'text-white/80'}`}>
                    {won
                      ? 'You won the lot'
                      : result.winnerId === 'none'
                        ? 'No bids met the reserve'
                        : `${result.winnerName} won the lot`}
                  </div>
                  {result.winnerId !== 'none' && (
                    <div className="num mt-0.5 text-xs text-white/50">Hammer price {fmtMoneyExact(result.price)}</div>
                  )}
                </div>

                <div>
                  <div className="stat-label mb-1.5">All bids</div>
                  <div className="flex flex-col gap-1">
                    {result.bids.map((b, i) => (
                      <div
                        key={b.bidderId + i}
                        className={`flex justify-between rounded-md px-2 py-1 text-xs ${
                          b.bidderId === 'player' ? 'bg-neon-cyan/10 text-neon-cyan' : 'bg-white/[0.04] text-white/60'
                        }`}
                      >
                        <span>{b.bidderName}</span>
                        <span className="num">{fmtMoneyExact(b.amount)}</span>
                      </div>
                    ))}
                    {auction.playerBid === null && (
                      <div className="px-2 py-1 text-[11px] text-white/35">You did not bid.</div>
                    )}
                  </div>
                </div>

                <button
                  className="btn-primary w-full"
                  onClick={() => {
                    dismiss();
                    setOpen(false);
                  }}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
