import { BASELINE_ARPU, TRANSIT_TIERS } from './constants';
import { priceIndex } from './economy';
import { computeRoutes, isRedundant, linkUtil, nodeUtil, servingCapacity } from './network';
import { INTERCONNECT_CONFIG, interconnectOperational } from './strategy';
import type { EnterpriseContract, GameState } from './types';

export type InsightSeverity = 'critical' | 'warning' | 'opportunity';

export interface OperationsInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  action: string;
  target:
    | { type: 'node' | 'link' | 'district' | 'building'; id: string; gx: number; gy: number }
    | { type: 'screen'; id: 'network' | 'company'; anchor?: string };
}

// Shown as a price relative to the market reference, which reads better than an index.
const fmtIndex = (i: number) => `$${Math.round(i * BASELINE_ARPU)}`;

export function contractRisk(state: GameState, contract: EnterpriseContract) {
  const allowance = Math.max(1, 43200 * (1 - contract.slaPercent / 100));
  const districtOut = Boolean(state.stats.outages[contract.districtId]);
  const serving = state.nodes.filter(
    (n) => n.districtId === contract.districtId && (n.kind === 'pop' || n.kind === 'access') && !n.down,
  );
  const routes = computeRoutes(state);
  const fragile = serving.length > 0 && serving.every((n) => !isRedundant(state, n.id, routes));
  const usage = contract.downtimeMinutes / allowance;
  const businessDemand = state.stats.serviceDemandGbps.business;
  const businessDelivery = businessDemand > 0 ? state.stats.serviceServedGbps.business / businessDemand : 1;
  const deliveryRisk = Math.max(0, 1 - businessDelivery);
  const score = Math.min(1, usage + (districtOut ? 0.55 : 0) + (fragile ? 0.18 : 0) + deliveryRisk * 0.8);
  return { allowance, usage, score, districtOut, fragile, businessDelivery };
}

