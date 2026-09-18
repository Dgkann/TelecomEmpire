import { effectiveNodeCapacity } from './capacity';
import { plural } from './util';
import { line } from './lang';
import { FIBER_UPGRADE_COST_PER_UNIT, NODE_SPECS, TRANSIT_TIERS, linkCapacity, nodeUpgradeCost } from './constants';
import { monthlyBreakdown } from './economy';
import { recordLedger } from './financeLedger';
import { loadServices } from './network';
import { researchModifiers } from './research';
import { allocateTransit, offeredTraffic, pushLog, trafficClassOf } from './simulation';
import { INTERCONNECT_CONFIG, interconnectOperational } from './strategy';
import type { GameState, ServiceTraffic } from './types';

export interface CapacityUpgrade {
  type: 'node' | 'link' | 'transit';
  id: string;
  tier: number;
}
export interface LabScenario {
  multiplier: number;
  cutLinkId: string | null;
}
export const upgradeKey = (item: Pick<CapacityUpgrade, 'type' | 'id'>) => `${item.type}:${item.id}`;

export function capacityOptions(state: GameState, locale: 'en' | 'tr' = 'en') {
  const tr = locale === 'tr';
  const mods = researchModifiers(state.researchDone);
  const nodes = new Map(state.nodes.map((n) => [n.id, n]));
  return [
    ...state.nodes.map((n) => ({
      type: 'node' as const,
      id: n.id,
      tier: n.tier,
      label: n.name,
      capacity: n.capacityGbps,
      nextCapacity: effectiveNodeCapacity(n.kind, n.tier + 1, state.spectrum, state.researchDone),
      cost: nodeUpgradeCost(n.kind, n.tier),
      issue:
        n.kind === 'datacenter' && n.tier === 0 && !state.researchDone.includes('edge_compute')
          ? tr
            ? 'Bu veri merkezini genişletmek için uç bilişimi araştır.'
            : 'Research edge compute to expand this data centre.'
          : n.down || state.incidents.some((i) => !i.resolved && i.targetType === 'node' && i.targetId === n.id)
            ? tr
              ? 'Önce noktadaki arızayı gider.'
              : 'Resolve the site fault first.'
            : state.maintenanceOrders.some((o) => o.nodeId === n.id && o.status !== 'completed')
              ? tr
                ? 'Önce planlı bakımı bitir.'
                : 'Finish planned maintenance first.'
              : n.tier >=
                  (n.kind === 'core'
                    ? mods.maxCoreTier
                    : n.kind === 'tower'
                      ? mods.maxTowerTier
                      : NODE_SPECS[n.kind].maxTier)
                ? tr
                  ? 'Mevcut en yüksek seviye. Araştırma daha fazlasını açabilir.'
                  : 'Maximum available tier. Research may unlock more.'
                : null,
    })),
    ...state.links.map((l) => ({
      type: 'link' as const,
      id: l.id,
      tier: l.tier,
      label: `${nodes.get(l.aId)?.name ?? (tr ? 'Eksik nokta' : 'Missing site')} / ${nodes.get(l.bId)?.name ?? (tr ? 'Eksik nokta' : 'Missing site')}`,
      capacity: l.capacityGbps,
      nextCapacity: linkCapacity(l.tier + 1) * mods.linkCapacityMul,
      cost: Math.round(l.length * FIBER_UPGRADE_COST_PER_UNIT * l.tier),
      issue:
        l.down || state.incidents.some((i) => !i.resolved && i.targetType === 'link' && i.targetId === l.id)
          ? tr
            ? 'Önce fiberi onar.'
            : 'Repair the fibre first.'
          : l.tier >= mods.maxLinkTier
            ? tr
              ? 'Daha üst sınıf optik araştırma gerektirir.'
              : 'Higher grade optics need research.'
            : null,
    })),
    {
      type: 'transit' as const,
      id: 'upstream',
      tier: state.transitTier,
      label: tr ? 'Üst bağlantı transiti' : 'Upstream transit',
      capacity: TRANSIT_TIERS[state.transitTier].capacity,
      nextCapacity: TRANSIT_TIERS[Math.min(TRANSIT_TIERS.length - 1, state.transitTier + 1)].capacity,
      cost: 0,
      issue:
        state.transitTier >= TRANSIT_TIERS.length - 1
          ? tr
            ? 'En yüksek transit planı etkin.'
            : 'Highest transit plan active.'
          : null,
    },
  ];
}

