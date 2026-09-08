import { fmtMoney } from '../../../game/economy';
import { contractRisk } from '../../../game/operations';
import { t } from '../../i18n';
import type { CompanyModel } from './model';

export default function ContractsPanel({ vm }: { vm: CompanyModel }) {
  return (
    <div className="panel panel-tone-violet p-5 lg:col-span-2">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
        {t(vm.locale, 'contracts')}
      </h2>
      {vm.game.contracts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-5 text-center">
          <div className="text-sm text-white/60">{t(vm.locale, 'noEnterprisePortfolio')}</div>
          <div className="mt-1 text-[11px] text-white/35">{t(vm.locale, 'noEnterpriseBlurb')}</div>
          <button
            className="btn mt-3"
            onClick={() => {
              vm.setOverlay('customers');
              vm.setScreen('map');
            }}
          >
            {t(vm.locale, 'openCustomerMap')}
          </button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {vm.game.contracts.map((c) => {
            const risk = contractRisk(vm.game, c);
            const breach = risk.usage > 1;
            const building = vm.game.buildings.find((b) => b.id === c.buildingId);
            const riskTone = risk.score >= 0.65 ? '#ff6577' : risk.score >= 0.3 ? '#ffc857' : '#7ee787';
            return (
              <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{c.clientName}</span>
                  <span
                    className={`chip text-[10px] ${c.segment === 'enterprise' ? 'border-neon-violet/40 text-neon-violet' : 'border-neon-blue/40 text-neon-blue'}`}
                  >
                    {c.segment}
                  </span>
                </div>
                <div className="num mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-white/50">
                  <span>{c.bandwidthGbps} Gbps</span>
                  <span className="text-right text-neon-lime">{fmtMoney(c.monthlyRevenue)}/mo</span>
                  <span>SLA {c.slaPercent}%</span>
                  <span className={`text-right ${breach ? 'text-neon-red' : 'text-white/50'}`}>
                    {Math.round(c.downtimeMinutes)}m down
                  </span>
                  <span>Delivery {Math.round(risk.businessDelivery * 100)}%</span>
                  <span className={`text-right ${c.penaltyPaid > 0 ? 'text-neon-red' : 'text-white/50'}`}>
                    {fmtMoney(c.penaltyPaid)} penalties
                  </span>
                </div>
                <div className="mt-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white/40">{t(vm.locale, 'slaAllowanceUsed')}</span>
                    <span className="num" style={{ color: riskTone }}>
                      {Math.round(risk.usage * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, risk.usage * 100)}%`, background: riskTone }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-white/[0.38]">
                      {risk.districtOut
                        ? 'District outage active'
                        : risk.fragile
                          ? 'Single-path exposure'
                          : `${Math.round(risk.allowance)}m monthly allowance`}
                    </span>
                    {building && (
                      <button
                        className="text-[9px] font-semibold uppercase tracking-wider text-neon-cyan"
                        onClick={() => {
                          vm.setOverlay('customers');
                          vm.focus(building.gx, building.gy);
                          vm.select({ type: 'building', id: building.id });
                        }}
                      >
                        {t(vm.locale, 'showOnMap')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
