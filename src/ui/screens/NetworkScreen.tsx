import { motion } from 'framer-motion';
import {
  BACKUP_TRANSIT_MONTHLY,
  SPECTRUM_BANDS,
  TRANSIT_TIERS,
  towerRadius,
  utilColor,
} from '../../game/constants';
import { fmtMoney, fmtNum, monthlyBreakdown } from '../../game/economy';
import { daysUntilFull, forecastDemand, linkUtil, nodeUtil, servingCapacity } from '../../game/network';
import { researchModifiers } from '../../game/research';
import { cacheRatio, mobileSubs, residentialSubs } from '../../game/simulation';
import { useGame } from '../../store/gameStore';
import SiteIcon from '../SiteIcon';
import TrendChart from '../TrendChart';

function Meter({ v, label, right }: { v: number; label: string; right: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex justify-between text-[11px]">
        <span className="truncate text-white/60">{label}</span>
        <span className="num shrink-0 pl-2 text-white/45">{right}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, v * 100)}%`, background: utilColor(v) }} />
      </div>
    </div>
  );
}

export default function NetworkScreen() {
  const game = useGame((s) => s.game)!;
  const focus = useGame((s) => s.focus);
  const select = useGame((s) => s.select);
  const setTransitTier = useGame((s) => s.setTransitTier);
  const toggleBackup = useGame((s) => s.toggleBackupTransit);
  const toggleAuto = useGame((s) => s.toggleAutoDispatch);
  const setScreen = useGame((s) => s.setScreen);
  const setOverlay = useGame((s) => s.setOverlay);
  const setTool = useGame((s) => s.setTool);
  const mods = researchModifiers(game.researchDone);

  const forecast = forecastDemand(game.demandHistory, Math.max(game.dayPeakDemand, game.stats.demandGbps), 30);
  const accessCapacity = servingCapacity(game.nodes);
  const daysLeft = daysUntilFull(forecast, accessCapacity);
  const transit = TRANSIT_TIERS[game.transitTier];
  const transitUse = game.stats.demandGbps / (transit.capacity * (game.backupTransit ? 1.35 : 1));
  const demandSeries = [...game.demandHistory.slice(-29), Math.max(game.dayPeakDemand, game.stats.demandGbps)];
  const dayTelemetry = game.telemetry.slice(-24);
  const dataCenters = game.nodes.filter((n) => n.kind === 'datacenter');
  const finance = monthlyBreakdown(game, mods);

  return (
    <div className="screen-shell">
      <div className="mx-auto grid max-w-[1240px] gap-5 lg:grid-cols-2">
        <div className="flex flex-wrap items-end justify-between gap-4 lg:col-span-2">
          <div>
            <div className="stat-label text-neon-cyan">Network operations</div>
            <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">Live service control</h1>
            <p className="mt-1 text-[13px] text-white/45">Capacity, quality and resilience across every active route.</p>
          </div>
          <div className={`rounded-lg border px-3 py-2 text-right ${daysLeft !== null && daysLeft < 30 ? 'border-neon-red/30 bg-neon-red/[0.07]' : 'border-neon-lime/20 bg-neon-lime/[0.05]'}`}>
            <div className="stat-label">Capacity outlook</div>
            <div className={`num text-sm font-semibold ${daysLeft !== null && daysLeft < 30 ? 'text-neon-red' : 'text-neon-lime'}`}>
              {!forecast.confident ? 'Collecting baseline' : daysLeft === null ? 'Demand stable' : daysLeft > 365 ? 'More than 1 year' : `${Math.round(daysLeft)} days headroom`}
            </div>
          </div>
        </div>

        <div className="panel panel-tone-blue p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">24-hour traffic timeline</h2><p className="mt-1 text-[11px] text-white/40">Hourly demand, carried traffic and loss across the current operating day.</p></div>
            <div className="num text-[10px] text-white/35">{dayTelemetry.length}/24 SAMPLES</div>
          </div>
          {dayTelemetry.length > 1 ? (
            <TrendChart height={112} formatValue={(v) => `${v.toFixed(1)}G`} series={[
              { label: 'Demand', values: dayTelemetry.map((p) => p.demandGbps), color: '#68a5ff' },
              { label: 'Carried', values: dayTelemetry.map((p) => p.servedGbps), color: '#2dd4bf' },
              { label: 'Loss ×10', values: dayTelemetry.map((p) => p.packetLoss * 10), color: '#ff6577', dashed: true },
            ]} />
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-5 text-center">
              <div className="text-sm text-white/60">Building the first traffic baseline</div>
              <div className="mt-1 text-[11px] text-white/35">Keep the clock running; the NOC records one sample every in-game hour.</div>
            </div>
          )}
        </div>
        <div className="panel p-5 lg:col-span-2">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
            {[
              { label: 'Network health', value: `${Math.round(game.stats.health)}%`, tone: game.stats.health > 80 ? 'text-neon-lime' : 'text-neon-amber' },
              { label: 'Demand', value: `${game.stats.demandGbps.toFixed(1)} Gbps` },
              { label: 'Carried', value: `${game.stats.servedGbps.toFixed(1)} Gbps` },
              { label: 'Packet loss', value: `${(game.stats.packetLoss * 100).toFixed(1)}%`, tone: game.stats.packetLoss > 0.02 ? 'text-neon-red' : 'text-neon-lime' },
              { label: 'Latency', value: `${Math.round(game.stats.latencyMs)} ms`, tone: game.stats.latencyMs > 40 ? 'text-neon-amber' : undefined },
            ].map((s) => (
              <div key={s.label} className="kpi border-0 bg-transparent px-0 py-0">
                <div className="stat-label">{s.label}</div>
                <div className={`num text-2xl font-semibold ${s.tone ?? 'text-white'}`}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-white/[0.07] pt-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <div><div className="stat-label">Live delivery path</div><div className="text-[12px] text-white/40">Traffic accepted by the network at this instant</div></div>
              <div className="num text-[12px] text-white/55"><span className="text-neon-cyan">{game.stats.servedGbps.toFixed(2)}G carried</span> / {game.stats.demandGbps.toFixed(2)}G requested</div>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-neon-red/18">
              <motion.div className="h-full rounded-full bg-neon-cyan" animate={{ width: `${Math.min(100, (game.stats.servedGbps / Math.max(0.01, game.stats.demandGbps)) * 100)}%` }} />
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
              <div className="absolute inset-y-0 left-3/4 w-px bg-white/20" />
            </div>
          </div>
        </div>

        <div className="panel panel-tone-green p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Sites</h2>
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
                  <SiteIcon kind={n.kind} className="h-7 w-7" title={`${n.kind} site`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{n.name}</span>
                    {n.down && <span className="chip border-neon-red/40 text-[10px] text-neon-red">DOWN</span>}
                  </div>
                  <Meter
                    v={nodeUtil(n)}
                    label={`Tier ${n.tier}`}
                    right={`${n.trafficGbps.toFixed(1)}/${n.capacityGbps.toFixed(0)} Gbps`}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel panel-tone-blue p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Fibre spans</h2>
          <div className="flex flex-col gap-2">
            {game.links.length === 0 && <p className="text-sm text-white/40">No fibre built yet.</p>}
            {game.links.map((l) => {
              const a = game.nodes.find((n) => n.id === l.aId);
              const b = game.nodes.find((n) => n.id === l.bId);
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

        <div className="panel panel-tone-violet p-5">
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
                    {d.unlocked ? `${fmtNum(residentialSubs(game, d.id))} customers` : `Licence ${fmtMoney(d.entryCost)}`}
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

        <div className="panel panel-tone-amber p-5 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">Demand forecast</h2>
          <p className="mb-3 text-[11px] text-white/40">
            Straight line through recent peaks. Capacity takes time to build, so the useful moment to act is before
            the line crosses.
          </p>

          {demandSeries.length > 1 && (
            <div className="mb-4 rounded-lg border border-white/[0.07] bg-black/15 p-3">
              <TrendChart
                height={92}
                formatValue={(value) => `${value.toFixed(1)}G`}
                series={[
                  { label: 'Daily peak Gbps', values: demandSeries, color: '#2dd4bf' },
                  { label: 'Access capacity', values: demandSeries.map(() => accessCapacity), color: '#f3b843', dashed: true },
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
                    className={`num text-sm ${
                      daysLeft !== null && daysLeft < 30 ? 'text-neon-red' : 'text-neon-lime'
                    }`}
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

        <div className="panel panel-tone-green p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Data centre operations</h2><p className="mt-1 text-[11px] text-white/40">Edge cache offload and hosting economics.</p></div><SiteIcon kind="datacenter" className="h-8 w-8" /></div>
          {dataCenters.length ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="chip py-2"><div className="stat-label">Sites</div><div className="num text-sm">{dataCenters.length}</div></div>
                <div className="chip py-2"><div className="stat-label">Cache offload</div><div className="num text-sm text-neon-cyan">{Math.round(cacheRatio(game) * 100)}%</div></div>
                <div className="chip py-2"><div className="stat-label">Hosting</div><div className="num text-sm text-neon-lime">{fmtMoney(finance.revenueHosting)}</div></div>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">{dataCenters.map((n) => (
                <button key={n.id} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-left hover:bg-white/[0.07]" onClick={() => { focus(n.gx, n.gy); select({ type: 'node', id: n.id }); }}>
                  <SiteIcon kind="datacenter" className="h-6 w-6" /><span className="min-w-0 flex-1 truncate text-xs font-medium">{n.name}</span><span className="num text-[10px] text-white/40">T{n.tier} · {Math.round(nodeUtil(n) * 100)}%</span>
                </button>
              ))}</div>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-center"><div className="text-sm text-white/55">No edge infrastructure yet</div><div className="mt-1 text-[11px] text-white/35">Research Edge Compute, then place a data centre to reduce transit load.</div><button className="btn mt-3" onClick={() => { setScreen('map'); setTool('datacenter'); }}>Open build tools</button></div>
          )}
        </div>

        <div className="panel panel-tone-violet p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Competitor intelligence</h2><p className="mt-1 text-[11px] text-white/40">Coverage, pricing posture and strongest district.</p></div><button className="btn py-1.5 text-[10px]" onClick={() => { setOverlay('rivals'); setScreen('map'); }}>Open overlay</button></div>
          <div className="mt-4 flex flex-col gap-2">{game.competitors.map((rival) => {
            const strongest = [...game.districts].sort((a, b) => (rival.share[b.id] ?? 0) - (rival.share[a.id] ?? 0))[0];
            const avgCoverage = game.districts.reduce((sum, d) => sum + (rival.coverage[d.id] ?? 0), 0) / Math.max(1, game.districts.length);
            return <button key={rival.id} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.07]" onClick={() => strongest && focus(strongest.center.gx, strongest.center.gy)}>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold"><i className="h-2 w-2 rounded-full" style={{ background: rival.color }} />{rival.name}</span><span className="num text-[10px] text-white/45">PRICE {rival.priceIndex.toFixed(2)}×</span></div>
              <div className="mt-1 grid grid-cols-3 text-[10px] text-white/42"><span>{Math.round(avgCoverage * 100)}% cover</span><span className="text-center">Tech {Math.round(rival.tech * 100)}</span><span className="truncate text-right">Lead: {strongest?.name}</span></div>
              {rival.lastMove && <div className="mt-1 truncate text-[10px]" style={{ color: rival.color }}>{rival.lastMove}</div>}
            </button>;
          })}</div>
        </div>

        {mods.hasMobile && (
          <div className="panel panel-tone-violet p-5">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">Spectrum</h2>
            <p className="mb-3 text-[11px] text-white/40">
              Low bands reach further, high bands carry more. Reach comes from your best band, capacity from all of them.
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

        <div className="panel panel-tone-blue p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Upstream & automation</h2>
          <Meter
            v={transitUse}
            label="Transit usage"
            right={`${game.stats.demandGbps.toFixed(1)}/${(transit.capacity * (game.backupTransit ? 1.35 : 1)).toFixed(0)} Gbps`}
          />
          <div className="mt-3 flex flex-col gap-2">
            {TRANSIT_TIERS.map((t, i) => (
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
                </div>
                <div className="num text-sm text-white/70">
                  {fmtMoney(t.monthly * mods.transitCostMul)}/mo
                </div>
              </button>
            ))}
          </div>

          <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div>
              <div className="text-sm font-medium">Backup transit provider</div>
              <div className="text-[11px] text-white/45">+35% headroom, fewer upstream failures.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="num text-xs text-white/60">{fmtMoney(BACKUP_TRANSIT_MONTHLY)}/mo</span>
              <input type="checkbox" checked={game.backupTransit} onChange={toggleBackup} className="h-4 w-4 accent-[#3ee6d6]" />
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
                {mods.hasAutoDispatch ? 'Crews roll to faults without waiting for you.' : 'Requires Automatic Dispatch research.'}
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
