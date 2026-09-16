import { DistrictProjectCard } from '../ProjectMap';
import { DistrictLaunchProgress } from '../ExpansionPlanner';
import { fmtMoneyExact, fmtNum } from '../../game/economy';
import { residentialSubs } from '../../game/simulation';
import { CAMPAIGN_CONFIG } from '../../game/strategy';
import type { CampaignKind } from '../../game/types';
import { useGame } from '../../store/gameStore';
import { INCOME_LEVEL_TR, t } from '../i18n';
import { Bar } from './Bar';
import type { District } from '../../game/types';
import type { ContextModel } from './model';

export default function DistrictInspector({ cp, district }: { cp: ContextModel; district: District }) {
  const tr = cp.locale === 'tr';
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40">{t(cp.locale, 'district')}</div>
        <div className="text-lg font-semibold leading-tight" style={{ color: district.color }}>
          {district.name}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="chip">
          <div className="stat-label">{t(cp.locale, 'population')}</div>
          <div className="num">{fmtNum(district.population)}</div>
        </div>
        <div className="chip">
          <div className="stat-label">{t(cp.locale, 'potential')}</div>
          <div className="num">{fmtNum(district.potential)}</div>
        </div>
        <div className="chip">
          <div className="stat-label">{t(cp.locale, 'income')}</div>
          <div className="capitalize">{tr ? INCOME_LEVEL_TR[district.incomeLevel] : district.incomeLevel}</div>
        </div>
        <div className="chip">
          <div className="stat-label">{t(cp.locale, 'yourCustomers')}</div>
          <div className="num">{fmtNum(residentialSubs(cp.game, district.id))}</div>
        </div>
      </div>

      <button className="btn w-full text-xs" onClick={() => useGame.getState().setScreen('market')}>
        {t(cp.locale, 'openDistrictCompetition')}
      </button>
      <DistrictProjectCard districtId={district.id} />
      <DistrictLaunchProgress districtId={district.id} />
      <Bar value={district.coverage} label={tr ? 'Kapsaman' : 'Your coverage'} />
      <Bar
        value={district.satisfaction / 100}
        label={t(cp.locale, 'satisfaction')}
        right={`${Math.round(district.satisfaction)}%`}
      />

      <div>
        <div className="stat-label mb-1">{t(cp.locale, 'marketShare')}</div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/10">
          {(() => {
            const mine = district.potential > 0 ? residentialSubs(cp.game, district.id) / district.potential : 0;
            const parts = [
              { name: cp.game.companyName, v: mine, color: '#3ee6d6' },
              ...cp.game.competitors.map((c) => ({ name: c.name, v: c.share[district.id] ?? 0, color: c.color })),
            ];
            const total = parts.reduce((s, p) => s + p.v, 0);
            const rest = Math.max(0, 1 - total);
            return [...parts, { name: tr ? 'Hizmet almayan' : 'Unserved', v: rest, color: '#33405422' }].map((p, i) => (
              <div
                key={i}
                title={`${p.name} ${Math.round(p.v * 100)}%`}
                style={{ width: `${Math.max(0, p.v) * 100}%`, background: p.color }}
              />
            ));
          })()}
        </div>
      </div>

      {district.unlocked &&
        (cp.districtCampaign ? (
          <div className="rounded-lg border border-neon-lime/25 bg-neon-lime/[0.05] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neon-lime">
                {tr
                  ? CAMPAIGN_CONFIG[cp.districtCampaign.kind].labelTr
                  : CAMPAIGN_CONFIG[cp.districtCampaign.kind].label}
              </span>
              <span className="num text-[9px] text-white/45">
                {Math.ceil((cp.districtCampaign.endsAt - cp.game.minutes) / 1440)}
                {tr ? ' GÜN KALDI' : 'D LEFT'}
              </span>
            </div>
            <div className="mt-1 text-[10px] leading-relaxed text-white/45">
              {tr
                ? CAMPAIGN_CONFIG[cp.districtCampaign.kind].descriptionTr
                : CAMPAIGN_CONFIG[cp.districtCampaign.kind].description}
            </div>
            <div className="num mt-2 grid grid-cols-3 gap-1 text-center text-[9px] text-white/45">
              <span>
                {Math.round(
                  residentialSubs(cp.game, district.id) + district.mobileSubs - cp.districtCampaign.baselineCustomers,
                ) >= 0
                  ? '+'
                  : ''}
                {Math.round(
                  residentialSubs(cp.game, district.id) + district.mobileSubs - cp.districtCampaign.baselineCustomers,
                )}{' '}
                {tr ? 'müşteri' : 'customers'}
              </span>
              <span>
                {(district.satisfaction - cp.districtCampaign.baselineSatisfaction).toFixed(1)} {tr ? 'memn.' : 'sat'}
              </span>
              <span>
                {cp.game.contracts.filter((contract) => contract.districtId === district.id).length -
                  cp.districtCampaign.baselineContracts >=
                0
                  ? '+'
                  : ''}
                {cp.game.contracts.filter((contract) => contract.districtId === district.id).length -
                  cp.districtCampaign.baselineContracts}{' '}
                {tr ? 'anlaşma' : 'deals'}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <div className="stat-label mb-1.5">{t(cp.locale, 'districtCampaign30')}</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(CAMPAIGN_CONFIG) as Array<[CampaignKind, (typeof CAMPAIGN_CONFIG)[CampaignKind]]>).map(
                ([kind, campaign]) => {
                  const locked =
                    kind === 'mobile' && (!cp.game.researchDone.includes('mobile_4g') || !cp.game.spectrum.length);
                  return (
                    <button
                      key={kind}
                      disabled={locked}
                      onClick={() => cp.startCampaign(district.id, kind)}
                      className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-left hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <span className="block truncate text-[10px] font-semibold">
                        {tr ? campaign.labelTr : campaign.label}
                      </span>
                      <span className="num mt-0.5 block text-[9px]" style={{ color: campaign.color }}>
                        {fmtMoneyExact(campaign.cost)}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
            <div className="mt-1.5 text-[9px] leading-relaxed text-white/30">
              {t(cp.locale, 'districtCampaignBlurb')}
            </div>
          </div>
        ))}

      {cp.districtCampaignHistory.length > 0 && (
        <div>
          <div className="stat-label mb-1.5">{t(cp.locale, 'recentCampaignResults')}</div>
          <div className="space-y-1">
            {cp.districtCampaignHistory.map((result) => (
              <div
                key={result.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 rounded-md bg-white/[0.03] px-2 py-1.5 text-[9px]"
              >
                <span className="truncate" style={{ color: CAMPAIGN_CONFIG[result.kind].color }}>
                  {tr ? CAMPAIGN_CONFIG[result.kind].labelTr : CAMPAIGN_CONFIG[result.kind].label}
                </span>
                <span className="num text-white/50">
                  {result.customerDelta >= 0 ? '+' : ''}
                  {Math.round(result.customerDelta)} {tr ? 'abone' : 'subs'}
                </span>
                <span className="num text-white/50">
                  {result.contractDelta >= 0 ? '+' : ''}
                  {result.contractDelta} {tr ? 'anlaşma' : 'deals'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!district.unlocked ? (
        <button className="btn-primary w-full" onClick={() => cp.unlockDistrict(district.id)}>
          {tr ? 'Lisans al' : 'Buy licence'} · {fmtMoneyExact(district.entryCost)}
        </button>
      ) : (
        <p className="text-[11px] leading-snug text-white/45">{t(cp.locale, 'placePopHere')}</p>
      )}
    </div>
  );
}
