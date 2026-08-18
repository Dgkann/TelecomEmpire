import { TRANSIT_TIERS } from './constants';
import { computeRoutes, isRedundant, linkUtil, nodeUtil } from './network';
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
    | { type: 'screen'; id: 'network' | 'company' };
}

export function contractRisk(state: GameState, contract: EnterpriseContract) {
  const allowance = Math.max(1, 43200 * (1 - contract.slaPercent / 100));
  const districtOut = Boolean(state.stats.outages[contract.districtId]);
  const serving = state.nodes.filter(
    (n) => n.districtId === contract.districtId && (n.kind === 'pop' || n.kind === 'access') && !n.down,
  );
  const routes = computeRoutes(state);
  const fragile = serving.length > 0 && serving.every((n) => !isRedundant(state, n.id, routes));
  const usage = contract.downtimeMinutes / allowance;
  const score = Math.min(1, usage + (districtOut ? 0.55 : 0) + (fragile ? 0.18 : 0) + state.stats.packetLoss * 0.45);
  return { allowance, usage, score, districtOut, fragile };
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
      detail: `${isLink ? 'Fibre span' : hottestNode?.name ?? 'Site'} is the current network bottleneck.`,
      action: 'Inspect bottleneck',
      target: { type: isLink ? 'link' : 'node', id: item!.id, gx: anchor?.gx ?? 0, gy: anchor?.gy ?? 0 },
    });
  }

  // Upstream capacity is the one bottleneck the map cannot show, because it
  // sits off the edge of the city. Left unflagged, a player watches every site
  // read healthy while satisfaction falls everywhere at once.
  const transitCap = TRANSIT_TIERS[state.transitTier].capacity * (state.backupTransit ? 1.35 : 1);
  const peak = Math.max(state.stats.demandGbps, ...state.demandHistory.slice(-7));
  const transitUse = peak / Math.max(0.01, transitCap);
  const nextTransit = TRANSIT_TIERS[state.transitTier + 1];
  if (transitUse >= 0.75 && nextTransit) {
    const over = transitUse >= 1;
    insights.push({
      id: 'transit-headroom',
      severity: over ? 'critical' : 'warning',
      title: over ? 'Upstream transit is saturated' : `Transit at ${Math.round(transitUse * 100)}% of capacity`,
      detail: over
        ? `Peak demand is ${peak.toFixed(1)} Gbps against ${transitCap.toFixed(0)} Gbps upstream. Every district is losing satisfaction, and no site upgrade can fix it.`
        : `Peak demand is ${peak.toFixed(1)} Gbps of ${transitCap.toFixed(0)} Gbps. ${nextTransit.label} carries ${nextTransit.capacity} Gbps.`,
      action: 'Open transit',
      target: { type: 'screen', id: 'network' },
    });
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
      detail: risky.risk.fragile ? 'The client depends on a single network path.' : 'Downtime is consuming this month’s SLA allowance.',
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
    .sort((a, b) => ({ critical: 0, warning: 1, opportunity: 2 })[a.severity] - ({ critical: 0, warning: 1, opportunity: 2 })[b.severity])
    .slice(0, 3);
}
