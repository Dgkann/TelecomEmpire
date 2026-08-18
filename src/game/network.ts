import type { GameState, NetLink, NetNode } from './types';

// Traffic is not simulated packet by packet. Each district's demand is pushed
// onto the shortest live path back to a core, every element on that path picks
// up load, and the worst-loaded one decides what customers feel.

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

export function servingNodes(state: GameState, districtId: string): NetNode[] {
  return state.nodes.filter(
    (n) => n.districtId === districtId && (n.kind === 'pop' || n.kind === 'access' || n.kind === 'tower') && !n.down,
  );
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

// districtDemand is in Gbps at the current time of day.
export function loadNetwork(
  state: GameState,
  districtDemand: Record<string, number>,
  routes: Record<string, RouteInfo>,
  // Automatic balancing shares a district's traffic by what each serving node
  // can actually deliver end to end, rather than by the size of the box alone.
  // A large POP sitting behind a thin span is not a large POP, and without this
  // the network keeps pushing traffic at it.
  autoBalance = false,
): LoadResult {
  const nodeTraffic: Record<string, number> = {};
  const linkTraffic: Record<string, number> = {};
  const districtServed: Record<string, number> = {};
  const districtPressure: Record<string, number> = {};
  const districtOutage: Record<string, boolean> = {};
  let totalDemand = 0;
  let totalServed = 0;

  for (const n of state.nodes) nodeTraffic[n.id] = 0;
  for (const l of state.links) linkTraffic[l.id] = 0;

  const nodeById: Record<string, NetNode> = {};
  for (const n of state.nodes) nodeById[n.id] = n;
  const linkById: Record<string, NetLink> = {};
  for (const l of state.links) linkById[l.id] = l;

  for (const district of state.districts) {
    const demand = districtDemand[district.id] ?? 0;
    totalDemand += demand;
    if (demand <= 0) {
      districtServed[district.id] = 1;
      districtPressure[district.id] = 0;
      districtOutage[district.id] = false;
      continue;
    }

    const serving = servingNodes(state, district.id).filter((n) => routes[n.id]);
    if (serving.length === 0) {
      districtServed[district.id] = 0;
      districtPressure[district.id] = 2;
      districtOutage[district.id] = true;
      continue;
    }

    // Weight is never above the node's own capacity, so with balancing off, or
    // where the path is wider than the node, this is the old behaviour exactly.
    const weightOf = (n: NetNode) => {
      if (!autoBalance) return n.capacityGbps;
      const route = routes[n.id];
      if (!route) return n.capacityGbps;
      let cap = n.capacityGbps;
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

    const totalCap = serving.reduce((s, n) => s + weightOf(n), 0) || 1;
    let servedHere = 0;
    let worstPressure = 0;

    for (const node of serving) {
      const share = (weightOf(node) / totalCap) * demand;
      nodeTraffic[node.id] += share;
      const route = routes[node.id];
      for (const linkId of route.path) linkTraffic[linkId] += share;
      for (const hopId of route.hops) nodeTraffic[hopId] += share;
      servedHere += share;
    }

    // Second pass: measure the tightest element each serving node depends on.
    for (const node of serving) {
      const route = routes[node.id];
      let pressure = nodeTraffic[node.id] / Math.max(0.01, node.capacityGbps);
      for (const linkId of route.path) {
        const link = linkById[linkId];
        if (link) pressure = Math.max(pressure, linkTraffic[linkId] / Math.max(0.01, link.capacityGbps));
      }
      for (const hopId of route.hops) {
        const hop = nodeById[hopId];
        if (hop) pressure = Math.max(pressure, nodeTraffic[hopId] / Math.max(0.01, hop.capacityGbps));
      }
      worstPressure = Math.max(worstPressure, pressure);
    }

    districtPressure[district.id] = worstPressure;
    // Demand above capacity is simply not carried.
    const servedFraction = worstPressure > 1 ? 1 / worstPressure : 1;
    districtServed[district.id] = servedFraction;
    districtOutage[district.id] = false;
    totalServed += servedHere * servedFraction;
  }

  return { nodeTraffic, linkTraffic, districtServed, districtPressure, districtOutage, totalDemand, totalServed };
}

export const nodeUtil = (n: NetNode) => (n.capacityGbps > 0 ? n.trafficGbps / n.capacityGbps : 0);
export const linkUtil = (l: NetLink) => (l.capacityGbps > 0 ? l.trafficGbps / l.capacityGbps : 0);

// Capacity that customer traffic actually has to fit through: the access layer
// that terminates it, and the transit that carries it off-net.
export function servingCapacity(nodes: NetNode[]) {
  return nodes
    .filter((n) => !n.down && (n.kind === 'pop' || n.kind === 'access' || n.kind === 'tower'))
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

// Straight line fit over recent daily peaks. Deliberately simple: the point is
// to let a player see a wall coming, not to be a good statistician.
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
