import { SmartPauseSettings } from './SmartPause';
import { plural } from '../game/util';
import { fmtMoney, fmtNum } from '../game/economy';
import { currentMonthCashFlow } from '../game/financeLedger';
import CompanyProfile from './CompanyProfile';
import { scenarioStatus } from '../game/scenarios';
import { dateFromMinutes, fmtClock, fmtDate, hourOfDay, totalCustomers } from '../game/simulation';
import { useGame } from '../store/gameStore';
import type { Speed } from '../game/types';
import { AlertIcon } from './icons';
import { MobileOperatorSummary, Stat } from './OperatorSummary';
import { scenarioCopy, t } from './i18n';

const SPEEDS: Array<{ v: Speed; label: string }> = [
  { v: 0, label: 'Ⅱ' },
  { v: 1, label: '1×' },
  { v: 2, label: '2×' },
  { v: 4, label: '4×' },
];

export default function TopBar() {
  const game = useGame((s) => s.game)!;
  const planning = useGame((s) => s.planning || !!s.drillTarget);
  const setSpeed = useGame((s) => s.setSpeed);
  const setScreen = useGame((s) => s.setScreen);
  const customers = totalCustomers(game);
  const health = game.stats.health;
  const cashFlow = currentMonthCashFlow(game);
  const incidents = game.incidents.filter((i) => !i.resolved).length;
  const locale = useGame((s) => s.locale);
  const peakHour = hourOfDay(game.minutes) >= 18 && hourOfDay(game.minutes) < 23;
  const mission = scenarioStatus(game);
  const tr = locale === 'tr';
  const alertLabel = tr
    ? incidents
      ? `${incidents} aktif alarm`
      : 'Aktif alarm yok'
    : incidents
      ? `${incidents} active ${plural(incidents, 'alert')}`
      : 'No active alerts';
  const missionProgress = mission.objectives.length
    ? mission.objectives.reduce((sum, objective) => sum + objective.progress, 0) / mission.objectives.length
    : null;

  return (
    <header className="relative z-40 flex h-16 shrink-0 items-stretch border-b border-white/[0.09] bg-[#111b23]">
      <CompanyProfile />

      <div className="flex min-w-0 flex-1 items-stretch px-1">
        <MobileOperatorSummary game={game} />
        <div className="hidden min-w-0 flex-1 md:flex">
          <Stat
            label={t(locale, 'cash')}
            value={fmtMoney(game.money)}
            tone={game.money < 0 ? 'text-neon-red' : 'text-neon-cyan'}
          />
        </div>
        <div className="hidden min-w-0 flex-1 lg:flex">
          <Stat
            label={locale === 'tr' ? 'Aylık serbest nakit' : 'Free cash flow MTD'}
            shortLabel={t(locale, 'cashFlow')}
            value={`${cashFlow.freeCashFlow >= 0 ? '+' : ''}${fmtMoney(cashFlow.freeCashFlow)}`}
            tone={cashFlow.freeCashFlow >= 0 ? 'text-neon-lime' : 'text-neon-red'}
            secondary={`${tr ? 'işl.' : 'op'} ${cashFlow.operatingCash >= 0 ? '+' : ''}${fmtMoney(cashFlow.operatingCash)}`}
          />
        </div>
        <div className="hidden min-w-0 flex-1 md:flex">
          <Stat
            label={t(locale, 'customers')}
            shortLabel={locale === 'tr' ? 'Abone' : 'Subs'}
            value={fmtNum(customers)}
            secondary={`${tr ? 'itibar' : 'rep'} ${Math.round(game.reputation)}`}
          />
        </div>
        <div className="hidden min-w-0 flex-1 lg:flex">
          <Stat
            label={t(locale, 'network')}
            shortLabel={t(locale, 'health')}
            value={`${Math.round(health)}%`}
            tone={health > 80 ? 'text-neon-lime' : health > 55 ? 'text-neon-amber' : 'text-neon-red'}
            bar={health / 100}
          />
        </div>
        <div className="hidden min-w-0 flex-1 xl:flex">
          {missionProgress === null ? (
            <Stat label={t(locale, 'traffic')} value={`${game.stats.demandGbps.toFixed(1)}G`} secondary="Gbps" />
          ) : (
            <Stat
              label={scenarioCopy(locale, mission.scenario.id)?.name ?? mission.scenario.name}
              shortLabel={t(locale, 'objective')}
              value={`${Math.round(missionProgress * 100)}%`}
              secondary={
                mission.daysLeft === null
                  ? undefined
                  : locale === 'tr'
                    ? `${mission.daysLeft} gün kaldı`
                    : `${mission.daysLeft} ${plural(mission.daysLeft, 'day')} left`
              }
              bar={missionProgress}
            />
          )}
        </div>
      </div>

      <button
        onClick={() => setScreen('network')}
        className={`flex w-14 shrink-0 items-center justify-center border-l border-white/[0.07] transition-colors ${incidents ? 'bg-neon-red/10 text-neon-red' : 'text-white/35 hover:bg-white/5 hover:text-white/70'}`}
        title={alertLabel}
        aria-label={alertLabel}
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
        <SmartPauseSettings>
          <div className="text-right leading-tight">
            <div
              className={`num text-[15px] font-semibold ${peakHour ? 'text-neon-amber' : 'text-white'}`}
              title={
                locale === 'tr'
                  ? '18:00–23:00: yoğun saatlerde trafik artar'
                  : '18:00–23:00: demand rises during the evening peak'
              }
            >
              {fmtClock(game.minutes)}
              {peakHour && <span className="ml-1 text-[10px]">{locale === 'tr' ? 'Yoğun' : 'Peak'}</span>}
            </div>
            <div className="hidden text-[11px] text-white/55 sm:block">
              {game.speed === 0
                ? locale === 'tr'
                  ? 'Duraklatıldı'
                  : 'Paused'
                : locale === 'tr'
                  ? dateFromMinutes(game.minutes).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
                  : fmtDate(game.minutes)}
            </div>
          </div>
        </SmartPauseSettings>
        <div className="flex items-center gap-0.5 rounded-sm border border-white/[0.08] bg-black/10 p-1">
          {SPEEDS.map((s) => (
            <button
              key={s.v}
              disabled={planning}
              onClick={() => setSpeed(s.v)}
              className={`h-7 min-w-8 rounded-sm px-1.5 font-mono text-[11px] font-semibold transition-colors ${
                game.speed === s.v
                  ? 'bg-white/[0.09] text-white'
                  : 'text-white/40 hover:bg-white/[0.06] hover:text-white'
              }`}
              title={
                s.v === 0 ? `${t(locale, 'pause')} (${tr ? 'Boşluk' : 'Space'})` : `${s.v}x ${tr ? 'hız' : 'speed'}`
              }
              aria-label={s.v === 0 ? t(locale, 'pause') : `${s.v}x ${tr ? 'hız' : 'speed'}`}
              aria-pressed={game.speed === s.v}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
