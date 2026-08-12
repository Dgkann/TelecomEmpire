import {
  BACKUP_TRANSIT_MONTHLY,
  NODE_SPECS,
  SPECTRUM_BANDS,
  TRANSIT_TIERS,
  towerRadius,
  utilColor,
} from '../../game/constants';
import { fmtMoney, fmtNum } from '../../game/economy';
import { linkUtil, nodeUtil } from '../../game/network';
import { researchModifiers } from '../../game/research';
import { mobileSubs, residentialSubs } from '../../game/simulation';
import { useGame } from '../../store/gameStore';

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
  const mods = researchModifiers(game.researchDone);

  const transit = TRANSIT_TIERS[game.transitTier];
  const transitUse = game.stats.demandGbps / (transit.capacity * (game.backupTransit ? 1.35 : 1));

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-ink-900 p-6">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
        <div className="panel p-5 lg:col-span-2">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
            {[
              { label: 'Network health', value: `${Math.round(game.stats.health)}%`, tone: game.stats.health > 80 ? 'text-neon-lime' : 'text-neon-amber' },
              { label: 'Demand', value: `${game.stats.demandGbps.toFixed(1)} Gbps` },
              { label: 'Carried', value: `${game.stats.servedGbps.toFixed(1)} Gbps` },
              { label: 'Packet loss', value: `${(game.stats.packetLoss * 100).toFixed(1)}%`, tone: game.stats.packetLoss > 0.02 ? 'text-neon-red' : 'text-neon-lime' },
              { label: 'Latency', value: `${Math.round(game.stats.latencyMs)} ms`, tone: game.stats.latencyMs > 40 ? 'text-neon-amber' : undefined },
            ].map((s) => (
              <div key={s.label}>
                <div className="stat-label">{s.label}</div>
                <div className={`num text-2xl font-semibold ${s.tone ?? 'text-white'}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5">
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
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/5 text-base">
                  {NODE_SPECS[n.kind].icon}
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

        <div className="panel p-5">
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

        <div className="panel p-5">
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

        {mods.hasMobile && (
          <div className="panel p-5">
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

        <div className="panel p-5">
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