export function operationsInsights(state: GameState): OperationsInsight[] {
  const insights: OperationsInsight[] = [];
  const nodeById = new Map(state.nodes.map((n) => [n.id, n]));

  for (const incident of state.incidents.filter((i) => !i.resolved && i.assignedTechId === null).slice(0, 2)) {
    const node = incident.targetType === 'node' ? nodeById.get(incident.targetId) : undefined;
    const link = incident.targetType === 'link' ? state.links.find((l) => l.id === incident.targetId) : undefined;
    const a = link ? nodeById.get(link.aId) : undefined;
    insights.push({
      id: `incident-${incident.id}`,
      severity: 'critical',
      title: `Unassigned: ${incident.title}`,
      detail: `${incident.affected.toLocaleString()} customers are exposed while no crew is dispatched.`,
      action: 'Open incident',
      target: {
        type: incident.targetType,
        id: incident.targetId,
        gx: node?.gx ?? a?.gx ?? 0,
        gy: node?.gy ?? a?.gy ?? 0,
      },
    });
  }

  const hottestLink = [...state.links].sort((a, b) => linkUtil(b) - linkUtil(a))[0];
  const hottestNode = [...state.nodes].sort((a, b) => nodeUtil(b) - nodeUtil(a))[0];
  const linkPressure = hottestLink ? linkUtil(hottestLink) : 0;
  const nodePressure = hottestNode ? nodeUtil(hottestNode) : 0;
  if (Math.max(linkPressure, nodePressure) >= 0.78) {
    const isLink = linkPressure >= nodePressure;
    const item = isLink ? hottestLink : hottestNode;
    const anchor = isLink && hottestLink ? nodeById.get(hottestLink.aId) : hottestNode;
    insights.push({
      id: `capacity-${item?.id}`,
      severity: Math.max(linkPressure, nodePressure) >= 0.95 ? 'critical' : 'warning',
      title: `${Math.round(Math.max(linkPressure, nodePressure) * 100)}% capacity pressure`,
      detail: `${isLink ? 'Fibre span' : (hottestNode?.name ?? 'Site')} is the current network bottleneck.`,
      action: 'Inspect bottleneck',
      target: { type: isLink ? 'link' : 'node', id: item!.id, gx: anchor?.gx ?? 0, gy: anchor?.gy ?? 0 },
    });
  }

  // The one bottleneck the map cannot draw.
  const routesForTransit = computeRoutes(state);
  const interconnect = interconnectOperational(state, routesForTransit)
    ? INTERCONNECT_CONFIG[state.interconnectPlan]
    : INTERCONNECT_CONFIG.transit;
  const transitCap =
    TRANSIT_TIERS[state.transitTier].capacity * (state.backupTransit ? 1.35 : 1) + interconnect.capacityBonus;
  const peak = state.stats.transitGbps;
  const transitUse = peak / Math.max(0.01, transitCap);
  const nextTransit = TRANSIT_TIERS[state.transitTier + 1];
  if (transitUse >= 0.75 && nextTransit) {
    const over = transitUse >= 1;
    insights.push({
      id: 'transit-headroom',
      severity: over ? 'critical' : 'warning',
      title: over ? 'Upstream transit is saturated' : `Transit at ${Math.round(transitUse * 100)}% of capacity`,
      // The panel clamps this to two lines, so both readings must fit.
      detail: over
        ? `${peak.toFixed(1)} of ${transitCap.toFixed(0)} Gbps upstream. More sites will not help, only transit.`
        : `${peak.toFixed(1)} of ${transitCap.toFixed(0)} Gbps used. ${nextTransit.label} carries ${nextTransit.capacity} Gbps.`,
      action: 'Open transit',
      target: { type: 'screen', id: 'network', anchor: 'transit' },
    });
  }

  if (state.interconnectPlan === 'cdn' && !interconnectOperational(state, routesForTransit)) {
    insights.push({
      id: 'cdn-suspended',
      severity: 'warning',
      title: 'CDN partnership is suspended',
      detail: 'The monthly commitment remains due, but no routed data centre is available to deliver its benefits.',
      action: 'Review interconnect',
      target: { type: 'screen', id: 'network', anchor: 'interconnect' },
    });
  }

  const wholesaleDemand = state.stats.serviceDemandGbps.wholesale;
  const wholesaleDelivery =
    wholesaleDemand > 0 ? state.stats.serviceServedGbps.wholesale / Math.max(0.001, wholesaleDemand) : 1;
  if ((state.wholesaleFixed || state.mvnoEnabled) && wholesaleDemand > 0 && wholesaleDelivery < 0.9) {
    insights.push({
      id: 'wholesale-delivery',
      severity: wholesaleDelivery < 0.65 ? 'critical' : 'warning',
      title: `Wholesale delivery is ${Math.round(wholesaleDelivery * 100)}%`,
      detail: 'Partner income scales with carried traffic. Add upstream headroom or change the traffic policy.',
      action: 'Review service policy',
      target: { type: 'screen', id: 'network', anchor: 'traffic-policy' },
    });
  }

  const queuedMaintenance = state.maintenanceOrders.filter((order) => order.status === 'scheduled').length;
  if (queuedMaintenance > 0 && state.technicians.every((technician) => technician.state !== 'idle')) {
    insights.push({
      id: 'maintenance-queue',
      severity: 'warning',
      title: `${queuedMaintenance} maintenance job${queuedMaintenance === 1 ? '' : 's'} waiting`,
      detail: 'Every field crew is occupied, so planned work cannot begin on schedule.',
      action: 'Review operations',
      target: { type: 'screen', id: 'network', anchor: 'maintenance' },
    });
  }

  const endingCampaign = [...state.campaigns].sort((a, b) => a.endsAt - b.endsAt)[0];
  if (endingCampaign && endingCampaign.endsAt - state.minutes <= 2 * 1440) {
    const district = state.districts.find((entry) => entry.id === endingCampaign.districtId);
    insights.push({
      id: `campaign-ending-${endingCampaign.id}`,
      severity: 'opportunity',
      title: `${district?.name ?? 'District'} campaign ends soon`,
      detail: 'Review its live customer and satisfaction lift before committing the next budget.',
      action: 'Review campaign',
      target: district
        ? { type: 'district', id: district.id, gx: district.center.gx, gy: district.center.gy }
        : { type: 'screen', id: 'company' },
    });
  }

  // Price moves the rivals' pull as hard as coverage does, but nothing ever suggested touching it.
  const rivals = state.competitors;
  if (rivals.length) {
    const mine = priceIndex(state);
    const market = rivals.reduce((sum, c) => sum + c.priceIndex, 0) / rivals.length;
    const gap = mine / Math.max(0.01, market);
    const load = state.stats.demandGbps / Math.max(0.01, servingCapacity(state.nodes));
    if (gap > 1.18) {
      insights.push({
        id: 'pricing-high',
        severity: 'warning',
        title: `You are ${Math.round((gap - 1) * 100)}% above the market`,
        detail: `Rivals average ${fmtIndex(market)} against your ${fmtIndex(mine)}. Every switcher weighs that.`,
        action: 'Review pricing',
        target: { type: 'screen', id: 'company', anchor: 'pricing' },
      });
    } else if (gap < 0.88 && load < 0.6) {
      insights.push({
        id: 'pricing-low',
        severity: 'opportunity',
        title: 'You are the cheapest operator in town',
        detail: `Rivals average ${fmtIndex(market)} against your ${fmtIndex(mine)}, and the network is ${Math.round(load * 100)}% full.`,
        action: 'Review pricing',
        target: { type: 'screen', id: 'company', anchor: 'pricing' },
      });
    }
  }

  const risky = state.contracts
    .map((contract) => ({ contract, risk: contractRisk(state, contract) }))
    .sort((a, b) => b.risk.score - a.risk.score)[0];
  if (risky && risky.risk.score >= 0.2) {
    const building = state.buildings.find((b) => b.id === risky.contract.buildingId);
    insights.push({
      id: `sla-${risky.contract.id}`,
      severity: risky.risk.score >= 0.65 ? 'critical' : 'warning',
      title: `${risky.contract.clientName} SLA at risk`,
      detail: risky.risk.fragile
        ? 'The client depends on a single network path.'
        : 'Downtime is consuming this month’s SLA allowance.',
      action: 'Review contract',
      target: building
        ? { type: 'building', id: building.id, gx: building.gx, gy: building.gy }
        : { type: 'screen', id: 'company' },
    });
  }

  const growth = [...state.districts]
    .filter((d) => d.unlocked && d.coverage < 0.55)
    .sort((a, b) => b.potential * (1 - b.coverage) - a.potential * (1 - a.coverage))[0];
  if (growth) {
    insights.push({
      id: `growth-${growth.id}`,
      severity: 'opportunity',
      title: `${growth.name} has room to grow`,
      detail: `${Math.round(growth.coverage * 100)}% coverage leaves high-value demand unserved.`,
      action: 'Open district',
      target: { type: 'district', id: growth.id, gx: growth.center.gx, gy: growth.center.gy },
    });
  }

  return insights
    .sort(
      (a, b) =>
        ({ critical: 0, warning: 1, opportunity: 2 })[a.severity] -
        { critical: 0, warning: 1, opportunity: 2 }[b.severity],
    )
    .slice(0, 3);
}
