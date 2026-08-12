import { motion } from 'framer-motion';
import { fmtMoney, fmtNum } from '../game/economy';
import { fmtClock, fmtDate, totalCustomers } from '../game/simulation';
import { useGame } from '../store/gameStore';
import type { Screen, Speed } from '../game/types';

const SPEEDS: Array<{ v: Speed; label: string }> = [
  { v: 0, label: '❚❚' },
  { v: 1, label: '1x' },
  { v: 2, label: '2x' },
  { v: 4, label: '4x' },
];

const SCREENS: Array<{ id: Screen; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'network', label: 'Network' },
  { id: 'company', label: 'Company' },
  { id: 'research', label: 'Research' },
];

function Stat({
  label,
  value,
  tone,
  bar,
}: {
  label: string;
  value: string;
  tone?: string;
  bar?: number;
}) {
  return (
    <div className="flex min-w-[86px] flex-col justify-center px-3">
      <div className="stat-label">{label}</div>
      <div className={`num text-[15px] font-semibold leading-tight ${tone ?? 'text-white'}`}>{value}</div>
      {bar !== undefined && (
        <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full"
            style={{ background: bar > 0.66 ? '#4ade80' : bar > 0.33 ? '#facc15' : '#ff5c68' }}
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
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const setSpeed = useGame((s) => s.setSpeed);
  const save = useGame((s) => s.save);
  const quit = useGame((s) => s.quitToMenu);
  const soundOn = useGame((s) => s.soundOn);
  const toggleSound = useGame((s) => s.toggleSound);
  const setShowHelp = useGame((s) => s.setShowHelp);

  const customers = totalCustomers(game);
  const health = game.stats.health;
  const profit = game.monthAccumulator.revenue - game.monthAccumulator.expense;

  return (
    <div className="z-30 flex h-14 items-stretch gap-1 border-b border-white/10 bg-ink-800/90 px-3 backdrop-blur-md">
      <div className="flex items-center gap-2 pr-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-neon-cyan/15 text-lg">{game.logo}</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">{game.companyName}</div>
          <div className="text-[10px] text-white/40">{game.cityName}</div>
        </div>
      </div>

      <div className="flex flex-1 items-stretch divide-x divide-white/5">
        <Stat
          label="Money"
          value={fmtMoney(game.money)}
          tone={game.money < 0 ? 'text-neon-red' : 'text-neon-cyan'}
        />
        <Stat label="Customers" value={fmtNum(customers)} />
        <Stat label="Reputation" value={`${Math.round(game.reputation)}`} bar={game.reputation / 100} />
        <Stat
          label="Network"
          value={`${Math.round(health)}%`}
          tone={health > 80 ? 'text-white' : health > 55 ? 'text-neon-amber' : 'text-neon-red'}
          bar={health / 100}
        />
        <Stat
          label="This month"
          value={`${profit >= 0 ? '+' : ''}${fmtMoney(profit)}`}
          tone={profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}
        />
        <Stat label="Traffic" value={`${game.stats.demandGbps.toFixed(1)} Gbps`} />
      </div>

      <div className="flex items-center gap-3 pl-2">
        <div className="text-right leading-tight">
          <div className="num text-sm font-semibold">{fmtClock(game.minutes)}</div>
          <div className="text-[10px] text-white/40">{fmtDate(game.minutes)}</div>
        </div>

        <div className="flex items-center gap-0.5 rounded-lg bg-black/30 p-1">
          {SPEEDS.map((s) => (
            <button
              key={s.v}
              onClick={() => setSpeed(s.v)}
              className={`h-7 w-9 rounded-md text-xs font-semibold transition-colors ${
                game.speed === s.v ? 'bg-neon-cyan/25 text-neon-cyan' : 'text-white/50 hover:bg-white/10'
              }`}
              title={s.v === 0 ? 'Pause (Space)' : `${s.v}x speed`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 rounded-lg bg-black/30 p-1">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              onClick={() => setScreen(s.id)}
              className={`h-7 rounded-md px-3 text-xs font-semibold transition-colors ${
                screen === s.id ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/10'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button className="btn px-2 py-1 text-xs" onClick={() => setShowHelp(true)} title="How to play">
            ?
          </button>
          <button className="btn px-2 py-1 text-xs" onClick={toggleSound} title="Sound">
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button className="btn px-2 py-1 text-xs" onClick={save} title="Save game">
            Save
          </button>
          <button className="btn px-2 py-1 text-xs" onClick={quit} title="Save and exit to menu">
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
