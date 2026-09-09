import { AnimatePresence, motion } from 'framer-motion';
import { fmtMoney } from '../../game/economy';
import { contractProfile, negotiatedTerms, premiumCounterChance } from '../../game/contracts';
import { t } from '../i18n';
import type { SideModel } from './model';

export default function OffersSection({ sp }: { sp: SideModel }) {
  const { locale, game, tr, acceptOffer, declineOffer, inspectedOfferId, activeSection, redundancyBy } = sp;
  return (
    <>
      {activeSection === 'offers' && (
        <>
          <AnimatePresence>
            {[...game.offers]
              .sort((a, b) => Number(b.id === inspectedOfferId) - Number(a.id === inspectedOfferId))
              .slice(0, 2)
              .map((o) => {
                const d = game.districts.find((x) => x.id === o.districtId);
                const building = game.buildings.find((entry) => entry.id === o.buildingId);
                const service = building ? contractProfile(building.kind) : null;
                const cover = redundancyBy.get(o.districtId);
                const ready = !o.requiresRedundancy || !!cover?.complete;
                const flexible = negotiatedTerms(o, 'flexible');
                const premium = negotiatedTerms(o, 'premium');
                const premiumChance = premiumCounterChance(game, o);
                return (
                  <motion.div
                    key={o.id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16, transition: { duration: 0.2 } }}
                    className="pointer-events-auto panel border-neon-lime/30 p-3"
                  >
                    <div className="text-[10px] uppercase tracking-widest text-neon-lime">
                      {o.segment === 'enterprise' ? 'Enterprise contract' : 'Business contract'}
                    </div>
                    <div className="text-sm font-semibold">{o.clientName}</div>
                    {service && <div className="mt-0.5 text-[10px] text-neon-cyan/70">{service.label}</div>}
                    <div className="num mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-white/55">
                      <span>{t(locale, 'bandwidth')}</span>
                      <span className="text-right text-white">{o.bandwidthGbps} Gbps</span>
                      <span>{t(locale, 'revenue')}</span>
                      <span className="text-right text-neon-lime">{fmtMoney(o.monthlyRevenue)}/mo</span>
                      <span>SLA</span>
                      <span className="text-right text-white">{o.slaPercent}%</span>
                      <span>{t(locale, 'term')}</span>
                      <span className="text-right text-white">{o.termMonths} months</span>
                      <span>{t(locale, 'signingBonus')}</span>
                      <span className="text-right text-white">{fmtMoney(o.signingBonus)}</span>
                      <span>{t(locale, 'district')}</span>
                      <span className="text-right text-white">{d?.name}</span>
                    </div>
                    {o.requiresRedundancy && (
                      <div
                        className={`mt-2 rounded-md px-2 py-1.5 text-[10px] leading-snug ${ready ? 'bg-neon-lime/10 text-neon-lime' : 'bg-neon-red/10 text-neon-red'}`}
                      >
                        {ready
                          ? 'Second path in place, this client will sign.'
                          : `Every site in ${d?.name} needs a second path: ${cover?.done ?? 0} of ${cover?.total ?? 0} covered.`}
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button
                        className="btn-primary py-1.5 text-left"
                        disabled={!ready}
                        onClick={() => acceptOffer(o.id, 'standard')}
                        title="Sign the contract exactly as offered."
                      >
                        <span className="block text-[10px] font-semibold">{t(locale, 'standard')}</span>
                        <span className="num block text-[9px] opacity-70">{fmtMoney(o.monthlyRevenue)}/mo</span>
                      </button>
                      <button
                        className="btn py-1.5 text-left"
                        disabled={!ready}
                        onClick={() => acceptOffer(o.id, 'flexible')}
                        title="Take 15% less revenue in exchange for twice the monthly downtime allowance."
                      >
                        <span className="block text-[10px] font-semibold">{t(locale, 'flexibleSla')}</span>
                        <span className="num block text-[9px] text-white/45">
                          {flexible.slaPercent}% · {fmtMoney(flexible.monthlyRevenue)}
                        </span>
                      </button>
                      <button
                        className="btn border-neon-amber/30 py-1.5 text-left"
                        disabled={!ready}
                        onClick={() => acceptOffer(o.id, 'premium')}
                        title="Ask for 20% more monthly revenue. Rejection loses the deal."
                      >
                        <span className="block text-[10px] font-semibold text-neon-amber">
                          {t(locale, 'premiumCounter')}
                        </span>
                        <span className="num block text-[9px] text-white/45">
                          {fmtMoney(premium.monthlyRevenue)} · {Math.round(premiumChance * 100)}%
                        </span>
                      </button>
                      <button className="btn py-1.5 text-xs" onClick={() => declineOffer(o.id)}>
                        {t(locale, 'pass')}
                      </button>
                    </div>
                    <div className="mt-1.5 text-[10px] leading-snug text-white/35">
                      Flexible doubles the outage allowance for 15% less income. Premium asks 20% more, halves the
                      bonus, and can lose the offer.
                    </div>
                  </motion.div>
                );
              })}
          </AnimatePresence>
          {game.offers.length === 0 && (
            <div className="panel p-4 text-center">
              <div className="text-xs font-semibold text-white/70">
                {tr ? 'Bekleyen sözleşme yok' : 'No contracts waiting'}
              </div>
              <div className="mt-1 text-[10px] text-white/40">
                {tr ? 'Yeni ticari teklifler burada görünecek.' : 'New business offers will appear here.'}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
