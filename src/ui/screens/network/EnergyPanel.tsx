import { ENERGY } from '../../../game/constants';
import { fmtMoney } from '../../../game/economy';
import {
  ENERGY_PLANS,
  energyPriceIndex,
  fixedExitFee,
  hasSolar,
  monthlyPowerBill,
  planIssue,
  solarCost,
  solarIssue,
} from '../../../game/energy';
import type { EnergyPlan } from '../../../game/types';
import { useGame } from '../../../store/gameStore';
import { t } from '../../i18n';
import type { NetworkModel } from './model';

const PLAN_IDS: EnergyPlan[] = ['spot', 'fixed', 'green'];

export default function EnergyPanel({ m }: { m: NetworkModel }) {
  const setEnergyPlan = useGame((s) => s.setEnergyPlan);
  const installSolar = useGame((s) => s.installSolar);
  const tr = m.locale === 'tr';
  const energy = m.game.energy;
  const index = energyPriceIndex(m.game);
  const bill = monthlyPowerBill(m.game);
  const exitFee = fixedExitFee(m.game);
  const canSolar = m.mods.hasOnsiteSolar;
  const history = energy.history.slice(-12);
  const peak = Math.max(ENERGY.spotCeiling, ...history);

  return (
    <div className={`panel panel-tone-amber p-5 lg:col-span-2 ${m.networkView === 'interconnect' ? '' : 'hidden'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">{t(m.locale, 'energyDesk')}</h2>
          <p className="mt-1 text-[11px] text-white/40">{t(m.locale, 'energyDeskBlurb')}</p>
        </div>
        <div className="text-right">
          <div className="stat-label">{t(m.locale, 'monthlyPowerBill')}</div>
          <div className="num text-lg font-semibold text-neon-amber">{fmtMoney(bill)}</div>
          <div className="num text-[10px] text-white/40">
            {t(m.locale, 'tariffIndex')} ×{index.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Twelve months of wholesale price, so a spike is visible before it is signed away. */}
      <div className="mt-4">
        <div className="flex items-end justify-between text-[10px] text-white/40">
          <span>{t(m.locale, 'wholesaleTrend')}</span>
          <span className="num">×{energy.spotIndex.toFixed(2)}</span>
        </div>
        <div className="mt-1 flex h-12 items-end gap-1" role="img" aria-label={t(m.locale, 'wholesaleTrend')}>
          {history.map((value, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(6, (value / peak) * 100)}%`,
                background: value > 1.25 ? '#ff8a5c' : value < 0.9 ? '#7ee787' : '#f3b843',
                opacity: i === history.length - 1 ? 1 : 0.55,
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = ENERGY_PLANS[id];
          const active = energy.plan === id;
          const issue = planIssue(m.game, id, m.locale);
          return (
            <div
              key={id}
              className={`rounded-md border p-3 ${active ? 'border-neon-amber/50 bg-neon-amber/[0.07]' : 'border-white/10 bg-black/15'}`}
            >
              <div className="text-xs font-semibold text-white/85">{tr ? plan.titleTr : plan.title}</div>
              <p className="mt-1 text-[10px] leading-snug text-white/45">{tr ? plan.detailTr : plan.detail}</p>
              <p className="mt-1.5 text-[10px] leading-snug text-white/35">{tr ? plan.tradeoffTr : plan.tradeoff}</p>
              {active ? (
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-neon-amber">
                  {t(m.locale, 'currentTariff')}
                </div>
              ) : (
                <button
                  className="btn mt-2 w-full py-1 text-[11px]"
                  disabled={!!issue}
                  title={issue ?? undefined}
                  onClick={() => setEnergyPlan(id)}
                >
                  {t(m.locale, 'switchTariff')}
                  {exitFee > 0 ? ` · ${fmtMoney(exitFee)}` : ''}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-white/[0.07] pt-3">
        <div className="flex items-center justify-between">
          <div className="stat-label">{t(m.locale, 'onsiteGeneration')}</div>
          <div className="num text-[10px] text-white/40">
            {energy.solarNodeIds.length}/{m.game.nodes.length}
          </div>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-white/40">
          {canSolar ? t(m.locale, 'onsiteGenerationBlurb') : t(m.locale, 'onsiteGenerationLocked')}
        </p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {[...m.game.nodes]
            .sort((a, b) => solarCost(m.game, b.id) - solarCost(m.game, a.id))
            .slice(0, 6)
            .map((node) => {
              const fitted = hasSolar(m.game, node.id);
              const issue = solarIssue(m.game, node.id, canSolar, m.locale);
              return (
                <div
                  key={node.id}
                  className="flex items-center justify-between gap-2 rounded border border-white/[0.07] bg-black/15 px-2.5 py-1.5"
                >
                  <span className="truncate text-[11px] text-white/70">{node.name}</span>
                  {fitted ? (
                    <span className="shrink-0 text-[10px] font-semibold text-neon-lime">
                      −{Math.round(ENERGY.solarDrawCut * 100)}%
                    </span>
                  ) : (
                    <button
                      className="btn shrink-0 px-2 py-0.5 text-[10px]"
                      disabled={!!issue}
                      title={issue ?? undefined}
                      onClick={() => installSolar(node.id)}
                    >
                      {fmtMoney(solarCost(m.game, node.id))}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
