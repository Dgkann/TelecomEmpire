import { t } from '../../i18n';
import { CHURN_REASON } from './shared';
import type { CompanyModel } from './model';

export default function ChurnPanel({ vm }: { vm: CompanyModel }) {
  return (
    <div className="panel panel-tone-red p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">
        {t(vm.locale, 'whereCustomersWent')}
      </h2>
      <p className="mb-3 text-[11px] text-white/40">{t(vm.locale, 'mostRecentLossesFirst')}</p>
      {vm.game.churn.length === 0 ? (
        <p className="text-sm text-white/40">{t(vm.locale, 'nobodyHasLeftYet')}</p>
      ) : (
        <div className="scroll-thin flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
          {vm.game.churn.slice(0, 12).map((c) => {
            const d = vm.game.districts.find((x) => x.id === c.districtId);
            const rival = vm.game.competitors.find((x) => x.id === c.toId);
            return (
              <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="num text-sm font-semibold text-neon-red">-{Math.round(c.count)}</span>
                  <span className="text-[11px]" style={{ color: rival?.color ?? '#8ea0b8' }}>
                    {c.toName}
                  </span>
                </div>
                <div className="num mt-0.5 flex justify-between text-[10px] text-white/40">
                  <span>{d?.name}</span>
                  <span>{t(vm.locale, CHURN_REASON[c.reason])}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
