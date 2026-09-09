import { fmtMoneyExact, fmtNum } from '../../game/economy';
import { SLA_PENALTY_CAP } from '../../game/constants';
import { t } from '../i18n';
import { Bar } from './Bar';
import type { Building } from '../../game/types';
import { fmtMins } from './Bar';
import type { ContextModel } from './model';

export default function BuildingInspector({ cp, building }: { cp: ContextModel; building: Building }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40">
          {cp.buildingContract ? 'Enterprise client' : 'Building'}
        </div>
        <div className="text-lg font-semibold leading-tight">
          {cp.buildingContract?.clientName ?? cp.game.districts.find((d) => d.id === building.districtId)?.name}
        </div>
        <div className="text-[11px] text-white/40">
          {cp.game.districts.find((d) => d.id === building.districtId)?.name} · {building.kind}
        </div>
      </div>

      {cp.buildingContract && cp.buildingRisk ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="chip">
              <div className="stat-label">{t(cp.locale, 'bandwidth')}</div>
              <div className="num">{cp.buildingContract.bandwidthGbps} Gbps</div>
            </div>
            <div className="chip">
              <div className="stat-label">{t(cp.locale, 'monthly')}</div>
              <div className="num">{fmtMoneyExact(cp.buildingContract.monthlyRevenue)}</div>
            </div>
            <div className="chip">
              <div className="stat-label">SLA</div>
              <div className="num">{cp.buildingContract.slaPercent}%</div>
            </div>
            <div className="chip">
              <div className="stat-label">{t(cp.locale, 'penaltiesPaid')}</div>
              <div className="num">{fmtMoneyExact(cp.buildingContract.penaltyPaid)}</div>
            </div>
          </div>

          <Bar
            value={cp.buildingRisk.usage}
            label="Downtime allowance used"
            right={`${fmtMins(cp.buildingContract.downtimeMinutes)} / ${fmtMins(cp.buildingRisk.allowance)}`}
          />

          <div className="text-[10px] text-white/35">
            Penalties are capped at {fmtMoneyExact(cp.buildingContract.monthlyRevenue * SLA_PENALTY_CAP)} a month.
          </div>

          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 text-[11px] leading-snug text-white/55">
            {cp.buildingRisk.districtOut
              ? 'This district is down right now, and the allowance is burning.'
              : cp.buildingRisk.fragile
                ? 'Every path to this client runs through one span. A single cut breaches the SLA.'
                : cp.buildingRisk.usage >= 1
                  ? 'The allowance is spent. Further downtime is charged as a penalty.'
                  : 'Service is within the agreed allowance.'}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="chip">
            <div className="stat-label">{t(cp.locale, 'households')}</div>
            <div className="num">{fmtNum(building.households)}</div>
          </div>
          <div className="chip">
            <div className="stat-label">{t(cp.locale, 'connectedLabel')}</div>
            <div className="num">{Math.round(building.connected * 100)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
