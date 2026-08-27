import { AnimatePresence, motion } from 'framer-motion';
import { repairOptions } from '../game/incidents';
import { fmtMoneyExact } from '../game/economy';
import { useGame } from '../store/gameStore';
import { useDialogAccessibility } from './useDialogAccessibility';

export default function IncidentModal() {
  const game = useGame((s) => s.game)!;
  const openId = useGame((s) => s.openIncidentId);
  const close = useGame((s) => s.openIncident);
  const dispatchTech = useGame((s) => s.dispatchTech);

  const incident = game.incidents.find((i) => i.id === openId && !i.resolved);
  const district = incident ? game.districts.find((d) => d.id === incident.districtId) : undefined;
  const freeTech = game.technicians.find((t) => t.state === 'idle');
  const options = incident ? repairOptions(incident, freeTech?.skill ?? 1) : [];
  const assigned = incident?.assignedTechId
    ? game.technicians.find((t) => t.id === incident.assignedTechId)
    : undefined;
  const dialogRef = useDialogAccessibility(Boolean(incident), () => close(null));

  return (
    <AnimatePresence>
      {incident && (
        <motion.div
          className="absolute inset-0 z-40 grid place-items-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => close(null)}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Network incident"
            tabIndex={-1}
            className="panel max-h-[calc(100dvh-2rem)] w-[440px] max-w-[calc(100%-2rem)] overflow-y-auto"
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neon-red/25 bg-neon-red/10 px-5 py-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-neon-red">Incident</div>
              <div className="text-xl font-bold">{incident.title}</div>
              <div className="mt-1 flex gap-4 text-[11px] text-white/50">
                <span>{district?.name}</span>
                <span className="num">{incident.affected.toLocaleString()} customers affected</span>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-sm leading-relaxed text-white/70">{incident.description}</p>

              {incident.repairMinutesLeft !== null ? (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="font-semibold text-neon-amber">
                    {assigned?.name ?? 'A crew'} is {assigned?.state === 'driving' ? 'on the way' : 'working on it'}
                  </div>
                  <div className="num mt-1 text-xs text-white/50">
                    About {Math.max(1, Math.round(incident.repairMinutesLeft / 60))}h of work remaining.
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-2">
                    {options.map((o) => (
                      <button
                        key={o.key}
                        disabled={!freeTech || (o.key === 'emergency' && game.money < o.cost)}
                        onClick={() => dispatchTech(incident.id, o.key)}
                        className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-neon-cyan/40 hover:bg-neon-cyan/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-white/[0.04]"
                      >
                        <div>
                          <div className="text-sm font-semibold">{o.label}</div>
                          <div className="text-[11px] text-white/45">{o.note}</div>
                        </div>
                        <div className="text-right">
                          <div className="num text-sm font-semibold text-neon-cyan">{fmtMoneyExact(o.cost)}</div>
                          <div className="num text-[11px] text-white/45">
                            ~{Math.max(1, Math.round(o.minutes / 60))}h
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {!freeTech && (
                    <div className="text-xs text-neon-amber">
                      Every field crew is already out. Hire another from the Company screen.
                    </div>
                  )}
                </>
              )}

              <button className="btn w-full" onClick={() => close(null)}>
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
