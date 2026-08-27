import type { GameState, NetLink, NetNode } from './types';

// Traffic is not simulated packet by packet.

export interface Adjacency {
  [nodeId: string]: Array<{ linkId: string; otherId: string; length: number }>;
}

export function buildAdjacency(state: GameState, ignoreLinkId?: string): Adjacency {
  const adj: Adjacency = {};
  for (const n of state.nodes) adj[n.id] = [];
  for (const l of state.links) {
    if (l.down || l.id === ignoreLinkId) continue;
    const a = state.nodes.find((n) => n.id === l.aId);
    const b = state.nodes.find((n) => n.id === l.bId);
    if (!a || !b || a.down || b.down) continue;
    adj[l.aId]?.push({ linkId: l.id, otherId: l.bId, length: l.length });
    adj[l.bId]?.push({ linkId: l.id, otherId: l.aId, length: l.length });
  }
  return adj;
}

export interface RouteInfo {
  path: string[];
  hops: string[];
  distance: number;
  coreId: string;
}

export function computeRoutes(state: GameState, ignoreLinkId?: string): Record<string, RouteInfo> {
  const adj = buildAdjacency(state, ignoreLinkId);
  const dist: Record<string, number> = {};
  const prev: Record<string, { linkId: string; from: string } | null> = {};
  const coreOf: Record<string, string> = {};
  const visited = new Set<string>();
  const queue: Array<{ id: string; d: number }> = [];

  for (const n of state.nodes) {
    if (n.kind === 'core' && !n.down) {
      dist[n.id] = 0;
      prev[n.id] = null;
      coreOf[n.id] = n.id;
      queue.push({ id: n.id, d: 0 });
    }
  }

  while (queue.length) {
    queue.sort((a, b) => a.d - b.d);
    const cur = queue.shift()!;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    for (const edge of adj[cur.id] ?? []) {
      const nd = cur.d + edge.length;
      if (dist[edge.otherId] === undefined || nd < dist[edge.otherId]) {
        dist[edge.otherId] = nd;
        prev[edge.otherId] = { linkId: edge.linkId, from: cur.id };
        coreOf[edge.otherId] = coreOf[cur.id];
        queue.push({ id: edge.otherId, d: nd });
      }
    }
  }

  const routes: Record<string, RouteInfo> = {};
  for (const n of state.nodes) {
    if (dist[n.id] === undefined) continue;
    const path: string[] = [];
    const hops: string[] = [];
    let cursor = n.id;
    let guard = 0;
    while (prev[cursor] && guard++ < 200) {
      path.push(prev[cursor]!.linkId);
      cursor = prev[cursor]!.from;
      hops.push(cursor);
    }
    routes[n.id] = { path, hops, distance: dist[n.id], coreId: coreOf[n.id] };
  }
  return routes;
}

// Redundant means it still reaches a core after any single link on its path is cut.
export function isRedundant(state: GameState, nodeId: string, routes: Record<string, RouteInfo>): boolean {
  const route = routes[nodeId];
  if (!route || route.path.length === 0) return false;
  for (const linkId of route.path) {
    const alt = computeRoutes(state, linkId);
    if (!alt[nodeId]) return false;
  }
  return true;
}

// How many of the district's sites survive losing any single span.
export function districtRedundancy(state: GameState, districtId: string) {
  const routes = computeRoutes(state);
  const serving = servingNodes(state, districtId).filter((n) => routes[n.id]);
  const done = serving.filter((n) => isRedundant(state, n.id, routes)).length;
  return { done, total: serving.length, complete: serving.length > 0 && done === serving.length };
}

export function districtIsRedundant(state: GameState, districtId: string): boolean {
  return districtRedundancy(state, districtId).complete;
}

// Planned work powers a site down, so only another serving site keeps a district alive.
export function servingCoverAfterLoss(state: GameState, nodeId: string): { others: number; safe: boolean } {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return { others: 0, safe: true };
  const without = { ...state, nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, down: true } : n)) };
  const routes = computeRoutes(without);
  const others = servingNodes(without, node.districtId).filter(
    (n) => n.id !== nodeId && !n.down && routes[n.id],
  ).length;
  return { others, safe: others > 0 };
}

export function servingNodes(
  state: GameState,
  districtId: string,
  kinds: NetNode['kind'][] = ['pop', 'access'],
): NetNode[] {
  return state.nodes.filter((n) => n.districtId === districtId && kinds.includes(n.kind) && !n.down);
}

export interface LoadResult {
  nodeTraffic: Record<string, number>;
  linkTraffic: Record<string, number>;
  // districtId -> served fraction of its demand (0..1).
  districtServed: Record<string, number>;
  // districtId -> worst utilisation on its path (can exceed 1).
  districtPressure: Record<string, number>;
  districtOutage: Record<string, boolean>;
  totalDemand: number;
  totalServed: number;
}

