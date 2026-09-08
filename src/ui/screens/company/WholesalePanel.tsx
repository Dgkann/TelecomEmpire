import { RANKS, cityShare, nextRank, rankOf } from '../../../game/progression';
import { t } from '../../i18n';
import type { CompanyModel } from './model';

export default function WholesalePanel({ vm }: { vm: CompanyModel }) {
  return (
    <div className="panel panel-tone-violet p-5 lg:col-span-3">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
            {t(vm.locale, 'companyStanding')}
          </h2>
          <p className="text-[11px] text-white/40">{rankOf(vm.game).blurb}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-neon-cyan">{rankOf(vm.game).name}</div>
          <div className="num text-[11px] text-white/40">{Math.round(cityShare(vm.game) * 100)}% of the city</div>
        </div>
      </div>

      <div className="flex gap-1">
        {RANKS.map((r, i) => (
          <div
            key={r.id}
            className={`h-1.5 flex-1 rounded-full ${i <= vm.game.rank ? 'bg-neon-cyan' : 'bg-white/10'}`}
            title={r.name}
          />
        ))}
      </div>

      {nextRank(vm.game) ? (
        <div className="mt-4">
          <div className="text-[11px] text-white/45">
            Next: <span className="font-semibold text-white/80">{nextRank(vm.game)!.name}</span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {nextRank(vm.game)!.requirements.map((req) => {
              const p = req.progress(vm.game);
              return (
                <div key={req.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-white/60">{req.label}</span>
                    <span className={`num ${p >= 1 ? 'text-neon-lime' : 'text-white/45'}`}>{req.detail(vm.game)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p * 100}%`, background: p >= 1 ? '#7ee787' : '#3ee6d6' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neon-lime">{t(vm.locale, 'topOfLadder')}</p>
      )}
    </div>
  );
}
