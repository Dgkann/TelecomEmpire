import { useState } from 'react';
import { motion } from 'framer-motion';
import { fmtMoney, fmtNum } from '../game/economy';
import { currentMonthCashFlow } from '../game/financeLedger';
import { scenarioStatus } from '../game/scenarios';
import { totalCustomers } from '../game/simulation';
import type { GameState } from '../game/types';
import { useGame } from '../store/gameStore';
import { scenarioCopy, t } from './i18n';

export function Stat({
  label,
  shortLabel,
  value,
  tone,
  bar,
  secondary,
}: {
  label: string;
  shortLabel?: string;
  value: string;
  tone?: string;
  bar?: number;
  secondary?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center border-l border-white/[0.06] px-2 first:border-l-0 lg:px-3">
      <div className="stat-label truncate">
        <span className="hidden lg:inline">{label}</span>
        <span className="lg:hidden">{shortLabel ?? label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <div className={`num truncate text-[15px] font-semibold leading-tight ${tone ?? 'text-white'}`}>{value}</div>
        {secondary && <span className="hidden text-[11px] text-white/35 2xl:inline">{secondary}</span>}
      </div>
      {bar !== undefined && (
        <div className="mt-1 h-[3px] w-full max-w-[92px] overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full"
            style={{ background: bar > 0.66 ? '#75df9a' : bar > 0.33 ? '#f3b843' : '#ff6577' }}
            animate={{ width: `${Math.round(bar * 100)}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}
    </div>
  );
}

export function MobileOperatorSummary({ game }: { game: GameState }) {
  const [open, setOpen] = useState(false);
  const locale = useGame((state) => state.locale);
  const cashFlow = currentMonthCashFlow(game);
  const mission = scenarioStatus(game);
  const objectiveProgress = mission.objectives.length
    ? mission.objectives.reduce((sum, objective) => sum + objective.progress, 0) / mission.objectives.length
    : null;

  return (
    <div className="flex min-w-0 flex-1 items-stretch md:hidden">
      <button
        className="flex min-w-0 flex-1 flex-col justify-center px-2 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-operator-summary"
      >
        <span className="stat-label">
          {t(locale, 'cash')} - {t(locale, 'overview')}
        </span>
        <span
          className={`num truncate text-[15px] font-semibold ${game.money < 0 ? 'text-neon-red' : 'text-neon-cyan'}`}
        >
          {fmtMoney(game.money)} <span className="text-[10px] text-white/40">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div
          id="mobile-operator-summary"
          className="panel fixed left-2 right-2 top-[68px] z-50 border-neon-cyan/25 p-3 shadow-2xl"
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <SummaryCell label={t(locale, 'customers')} value={fmtNum(totalCustomers(game))} />
            <SummaryCell label={t(locale, 'network')} value={`${Math.round(game.stats.health)}%`} />
            <SummaryCell label={t(locale, 'traffic')} value={`${game.stats.demandGbps.toFixed(1)}G`} />
            <SummaryCell label={t(locale, 'reputation')} value={`${Math.round(game.reputation)}`} />
            <SummaryCell
              label={t(locale, 'cashFlow')}
              value={`${cashFlow.freeCashFlow >= 0 ? '+' : ''}${fmtMoney(cashFlow.freeCashFlow)}`}
            />
            <SummaryCell
              label={t(locale, 'alerts')}
              value={`${game.incidents.filter((incident) => !incident.resolved).length}`}
            />
          </div>
          {objectiveProgress !== null && (
            <div className="mt-3 border-t border-white/10 pt-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-white/75">
                  {scenarioCopy(locale, mission.scenario.id)?.name ?? mission.scenario.name}
                </span>
                <span className="num text-neon-cyan">{Math.round(objectiveProgress * 100)}%</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-neon-cyan" style={{ width: `${Math.round(objectiveProgress * 100)}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-white/40">
                {mission.daysLeft === null
                  ? t(locale, 'noDeadline')
                  : locale === 'tr'
                    ? `${mission.daysLeft} gün kaldı`
                    : `${mission.daysLeft} days remaining`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-white/[0.08] bg-black/10 p-2">
      <div className="stat-label">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
