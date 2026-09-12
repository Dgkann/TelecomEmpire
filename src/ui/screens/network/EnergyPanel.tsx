import { useState } from 'react';
import { ENERGY, MINUTES_PER_DAY, MINUTES_PER_MONTH } from '../../../game/constants';
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
import type { EnergyPlan, NetNode } from '../../../game/types';
import { DATA_CENTER_MODE_CONFIG, dataCenterMode } from '../../../game/strategy';
import { useGame } from '../../../store/gameStore';
import { t } from '../../i18n';
import type { NetworkModel } from './model';

const PLAN_IDS: EnergyPlan[] = ['spot', 'fixed', 'green'];

export default function EnergyPanel({ m }: { m: NetworkModel }) {
  const setEnergyPlan = useGame((s) => s.setEnergyPlan);
  const installSolar = useGame((s) => s.installSolar);
  const tr = m.locale === 'tr';
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const energy = m.game.energy;
  const index = energyPriceIndex(m.game);
  const modePower = (node: NetNode) =>
    node.kind === 'datacenter' ? DATA_CENTER_MODE_CONFIG[dataCenterMode(m.game, node.id)].powerMultiplier : 1;
  const bill = monthlyPowerBill(m.game, modePower);
  const exitFee = fixedExitFee(m.game);
  const canSolar = m.mods.hasOnsiteSolar;
  const history = energy.history.slice(-12);
  const peak = Math.max(ENERGY.spotCeiling, ...history);
  const sites = [...m.game.nodes]
    .filter((node) => node.name.toLocaleLowerCase(m.locale).includes(query.trim().toLocaleLowerCase(m.locale)))
    .sort((a, b) => solarCost(m.game, b.id) - solarCost(m.game, a.id));
  const visibleSites = showAll || query.trim() ? sites : sites.slice(0, 6);

  return (
    <section
      aria-label={t(m.locale, 'energyDesk')}
      className={`panel panel-tone-amber p-5 lg:col-span-2 ${m.networkView === 'interconnect' ? '' : 'hidden'}`}
    >
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

      <p className="mt-4 text-xs text-white/60">
        {tr
          ? 'Tahminler mevcut tüketim ve bu ayın fiyatlarıyla hesaplanır; karbon vergisi ayrıca alınır.'
          : 'Estimates use current consumption and this month’s prices; carbon levies are charged separately.'}
      </p>
      {energy.plan === 'fixed' && energy.fixedUntil !== null && (
        <p className="mt-2 text-xs text-neon-amber">
          {tr ? 'Sabit fiyat süresi' : 'Fixed rate remaining'}:{' '}
          {Math.max(0, Math.ceil((energy.fixedUntil - m.game.minutes) / MINUTES_PER_DAY))} {tr ? 'gün' : 'days'}
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = ENERGY_PLANS[id];
          const active = energy.plan === id;
          const issue = planIssue(m.game, id, m.locale);
          const estimate = active
            ? bill
            : monthlyPowerBill(
                {
                  ...m.game,
                  energy: {
                    ...energy,
                    plan: id,
                    fixedIndex: energy.spotIndex,
                    fixedUntil: id === 'fixed' ? m.game.minutes + ENERGY.fixedTermMonths * MINUTES_PER_MONTH : null,
                  },
                },
                modePower,
              );
          return (
            <div
              key={id}
              className={`rounded-md border p-3 ${active ? 'border-neon-amber/50 bg-neon-amber/[0.07]' : 'border-white/10 bg-black/15'}`}
            >
              <div className="text-xs font-semibold text-white/85">{tr ? plan.titleTr : plan.title}</div>
              <div className="num mt-2 text-lg font-semibold text-white/90">
                {fmtMoney(estimate)}
                <span className="ml-1 text-xs font-normal text-white/60">/ {tr ? 'ay' : 'month'}</span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-white/45">{tr ? plan.detailTr : plan.detail}</p>
              <p className="mt-1.5 text-[10px] leading-snug text-white/35">{tr ? plan.tradeoffTr : plan.tradeoff}</p>
              {!active && (
                <p className="mt-2 text-xs text-white/60">
                  {tr ? 'Tek seferlik çıkış bedeli' : 'One-time exit fee'}: {fmtMoney(exitFee)}
                </p>
              )}
              {active ? (
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-neon-amber">
                  {t(m.locale, 'currentTariff')}
                </div>
              ) : (
                <button
                  className="btn mt-2 w-full py-1 text-[11px]"
                  disabled={!!issue}
                  title={issue ?? undefined}
                  aria-label={`${t(m.locale, 'switchTariff')}: ${tr ? plan.titleTr : plan.title}`}
                  onClick={() => setEnergyPlan(id)}
                >
                  {t(m.locale, 'switchTariff')}
                  {exitFee > 0 ? ` · ${fmtMoney(exitFee)}` : ''}
                </button>
              )}
              {!active && issue && <p className="mt-2 text-xs text-neon-amber">{issue}</p>}
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
        <label className="mt-3 block text-xs text-white/60">
          {tr ? 'Saha ara' : 'Search sites'}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-1 block w-full rounded border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
          />
        </label>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {visibleSites.map((node) => {
            const fitted = hasSolar(m.game, node.id);
            const issue = solarIssue(m.game, node.id, canSolar, m.locale);
            return (
              <div
                key={node.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/[0.07] bg-black/15 px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 break-words text-xs text-white/70">{node.name}</span>
                {fitted ? (
                  <span className="shrink-0 text-[10px] font-semibold text-neon-lime">
                    −{Math.round(ENERGY.solarDrawCut * 100)}%
                  </span>
                ) : (
                  <button
                    className="btn shrink-0 px-2 py-0.5 text-[10px]"
                    disabled={!!issue}
                    title={issue ?? undefined}
                    aria-label={`${tr ? 'Üretim kur' : 'Install generation'}: ${node.name}`}
                    onClick={() => installSolar(node.id)}
                  >
                    {fmtMoney(solarCost(m.game, node.id))}
                  </button>
                )}
                {!fitted && issue && <p className="w-full text-xs text-white/60">{issue}</p>}
              </div>
            );
          })}
        </div>
        {sites.length === 0 && (
          <p className="mt-3 text-xs text-white/60">
            {tr ? 'Eşleşen saha yok. Başka bir ad deneyin.' : 'No matching sites. Try another name.'}
          </p>
        )}
        {!query.trim() && sites.length > 6 && (
          <button className="btn mt-3" onClick={() => setShowAll(!showAll)}>
            {showAll
              ? tr
                ? 'Daha az göster'
                : 'Show fewer'
              : tr
                ? `Tüm sahaları göster (${sites.length})`
                : `Show all sites (${sites.length})`}
          </button>
        )}
      </div>
    </section>
  );
}
