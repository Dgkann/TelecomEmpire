import { INTERCONNECT_CONFIG, TRAFFIC_POLICY_CONFIG } from '../../../game/strategy';
import { fmtMoney } from '../../../game/economy';
import type { InterconnectPlan, TrafficClass, TrafficPolicy } from '../../../game/types';
import { t } from '../../i18n';
import type { NetworkModel } from './model';

const SERVICE_TR: Record<TrafficClass, string> = {
  residential: 'konut',
  business: 'ticari',
  mobile: 'mobil',
  wholesale: 'toptan',
  workload: 'veri merkezi',
};

export default function TrafficEngineeringPanel({ m }: { m: NetworkModel }) {
  const tr = m.locale === 'tr';
  return (
    <div
      id="traffic-policy"
      className={`panel panel-tone-violet scroll-mt-20 p-5 lg:col-span-2 ${m.networkView === 'policy' ? '' : 'hidden'}`}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
            {t(m.locale, 'trafficEngineering')}
          </h2>
          <p className="mt-1 text-[11px] text-white/40">{t(m.locale, 'trafficEngineeringBlurb')}</p>
        </div>
        <div className="chip border-neon-violet/30 text-[10px] text-neon-violet">
          {t(m.locale, 'gainVsOperatingCost')}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="stat-label mb-2">{t(m.locale, 'servicePolicy')}</div>
          <div className="grid grid-cols-2 gap-2">
            {(
              Object.entries(TRAFFIC_POLICY_CONFIG) as Array<
                [TrafficPolicy, (typeof TRAFFIC_POLICY_CONFIG)[TrafficPolicy]]
              >
            ).map(([id, policy]) => {
              const locked =
                (id !== 'balanced' && !m.game.researchDone.includes('noc')) ||
                (id === 'mobile' && !m.game.researchDone.includes('mobile_5g'));
              return (
                <button
                  key={id}
                  disabled={locked}
                  onClick={() => m.setTrafficPolicy(id)}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${m.game.trafficPolicy === id ? 'border-neon-violet/50 bg-neon-violet/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'} disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  <div className="text-xs font-semibold">{tr ? policy.labelTr : policy.label}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-white/40">
                    {locked
                      ? id === 'mobile'
                        ? tr
                          ? 'Bağımsız 5G gerekir.'
                          : 'Requires 5G Standalone.'
                        : tr
                          ? 'NOC gerekir.'
                          : 'Requires a NOC.'
                      : tr
                        ? policy.descriptionTr
                        : policy.description}
                  </div>
                  {!locked && (
                    <div
                      className="mt-2 flex gap-1"
                      aria-label={tr ? `${policy.labelTr} hizmet öncelikleri` : `${policy.label} service priorities`}
                    >
                      {(Object.entries(policy.priorities) as Array<[TrafficClass, number]>).map(
                        ([service, priority]) => (
                          <span
                            key={service}
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]"
                            title={
                              tr
                                ? `${SERVICE_TR[service]}: öncelik ${priority.toFixed(2)}`
                                : `${service}: ${priority.toFixed(2)} priority`
                            }
                          >
                            <i
                              className="block h-full bg-neon-violet"
                              style={{ width: `${Math.min(100, priority * 50)}%` }}
                            />
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div id="interconnect" className="stat-label mb-2 scroll-mt-20">
            {t(m.locale, 'interconnection')}
          </div>
          <div className="flex flex-col gap-2">
            {(
              Object.entries(INTERCONNECT_CONFIG) as Array<
                [InterconnectPlan, (typeof INTERCONNECT_CONFIG)[InterconnectPlan]]
              >
            ).map(([id, plan]) => {
              const locked = plan.requiresDataCenter && !m.dataCenters.some((node) => !node.down && m.routes[node.id]);
              return (
                <button
                  key={id}
                  disabled={locked}
                  onClick={() => m.setInterconnectPlan(id)}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition-colors ${m.game.interconnectPlan === id ? 'border-neon-cyan/50 bg-neon-cyan/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'} disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  <div>
                    <div className="text-xs font-semibold">{tr ? plan.labelTr : plan.label}</div>
                    <div className="mt-0.5 text-[10px] leading-relaxed text-white/40">
                      {locked
                        ? tr
                          ? 'Şebekeye çevrimiçi bir veri merkezi bağla.'
                          : 'Bring an online data centre onto the network.'
                        : tr
                          ? plan.descriptionTr
                          : plan.description}
                    </div>
                    {m.game.interconnectPlan === id && id === 'cdn' && !m.interconnectOnline && (
                      <div className="mt-1 text-[10px] font-semibold text-neon-red">{t(m.locale, 'cdnSuspended')}</div>
                    )}
                    {!locked && (
                      <div className="mt-1.5 flex flex-wrap gap-1 text-[9px]">
                        {plan.capacityBonus > 0 && (
                          <span className="rounded-sm bg-neon-cyan/[0.09] px-1.5 py-0.5 text-neon-cyan">
                            +{plan.capacityBonus} Gbps
                          </span>
                        )}
                        {plan.cacheOffload > 0 && (
                          <span className="rounded-sm bg-neon-lime/[0.09] px-1.5 py-0.5 text-neon-lime">
                            {tr
                              ? `dış trafik −%${Math.round(plan.cacheOffload * 100)}`
                              : `−${Math.round(plan.cacheOffload * 100)}% external traffic`}
                          </span>
                        )}
                        {plan.latencyDelta < 0 && (
                          <span className="rounded-sm bg-neon-blue/[0.09] px-1.5 py-0.5 text-neon-blue">
                            {plan.latencyDelta} ms
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="num shrink-0 text-right text-[10px] text-white/55">
                    <div>
                      {plan.monthly ? `${fmtMoney(plan.monthly)}${tr ? '/ay' : '/mo'}` : tr ? 'ÜCRETSİZ' : 'NO FEE'}
                    </div>
                    {plan.capacityBonus > 0 && <div className="text-neon-cyan">+{plan.capacityBonus}G</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