export interface TrafficService {
  id: string;
  districtId: string;
  demandGbps: number;
  servingNodeIds: string[];
  // Relative share of a congested resource. One preserves the old balanced behaviour.
  priority?: number;
}

export interface ServiceLoadResult {
  nodeTraffic: Record<string, number>;
  linkTraffic: Record<string, number>;
  serviceServed: Record<string, number>;
  servicePressure: Record<string, number>;
  serviceOutage: Record<string, boolean>;
  totalDemand: number;
  totalServed: number;
}

// districtDemand is in Gbps at the current time of day.
export function loadNetwork(
  state: GameState,
  districtDemand: Record<string, number>,
  routes: Record<string, RouteInfo>,
  // Share by what each node delivers end to end, not by the size of the box.
  autoBalance = false,
): LoadResult {
  const services = state.districts.map((district) => ({
    id: district.id,
    districtId: district.id,
    demandGbps: districtDemand[district.id] ?? 0,
    servingNodeIds: servingNodes(state, district.id).map((node) => node.id),
  }));
  const result = loadServices(state, services, routes, autoBalance);
  return {
    nodeTraffic: result.nodeTraffic,
    linkTraffic: result.linkTraffic,
    districtServed: result.serviceServed,
    districtPressure: result.servicePressure,
    districtOutage: result.serviceOutage,
    totalDemand: result.totalDemand,
    totalServed: result.totalServed,
  };
}

export function loadServices(
  state: GameState,
  services: TrafficService[],
  routes: Record<string, RouteInfo>,
  autoBalance = false,
): ServiceLoadResult {
  // Collect all offered load before measuring shared bottlenecks to avoid district-order bias.
  const offeredNodeTraffic: Record<string, number> = {};
  const offeredLinkTraffic: Record<string, number> = {};
  const weightedNodeTraffic: Record<string, number> = {};
  const weightedLinkTraffic: Record<string, number> = {};
  const nodeTraffic: Record<string, number> = {};
  const linkTraffic: Record<string, number> = {};
  const serviceServed: Record<string, number> = {};
  const servicePressure: Record<string, number> = {};
  const serviceOutage: Record<string, boolean> = {};
  let totalDemand = 0;
  let totalServed = 0;

  for (const n of state.nodes) {
    offeredNodeTraffic[n.id] = 0;
    weightedNodeTraffic[n.id] = 0;
    nodeTraffic[n.id] = 0;
  }
  for (const l of state.links) {
    offeredLinkTraffic[l.id] = 0;
    weightedLinkTraffic[l.id] = 0;
    linkTraffic[l.id] = 0;
  }

  const nodeById: Record<string, NetNode> = {};
  for (const n of state.nodes) nodeById[n.id] = n;
  const linkById: Record<string, NetLink> = {};
  for (const l of state.links) linkById[l.id] = l;

  interface PlannedFlow {
    node: NetNode;
    route: RouteInfo;
    offered: number;
    priority: number;
  }
  const planned: Record<string, PlannedFlow[]> = {};

  for (const service of services) {
    const demand = service.demandGbps;
    const priority = Math.max(0.1, service.priority ?? 1);
    totalDemand += demand;
    if (demand <= 0) {
      serviceServed[service.id] = 1;
      servicePressure[service.id] = 0;
      serviceOutage[service.id] = false;
      continue;
    }

    const serving = service.servingNodeIds
      .map((id) => nodeById[id])
      .filter((node): node is NetNode => Boolean(node && !node.down && routes[node.id]));
    if (serving.length === 0) {
      serviceServed[service.id] = 0;
      servicePressure[service.id] = 2;
      serviceOutage[service.id] = true;
      continue;
    }

    const weightOf = (n: NetNode) => {
      if (!autoBalance) return Math.max(0, n.capacityGbps);
      const route = routes[n.id];
      if (!route) return Math.max(0, n.capacityGbps);
      let cap = Math.max(0, n.capacityGbps);
      for (const linkId of route.path) {
        const link = linkById[linkId];
        if (link) cap = Math.min(cap, link.capacityGbps);
      }
      for (const hopId of route.hops) {
        const hop = nodeById[hopId];
        if (hop) cap = Math.min(cap, hop.capacityGbps);
      }
      return Math.max(cap, n.capacityGbps * 0.15);
    };

    const weights = serving.map((node) => ({ node, weight: weightOf(node) }));
    const totalCap = weights.reduce((sum, item) => sum + item.weight, 0);
    if (totalCap <= 0) {
      serviceServed[service.id] = 0;
      servicePressure[service.id] = 2;
      serviceOutage[service.id] = false;
      continue;
    }

    const flows: PlannedFlow[] = [];
    for (const { node, weight } of weights) {
      const share = (weight / totalCap) * demand;
      if (share <= 0) continue;
      const route = routes[node.id];
      const flow = { node, route, offered: share, priority };
      flows.push(flow);
      offeredNodeTraffic[node.id] += share;
      weightedNodeTraffic[node.id] += share * priority;
      for (const linkId of route.path) {
        offeredLinkTraffic[linkId] += share;
        weightedLinkTraffic[linkId] += share * priority;
      }
      for (const hopId of route.hops) {
        offeredNodeTraffic[hopId] += share;
        weightedNodeTraffic[hopId] += share * priority;
      }
    }
    planned[service.id] = flows;
  }

  // Scale each district's flows by its worst final path pressure to conserve shared capacity.
  for (const service of services) {
    const demand = service.demandGbps;
    if (demand <= 0 || serviceOutage[service.id]) continue;
    const flows = planned[service.id] ?? [];
    if (!flows.length) continue;

    let worstPressure = 0;
    let servedFraction = 1;
    let blocked = false;
    const recordPressure = (traffic: number, weightedTraffic: number, capacity: number, priority: number) => {
      if (traffic <= 0) return;
      if (capacity <= 0) {
        blocked = true;
        worstPressure = Math.max(worstPressure, 2);
        servedFraction = 0;
        return;
      }
      if (traffic <= capacity) {
        worstPressure = Math.max(worstPressure, traffic / capacity);
        return;
      }
      const localFraction = Math.min(1, (capacity * priority) / Math.max(0.001, weightedTraffic));
      servedFraction = Math.min(servedFraction, localFraction);
      worstPressure = Math.max(worstPressure, 1 / Math.max(0.001, localFraction));
    };

    for (const { node, route, priority } of flows) {
      recordPressure(offeredNodeTraffic[node.id], weightedNodeTraffic[node.id], node.capacityGbps, priority);
      for (const linkId of route.path) {
        const link = linkById[linkId];
        if (link) recordPressure(offeredLinkTraffic[linkId], weightedLinkTraffic[linkId], link.capacityGbps, priority);
      }
      for (const hopId of route.hops) {
        const hop = nodeById[hopId];
        if (hop) recordPressure(offeredNodeTraffic[hopId], weightedNodeTraffic[hopId], hop.capacityGbps, priority);
      }
    }

    if (blocked) servedFraction = 0;
    let servedHere = 0;
    for (const { node, route, offered } of flows) {
      const carried = offered * servedFraction;
      nodeTraffic[node.id] += carried;
      for (const linkId of route.path) linkTraffic[linkId] += carried;
      for (const hopId of route.hops) nodeTraffic[hopId] += carried;
      servedHere += carried;
    }
    servicePressure[service.id] = worstPressure;
    serviceServed[service.id] = Math.max(0, Math.min(1, servedHere / demand));
    serviceOutage[service.id] = false;
    totalServed += servedHere;
  }

  return { nodeTraffic, linkTraffic, serviceServed, servicePressure, serviceOutage, totalDemand, totalServed };
}

