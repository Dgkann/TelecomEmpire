import { fmtMoneyExact, fmtNum } from '../../game/economy';
import { SLA_PENALTY_CAP } from '../../game/constants';
import { t } from '../i18n';
import { Bar } from './Bar';
import type { Building } from '../../game/types';
import { fmtMins } from './Bar';
import type { ContextModel } from './model';

const BUILDING_KIND_TR: Record<Building['kind'], string> = {
  house: 'müstakil ev',
  apartment: 'apartman',
  office: 'ofis',
  shop: 'dükkân',
  industrial: 'sanayi',
  hospital: 'hastane',
  university: 'üniversite',
  park: 'park',
};

export default function BuildingInspector({ cp, building }: { cp: ContextModel; building: Building }) {
  const tr = cp.locale === 'tr';
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40">
          {cp.buildingContract ? (tr ? 'Kurumsal müşteri' : 'Enterprise client') : tr ? 'Bina' : 'Building'}
        </div>
        <div className="text-lg font-semibold leading-tight">
          {cp.buildingContract?.clientName ?? cp.game.districts.find((d) => d.id === building.districtId)?.name}
        </div>
        <div className="text-[11px] text-white/40">
          {cp.game.districts.find((d) => d.id === building.districtId)?.name} ·{' '}
          {tr ? BUILDING_KIND_TR[building.kind] : building.kind}
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
            label={tr ? 'Kullanılan kesinti payı' : 'Downtime allowance used'}
            right={`${fmtMins(cp.buildingContract.downtimeMinutes, tr)} / ${fmtMins(cp.buildingRisk.allowance, tr)}`}
          />

          <div className="text-[10px] text-white/35">
            {tr
              ? `Cezalar ayda en fazla ${fmtMoneyExact(cp.buildingContract.monthlyRevenue * SLA_PENALTY_CAP)}.`
              : `Penalties are capped at ${fmtMoneyExact(cp.buildingContract.monthlyRevenue * SLA_PENALTY_CAP)} a month.`}
          </div>

          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 text-[11px] leading-snug text-white/55">
            {cp.buildingRisk.districtOut
              ? tr
                ? 'Bu ilçede şu an kesinti var ve kesinti payı tükeniyor.'
                : 'This district is down right now, and the allowance is burning.'
              : cp.buildingRisk.fragile
                ? tr
                  ? 'Bu müşteriye giden her yol tek bir hattan geçiyor. Tek bir kesinti SLA ihlali demek.'
                  : 'Every path to this client runs through one span. A single cut breaches the SLA.'
                : cp.buildingRisk.usage >= 1
                  ? tr
                    ? 'Kesinti payı tükendi. Bundan sonraki kesintiler ceza olarak yansır.'
                    : 'The allowance is spent. Further downtime is charged as a penalty.'
                  : tr
                    ? 'Hizmet anlaşılan kesinti payı içinde.'
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
