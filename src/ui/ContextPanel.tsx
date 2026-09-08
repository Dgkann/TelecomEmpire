import { DistrictProjectCard } from './ProjectMap';
import { DistrictLaunchProgress } from './ExpansionPlanner';
import { backupRouteEstimate } from '../game/redundancyBuild';
import { AnimatePresence, motion } from 'framer-motion';
import { FIBER_UPGRADE_COST_PER_UNIT, NODE_SPECS, linkCapacity, nodeUpgradeCost, utilColor } from '../game/constants';
import { effectiveNodeCapacity } from '../game/capacity';
import { fmtMoneyExact, fmtNum } from '../game/economy';
import { computeRoutes, isRedundant, linkUtil, nodeUtil, servingCoverAfterLoss } from '../game/network';
import { contractRisk } from '../game/operations';
import { SLA_PENALTY_CAP } from '../game/constants';
import { researchModifiers } from '../game/research';
import { residentialSubs } from '../game/simulation';
import { CAMPAIGN_CONFIG, MAINTENANCE_CONFIG, activeCampaign, maintenanceCost } from '../game/strategy';
import type { CampaignKind, MaintenanceMode } from '../game/types';
import { useGame } from '../store/gameStore';
import { t } from './i18n';
import { useMemo } from 'react';
import SiteIcon, { TierBadge } from './SiteIcon';
import InvestmentPreview from './InvestmentPreview';

