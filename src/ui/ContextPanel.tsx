import { AnimatePresence, motion } from 'framer-motion';
import { FIBER_UPGRADE_COST_PER_UNIT, NODE_SPECS, nodeUpgradeCost, utilColor } from '../game/constants';
import { fmtMoneyExact, fmtNum } from '../game/economy';
import { computeRoutes, isRedundant, linkUtil, nodeUtil } from '../game/network';
import { researchModifiers } from '../game/research';
import { residentialSubs } from '../game/simulation';
import { useGame } from '../store/gameStore';
import { useMemo } from 'react';

function Bar({ value, label, right }: { value: number; label: string; right?: string }) {
  const pct = Math.min(1, value);
  return (
    <div>
      <div className="flex justify-between text-[11px] text-white/50">
        <span>{label}</span>
        <span className="num">{right ?? `${Math.round(value * 100)}%`}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: utilColor(value) }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
    </div>
  );
}

export default function ContextPanel() {
  const game = useGame((s) => s.game)!;
  const selection = useGame((s) => s.selection);
  const select = useGame((s) => s.select);
  const setTool = useGame((s) => s.setTool);
  const upgradeNode = useGame((s) => s.upgradeNode);
  const repairNode = useGame((s) => s.repairNode);
  const sellNode = useGame((s) => s.sellNode);
  const upgradeLink = useGame((s) => s.upgradeLink);
  const sellLink = useGame((s) => s.sellLink);
  const unlockDistrict = useGame((s) => s.unlockDistrict);
  const clickNodeForLink = useGame((s) => s.clickNodeForLink);

  const mods = researchModifiers(game.researchDone);

  const node = selection?.type === 'node' ? game.nodes.find((n) => n.id === selection.id) : undefined;
  const link = selection?.type === 'link' ? game.links.find((l) => l.id === selection.id) : undefined;
  const district = selection?.type === 'district' ? game.districts.find((d) => d.id === selection.id) : undefined;

  // Topology only changes when something is added, removed or knocked out,
  // so key the expensive redundancy check on a cheap signature of that.
  const topology = `${game.nodes.length}:${game.links.length}:${game.nodes
    .filter((n) => n.down)
    .map((n) => n.id)
    .join(',')}:${game.links
    .filter((l) => l.down)
    .map((l) => l.id)
    .join(',')}`;

  const { redundant, connected } = useMemo(() => {
    if (!node) return { redundant: false, connected: false };
    const routes = computeRoutes(game);
    return {
      redundant: isRedundant(game, node.id, routes),
      connected: node.kind === 'core' ? !node.down : !!routes[node.id],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, topology]);

  return (
    <AnimatePresence>
      {selection && (
        <motion.div
          key={selection.type + selection.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="panel absolute right-4 top-4 z-20 w-[290px] p-4"
        >
          <button
            className="absolute right-3 top-3 text-white/40 hover:text-white"
            onClick={() => select(null)}
            aria-label="Close"
          >
            ✕
          </button>

          {node && (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                  {NODE_SPECS[node.kind].label} · Tier {node.tier}
                </div>
                <div className="text-lg font-semibold leading-tight">{node.name}</div>
                {node.down && <div className="mt-1 text-xs font-semibold text-neon-red">OUT OF SERVICE</div>}
              </div>

              <Bar
                value={nodeUtil(node)}
                label="Capacity"
                right={`${node.trafficGbps.toFixed(1)} / ${node.capacityGbps.toFixed(0)} Gbps`}
              />
              <Bar value={1 - node.health / 100} label="Wear" right={`${Math.round(node.health)}% health`} />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="chip">
                  <div className="stat-label">Path to core</div>
                  <div className={connected ? 'text-neon-lime' : 'text-neon-red'}>{connected ? 'Live' : 'Isolated'}</div>
                </div>
                <div className="chip">
                  <div className="stat-label">Redundancy</div>
                  <div className={redundant ? 'text-neon-lime' : 'text-neon-amber'}>
                    {node.kind === 'core' ? 'n/a' : redundant ? 'Protected' : 'Single path'}
                  </div>
                </div>
              </div>

              {!redundant && node.kind !== 'core' && (
                <p className="text-[11px] leading-snug text-white/45">
                  One fibre cut takes this site dark. A second span from another site keeps it alive.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => upgradeNode(node.id)}>
                  Upgrade · {fmtMoneyExact(nodeUpgradeCost(node.kind, node.tier))}
                </button>
                {node.health < 99 && (
                  <button className="btn" onClick={() => repairNode(node.id)}>
                    Service · {fmtMoneyExact(Math.round((100 - node.health) * 260))}
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() => {
                    setTool('fiber');
                    clickNodeForLink(node.id);
                  }}
                >
                  Add fibre
                </button>
                <button className="btn-danger" onClick={() => sellNode(node.id)}>
                  Decommission
                </button>
              </div>
            </div>
          )}

          {link && (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">Fibre span · Tier {link.tier}</div>
                <div className="text-base font-semibold leading-tight">
                  {game.nodes.find((n) => n.id === link.aId)?.name} ↔ {game.nodes.find((n) => n.id === link.bId)?.name}
                </div>
                {link.down && <div className="mt-1 text-xs font-semibold text-neon-red">SPAN DARK</div>}
              </div>
              <Bar
                value={linkUtil(link)}
                label="Utilisation"
                right={`${link.trafficGbps.toFixed(1)} / ${link.capacityGbps.toFixed(0)} Gbps`}
              />
              <div className="text-[11px] text-white/45">Length {link.length.toFixed(1)} km</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={link.tier >= mods.maxLinkTier}
                  onClick={() => upgradeLink(link.id)}
                >
                  Upgrade optics · {fmtMoneyExact(Math.round(link.length * FIBER_UPGRADE_COST_PER_UNIT * link.tier))}
                </button>
                <button className="btn-danger" onClick={() => sellLink(link.id)}>
                  Remove
                </button>
              </div>
            </div>
          )}

          {district && (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">District</div>
                <div className="text-lg font-semibold leading-tight" style={{ color: district.color }}>
                  {district.name}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="chip">
                  <div className="stat-label">Population</div>
                  <div className="num">{fmtNum(district.population)}</div>
                </div>
                <div className="chip">
                  <div className="stat-label">Potential</div>
                  <div className="num">{fmtNum(district.potential)}</div>
                </div>
                <div className="chip">
                  <div className="stat-label">Income</div>
                  <div className="capitalize">{district.incomeLevel}</div>
                </div>
                <div className="chip">
                  <div className="stat-label">Your customers</div>
                  <div className="num">{fmtNum(residentialSubs(game, district.id))}</div>
                </div>
              </div>

              <Bar value={district.coverage} label="Your coverage" />
              <Bar
                value={district.satisfaction / 100}
                label="Satisfaction"
                right={`${Math.round(district.satisfaction)}%`}
              />

              <div>
                <div className="stat-label mb-1">Market share</div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/10">
                  {(() => {
                    const mine = district.potential > 0 ? residentialSubs(game, district.id) / district.potential : 0;
                    const parts = [
                      { name: game.companyName, v: mine, color: '#3ee6d6' },
                      ...game.competitors.map((c) => ({ name: c.name, v: c.share[district.id] ?? 0, color: c.color })),
                    ];
                    const total = parts.reduce((s, p) => s + p.v, 0);
                    const rest = Math.max(0, 1 - total);
                    return [...parts, { name: 'Unserved', v: rest, color: '#33405422' }].map((p, i) => (
                      <div
                        key={i}
                        title={`${p.name} ${Math.round(p.v * 100)}%`}
                        style={{ width: `${Math.max(0, p.v) * 100}%`, background: p.color }}
                      />
                    ));
                  })()}
                </div>
              </div>

              {!district.unlocked ? (
                <button className="btn-primary w-full" onClick={() => unlockDistrict(district.id)}>
                  Buy licence · {fmtMoneyExact(district.entryCost)}
                </button>
              ) : (
                <p className="text-[11px] leading-snug text-white/45">
                  Place a POP here and run fibre back to your core to start selling.
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
