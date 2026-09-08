import { computeRoutes, servingNodes } from './network';
import { researchModifiers } from './research';
import type { GameState, NodeKind } from './types';

export const siteReach = (kind: NodeKind, tier: number) =>
  (kind === 'pop' ? 0.32 : kind === 'access' ? 0.13 : 0) * (1 + (tier - 1) * 0.18);

export function fixedCoverageTarget(
  state: GameState,
  districtId: string,
  routes = computeRoutes(state),
  ceiling = researchModifiers(state.researchDone).coverageCeiling,
) {
  if (!state.districts.some((d) => d.id === districtId && d.unlocked)) return 0;
  return Math.min(
    ceiling,
    servingNodes(state, districtId)
      .filter((n) => routes[n.id])
      .reduce((sum, n) => sum + siteReach(n.kind, n.tier), 0),
  );
}

export function reachGain(
  state: GameState,
  districtId: string,
  kind: NodeKind,
  nodeId?: string,
  routes = computeRoutes(state),
) {
  const d = state.districts.find((d) => d.id === districtId);
  const node = state.nodes.find((n) => n.id === nodeId);
  const before = fixedCoverageTarget(state, districtId, routes);
  const extra = node
    ? routes[node.id]
      ? siteReach(node.kind, node.tier + 1) - siteReach(node.kind, node.tier)
      : 0
    : siteReach(kind, 1);
  const after = d?.unlocked ? Math.min(researchModifiers(state.researchDone).coverageCeiling, before + extra) : before;
  const homes = state.buildings
    .filter((b) => b.districtId === districtId && b.segment === 'residential')
    .reduce((sum, b) => sum + b.households, 0);
  return { before, after, homes: Math.floor(Math.max(0, after - before) * homes) };
}

export function networkReachGain(before: GameState, after: GameState) {
  const beforeRoutes = computeRoutes(before),
    afterRoutes = computeRoutes(after);
  return Math.floor(
    before.districts.reduce((sum, d) => {
      const gain = Math.max(
        0,
        fixedCoverageTarget(after, d.id, afterRoutes) - fixedCoverageTarget(before, d.id, beforeRoutes),
      );
      const homes = before.buildings
        .filter((b) => b.districtId === d.id && b.segment === 'residential')
        .reduce((n, b) => n + b.households, 0);
      return sum + gain * homes;
    }, 0),
  );
}
