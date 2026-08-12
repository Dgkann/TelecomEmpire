import { AnimatePresence, motion } from 'framer-motion';
import { fmtMoney } from '../game/economy';
import { researchModifiers } from '../game/research';
import { pendingRegulations, regulationProgress } from '../game/regulator';
import { fmtClock, incidentLocation } from '../game/simulation';
import { useGame } from '../store/gameStore';

function Stars({ n }: { n: number }) {
  return (
    <span className="text-[11px] text-neon-amber">
      {'★'.repeat(n)}
      <span className="text-white/20">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export default function SidePanel() {
  const game = useGame((s) => s.game)!;
  const openIncident = useGame((s) => s.openIncident);
  const focus = useGame((s) => s.focus);
  const acceptOffer = useGame((s) => s.acceptOffer);
  const declineOffer = useGame((s) => s.declineOffer);
  const select = useGame((s) => s.select);

  const mods = researchModifiers(game.researchDone);
  const active = game.incidents.filter((i) => !i.resolved);
  const outages = Object.entries(game.stats.outages).filter(([, v]) => v);
  const obligations = pendingRegulations(game);

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-20 flex w-[268px] flex-col gap-3">
      <AnimatePresence>
        {game.activeEvent && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="pointer-events-auto panel border-neon-violet/40 p-3"
          >
            <div className="text-[10px] uppercase tracking-widest text-neon-violet">City event</div>
            <div className="text-sm font-semibold">{game.activeEvent.name}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-white/50">{game.activeEvent.blurb}</div>
            <div className="num mt-1.5 text-[11px] text-neon-violet">
              +{Math.round((game.activeEvent.mul - 1) * 100)}% traffic · until{' '}
              {fmtClock(game.activeEvent.endsAt)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(active.length > 0 || outages.length > 0) && (
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="pointer-events-auto panel border-neon-red/30 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-neon-red">
                {mods.hasNoc ? 'NOC · Alerts' : 'Alerts'}
              </div>
              <div className="num text-[11px] text-white/40">{active.length}</div>
            </div>
            <div className="scroll-thin flex max-h-[210px] flex-col gap-1.5 overflow-y-auto">
              {active.map((i) => {
                const d = game.districts.find((x) => x.id === i.districtId);
                const working = i.repairMinutesLeft !== null;
                return (
                  <button
                    key={i.id}
                    onClick={() => {
                      const p = incidentLocation(game, i);
                      focus(p.gx, p.gy);
                      openIncident(i.id);
                    }}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neon-red">{i.title}</span>
                      <span className="num text-[10px] text-white/35">{d?.name}</span>
                    </div>
                    <div className="num mt-0.5 text-[10px] text-white/45">
                      {working
                        ? `Crew on it · ${Math.round((i.repairMinutesLeft ?? 0) / 60)}h left`
                        : `Unassigned · ${i.affected.toLocaleString()} affected`}
                    </div>
                  </button>
                );
              })}
              {outages.map(([id]) => {
                const d = game.districts.find((x) => x.id === id);
                if (!d) return null;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      focus(d.center.gx, d.center.gy);
                      select({ type: 'district', id });
                    }}
                    className="alert-blink rounded-lg border border-neon-red/40 bg-neon-red/10 px-2.5 py-2 text-left"
                  >
                    <div className="text-xs font-semibold text-neon-red">{d.name}: NO SERVICE</div>
                    <div className="text-[10px] text-white/50">No live path back to a core router.</div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {obligations.map((r) => {
        const progress = regulationProgress(game, r);
        const daysLeft = Math.max(0, Math.ceil((r.dueAt - game.minutes) / 1440));
        return (
          <div key={r.id} className="pointer-events-auto panel border-neon-amber/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-neon-amber">{r.title}</div>
              <div className="num text-[10px] text-white/40">{daysLeft}d left</div>
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-white/55">{r.detail}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${progress * 100}%`, background: progress >= 1 ? '#7ee787' : '#ffc857' }}
              />
            </div>
            <div className="num mt-1 text-[10px] text-white/35">
              {progress >= 1 ? 'On track' : `Fine if missed: $${r.fine.toLocaleString()}`}
            </div>
          </div>
        );
      })}

      <AnimatePresence>
        {game.offers.slice(0, 2).map((o) => {
          const d = game.districts.find((x) => x.id === o.districtId);
          return (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16, transition: { duration: 0.2 } }}
              className="pointer-events-auto panel border-neon-lime/30 p-3"
            >
              <div className="text-[10px] uppercase tracking-widest text-neon-lime">
                {o.segment === 'enterprise' ? 'Enterprise contract' : 'Business contract'}
              </div>
              <div className="text-sm font-semibold">{o.clientName}</div>
              <div className="num mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-white/55">
                <span>Bandwidth</span>
                <span className="text-right text-white">{o.bandwidthGbps} Gbps</span>
                <span>Revenue</span>
                <span className="text-right text-neon-lime">{fmtMoney(o.monthlyRevenue)}/mo</span>
                <span>SLA</span>
                <span className="text-right text-white">{o.slaPercent}%</span>
                <span>District</span>
                <span className="text-right text-white">{d?.name}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn-primary flex-1 py-1 text-xs" onClick={() => acceptOffer(o.id)}>
                  Sign
                </button>
                <button className="btn flex-1 py-1 text-xs" onClick={() => declineOffer(o.id)}>
                  Pass
                </button>
              </div>
              <div className="mt-1.5 text-[10px] leading-snug text-white/35">
                Missing the SLA costs you money every hour they are down.
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {game.posts.length > 0 && (
        <div className="pointer-events-auto panel p-3">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Word on the street</div>
          <div className="scroll-thin flex max-h-[168px] flex-col gap-2 overflow-y-auto">
            <AnimatePresence initial={false}>
              {game.posts.slice(0, 6).map((p) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
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
    </div>
  );
}