// One tier per asset per order. Validate the whole order before applying any charge.
export function capacityPlan(state: GameState, items: CapacityUpgrade[], locale: 'en' | 'tr' = 'en') {
  const tr = locale === 'tr';
  const options = new Map(capacityOptions(state, locale).map((o) => [upgradeKey(o), o]));
  const unique = new Set<string>();
  let error: string | null = state.gameOver
    ? tr
      ? 'Bu şirket kapandı.'
      : 'This company has closed.'
    : items.length > 32
      ? tr
        ? 'En fazla 32 yükseltme seç.'
        : 'Choose up to 32 upgrades.'
      : null;
  let cost = 0;
  for (const item of items) {
    const key = upgradeKey(item),
      option = options.get(key);
    if (!option || option.tier !== item.tier)
      error ??= tr
        ? 'Şebeke değişti. Anlık görüntüyü yenile ve planını gözden geçir.'
        : 'The network changed. Refresh the snapshot and review your plan.';
    else if (option.issue) error ??= option.issue;
    else cost += option.cost;
    if (unique.has(key))
      error ??= tr ? 'Bir varlık emirde yalnızca bir kez yer alabilir.' : 'An asset can appear only once in an order.';
    unique.add(key);
  }
  const next: GameState = error
    ? state
    : {
        ...state,
        nodes: state.nodes.map((n) =>
          unique.has(`node:${n.id}`)
            ? {
                ...n,
                tier: n.tier + 1,
                capacityGbps: options.get(`node:${n.id}`)!.nextCapacity,
                health: Math.max(n.health, 92),
                servicedAt: state.minutes,
              }
            : n,
        ),
        links: state.links.map((l) =>
          unique.has(`link:${l.id}`)
            ? {
                ...l,
                tier: l.tier + 1,
                capacityGbps: options.get(`link:${l.id}`)!.nextCapacity,
              }
            : l,
        ),
        transitTier: state.transitTier + (unique.has('transit:upstream') ? 1 : 0),
      };
  const mods = researchModifiers(state.researchDone);
  return {
    state: next,
    cost,
    error,
    affordable: cost <= state.money,
    monthly: monthlyBreakdown(next, mods).totalCost - monthlyBreakdown(state, mods).totalCost,
  };
}

export function commissionCapacityPlan(state: GameState, items: CapacityUpgrade[]): GameState | null {
  if (!items.length) return null;
  const plan = capacityPlan(state, items);
  if (plan.error || !plan.affordable) return null;
  const next = { ...plan.state, money: state.money - plan.cost };
  recordLedger(
    next,
    'network_upgrade',
    line(
      `Capacity programme: ${items.length} ${plural(items.length, 'upgrade')}`,
      `Kapasite programı: ${items.length} yükseltme`,
    ),
    -plan.cost,
  );
  pushLog(
    next,
    line(
      `${items.length} ${plural(items.length, 'capacity upgrade')} commissioned.`,
      `${items.length} kapasite yükseltmesi sipariş edildi.`,
    ),
    'good',
  );
  return next;
}

// Snapshot test: identical service routing and transit priorities to the live sim.
// No clock, RNG, subscriber growth, billing or fault creation is advanced here.
export function testCapacity(state: GameState, scenario: LabScenario) {
  const sample = scenario.cutLinkId
    ? { ...state, links: state.links.map((l) => (l.id === scenario.cutLinkId ? { ...l, down: true } : l)) }
    : state;
  const { services: offered, routes, priorities } = offeredTraffic(sample);
  const factor = Number.isFinite(scenario.multiplier) ? Math.max(1, Math.min(4, scenario.multiplier)) : 1;
  const services = offered.map((s) => ({ ...s, demandGbps: s.demandGbps * factor }));
  const load = loadServices(sample, services, routes, researchModifiers(sample.researchDone).hasAutoBalance);
  const transitCapacity =
    TRANSIT_TIERS[sample.transitTier].capacity * (sample.backupTransit ? 1.35 : 1) +
    (interconnectOperational(sample, routes) ? INTERCONNECT_CONFIG[sample.interconnectPlan].capacityBonus : 0);
  const upstream: ServiceTraffic = { residential: 0, business: 0, mobile: 0, wholesale: 0, workload: 0 };
  for (const service of services)
    upstream[trafficClassOf(service.id)] += service.demandGbps * (load.serviceServed[service.id] ?? 0);
  const carried = allocateTransit(upstream, priorities, transitCapacity);
  const districts = sample.districts.map((district) => {
    let demand = 0,
      served = 0;
    for (const service of services) {
      if (service.districtId !== district.id) continue;
      const kind = trafficClassOf(service.id);
      demand += service.demandGbps;
      served +=
        service.demandGbps *
        (load.serviceServed[service.id] ?? 0) *
        (upstream[kind] > 0 ? carried[kind] / upstream[kind] : 1);
    }
    return { id: district.id, name: district.name, demand, served, delivery: demand > 0 ? served / demand : 1 };
  });
  const pressure = new Map<string, number>();
  for (const n of sample.nodes)
    pressure.set(`node:${n.id}`, (load.offeredNodeTraffic[n.id] ?? 0) / Math.max(0.001, n.capacityGbps));
  for (const l of sample.links)
    pressure.set(`link:${l.id}`, (load.offeredLinkTraffic[l.id] ?? 0) / Math.max(0.001, l.capacityGbps));
  pressure.set('transit:upstream', load.totalServed / Math.max(0.001, transitCapacity));
  const served = districts.reduce((sum, d) => sum + d.served, 0);
  return {
    districts,
    pressure,
    demand: load.totalDemand,
    served,
    delivery: load.totalDemand > 0 ? served / load.totalDemand : 1,
  };
}
