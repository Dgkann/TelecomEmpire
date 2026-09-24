import { useState } from 'react';
import { plural } from '../game/util';
import { AnimatePresence, motion } from 'framer-motion';
import {
  crewTravelMinutes,
  dispatchCandidates,
  incidentCopy,
  pendingIncidents,
  repairCost,
  type RepairMode,
} from '../game/incidents';
import { MINUTES_PER_STEP } from '../game/constants';
import { fmtMoneyExact } from '../game/economy';
import { useGame } from '../store/gameStore';
import { t } from './i18n';
import { useDialogAccessibility } from './useDialogAccessibility';

const duration = (minutes: number, tr = false) => {
  const rounded = Math.ceil(minutes);
  const [m, h] = tr ? [' dk', ' sa'] : ['m', 'h'];
  return rounded < 60 ? rounded + m : Math.floor(rounded / 60) + h + (rounded % 60 ? ' ' + (rounded % 60) + m : '');
};

export default function IncidentModal() {
  const locale = useGame((s) => s.locale);
  const game = useGame((s) => s.game)!;
  const openId = useGame((s) => s.openIncidentId);
  const close = useGame((s) => s.openIncident);
  const dispatchTech = useGame((s) => s.dispatchTech);
  const [choice, setChoice] = useState<{ incidentId: string | null; mode: RepairMode; techId?: string }>({
    incidentId: null,
    mode: 'normal',
  });
  const mode = choice.incidentId === openId ? choice.mode : 'normal';
  const selectedId = choice.incidentId === openId ? choice.techId : undefined;
  const incident = game.incidents.find((i) => i.id === openId && !i.resolved);
  const district = incident ? game.districts.find((d) => d.id === incident.districtId) : undefined;
  const candidates = incident ? dispatchCandidates(game, incident, mode) : [];
  const selected = selectedId ? candidates.find((c) => c.technician.id === selectedId) : candidates[0];
  const assigned = incident?.assignedTechId
    ? game.technicians.find((t) => t.id === incident.assignedTechId)
    : undefined;
  const cost = incident ? repairCost(incident, mode) : 0;
  const queue = pendingIncidents(game);
  const queueRank = queue.findIndex((i) => i.id === openId) + 1;
  const travelLeft = incident && assigned?.state === 'driving' ? crewTravelMinutes(game, incident, assigned) : 0;
  const workLeft = Math.ceil((incident?.repairMinutesLeft ?? 0) / MINUTES_PER_STEP) * MINUTES_PER_STEP;
  const affordable = mode === 'normal' || game.money >= cost;
  const dialogRef = useDialogAccessibility(Boolean(incident), () => close(null));
  const tr = locale === 'tr';
  const copy = incident ? incidentCopy(incident, game, tr) : null;
  const time = (minutes: number) => duration(minutes, tr);

  return (
    <AnimatePresence>
      {incident && (
        <motion.div
          className="absolute inset-0 z-40 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => close(null)}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={tr ? 'Şebeke arızası' : 'Network incident'}
            tabIndex={-1}
            className="panel max-h-full w-full min-w-0 max-w-[480px] overflow-y-auto"
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neon-red/25 bg-neon-red/10 px-5 py-4">
              <div className="text-xl font-bold">{copy?.title}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/60">
                <span>{district?.name}</span>
                <span>
                  {tr
                    ? `Arıza başladığında ${incident.affected.toLocaleString('tr-TR')} müşteri`
                    : `${incident.affected.toLocaleString('en-US')} ${plural(incident.affected, 'customer')} at incident start`}
                </span>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm leading-relaxed text-white/70">{copy?.description}</p>
              {incident.repairMinutesLeft !== null ? (
                <div
                  className="space-y-3 border-l-2 border-neon-cyan bg-white/5 p-3 text-sm"
                  aria-label={tr ? 'Onarım ilerlemesi' : 'Repair progress'}
                >
                  <div className="font-semibold text-neon-cyan">
                    {tr
                      ? `${assigned?.name ?? 'Bir ekip'} ${assigned?.state === 'driving' ? 'yolda' : 'onarım yapıyor'}`
                      : `${assigned?.name ?? 'A crew'} is ${assigned?.state === 'driving' ? 'on the way' : 'working on it'}`}
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>{t(locale, 'travelRemaining')}</span>
                    <span>{time(travelLeft)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>{t(locale, 'repairRemaining')}</span>
                    <span>{time(workLeft)}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-2 font-semibold">
                    <span>{t(locale, 'estimatedRestoration')}</span>
                    <span>~{time(travelLeft + workLeft)}</span>
                  </div>
                </div>
              ) : (
                <>
                  {queue.length > 1 && (
                    <p className="text-xs text-neon-amber">
                      {tr
                        ? `Müdahale önceliği ${queueRank}/${queue.length} · önce kayıtlı müşteri etkisine, sonra arızanın yaşına göre.`
                        : `Response priority ${queueRank} of ${queue.length} · ranked by recorded customer impact, then age.`}
                    </p>
                  )}
                  <fieldset className="min-w-0">
                    <legend className="mb-2 text-sm font-semibold">{t(locale, 'responsePace')}</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {(['normal', 'emergency'] as const).map((pace) => (
                        <label
                          key={pace}
                          className={`cursor-pointer rounded border p-3 text-sm ${mode === pace ? 'border-neon-cyan/60 bg-neon-cyan/10' : 'border-white/10 bg-white/[0.03]'}`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="repair-mode"
                              checked={mode === pace}
                              onChange={() => setChoice({ incidentId: openId, mode: pace, techId: selectedId })}
                              className="accent-[#62c7bd]"
                            />
                            {pace === 'normal' ? (tr ? 'Planlı' : 'Scheduled') : tr ? 'Acil' : 'Emergency'}
                          </div>
                          <div className="mt-2 font-semibold">{fmtMoneyExact(repairCost(incident, pace))}</div>
                          <div className="mt-1 text-[11px] text-white/55">
                            {pace === 'normal'
                              ? tr
                                ? 'Standart onarım'
                                : 'Standard repair work'
                              : tr
                                ? 'Daha hızlı iş, aynı yol süresi'
                                : 'Faster work, same travel'}
                          </div>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="min-w-0">
                    <legend className="mb-2 text-sm font-semibold">{t(locale, 'chooseFieldCrew')}</legend>
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {candidates.map((c, index) => (
                        <label
                          key={c.technician.id}
                          className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2 ${selected?.technician.id === c.technician.id ? 'border-neon-cyan/50 bg-neon-cyan/10' : 'border-transparent bg-white/[0.03]'}`}
                        >
                          <input
                            type="radio"
                            name="repair-crew"
                            aria-label={c.technician.name}
                            checked={selected?.technician.id === c.technician.id}
                            onChange={() => setChoice({ incidentId: openId, mode, techId: c.technician.id })}
                            className="mt-1 accent-[#62c7bd]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap justify-between gap-x-2 text-sm">
                              <span>{c.technician.name}</span>
                              <span className="font-semibold">~{time(c.totalMinutes)}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-white/60">
                              {tr
                                ? `Yetkinlik ${c.technician.skill} · ${time(c.travelMinutes)} yol + ${time(c.workMinutes)} onarım`
                                : `Skill ${c.technician.skill} · ${time(c.travelMinutes)} travel + ${time(c.workMinutes)} repair`}
                              {index === 0 && (
                                <span className="text-neon-cyan">{tr ? ' · En hızlı' : ' · Fastest'}</span>
                              )}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {!candidates.length && (
                      <p className="text-xs text-neon-amber">
                        {tr
                          ? 'Tüm saha ekipleri sahada. Şirket ekranından yeni ekip al veya bir ekibin dönmesini bekle.'
                          : 'Every field crew is already out. Hire another from the Company screen or wait for a crew to return.'}
                      </p>
                    )}
                    {candidates.length > 0 && !selected && (
                      <p className="mt-2 text-xs text-neon-amber">{t(locale, 'crewNoLongerAvailable')}</p>
                    )}
                  </fieldset>
                  {selected && (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/60">{t(locale, 'travelPlusRepair')}</span>
                        <strong>~{time(selected.totalMinutes)}</strong>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                        <span
                          className="bg-neon-amber"
                          style={{ width: (selected.travelMinutes / selected.totalMinutes) * 100 + '%' }}
                        />
                        <span className="flex-1 bg-neon-cyan" />
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neon-amber">
                          {tr ? 'Yol' : 'Travel'} {time(selected.travelMinutes)}
                        </span>
                        <span className="text-neon-cyan">
                          {tr ? 'Onarım' : 'Repair'} {time(selected.workMinutes)}
                        </span>
                      </div>
                    </div>
                  )}
                  {!affordable && (
                    <p className="text-xs text-neon-amber">
                      {tr
                        ? `Acil onarım için ${fmtMoneyExact(cost - game.money)} daha nakit gerekiyor.`
                        : `Emergency repair needs ${fmtMoneyExact(cost - game.money)} more cash.`}
                    </p>
                  )}
                  {mode === 'normal' && game.money < cost && (
                    <p className="text-xs text-neon-amber">
                      {tr
                        ? `Planlı onarım eksi bakiyeyle de yapılabilir: bakiye ${fmtMoneyExact(game.money - cost)} olur.`
                        : `Scheduled repairs can proceed with negative cash: balance will fall to ${fmtMoneyExact(game.money - cost)}.`}
                    </p>
                  )}
                  <button
                    className="btn-primary w-full"
                    disabled={!selected || !affordable}
                    onClick={() => selected && dispatchTech(incident.id, mode, selected.technician.id)}
                  >
                    {tr ? 'Ekip gönder' : 'Dispatch crew'} · {fmtMoneyExact(cost)}
                  </button>
                  <p className="text-[11px] text-white/45">{t(locale, 'estimatesUseGameTime')}</p>
                </>
              )}
              <button className="btn w-full" onClick={() => close(null)}>
                {t(locale, 'close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
