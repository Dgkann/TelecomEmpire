import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fmtMoney, priceIndex } from '../game/economy';
import { researchModifiers } from '../game/research';
import { districtRedundancy } from '../game/network';
import { operationsInsights } from '../game/operations';
import { networkResilience, pendingRegulations, regulationProgress } from '../game/regulator';
import { contractProfile, negotiatedTerms, premiumCounterChance } from '../game/contracts';
import { fmtClock, incidentLocation } from '../game/simulation';
import { useGame } from '../store/gameStore';

type ActionSection = 'live' | 'alerts' | 'obligations' | 'offers' | 'posts';

function Stars({ n }: { n: number }) {
  return (
    <span className="text-[11px] text-neon-amber">
      {'★'.repeat(n)}
      <span className="text-white/20">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

// The screen mounts after this runs.
function scrollToAnchor(id: string, tries = 40) {
  const networkView =
    id === 'traffic-policy' || id === 'interconnect'
      ? 'policy'
      : id === 'maintenance'
        ? 'operations'
        : id === 'transit'
          ? 'interconnect'
          : null;
  if (networkView) window.dispatchEvent(new CustomEvent('network:view', { detail: networkView }));
  const el = document.getElementById(id);
  const shell = el?.closest('.screen-shell') as HTMLElement | null;
  if (el && shell && el.offsetTop > 0) {
    shell.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
    return;
  }
  if (tries > 0) requestAnimationFrame(() => scrollToAnchor(id, tries - 1));
}

export default function SidePanel() {
  const game = useGame((s) => s.game)!;
  const openIncident = useGame((s) => s.openIncident);
  const focus = useGame((s) => s.focus);
  const acceptOffer = useGame((s) => s.acceptOffer);
  const declineOffer = useGame((s) => s.declineOffer);
  const select = useGame((s) => s.select);
  const setScreen = useGame((s) => s.setScreen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<ActionSection>('live');

  // Redundancy costs a Dijkstra per span, and this panel redraws every tick.
  const topology = `${game.nodes.length}:${game.links.length}:${game.nodes
    .filter((n) => n.down)
    .map((n) => n.id)
    .join(',')}:${game.links
    .filter((l) => l.down)
    .map((l) => l.id)
    .join(',')}`;
  const offerKey = game.offers.map((o) => o.id).join(',');
  const redundancyBy = useMemo(() => {
    const map = new Map<string, { done: number; total: number; complete: boolean }>();
    for (const o of game.offers) {
      if (o.requiresRedundancy && !map.has(o.districtId)) map.set(o.districtId, districtRedundancy(game, o.districtId));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology, offerKey]);

  const mods = researchModifiers(game.researchDone);
  const active = game.incidents.filter((i) => !i.resolved);
  const outages = Object.entries(game.stats.outages).filter(([, v]) => v);
  const obligations = pendingRegulations(game);
  const insights = operationsInsights(game);
  const priorityCount =
    insights.length + active.length + obligations.length + game.offers.length + (game.activeEvent ? 1 : 0);
  const sections: { id: ActionSection; label: string; count: number; tone: string }[] = [
    { id: 'live', label: 'Live', count: insights.length + (game.activeEvent ? 1 : 0), tone: '#4de3ff' },
    { id: 'alerts', label: 'Faults', count: active.length + outages.length, tone: '#ff5d73' },
    { id: 'obligations', label: 'Due', count: obligations.length, tone: '#ffc857' },
    { id: 'offers', label: 'Deals', count: game.offers.length, tone: '#7ee787' },
    { id: 'posts', label: 'Feed', count: game.posts.length, tone: '#69a7ff' },
  ];

  return (
    <>
      <button
        className="pointer-events-auto absolute left-2 top-2 z-30 rounded-lg border border-neon-cyan/40 bg-ink-900/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neon-cyan shadow-panel lg:hidden"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
        aria-controls="mobile-action-center"
      >
        Actions{priorityCount > 0 ? ` · ${priorityCount}` : ''}
      </button>
      <div
        id="mobile-action-center"
        className={`pointer-events-none absolute inset-x-2 bottom-[88px] top-2 z-30 w-auto min-h-0 flex-col gap-2 lg:bottom-4 lg:left-4 lg:right-auto lg:top-4 lg:flex lg:w-[268px] ${mobileOpen ? 'flex' : 'hidden'}`}
      >
        <div className="pointer-events-auto panel flex items-center justify-between p-2.5 lg:hidden">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-neon-cyan">Action center</div>
            <div className="text-[10px] text-white/35">Offers, alerts, events, and obligations</div>
          </div>
          <button
            className="btn px-2 py-1 text-xs"
            onClick={() => setMobileOpen(false)}
            aria-label="Close action center"
          >
            ✕
          </button>
        </div>
        <div className="pointer-events-auto panel shrink-0 overflow-hidden p-1.5">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55">Operations queue</span>
            <span className="num text-[9px] text-neon-cyan">{priorityCount} active</span>
          </div>
          <div className="grid grid-cols-5 gap-1" role="tablist" aria-label="Action center sections">
            {sections.map((section) => {
              const selected = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveSection(section.id)}
                  className={`relative rounded-md border px-1 py-1.5 text-center transition-colors ${
                    selected
                      ? 'border-white/20 bg-white/10'
                      : 'border-transparent bg-white/[0.025] hover:bg-white/[0.07]'
                  }`}
                >
                  <span className="num block text-[11px] font-semibold" style={{ color: section.tone }}>
                    {section.count}
                  </span>
                  <span className="block text-[8px] font-semibold uppercase tracking-wide text-white/45">
                    {section.label}
                  </span>
                  {selected && (
                    <span className="absolute inset-x-2 bottom-0 h-px" style={{ background: section.tone }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="scroll-thin pointer-events-auto min-h-0 flex-1 overflow-y-auto pr-1" role="tabpanel">
          <div className="flex flex-col gap-2">
            {activeSection === 'live' && (
              <>
                <AnimatePresence>
                  {game.activeEvent && (
                    <motion.div
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      className="pointer-events-auto panel border-neon-violet/40 p-3"
                    >
                      <div className="text-[10px] uppercase tracking-widest text-neon-violet">City event</div>
                      <div className="text-sm font-semibold">{game.activeEvent.name}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-white/50">{game.activeEvent.blurb}</div>
                      <div className="num mt-1.5 text-[11px] text-neon-violet">
                        +{Math.round((game.activeEvent.mul - 1) * 100)}% traffic · until{' '}
                        {fmtClock(game.activeEvent.endsAt)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {insights.length > 0 && (
                  <div className="pointer-events-auto panel p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-widest text-neon-cyan">Action center</div>
                      <span className="num text-[9px] text-white/35">LIVE PRIORITIES</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {insights.map((item) => {
                        const tone =
                          item.severity === 'critical'
                            ? '#ff5d73'
                            : item.severity === 'warning'
                              ? '#ffc857'
                              : '#7ee787';
                        return (
                          <button
                            key={item.id}
                            className="group rounded-lg border border-white/[0.08] bg-white/[0.035] p-2.5 text-left transition-colors hover:bg-white/[0.075]"
                            onClick={() => {
                              if (item.target.type === 'screen') {
                                const { id, anchor } = item.target;
                                setScreen(id);
                                // The target screen has not mounted yet.
                                if (anchor) scrollToAnchor(anchor);
                                return;
                              }
                              focus(item.target.gx, item.target.gy);
                              select({ type: item.target.type, id: item.target.id });
                              if (item.id.startsWith('incident-')) openIncident(item.id.slice('incident-'.length));
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ background: tone, boxShadow: `0 0 9px ${tone}` }}
                              />
                              <span className="truncate text-[11px] font-semibold text-white/85">{item.title}</span>
                            </div>
                            <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/[0.42]">
                              {item.detail}
                            </div>
                            <div
                              className="mt-1.5 text-[9px] font-semibold uppercase tracking-wider"
                              style={{ color: tone }}
                            >
                              {item.action} →
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!game.activeEvent && insights.length === 0 && (
                  <div className="panel p-4 text-center">
                    <div className="text-xs font-semibold text-neon-lime">Network steady</div>
                    <div className="mt-1 text-[10px] leading-snug text-white/40">
                      No immediate operational priorities.
                    </div>
                  </div>
                )}
              </>
            )}

            {activeSection === 'alerts' && (
              <AnimatePresence>
                {(active.length > 0 || outages.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="pointer-events-auto panel border-neon-red/30 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-widest text-neon-red">
                        {mods.hasNoc ? 'NOC · Alerts' : 'Alerts'}
                      </div>
                      <div className="num text-[11px] text-white/40">{active.length}</div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {active.map((i) => {
                        const d = game.districts.find((x) => x.id === i.districtId);
                        const working = i.repairMinutesLeft !== null;
                        return (
                          <button
                            key={i.id}
                            onClick={() => {
                              const p = incidentLocation(game, i);
                              focus(p.gx, p.gy);
                              openIncident(i.id);
                            }}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left transition-colors hover:bg-white/10"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-neon-red">{i.title}</span>
                              <span className="num text-[10px] text-white/35">{d?.name}</span>
                            </div>
                            <div className="num mt-0.5 text-[10px] text-white/45">
                              {working
                                ? `Crew on it · ${Math.round((i.repairMinutesLeft ?? 0) / 60)}h left`
                                : `Unassigned · ${i.affected.toLocaleString()} affected`}
                            </div>
                          </button>
                        );
                      })}
                      {outages.map(([id]) => {
                        const d = game.districts.find((x) => x.id === id);
                        if (!d) return null;
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              focus(d.center.gx, d.center.gy);
                              select({ type: 'district', id });
                            }}
                            className="alert-blink rounded-lg border border-neon-red/40 bg-neon-red/10 px-2.5 py-2 text-left"
                          >
                            <div className="text-xs font-semibold text-neon-red">{d.name}: NO SERVICE</div>
                            <div className="text-[10px] text-white/50">No live path back to a core router.</div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            {activeSection === 'alerts' && active.length === 0 && outages.length === 0 && (
              <div className="panel p-4 text-center">
                <div className="text-xs font-semibold text-neon-lime">All systems nominal</div>
                <div className="mt-1 text-[10px] text-white/40">There are no open faults or outages.</div>
              </div>
            )}

            {activeSection === 'obligations' && (
              <>
                {obligations.map((r) => {
                  const progress = regulationProgress(game, r);
                  const daysLeft = Math.max(0, Math.ceil((r.dueAt - game.minutes) / 1440));
                  const district = r.districtId ? game.districts.find((entry) => entry.id === r.districtId) : null;
                  const current =
                    r.kind === 'coverage'
                      ? (district?.coverage ?? 0)
                      : r.kind === 'price_cap'
                        ? priceIndex(game)
                        : networkResilience(game);
                  const targetText =
                    r.kind === 'price_cap' ? `${r.target.toFixed(2)}× max` : `${Math.round(r.target * 100)}%`;
                  const currentText =
                    r.kind === 'price_cap' ? `${current.toFixed(2)}× now` : `${Math.round(current * 100)}% now`;
                  const urgent = daysLeft <= 7 && progress < 1;
                  return (
                    <div
                      key={r.id}
                      className={`pointer-events-auto panel overflow-hidden p-3 ${urgent ? 'border-neon-red/55' : 'border-neon-amber/45'}`}
                    >
                      <div className={`absolute inset-y-0 left-0 w-0.5 ${urgent ? 'bg-neon-red' : 'bg-neon-amber'}`} />
                      <div className="flex items-center justify-between">
                        <div
                          className={`text-[10px] font-semibold uppercase tracking-widest ${urgent ? 'text-neon-red' : 'text-neon-amber'}`}
                        >
                          {r.title}
                        </div>
                        <div className={`num text-[10px] ${urgent ? 'text-neon-red' : 'text-white/55'}`}>
                          {daysLeft}d left
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] leading-snug text-white/65">{r.detail}</div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="rounded-sm bg-black/20 px-2 py-1.5">
                          <div className="text-white/40">Current</div>
                          <div className="num text-white/80">{currentText}</div>
                        </div>
                        <div className="rounded-sm bg-black/20 px-2 py-1.5">
                          <div className="text-white/40">Target</div>
                          <div className="num text-neon-amber">{targetText}</div>
                        </div>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${progress * 100}%`,
                            background: progress >= 1 ? '#76b98a' : urgent ? '#d36e76' : '#d2a657',
                          }}
                        />
                      </div>
                      <div
                        className={`mt-2 rounded-sm border px-2 py-1.5 ${progress >= 1 ? 'border-neon-lime/25 bg-neon-lime/[0.06]' : 'border-neon-red/25 bg-neon-red/[0.07]'}`}
                      >
                        <div className="text-[9px] uppercase tracking-wider text-white/45">
                          {progress >= 1 ? 'Status' : 'Deadline risk'}
                        </div>
                        <div
                          className={`num text-[11px] font-semibold ${progress >= 1 ? 'text-neon-lime' : 'text-neon-red'}`}
                        >
                          {progress >= 1 ? 'On track · +4 reputation' : `${fmtMoney(r.fine)} fine · −8 reputation`}
                        </div>
                      </div>
                      {district && (
                        <button
                          className="mt-2 w-full rounded-sm border border-neon-cyan/25 bg-neon-cyan/[0.06] px-2 py-1.5 text-[10px] font-semibold text-neon-cyan hover:bg-neon-cyan/[0.12]"
                          onClick={() => {
                            focus(district.center.gx, district.center.gy);
                            select({ type: 'district', id: district.id });
                            setMobileOpen(false);
                          }}
                        >
                          Open {district.name} on map →
                        </button>
                      )}
                    </div>
                  );
                })}
                {obligations.length === 0 && (
                  <div className="panel p-4 text-center">
                    <div className="text-xs font-semibold text-neon-lime">No deadlines pending</div>
                    <div className="mt-1 text-[10px] text-white/40">Regulatory obligations are currently clear.</div>
                  </div>
                )}
              </>
            )}

            {activeSection === 'offers' && (
              <>
                <AnimatePresence>
                  {game.offers.slice(0, 2).map((o) => {
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
                          <span>Bandwidth</span>
                          <span className="text-right text-white">{o.bandwidthGbps} Gbps</span>
                          <span>Revenue</span>
                          <span className="text-right text-neon-lime">{fmtMoney(o.monthlyRevenue)}/mo</span>
                          <span>SLA</span>
                          <span className="text-right text-white">{o.slaPercent}%</span>
                          <span>Term</span>
                          <span className="text-right text-white">{o.termMonths} months</span>
                          <span>Signing bonus</span>
                          <span className="text-right text-white">{fmtMoney(o.signingBonus)}</span>
                          <span>District</span>
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
                            <span className="block text-[10px] font-semibold">Standard</span>
                            <span className="num block text-[9px] opacity-70">{fmtMoney(o.monthlyRevenue)}/mo</span>
                          </button>
                          <button
                            className="btn py-1.5 text-left"
                            disabled={!ready}
                            onClick={() => acceptOffer(o.id, 'flexible')}
                            title="Take 15% less revenue in exchange for twice the monthly downtime allowance."
                          >
                            <span className="block text-[10px] font-semibold">Flexible SLA</span>
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
                            <span className="block text-[10px] font-semibold text-neon-amber">Premium counter</span>
                            <span className="num block text-[9px] text-white/45">
                              {fmtMoney(premium.monthlyRevenue)} · {Math.round(premiumChance * 100)}%
                            </span>
                          </button>
                          <button className="btn py-1.5 text-xs" onClick={() => declineOffer(o.id)}>
                            Pass
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
                    <div className="text-xs font-semibold text-white/70">No contracts waiting</div>
                    <div className="mt-1 text-[10px] text-white/40">New business offers will appear here.</div>
                  </div>
                )}
              </>
            )}

            {activeSection === 'posts' && game.posts.length > 0 && (
              <div className="pointer-events-auto panel p-3">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Word on the street</div>
                <div className="flex flex-col divide-y divide-white/[0.07]">
                  <AnimatePresence initial={false}>
                    {game.posts.slice(0, 6).map((p) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="py-2 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-neon-blue">{p.handle}</span>
                          <Stars n={p.stars} />
                        </div>
                        <div className="text-[11px] leading-snug text-white/60">{p.text}</div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
            {activeSection === 'posts' && game.posts.length === 0 && (
              <div className="panel p-4 text-center">
                <div className="text-xs font-semibold text-white/70">The city is quiet</div>
                <div className="mt-1 text-[10px] text-white/40">Customer reactions will appear here.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