export const nodeUtil = (n: NetNode) => (n.capacityGbps > 0 ? n.trafficGbps / n.capacityGbps : 0);
export const linkUtil = (l: NetLink) => (l.capacityGbps > 0 ? l.trafficGbps / l.capacityGbps : 0);

// Capacity that customer traffic actually has to fit through: the access layer that terminates it.
export function servingCapacity(nodes: NetNode[]) {
  return nodes
    .filter((n) => !n.down && (n.kind === 'pop' || n.kind === 'access'))
    .reduce((sum, n) => sum + n.capacityGbps, 0);
}

export interface Forecast {
  // Gbps at peak, today and projected.
  today: number;
  projected: number;
  perDay: number;
  daysOfHeadroom: number | null;
  confident: boolean;
}

// Straight line fit over recent daily peaks.
export function forecastDemand(history: number[], today: number, daysAhead: number): Forecast {
  const points = history.slice(-14);
  if (points.length < 4) {
    return { today, projected: today, perDay: 0, daysOfHeadroom: null, confident: false };
  }

  const n = points.length;
  const meanX = (n - 1) / 2;
  const meanY = points.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (points[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const perDay = den > 0 ? num / den : 0;
  const projected = Math.max(0, today + perDay * daysAhead);
  return { today, projected, perDay, daysOfHeadroom: null, confident: n >= 10 };
}

// How long until demand reaches the capacity you have, at the current trend.
export function daysUntilFull(forecast: Forecast, capacity: number): number | null {
  if (forecast.perDay <= 0.0001) return null;
  const gap = capacity - forecast.today;
  if (gap <= 0) return 0;
  return gap / forecast.perDay;
}
