import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BACKUP_TRANSIT_MONTHLY, SPECTRUM_BANDS, TRANSIT_TIERS, towerRadius, utilColor } from '../../game/constants';
import { fmtMoney, fmtNum, monthlyBreakdown } from '../../game/economy';
import { computeRoutes, daysUntilFull, forecastDemand, linkUtil, nodeUtil, servingCapacity } from '../../game/network';
import { researchModifiers } from '../../game/research';
import { cacheRatio, mobileSubs, residentialSubs } from '../../game/simulation';
import { rivalPosture } from '../../game/competitors';
import { networkResilience } from '../../game/regulator';
import {
  DATA_CENTER_MODE_CONFIG,
  DATA_CENTER_MODE_COOLDOWN,
  INTERCONNECT_CONFIG,
  TRAFFIC_POLICY_CONFIG,
  dataCenterMode,
  dataCenterModeChangeCost,
  interconnectOperational,
} from '../../game/strategy';
import type { DataCenterMode, InterconnectPlan, TrafficClass, TrafficPolicy } from '../../game/types';
import { useGame } from '../../store/gameStore';
import SiteIcon, { TierBadge } from '../SiteIcon';
import TrendChart from '../TrendChart';

function Meter({ v, label, right }: { v: number; label: string; right: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex justify-between text-[11px]">
        <span className="truncate text-white/60">{label}</span>
        <span className="num shrink-0 pl-2 text-white/45">{right}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, v * 100)}%`, background: utilColor(v) }}
        />
      </div>
    </div>
  );
}

type NetworkView = 'live' | 'policy' | 'capacity' | 'operations' | 'interconnect';

const NETWORK_VIEWS: Array<{ id: NetworkView; label: string; note: string }> = [
  { id: 'live', label: 'Live', note: 'Quality & delivery' },
  { id: 'policy', label: 'Policy', note: 'QoS & peering' },
  { id: 'capacity', label: 'Capacity', note: 'Sites & forecast' },
  { id: 'operations', label: 'Operations', note: 'Maintenance' },
  { id: 'interconnect', label: 'Edge & transit', note: 'External network' },
];

export default function NetworkScreen() {
  const game = useGame((s) => s.game)!;
  const focus = useGame((s) => s.focus);
  const select = useGame((s) => s.select);
  const setTransitTier = useGame((s) => s.setTransitTier);
  const toggleBackup = useGame((s) => s.toggleBackupTransit);
  const toggleAuto = useGame((s) => s.toggleAutoDispatch);
  const setTrafficPolicy = useGame((s) => s.setTrafficPolicy);
  const setInterconnectPlan = useGame((s) => s.setInterconnectPlan);
  const setDataCenterMode = useGame((s) => s.setDataCenterMode);
  const [networkView, setNetworkView] = useState<NetworkView>('live');

  useEffect(() => {
    const onView = (event: Event) => setNetworkView((event as CustomEvent<NetworkView>).detail);
    window.addEventListener('network:view', onView);
    return () => window.removeEventListener('network:view', onView);
  }, []);

  // Routing is a Dijkstra per core, so only redo it when the topology moves.
  const topology = `${game.nodes.length}:${game.links.length}:${game.nodes
    .filter((n) => n.down)
    .map((n) => n.id)
    .join(',')}:${game.links
    .filter((l) => l.down)
    .map((l) => l.id)
    .join(',')}`;
  const { routes, usedSpans } = useMemo(() => {
    const r = computeRoutes(game);
    const used = new Set<string>();
    for (const info of Object.values(r)) for (const id of info.path) used.add(id);
    return { routes: r, usedSpans: used };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology]);
  const setScreen = useGame((s) => s.setScreen);
  const setOverlay = useGame((s) => s.setOverlay);
  const setTool = useGame((s) => s.setTool);
  const mods = researchModifiers(game.researchDone);

  const forecast = forecastDemand(game.demandHistory, Math.max(game.dayPeakDemand, game.stats.demandGbps), 30);
  const accessCapacity = servingCapacity(game.nodes);
  const daysLeft = daysUntilFull(forecast, accessCapacity);
  const transit = TRANSIT_TIERS[game.transitTier];
  const interconnect = INTERCONNECT_CONFIG[game.interconnectPlan];
  const interconnectOnline = interconnectOperational(game, routes);
  const transitCapacity =
    transit.capacity * (game.backupTransit ? 1.35 : 1) + (interconnectOnline ? interconnect.capacityBonus : 0);
  const transitUse = game.stats.transitGbps / transitCapacity;
  const demandSeries = [...game.demandHistory.slice(-29), Math.max(game.dayPeakDemand, game.stats.demandGbps)];
  const dayTelemetry = game.telemetry.slice(-24);
  const dataCenters = game.nodes.filter((n) => n.kind === 'datacenter');
  const finance = monthlyBreakdown(game, mods);
  const resilience = networkResilience(game);
  const openMaintenance = game.maintenanceOrders.filter((order) => order.status !== 'completed');
  const trafficClasses: Array<{ id: TrafficClass; label: string; color: string }> = [
    { id: 'residential', label: 'Residential', color: '#68a5ff' },
    { id: 'business', label: 'Business SLA', color: '#a78bfa' },
    { id: 'mobile', label: 'Mobile', color: '#f59e0b' },
    { id: 'wholesale', label: 'Wholesale', color: '#f3b843' },
    { id: 'workload', label: 'Data centre', color: '#2dd4bf' },
  ];

  return (
    <div className="screen-shell">
      <div className="mx-auto grid max-w-[1240px] gap-5 lg:grid-cols-2">
        <div className="flex flex-wrap items-end justify-between gap-4 lg:col-span-2">
          <div>
            <div className="stat-label text-neon-cyan">Network operations</div>
            <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">Live service control</h1>
            <p className="mt-1 text-[13px] text-white/45">
              Capacity, quality and resilience across every active route.
            </p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-right ${daysLeft !== null && daysLeft < 30 ? 'border-neon-red/30 bg-neon-red/[0.07]' : 'border-neon-lime/20 bg-neon-lime/[0.05]'}`}
          >
            <div className="stat-label">Capacity outlook</div>
            <div
              className={`num text-sm font-semibold ${daysLeft !== null && daysLeft < 30 ? 'text-neon-red' : 'text-neon-lime'}`}
            >
              {!forecast.confident
                ? 'Collecting baseline'
                : daysLeft === null
                  ? 'Demand stable'
                  : daysLeft > 365
                    ? 'More than 1 year'
                    : `${Math.round(daysLeft)} days headroom`}
            </div>
          </div>
        </div>

        <div
          className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-md border border-white/[0.08] bg-[#0d151c]/95 p-1 shadow-lg backdrop-blur lg:col-span-2"
          role="tablist"
          aria-label="Network operations views"
        >
          {NETWORK_VIEWS.map((view) => (
            <button
              key={view.id}
              role="tab"
              aria-selected={networkView === view.id}
              onClick={() => setNetworkView(view.id)}
              className={`min-w-[112px] flex-1 rounded-sm border px-3 py-2 text-left transition-colors ${
                networkView === view.id
                  ? 'border-neon-cyan/45 bg-neon-cyan/[0.1] text-white'
                  : 'border-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/80'
              }`}
            >
              <span className="block text-[11px] font-semibold">{view.label}</span>
              <span className="block text-[9px] text-white/40">{view.note}</span>
            </button>
          ))}
        </div>

        <div className={`panel panel-tone-blue p-5 lg:col-span-2 ${networkView === 'live' ? '' : 'hidden'}`}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
                24-hour traffic timeline
              </h2>
              <p className="mt-1 text-[11px] text-white/40">
                Hourly demand, carried traffic and loss across the current operating day.
              </p>
            </div>
            <div className="num text-[10px] text-white/35">{dayTelemetry.length}/24 SAMPLES</div>
          </div>
          {dayTelemetry.length > 1 ? (
            <TrendChart
              height={112}
              formatValue={(v) => `${v.toFixed(1)}G`}
              series={[
                { label: 'Demand', values: dayTelemetry.map((p) => p.demandGbps), color: '#68a5ff' },
                { label: 'Carried', values: dayTelemetry.map((p) => p.servedGbps), color: '#2dd4bf' },
                {
                  label: 'Loss ×10',
                  values: dayTelemetry.map((p) => p.packetLoss * 10),
                  color: '#ff6577',
                  dashed: true,
                },
              ]}
            />
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-md border border-dashed border-white/10 bg-black/10 px-4 py-3">
              <div>
                <div className="text-sm text-white/70">Building the first traffic baseline</div>
                <div className="mt-0.5 text-[11px] text-white/45">
                  Next sample arrives at the end of the in-game hour.
                </div>
              </div>
              <div className="flex shrink-0 items-end gap-1" aria-hidden="true">
                {[35, 55, 42, 72, 60].map((height, index) => (
                  <i key={index} className="w-1.5 rounded-sm bg-neon-blue/45" style={{ height }} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className={`panel p-5 lg:col-span-2 ${networkView === 'live' ? '' : 'hidden'}`}>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {[
              {
                label: 'Network health',
                value: `${Math.round(game.stats.health)}%`,
                tone: game.stats.health > 80 ? 'text-neon-lime' : 'text-neon-amber',
              },
              { label: 'Demand', value: `${game.stats.demandGbps.toFixed(1)} Gbps` },
              { label: 'Carried', value: `${game.stats.servedGbps.toFixed(1)} Gbps` },
              {
                label: 'Packet loss',
                value: `${(game.stats.packetLoss * 100).toFixed(1)}%`,
                tone: game.stats.packetLoss > 0.02 ? 'text-neon-red' : 'text-neon-lime',
              },
              {
                label: 'Latency',
                value: `${Math.round(game.stats.latencyMs)} ms`,
                tone: game.stats.latencyMs > 40 ? 'text-neon-amber' : undefined,
              },
              {
                label: 'Resilient sites',
                value: `${Math.round(resilience * 100)}%`,
                tone: resilience >= 0.7 ? 'text-neon-lime' : 'text-neon-amber',
              },
            ].map((s) => (
              <div key={s.label} className="kpi border-0 bg-transparent px-0 py-0">
                <div className="stat-label">{s.label}</div>
                <div className={`num text-2xl font-semibold ${s.tone ?? 'text-white'}`}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <div>
                <div className="stat-label">Live delivery path</div>
                <div className="text-[12px] text-white/40">Traffic accepted by the network at this instant</div>
              </div>
              <div className="num text-[12px] text-white/55">
                <span className="text-neon-cyan">{game.stats.servedGbps.toFixed(2)}G carried</span> /{' '}
                {game.stats.demandGbps.toFixed(2)}G requested
              </div>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-neon-red/[0.18]">
              <motion.div
                className="h-full rounded-full bg-neon-cyan"
                animate={{
                  width: `${Math.min(100, (game.stats.servedGbps / Math.max(0.01, game.stats.demandGbps)) * 100)}%`,
                }}
              />
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
              <div className="absolute inset-y-0 left-3/4 w-px bg-white/20" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-md bg-white/[0.03] p-2">
                <div className="text-white/35">Fixed access</div>
                <div className="num text-neon-blue">{game.stats.fixedDemandGbps.toFixed(2)} Gbps</div>
              </div>
              <div className="rounded-md bg-white/[0.03] p-2">
                <div className="text-white/35">Mobile radio</div>
                <div className="num text-neon-violet">{game.stats.mobileDemandGbps.toFixed(2)} Gbps</div>
              </div>
              <div className="rounded-md bg-white/[0.03] p-2">
                <div className="text-white/35">Offered upstream</div>
                <div className="num text-neon-cyan">{game.stats.transitGbps.toFixed(2)} Gbps</div>
              </div>
            </div>
            <div
              className="mt-4 overflow-hidden rounded-lg border border-white/[0.08]"
              aria-label="Traffic carried by service class"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 bg-black/15 px-3 py-2 text-[10px] text-white/35">
                <span>Service</span>
                <span>Requested</span>
                <span>Carried</span>
                <span>Delivery</span>
              </div>
              {trafficClasses.map(({ id, label, color }) => {
                const requested = game.stats.serviceDemandGbps[id];
                const carried = game.stats.serviceServedGbps[id];
                const delivery = requested > 0 ? carried / requested : 1;
                return (
                  <div
                    key={id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 gap-y-1.5 border-t border-white/[0.06] px-3 py-2 text-[11px]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="truncate">{label}</span>
                    </span>
                    <span className="num text-white/45">{requested.toFixed(2)}G</span>
                    <span className="num text-white/65">{carried.toFixed(2)}G</span>
                    <span className={`num font-semibold ${delivery < 0.995 ? 'text-neon-red' : 'text-neon-lime'}`}>
                      {Math.round(delivery * 100)}%
                    </span>
                    <span className="col-span-4 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <i
                        className="block h-full rounded-full transition-[width]"
                        style={{
                          width: `${delivery * 100}%`,
                          background: delivery < 0.8 ? '#d36e76' : delivery < 0.995 ? '#d2a657' : color,
                        }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div
          id="traffic-policy"
          className={`panel panel-tone-violet scroll-mt-20 p-5 lg:col-span-2 ${networkView === 'policy' ? '' : 'hidden'}`}
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Traffic engineering</h2>
              <p className="mt-1 text-[11px] text-white/40">
                Choose who keeps moving under congestion, then decide where internet traffic exits.
              </p>
            </div>
            <div className="chip border-neon-violet/30 text-[10px] text-neon-violet">GAIN ↔ OPERATING COST</div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="stat-label mb-2">Service policy</div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  Object.entries(TRAFFIC_POLICY_CONFIG) as Array<
                    [TrafficPolicy, (typeof TRAFFIC_POLICY_CONFIG)[TrafficPolicy]]
                  >
                ).map(([id, policy]) => {
                  const locked =
                    (id !== 'balanced' && !game.researchDone.includes('noc')) ||
                    (id === 'mobile' && !game.researchDone.includes('mobile_5g'));
                  return (
                    <button
                      key={id}
                      disabled={locked}
                      onClick={() => setTrafficPolicy(id)}
                      className={`rounded-lg border p-2.5 text-left transition-colors ${game.trafficPolicy === id ? 'border-neon-violet/50 bg-neon-violet/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'} disabled:cursor-not-allowed disabled:opacity-35`}
                    >
                      <div className="text-xs font-semibold">{policy.label}</div>
                      <div className="mt-1 text-[10px] leading-relaxed text-white/40">
                        {locked
                          ? id === 'mobile'
                            ? 'Requires 5G Standalone.'
                            : 'Requires a NOC.'
                          : policy.description}
                      </div>
                      {!locked && (
                        <div className="mt-2 flex gap-1" aria-label={`${policy.label} service priorities`}>
                          {(Object.entries(policy.priorities) as Array<[TrafficClass, number]>).map(
                            ([service, priority]) => (
                              <span
                                key={service}
                                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]"
                                title={`${service}: ${priority.toFixed(2)} priority`}
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
                Interconnection
              </div>
              <div className="flex flex-col gap-2">
                {(
                  Object.entries(INTERCONNECT_CONFIG) as Array<
                    [InterconnectPlan, (typeof INTERCONNECT_CONFIG)[InterconnectPlan]]
                  >
                ).map(([id, plan]) => {
                  const locked = plan.requiresDataCenter && !dataCenters.some((node) => !node.down && routes[node.id]);
                  return (
                    <button
                      key={id}
                      disabled={locked}
                      onClick={() => setInterconnectPlan(id)}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition-colors ${game.interconnectPlan === id ? 'border-neon-cyan/50 bg-neon-cyan/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'} disabled:cursor-not-allowed disabled:opacity-35`}
                    >
                      <div>
                        <div className="text-xs font-semibold">{plan.label}</div>
                        <div className="mt-0.5 text-[10px] leading-relaxed text-white/40">
                          {locked ? 'Bring an online data centre onto the network.' : plan.description}
                        </div>
                        {game.interconnectPlan === id && id === 'cdn' && !interconnectOnline && (
                          <div className="mt-1 text-[10px] font-semibold text-neon-red">
                            Suspended · restore a routed data centre; the monthly commitment remains.
                          </div>
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
                                −{Math.round(plan.cacheOffload * 100)}% external traffic
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
                        <div>{plan.monthly ? `${fmtMoney(plan.monthly)}/mo` : 'NO FEE'}</div>
                        {plan.capacityBonus > 0 && <div className="text-neon-cyan">+{plan.capacityBonus}G</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className={`panel panel-tone-green p-5 ${networkView === 'capacity' ? '' : 'hidden'}`}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Sites</h2>
              <p className="mt-1 text-[11px] text-white/40">
                A larger T-number means a larger equipment stack and more capacity.
              </p>
            </div>
            <div className="flex items-center gap-1" aria-label="Tier scale">
              {[1, 2, 3, 4, 5].map((tier) => (
                <TierBadge key={tier} tier={tier} maxTier={5} compact />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {game.nodes.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  focus(n.gx, n.gy);
                  select({ type: 'node', id: n.id });
                }}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.08]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-black/15">
                  <SiteIcon kind={n.kind} tier={n.tier} className="h-8 w-8" title={`${n.kind} site, Tier ${n.tier}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{n.name}</span>
                    {n.down && <span className="chip border-neon-red/40 text-[10px] text-neon-red">DOWN</span>}
                  </div>
                  <Meter
                    v={nodeUtil(n)}
                    label={`T${n.tier} equipment`}
                    right={`${n.trafficGbps.toFixed(1)}/${n.capacityGbps.toFixed(0)} Gbps`}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`panel panel-tone-blue p-5 ${networkView === 'capacity' ? '' : 'hidden'}`}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Fibre spans</h2>
          <p className="mb-3 text-[11px] text-white/40">
            Traffic takes the shortest way to a core, so a spare span sits at zero until the one it backs up fails.
          </p>
          <div className="flex flex-col gap-2">
            {game.links.length === 0 && <p className="text-sm text-white/40">No fibre built yet.</p>}
            {game.links.map((l) => {
              const a = game.nodes.find((n) => n.id === l.aId);
              const b = game.nodes.find((n) => n.id === l.bId);
              const stranded = !l.down && !routes[l.aId] && !routes[l.bId];
              const standby = !l.down && !stranded && !usedSpans.has(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => {
                    if (a) focus((a.gx + (b?.gx ?? a.gx)) / 2, (a.gy + (b?.gy ?? a.gy)) / 2);
                    select({ type: 'link', id: l.id });
                  }}
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.08]"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm">
                      {a?.name} <span className="text-white/30">↔</span> {b?.name}
                    </span>
                    {l.down && <span className="chip border-neon-red/40 text-[10px] text-neon-red">CUT</span>}
                    {stranded && (
                      <span
                        className="chip border-neon-red/40 text-[10px] text-neon-red"
                        title="Neither end can reach a core right now"
                      >
                        NO ROUTE
                      </span>
                    )}
                    {standby && (
                      <span
                        className="chip border-white/20 text-[10px] text-white/50"
                        title="Nothing routes over this span today. It is what keeps the district redundant."
                      >
                        STANDBY
                      </span>
                    )}
                  </div>
                  <Meter
                    v={linkUtil(l)}
                    label={`Tier ${l.tier} · ${l.length.toFixed(1)} km`}
                    right={`${l.trafficGbps.toFixed(1)}/${l.capacityGbps.toFixed(0)} Gbps`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div
          id="maintenance"
          className={`panel panel-tone-amber scroll-mt-20 p-5 ${networkView === 'operations' ? '' : 'hidden'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Maintenance board</h2>
              <p className="mt-1 text-[11px] text-white/40">Planned interventions wait for a free field crew.</p>
            </div>
            <span className="chip border-neon-amber/30 text-[10px] text-neon-amber">{openMaintenance.length} OPEN</span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {openMaintenance.length ? (
              openMaintenance.map((order) => {
                const node = game.nodes.find((entry) => entry.id === order.nodeId);
                const technician = game.technicians.find((entry) => entry.id === order.technicianId);
                const waitDays = Math.max(0, Math.ceil((order.scheduledAt - game.minutes) / 1440));
                return (
                  <button
                    key={order.id}
                    onClick={() => node && (focus(node.gx, node.gy), select({ type: 'node', id: node.id }))}
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.07]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{node?.name ?? 'Removed site'}</span>
                      <span
                        className={`chip text-[9px] ${order.status === 'active' ? 'border-neon-amber/40 text-neon-amber' : 'border-white/15 text-white/45'}`}
                      >
                        {order.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="num mt-1 text-[10px] text-white/40">
                      {order.mode.toUpperCase()} ·{' '}
                      {order.status === 'active'
                        ? `${Math.ceil(order.minutesLeft)} MIN · ${technician?.name ?? 'CREW'}`
                        : waitDays
                          ? `IN ${waitDays}D`
                          : 'AWAITING CREW'}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-[11px] text-white/35">
                No work orders. Select a site on the map to book maintenance.
              </div>
            )}
          </div>
        </div>

        <div className={`panel panel-tone-violet p-5 ${networkView === 'capacity' ? '' : 'hidden'}`}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Districts</h2>
          <div className="flex flex-col gap-2">
            {game.districts.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  focus(d.center.gx, d.center.gy);
                  select({ type: 'district', id: d.id });
                }}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.08]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: d.color }}>
                    {d.name}
                  </span>
                  <span className="num text-[11px] text-white/45">
                    {d.unlocked
                      ? `${fmtNum(residentialSubs(game, d.id))} customers`
                      : `Licence ${fmtMoney(d.entryCost)}`}
                  </span>
                </div>
                <div className="mt-1.5 flex gap-3">
                  <Meter v={d.coverage} label="Coverage" right={`${Math.round(d.coverage * 100)}%`} />
                  <Meter v={d.satisfaction / 100} label="Satisfaction" right={`${Math.round(d.satisfaction)}%`} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`panel panel-tone-amber p-5 lg:col-span-2 ${networkView === 'capacity' ? '' : 'hidden'}`}>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">Demand forecast</h2>
          <p className="mb-3 text-[11px] text-white/40">
            Straight line through recent peaks. Capacity takes time to build, so the useful moment to act is before the
            line crosses.
          </p>

          {demandSeries.length > 1 && (
            <div className="mb-4 rounded-lg border border-white/[0.07] bg-black/15 p-3">
              <TrendChart
                height={92}
                formatValue={(value) => `${value.toFixed(1)}G`}
                series={[
                  { label: 'Daily peak Gbps', values: demandSeries, color: '#2dd4bf' },
                  {
                    label: 'Access capacity',
                    values: demandSeries.map(() => accessCapacity),
                    color: '#f3b843',
                    dashed: true,
                  },
                ]}
              />
            </div>
          )}

          {!forecast.confident ? (
            <p className="text-sm text-white/40">Not enough history yet. Give it a couple of weeks.</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="chip py-2">
                  <div className="stat-label">Peak today</div>
                  <div className="num text-sm">{forecast.today.toFixed(1)}G</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">In 30 days</div>
                  <div className="num text-sm text-neon-cyan">{forecast.projected.toFixed(1)}G</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">Access capacity</div>
                  <div className="num text-sm">{accessCapacity.toFixed(0)}G</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">Headroom</div>
                  <div
                    className={`num text-sm ${daysLeft !== null && daysLeft < 30 ? 'text-neon-red' : 'text-neon-lime'}`}
                  >
                    {daysLeft === null ? 'flat' : daysLeft > 365 ? '1y+' : `${Math.round(daysLeft)}d`}
                  </div>
                </div>
              </div>

              <Meter
                v={forecast.projected / Math.max(0.01, accessCapacity)}
                label="Projected peak against what you have built"
                right={`${forecast.projected.toFixed(1)} / ${accessCapacity.toFixed(0)} Gbps`}
              />

              {daysLeft !== null && daysLeft < 30 && (
                <div className="mt-3 rounded-lg border border-neon-red/40 bg-neon-red/10 p-3 text-[12px] text-neon-red">
                  On the current trend you run out of access capacity in about {Math.round(daysLeft)} days.
                </div>
              )}
            </>
          )}
        </div>

        <div className={`panel panel-tone-green p-5 ${networkView === 'interconnect' ? '' : 'hidden'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Data centre operations</h2>
              <p className="mt-1 text-[11px] text-white/40">Edge cache offload and hosting economics.</p>
            </div>
            <SiteIcon kind="datacenter" className="h-8 w-8" />
          </div>
          {dataCenters.length ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="chip py-2">
                  <div className="stat-label">Sites</div>
                  <div className="num text-sm">{dataCenters.length}</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">Cache offload</div>
                  <div className="num text-sm text-neon-cyan">{Math.round(cacheRatio(game) * 100)}%</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">Hosting</div>
                  <div className="num text-sm text-neon-lime">{fmtMoney(finance.revenueHosting)}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                {dataCenters.map((n) => {
                  const activeMode = DATA_CENTER_MODE_CONFIG[dataCenterMode(game, n.id)];
                  const routed = !n.down && Boolean(routes[n.id]);
                  const changedAt = game.dataCenterModeChangedAt[n.id] ?? 0;
                  const cooldownLeft =
                    changedAt > 0 ? Math.max(0, changedAt + DATA_CENTER_MODE_COOLDOWN - game.minutes) : 0;
                  return (
                    <div
                      key={n.id}
                      className={`rounded-lg border p-2 ${routed ? 'border-white/[0.08] bg-white/[0.03]' : 'border-neon-red/30 bg-neon-red/[0.05]'}`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-neon-cyan"
                          onClick={() => {
                            focus(n.gx, n.gy);
                            select({ type: 'node', id: n.id });
                          }}
                        >
                          <SiteIcon kind="datacenter" tier={n.tier} className="h-7 w-7" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{n.name}</span>
                            <span className={`num block text-[9px] ${routed ? 'text-white/35' : 'text-neon-red'}`}>
                              {routed
                                ? `T${n.tier} · ${Math.round(nodeUtil(n) * 100)}% LOAD`
                                : 'OFFLINE · NO ROUTE TO CORE'}
                            </span>
                          </span>
                        </button>
                        <select
                          aria-label={`${n.name} workload`}
                          disabled={cooldownLeft > 0}
                          value={dataCenterMode(game, n.id)}
                          onChange={(event) => setDataCenterMode(n.id, event.target.value as DataCenterMode)}
                          className="max-w-[132px] rounded-md border border-white/10 bg-[#101827] px-2 py-1.5 text-[10px] text-white/70 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {(
                            Object.entries(DATA_CENTER_MODE_CONFIG) as Array<
                              [DataCenterMode, (typeof DATA_CENTER_MODE_CONFIG)[DataCenterMode]]
                            >
                          ).map(([id, mode]) => (
                            <option key={id} value={id}>
                              {mode.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="num mt-2 grid grid-cols-3 gap-1 text-center text-[9px] text-white/40">
                        <span>Cache {(activeMode.cachePerTier * n.tier * 100).toFixed(0)}%</span>
                        <span>Load {(activeMode.workloadPerTier * n.tier).toFixed(1)}G</span>
                        <span>Power ×{activeMode.powerMultiplier.toFixed(2)}</span>
                      </div>
                      <div className="num mt-1 text-right text-[9px] text-white/30">
                        {cooldownLeft > 0
                          ? `Reconfiguration ready in ${Math.ceil(cooldownLeft / 1440)}d`
                          : `Change fee ${fmtMoney(dataCenterModeChangeCost(n))} · 2d lock`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[10px] leading-relaxed text-white/35">
                Mode changes trade hosting income for cache offload, SLA protection, power draw and network load.
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-center">
              <div className="text-sm text-white/55">No edge infrastructure yet</div>
              <div className="mt-1 text-[11px] text-white/35">
                Research Edge Compute, then place a data centre to reduce transit load.
              </div>
              <button
                className="btn mt-3"
                onClick={() => {
                  setScreen('map');
                  setTool('datacenter');
                }}
              >
                Open build tools
              </button>
            </div>
          )}
        </div>

        <div className={`panel panel-tone-violet p-5 ${networkView === 'interconnect' ? '' : 'hidden'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Competitor intelligence</h2>
              <p className="mt-1 text-[11px] text-white/40">Coverage, pricing posture and strongest district.</p>
            </div>
            <button
              className="btn py-1.5 text-[10px]"
              onClick={() => {
                setOverlay('rivals');
                setScreen('map');
              }}
            >
              Open overlay
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {game.competitors.map((rival) => {
              const strongest = [...game.districts].sort(
                (a, b) => (rival.share[b.id] ?? 0) - (rival.share[a.id] ?? 0),
              )[0];
              const avgCoverage =
                game.districts.reduce((sum, d) => sum + (rival.coverage[d.id] ?? 0), 0) /
                Math.max(1, game.districts.length);
              const rivalSpectrum = rival.spectrum
                .map((holding) => `${SPECTRUM_BANDS[holding.band].label} ×${holding.blocks}`)
                .join(', ');
              const posture = rivalPosture(game, rival);
              return (
                <button
                  key={rival.id}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.07]"
                  onClick={() => strongest && focus(strongest.center.gx, strongest.center.gy)}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <i className="h-2 w-2 rounded-full" style={{ background: rival.color }} />
                      {rival.name}
                    </span>
                    <span className="num text-[10px] text-white/45">PRICE {rival.priceIndex.toFixed(2)}×</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px]">
                    <span
                      className="rounded border px-1.5 py-0.5 font-semibold"
                      style={{ borderColor: `${rival.color}66`, color: rival.color }}
                    >
                      {posture.label}
                    </span>
                    <span className="truncate text-white/35">{posture.detail}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 text-[10px] text-white/[0.42]">
                    <span>{Math.round(avgCoverage * 100)}% cover</span>
                    <span className="text-center">Tech {Math.round(rival.tech * 100)}</span>
                    <span className="truncate text-right">Lead: {strongest?.name}</span>
                  </div>
                  <div className="mt-1 truncate text-[10px] text-white/35">Spectrum: {rivalSpectrum || 'none'}</div>
                  {rival.lastMove && (
                    <div className="mt-1 truncate text-[10px]" style={{ color: rival.color }}>
                      {rival.lastMove}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {mods.hasMobile && (
          <div className={`panel panel-tone-violet p-5 ${networkView === 'interconnect' ? '' : 'hidden'}`}>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">Spectrum</h2>
            <p className="mb-3 text-[11px] text-white/40">
              Low bands reach further, high bands carry more. Reach comes from your best band, capacity from all of
              them.
            </p>

            {game.spectrum.length === 0 ? (
              <p className="text-sm text-white/40">No licences held. Towers cannot transmit.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {game.spectrum.map((h) => {
                  const spec = SPECTRUM_BANDS[h.band];
                  return (
                    <div key={h.band} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-neon-violet">{spec.label}</span>
                        <span className="num text-[11px] text-white/45">
                          {h.blocks} block{h.blocks > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="num mt-0.5 flex gap-3 text-[10px] text-white/40">
                        <span>reach {spec.radius.toFixed(2)}x</span>
                        <span>capacity {spec.capacity.toFixed(1)}x</span>
                        <span>{h.paid > 0 ? `paid ${fmtMoney(h.paid)}` : 'granted'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="chip py-2">
                <div className="stat-label">Tower reach</div>
                <div className="num text-sm text-neon-cyan">
                  {game.spectrum.length ? `${towerRadius(game.spectrum, 1).toFixed(1)} km` : '-'}
                </div>
              </div>
              <div className="chip py-2">
                <div className="stat-label">Mobile subs</div>
                <div className="num text-sm">{fmtNum(mobileSubs(game))}</div>
              </div>
              <div className="chip py-2">
                <div className="stat-label">Next auction</div>
                <div className="num text-sm">
                  {isFinite(game.nextAuctionAt)
                    ? `${Math.max(0, Math.round((game.nextAuctionAt - game.minutes) / 1440))}d`
                    : '-'}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="stat-label mb-1.5">Mobile coverage by district</div>
              <div className="flex flex-col gap-1.5">
                {game.districts
                  .filter((d) => d.unlocked)
                  .map((d) => (
                    <Meter
                      key={d.id}
                      v={d.mobileCoverage}
                      label={d.name}
                      right={`${Math.round(d.mobileCoverage * 100)}% · ${fmtNum(d.mobileSubs)} subs`}
                    />
                  ))}
              </div>
            </div>
          </div>
        )}

        <div
          id="transit"
          className={`panel panel-tone-blue scroll-mt-20 p-5 ${networkView === 'interconnect' ? '' : 'hidden'}`}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Upstream & automation</h2>
          <Meter
            v={transitUse}
            label="Transit usage"
            right={`${game.stats.transitGbps.toFixed(1)}/${transitCapacity.toFixed(0)} Gbps`}
          />
          <div className="mt-3 flex flex-col gap-2">
            {TRANSIT_TIERS.map((t, i) => {
              const capacityDelta = t.capacity - transit.capacity;
              const costDelta = (t.monthly - transit.monthly) * mods.transitCostMul;
              return (
                <button
                  key={t.label}
                  onClick={() => setTransitTier(i)}
                  className={`flex items-center justify-between rounded-lg border p-2.5 text-left text-sm transition-colors ${
                    game.transitTier === i
                      ? 'border-neon-cyan/50 bg-neon-cyan/10'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'
                  }`}
                >
                  <div>
                    <div className="font-medium">{t.label}</div>
                    <div className="num text-[11px] text-white/45">{t.capacity} Gbps upstream</div>
                    {i !== game.transitTier && (
                      <div className="num mt-1 text-[9px]">
                        <span className={capacityDelta >= 0 ? 'text-neon-lime' : 'text-neon-red'}>
                          {capacityDelta >= 0 ? '+' : ''}
                          {capacityDelta}G
                        </span>
                        <span className="text-white/30"> · </span>
                        <span className={costDelta <= 0 ? 'text-neon-lime' : 'text-neon-amber'}>
                          {costDelta >= 0 ? '+' : ''}
                          {fmtMoney(costDelta)}/mo
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="num text-sm text-white/70">{fmtMoney(t.monthly * mods.transitCostMul)}/mo</div>
                </button>
              );
            })}
          </div>

          <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div>
              <div className="text-sm font-medium">Backup transit provider</div>
              <div className="text-[11px] text-white/45">+35% headroom from a diverse second upstream.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="num text-xs text-white/60">{fmtMoney(BACKUP_TRANSIT_MONTHLY)}/mo</span>
              <input
                type="checkbox"
                checked={game.backupTransit}
                onChange={toggleBackup}
                className="h-4 w-4 accent-[#3ee6d6]"
              />
            </div>
          </label>

          <label
            className={`mt-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3 ${
              mods.hasAutoDispatch ? 'cursor-pointer' : 'opacity-40'
            }`}
          >
            <div>
              <div className="text-sm font-medium">Automatic technician dispatch</div>
              <div className="text-[11px] text-white/45">
                {mods.hasAutoDispatch
                  ? 'Crews roll to faults without waiting for you.'
                  : 'Requires Automatic Dispatch research.'}
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!mods.hasAutoDispatch}
              checked={game.autoDispatch}
              onChange={toggleAuto}
              className="h-4 w-4 accent-[#3ee6d6]"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
