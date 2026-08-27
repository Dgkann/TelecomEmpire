import { motion } from 'framer-motion';
import { fmtMoney, fmtNum } from '../game/economy';
import { currentMonthCashFlow } from '../game/financeLedger';
import { rankOf } from '../game/progression';
import { fmtClock, fmtDate, totalCustomers } from '../game/simulation';
import { useGame } from '../store/gameStore';
import type { Speed } from '../game/types';
import { AlertIcon } from './icons';

const SPEEDS: Array<{ v: Speed; label: string }> = [
  { v: 0, label: 'Ⅱ' },
  { v: 1, label: '1×' },
  { v: 2, label: '2×' },
  { v: 4, label: '4×' },
];

function Stat({
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

export default function TopBar() {
  const game = useGame((s) => s.game)!;
  const setSpeed = useGame((s) => s.setSpeed);
  const setScreen = useGame((s) => s.setScreen);
  const customers = totalCustomers(game);
  const health = game.stats.health;
  const cashFlow = currentMonthCashFlow(game);
  const incidents = game.incidents.filter((i) => !i.resolved).length;

  return (
    <header className="relative z-40 flex h-16 shrink-0 items-stretch border-b border-white/[0.09] bg-[#111b23]">
      <div className="flex w-12 shrink-0 items-center justify-center border-r border-white/[0.07] px-1 sm:w-[160px] sm:justify-start sm:gap-2 sm:px-3 lg:w-[220px] lg:gap-3 lg:px-4">
        <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-white/10 bg-black/15 text-lg">
          {game.logo}
          <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-ink-800 bg-neon-lime" />
        </div>
        <div className="hidden min-w-0 leading-tight sm:block">
          <div className="truncate text-[16px] font-semibold text-white/90">{game.companyName}</div>
          <div className="truncate text-[11px] text-white/40">
            {game.cityName} <span className="px-1 text-white/20">/</span>{' '}
            <span className="text-neon-cyan/80">{rankOf(game).name}</span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-stretch px-1">
        <Stat label="Cash" value={fmtMoney(game.money)} tone={game.money < 0 ? 'text-neon-red' : 'text-neon-cyan'} />
        <div className="hidden min-w-0 flex-1 lg:flex">
          <Stat
            label="Free cash flow MTD"
            shortLabel="Cash flow"
            value={`${cashFlow.freeCashFlow >= 0 ? '+' : ''}${fmtMoney(cashFlow.freeCashFlow)}`}
            tone={cashFlow.freeCashFlow >= 0 ? 'text-neon-lime' : 'text-neon-red'}
            secondary={`op ${cashFlow.operatingCash >= 0 ? '+' : ''}${fmtMoney(cashFlow.operatingCash)}`}
          />
        </div>
        <div className="hidden min-w-0 flex-1 md:flex">
          <Stat
            label="Customers"
            shortLabel="Subs"
            value={fmtNum(customers)}
            secondary={`rep ${Math.round(game.reputation)}`}
          />
        </div>
        <div className="hidden min-w-0 flex-1 lg:flex">
          <Stat
            label="Network"
            shortLabel="Health"
            value={`${Math.round(health)}%`}
            tone={health > 80 ? 'text-neon-lime' : health > 55 ? 'text-neon-amber' : 'text-neon-red'}
            bar={health / 100}
          />
        </div>
        <div className="hidden min-w-0 flex-1 xl:flex">
          <Stat label="Traffic" value={`${game.stats.demandGbps.toFixed(1)}G`} secondary="Gbps" />
        </div>
      </div>

      <button
        onClick={() => setScreen('network')}
        className={`flex w-14 shrink-0 items-center justify-center border-l border-white/[0.07] transition-colors ${incidents ? 'bg-neon-red/10 text-neon-red' : 'text-white/35 hover:bg-white/5 hover:text-white/70'}`}
        title={incidents ? `${incidents} active alert${incidents > 1 ? 's' : ''}` : 'No active alerts'}
        aria-label={incidents ? `${incidents} active alerts` : 'No active alerts'}
      >
        <span className="relative">
          <AlertIcon className="h-5 w-5" />
          {incidents > 0 && (
            <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-neon-red px-1 font-mono text-[9px] font-bold text-ink-900">
              {incidents}
            </span>
          )}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1 border-l border-white/[0.07] px-1 sm:gap-3 sm:px-3">
        <div className="text-right leading-tight">
          <div className="num text-[15px] font-semibold text-white">{fmtClock(game.minutes)}</div>
          <div className="hidden text-[11px] text-white/40 sm:block">{fmtDate(game.minutes)}</div>
        </div>
        <div className="flex items-center gap-0.5 rounded-sm border border-white/[0.08] bg-black/10 p-1">
          {SPEEDS.map((s) => (
            <button
              key={s.v}
              onClick={() => setSpeed(s.v)}
              className={`h-7 min-w-8 rounded-sm px-1.5 font-mono text-[11px] font-semibold transition-colors ${
                game.speed === s.v
                  ? 'bg-white/[0.09] text-white'
                  : 'text-white/40 hover:bg-white/[0.06] hover:text-white'
              }`}
              title={s.v === 0 ? 'Pause (Space)' : `${s.v}x speed`}
              aria-label={s.v === 0 ? 'Pause' : `${s.v}x speed`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