const fmtMins = (m: number) => (m < 120 ? `${Math.round(m)} min` : `${Math.round(m / 60)}h`);

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
  const addBackupRoute = useGame((s) => s.addBackupRoute);
  const beginDrill = useGame((s) => s.beginFailureDrill);
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const selection = useGame((s) => s.selection);
  const select = useGame((s) => s.select);
  const setTool = useGame((s) => s.setTool);
  const upgradeNode = useGame((s) => s.upgradeNode);
  const scheduleMaintenance = useGame((s) => s.scheduleMaintenance);
  const cancelMaintenance = useGame((s) => s.cancelMaintenance);
  const sellNode = useGame((s) => s.sellNode);
  const upgradeLink = useGame((s) => s.upgradeLink);
  const sellLink = useGame((s) => s.sellLink);
  const unlockDistrict = useGame((s) => s.unlockDistrict);
  const clickNodeForLink = useGame((s) => s.clickNodeForLink);
  const startCampaign = useGame((s) => s.startCampaign);

  const mods = researchModifiers(game.researchDone);

  const node = selection?.type === 'node' ? game.nodes.find((n) => n.id === selection.id) : undefined;
  const link = selection?.type === 'link' ? game.links.find((l) => l.id === selection.id) : undefined;
  const district = selection?.type === 'district' ? game.districts.find((d) => d.id === selection.id) : undefined;
  const building = selection?.type === 'building' ? game.buildings.find((b) => b.id === selection.id) : undefined;
  const buildingContract = building ? game.contracts.find((c) => c.buildingId === building.id) : undefined;
  const buildingRisk = buildingContract ? contractRisk(game, buildingContract) : null;
  const nodeMaintenance = node
    ? game.maintenanceOrders.find((order) => order.nodeId === node.id && order.status !== 'completed')
    : undefined;
  const districtCampaign = district ? activeCampaign(game, district.id) : undefined;
  const districtCampaignHistory = district
    ? game.campaignHistory
        .filter((result) => result.districtId === district.id)
        .slice(-3)
        .reverse()
    : [];
  const nodeMaxTier = node
    ? node.kind === 'core'
      ? mods.maxCoreTier
      : node.kind === 'tower'
        ? mods.maxTowerTier
        : NODE_SPECS[node.kind].maxTier
    : 0;
  const nextNodeCapacity =
    node && node.tier < nodeMaxTier
      ? effectiveNodeCapacity(node.kind, node.tier + 1, game.spectrum, game.researchDone)
      : null;
  const nextLinkCapacity =
    link && link.tier < mods.maxLinkTier ? linkCapacity(link.tier + 1) * mods.linkCapacityMul : null;

  // Topology only changes when something is added, removed or knocked out.
  const topology = `${game.nodes.length}:${game.links.length}:${game.nodes
    .filter((n) => n.down)
    .map((n) => n.id)
    .join(',')}:${game.links
    .filter((l) => l.down)
    .map((l) => l.id)
    .join(',')}`;

  const maintenanceCover = useMemo(
    () => (node ? servingCoverAfterLoss(game, node.id) : { others: 0, safe: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node?.id, topology],
  );

  const { redundant, connected } = useMemo(() => {
    if (!node) return { redundant: false, connected: false };
    const routes = computeRoutes(game);
    return {
      redundant: isRedundant(game, node.id, routes),
      connected: node.kind === 'core' ? !node.down : !!routes[node.id],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, topology]);

  const backup = useMemo(
    () => (node ? backupRouteEstimate(game, node.id) : null),
    // Traffic and the cash balance cannot change which fibre path is independent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node?.id, topology],
  );
  return (
    <AnimatePresence>
      {selection && (
        <motion.div
          key={selection.type + selection.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="panel scroll-thin absolute right-2 top-12 z-20 max-h-[calc(100%-160px)] w-[min(330px,calc(100%-16px))] overflow-y-auto border-white/[0.14] p-4 shadow-[0_24px_64px_-24px_rgba(0,0,0,.9)] sm:right-4 sm:top-4"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-neon-cyan/80 via-neon-cyan/20 to-transparent" />
          <button
            className="absolute right-3 top-3 text-white/40 hover:text-white"
            onClick={() => select(null)}
            aria-label="Close"
          >
            ✕
          </button>

          {node && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 pr-6">
                <SiteIcon
                  kind={node.kind}
                  tier={node.tier}
                  className="h-11 w-11 shrink-0"
                  title={`${NODE_SPECS[node.kind].label}, Tier ${node.tier}`}
                />
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-white/40">
                      {NODE_SPECS[node.kind].label}
                    </span>
                    <TierBadge tier={node.tier} maxTier={nodeMaxTier} compact />
                  </div>
                  <div className="truncate text-lg font-semibold leading-tight">{node.name}</div>
                  {node.down && (
                    <div className="mt-1 text-xs font-semibold text-neon-red">{t(locale, 'outOfService')}</div>
                  )}
                </div>
              </div>

              <Bar
                value={nodeUtil(node)}
                label="Capacity"
                right={`${node.trafficGbps.toFixed(1)} / ${node.capacityGbps.toFixed(0)} Gbps`}
              />
              <Bar value={1 - node.health / 100} label="Wear" right={`${Math.round(node.health)}% health`} />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="chip">
                  <div className="stat-label">{t(locale, 'pathToCore')}</div>
                  <div className={connected ? 'text-neon-lime' : 'text-neon-red'}>
                    {connected ? 'Live' : 'Isolated'}
                  </div>
                </div>
                <div className="chip">
                  <div className="stat-label">{t(locale, 'redundancy')}</div>
                  <div className={redundant ? 'text-neon-lime' : 'text-neon-amber'}>
                    {node.kind === 'core' ? 'n/a' : redundant ? 'Protected' : 'Single path'}
                  </div>
                </div>
              </div>

              {!node.down && (
                <button
                  className="btn w-full border-orange-300/30 text-xs text-orange-200"
                  onClick={() => beginDrill({ type: 'node', id: node.id })}
                >
                  {t(locale, 'testSiteFailure')}
                </button>
              )}
              {backup && (
                <div className="rounded-md border border-teal-300/25 bg-teal-300/5 p-3">
                  <div className="text-xs font-semibold text-teal-200">{t(locale, 'protectAgainstCut')}</div>
                  <p className="my-2 text-[11px] text-white/60">
                    Independent path via {backup.node.name}. Validated against every cut on the current route.
                  </p>
                  <button
                    className="btn-primary w-full text-xs"
                    disabled={game.money < backup.cost}
                    onClick={() => addBackupRoute(node.id)}
                  >
                    Build backup fibre · {fmtMoneyExact(backup.cost)}
                  </button>
                </div>
              )}
              {!redundant && node.kind !== 'core' && (
                <p className="text-[11px] leading-snug text-white/45">{t(locale, 'protectAgainstCutBlurb')}</p>
              )}

              {nextNodeCapacity !== null && (
                <div className="rounded-lg border border-neon-cyan/15 bg-neon-cyan/[0.045] p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="stat-label">{t(locale, 'upgradePreview')}</div>
                    <div className="num text-[10px] font-semibold text-neon-lime">
                      +{Math.round((nextNodeCapacity / Math.max(0.01, node.capacityGbps) - 1) * 100)}% capacity
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="rounded-md border border-white/[0.08] bg-black/10 p-2 text-center">
                      <TierBadge tier={node.tier} maxTier={nodeMaxTier} compact />
                      <div className="num mt-1 text-sm text-white/55">{node.capacityGbps.toFixed(1)}G</div>
                    </div>
                    <span className="text-neon-cyan/60">→</span>
                    <div className="rounded-md border border-neon-cyan/25 bg-neon-cyan/[0.06] p-2 text-center">
                      <TierBadge tier={node.tier + 1} maxTier={nodeMaxTier} compact />
                      <div className="num mt-1 text-sm font-semibold text-neon-cyan">
                        {nextNodeCapacity.toFixed(1)}G
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {nextNodeCapacity !== null && <InvestmentPreview kind={node.kind} nodeId={node.id} />}
              {nodeMaintenance ? (
                <div className="rounded-lg border border-neon-amber/25 bg-neon-amber/[0.06] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="stat-label text-neon-amber">{t(locale, 'plannedWork')}</span>
                    <span className="chip border-neon-amber/30 text-[9px] text-neon-amber">
                      {nodeMaintenance.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/55">
                    {MAINTENANCE_CONFIG[nodeMaintenance.mode].label} ·{' '}
                    {nodeMaintenance.status === 'active'
                      ? `${Math.ceil(nodeMaintenance.minutesLeft)} minutes left`
                      : 'waiting for its window and a free crew'}
                  </div>
                  {nodeMaintenance.status === 'scheduled' && (
                    <button
                      className="btn mt-2 w-full py-1 text-[11px]"
                      onClick={() => cancelMaintenance(nodeMaintenance.id)}
                    >
                      Call it off and refund {fmtMoneyExact(nodeMaintenance.cost)}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="stat-label mb-1.5">{t(locale, 'maintenanceWindow')}</div>
                  <div
                    className={`mb-2 rounded-md px-2 py-1.5 text-[10px] leading-snug ${maintenanceCover.safe ? 'bg-neon-lime/10 text-neon-lime' : 'bg-neon-red/10 text-neon-red'}`}
                  >
                    {maintenanceCover.safe
                      ? `${maintenanceCover.others} other site${maintenanceCover.others > 1 ? 's' : ''} can carry the district while this one is off.`
                      : 'Nothing else serves this district, so the work will black it out.'}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['urgent', 'overnight', 'defer'] as MaintenanceMode[]).map((mode) => (
                      <button
                        key={mode}
                        className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-left hover:border-neon-amber/35 hover:bg-neon-amber/[0.06]"
                        onClick={() => scheduleMaintenance(node.id, mode)}
                      >
                        <span className="block text-[11px] font-semibold">{MAINTENANCE_CONFIG[mode].label}</span>
                        <span className="num mt-0.5 block text-[10px] text-neon-amber">
                          {mode === 'defer' ? 'Free' : fmtMoneyExact(maintenanceCost(node, mode))}
                        </span>
                        <span className="mt-1 block text-[9px] leading-snug text-white/35">
                          {mode === 'urgent'
                            ? 'Now · short outage'
                            : mode === 'overnight'
                              ? '02:00 · lower cost'
                              : `Health ${Math.round(node.health)}% and falling`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={node.tier >= nodeMaxTier}
                  onClick={() => upgradeNode(node.id)}
                >
                  {node.tier >= nodeMaxTier
                    ? 'Max tier'
                    : `Upgrade · ${fmtMoneyExact(nodeUpgradeCost(node.kind, node.tier))}`}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setTool('fiber');
                    clickNodeForLink(node.id);
                  }}
                >
                  {t(locale, 'addFibre')}
                </button>
                <button className="btn-danger" onClick={() => sellNode(node.id)}>
                  {t(locale, 'decommission')}
                </button>
              </div>
            </div>
          )}

          {link && (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/40">{t(locale, 'fibreSpan')}</span>
                  <TierBadge tier={link.tier} maxTier={mods.maxLinkTier} compact />
                </div>
                <div className="text-base font-semibold leading-tight">
                  {game.nodes.find((n) => n.id === link.aId)?.name} ↔ {game.nodes.find((n) => n.id === link.bId)?.name}
                </div>
                {link.down && <div className="mt-1 text-xs font-semibold text-neon-red">{t(locale, 'spanDark')}</div>}
              </div>
              <Bar
                value={linkUtil(link)}
                label="Utilisation"
                right={`${link.trafficGbps.toFixed(1)} / ${link.capacityGbps.toFixed(0)} Gbps`}
              />
              {!link.down && (
                <button
                  className="btn w-full border-orange-300/30 text-xs text-orange-200"
                  onClick={() => beginDrill({ type: 'link', id: link.id })}
                >
                  {t(locale, 'testFibreCut')}
                </button>
              )}
              <div className="text-[11px] text-white/45">Length {link.length.toFixed(1)} km</div>
              {nextLinkCapacity !== null && (
                <div className="flex items-center justify-between rounded-lg border border-neon-blue/15 bg-neon-blue/[0.045] px-3 py-2 text-[11px]">
                  <span className="text-white/45">{t(locale, 'afterOpticsUpgrade')}</span>
                  <span className="num font-semibold text-neon-blue">
                    {link.capacityGbps.toFixed(0)}G → {nextLinkCapacity.toFixed(0)}G
                  </span>
                </div>
              )}
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

          {building && (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                  {buildingContract ? 'Enterprise client' : 'Building'}
                </div>
                <div className="text-lg font-semibold leading-tight">
                  {buildingContract?.clientName ?? game.districts.find((d) => d.id === building.districtId)?.name}
                </div>
                <div className="text-[11px] text-white/40">
                  {game.districts.find((d) => d.id === building.districtId)?.name} · {building.kind}
                </div>
              </div>

              {buildingContract && buildingRisk ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="chip">
                      <div className="stat-label">{t(locale, 'bandwidth')}</div>
                      <div className="num">{buildingContract.bandwidthGbps} Gbps</div>
                    </div>
                    <div className="chip">
                      <div className="stat-label">Monthly</div>
                      <div className="num">{fmtMoneyExact(buildingContract.monthlyRevenue)}</div>
                    </div>
                    <div className="chip">
                      <div className="stat-label">SLA</div>
                      <div className="num">{buildingContract.slaPercent}%</div>
                    </div>
                    <div className="chip">
                      <div className="stat-label">{t(locale, 'penaltiesPaid')}</div>
                      <div className="num">{fmtMoneyExact(buildingContract.penaltyPaid)}</div>
                    </div>
                  </div>

                  <Bar
                    value={buildingRisk.usage}
                    label="Downtime allowance used"
                    right={`${fmtMins(buildingContract.downtimeMinutes)} / ${fmtMins(buildingRisk.allowance)}`}
                  />

                  <div className="text-[10px] text-white/35">
                    Penalties are capped at {fmtMoneyExact(buildingContract.monthlyRevenue * SLA_PENALTY_CAP)} a month.
                  </div>

                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 text-[11px] leading-snug text-white/55">
                    {buildingRisk.districtOut
                      ? 'This district is down right now, and the allowance is burning.'
                      : buildingRisk.fragile
                        ? 'Every path to this client runs through one span. A single cut breaches the SLA.'
                        : buildingRisk.usage >= 1
                          ? 'The allowance is spent. Further downtime is charged as a penalty.'
                          : 'Service is within the agreed allowance.'}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="chip">
                    <div className="stat-label">{t(locale, 'households')}</div>
                    <div className="num">{fmtNum(building.households)}</div>
                  </div>
                  <div className="chip">
                    <div className="stat-label">{t(locale, 'connectedLabel')}</div>
                    <div className="num">{Math.round(building.connected * 100)}%</div>
                  </div>
                </div>
              )}
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
                  <div className="stat-label">{t(locale, 'population')}</div>
                  <div className="num">{fmtNum(district.population)}</div>
                </div>
                <div className="chip">
                  <div className="stat-label">{t(locale, 'potential')}</div>
                  <div className="num">{fmtNum(district.potential)}</div>
                </div>
                <div className="chip">
                  <div className="stat-label">Income</div>
                  <div className="capitalize">{district.incomeLevel}</div>
                </div>
                <div className="chip">
                  <div className="stat-label">{t(locale, 'yourCustomers')}</div>
                  <div className="num">{fmtNum(residentialSubs(game, district.id))}</div>
                </div>
              </div>

              <button className="btn w-full text-xs" onClick={() => useGame.getState().setScreen('market')}>
                {t(locale, 'openDistrictCompetition')}
              </button>
              <DistrictProjectCard districtId={district.id} />
              <DistrictLaunchProgress districtId={district.id} />
              <Bar value={district.coverage} label="Your coverage" />
              <Bar
                value={district.satisfaction / 100}
                label="Satisfaction"
                right={`${Math.round(district.satisfaction)}%`}
              />

              <div>
                <div className="stat-label mb-1">{t(locale, 'marketShare')}</div>
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

              {district.unlocked &&
                (districtCampaign ? (
                  <div className="rounded-lg border border-neon-lime/25 bg-neon-lime/[0.05] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-neon-lime">
                        {CAMPAIGN_CONFIG[districtCampaign.kind].label}
                      </span>
                      <span className="num text-[9px] text-white/45">
                        {Math.ceil((districtCampaign.endsAt - game.minutes) / 1440)}D LEFT
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] leading-relaxed text-white/45">
                      {CAMPAIGN_CONFIG[districtCampaign.kind].description}
                    </div>
                    <div className="num mt-2 grid grid-cols-3 gap-1 text-center text-[9px] text-white/45">
                      <span>
                        {Math.round(
                          residentialSubs(game, district.id) + district.mobileSubs - districtCampaign.baselineCustomers,
                        ) >= 0
                          ? '+'
                          : ''}
                        {Math.round(
                          residentialSubs(game, district.id) + district.mobileSubs - districtCampaign.baselineCustomers,
                        )}{' '}
                        customers
                      </span>
                      <span>{(district.satisfaction - districtCampaign.baselineSatisfaction).toFixed(1)} sat</span>
                      <span>
                        {game.contracts.filter((contract) => contract.districtId === district.id).length -
                          districtCampaign.baselineContracts >=
                        0
                          ? '+'
                          : ''}
                        {game.contracts.filter((contract) => contract.districtId === district.id).length -
                          districtCampaign.baselineContracts}{' '}
                        deals
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="stat-label mb-1.5">{t(locale, 'districtCampaign30')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        Object.entries(CAMPAIGN_CONFIG) as Array<[CampaignKind, (typeof CAMPAIGN_CONFIG)[CampaignKind]]>
                      ).map(([kind, campaign]) => {
                        const locked =
                          kind === 'mobile' && (!game.researchDone.includes('mobile_4g') || !game.spectrum.length);
                        return (
                          <button
                            key={kind}
                            disabled={locked}
                            onClick={() => startCampaign(district.id, kind)}
                            className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-left hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <span className="block truncate text-[10px] font-semibold">{campaign.label}</span>
                            <span className="num mt-0.5 block text-[9px]" style={{ color: campaign.color }}>
                              {fmtMoneyExact(campaign.cost)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-1.5 text-[9px] leading-relaxed text-white/30">
                      {t(locale, 'districtCampaignBlurb')}
                    </div>
                  </div>
                ))}

              {districtCampaignHistory.length > 0 && (
                <div>
                  <div className="stat-label mb-1.5">{t(locale, 'recentCampaignResults')}</div>
                  <div className="space-y-1">
                    {districtCampaignHistory.map((result) => (
                      <div
                        key={result.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 rounded-md bg-white/[0.03] px-2 py-1.5 text-[9px]"
                      >
                        <span className="truncate" style={{ color: CAMPAIGN_CONFIG[result.kind].color }}>
                          {CAMPAIGN_CONFIG[result.kind].label}
                        </span>
                        <span className="num text-white/50">
                          {result.customerDelta >= 0 ? '+' : ''}
                          {Math.round(result.customerDelta)} subs
                        </span>
                        <span className="num text-white/50">
                          {result.contractDelta >= 0 ? '+' : ''}
                          {result.contractDelta} deals
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!district.unlocked ? (
                <button className="btn-primary w-full" onClick={() => unlockDistrict(district.id)}>
                  Buy licence · {fmtMoneyExact(district.entryCost)}
                </button>
              ) : (
                <p className="text-[11px] leading-snug text-white/45">{t(locale, 'placePopHere')}</p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
