import { AnimatePresence, motion } from 'framer-motion';
import { incidentLocation } from '../../game/simulation';
import { t } from '../i18n';
import type { SideModel } from './model';

export default function AlertsSection({ sp }: { sp: SideModel }) {
  const { locale, game, tr, openIncident, focus, select, activeSection, mods, active, outages } = sp;
  return (
    <>
      {activeSection === 'alerts' && (
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
              <div className="flex flex-col gap-1.5">
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
                      <div className="text-[10px] text-white/50">{t(locale, 'noLivePathBackToCore')}</div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
      {activeSection === 'alerts' && active.length === 0 && outages.length === 0 && (
        <div className="panel p-4 text-center">
          <div className="text-xs font-semibold text-neon-lime">
            {tr ? 'Tüm sistemler çalışıyor' : 'All systems nominal'}
          </div>
          <div className="mt-1 text-[10px] text-white/40">
            {tr ? 'Açık arıza veya kesinti bulunmuyor.' : 'There are no open faults or outages.'}
          </div>
        </div>
      )}
    </>
  );
}
