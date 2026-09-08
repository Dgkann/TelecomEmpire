import { scenarioStatus } from '../game/scenarios';
import type { GameState } from '../game/types';
import { useGame } from '../store/gameStore';
import { scenarioCopy } from './i18n';

export default function ScenarioCard({ game }: { game: GameState }) {
  const locale = useGame((state) => state.locale);
  const status = scenarioStatus(game);
  if (status.objectives.length === 0) return null;
  const copy = scenarioCopy(locale, status.scenario.id);

  return (
    <section
      className="panel panel-tone-blue p-4 lg:col-span-3"
      aria-label={locale === 'tr' ? 'Görev ilerlemesi' : 'Scenario progress'}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="stat-label text-neon-cyan">{locale === 'tr' ? 'Etkin görev' : 'Active objective'}</div>
          <h2 className="mt-0.5 text-base font-semibold">{copy?.name ?? status.scenario.name}</h2>
          <p className="mt-1 text-[11px] text-white/45">{copy?.description ?? status.scenario.description}</p>
        </div>
        <div className="rounded-sm border border-white/10 bg-black/10 px-3 py-2 text-right">
          <div className="stat-label">{locale === 'tr' ? 'Kalan süre' : 'Time remaining'}</div>
          <div className="num text-sm font-semibold text-neon-cyan">
            {status.daysLeft === null
              ? locale === 'tr'
                ? 'Süre sınırı yok'
                : 'No deadline'
              : `${status.daysLeft} ${locale === 'tr' ? 'gün' : 'days'}`}
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {status.objectives.map((objective) => (
          <div key={objective.label} className="rounded-sm border border-white/[0.08] bg-black/10 p-2.5">
            <div className="flex justify-between gap-2 text-[11px]">
              <span className="text-white/65">{locale === 'tr' ? objective.labelTr : objective.label}</span>
              <span className={objective.progress >= 1 ? 'text-neon-lime' : 'text-white/45'}>{objective.detail}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={objective.progress >= 1 ? 'h-full bg-neon-lime' : 'h-full bg-neon-cyan'}
                style={{ width: `${Math.round(objective.progress * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
