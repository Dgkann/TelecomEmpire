import { computeRoutes } from './network';
import { fibreConnectionCost } from './placement';
import { projectBlueprint } from './blueprint';
import { uid } from './rng';
import type { GameState } from './types';

export function backupRouteEstimate(state: GameState, nodeId: string) {
  const route = computeRoutes(state)[nodeId];
  if (!route?.path.length) return null;
  // A useful peer must still reach a core after every cut on the primary path.
  // A neighbouring site behind the same bottleneck is not a backup.
  const cuts = route.path.map((id) => computeRoutes(state, id));
  if (cuts.every((routes) => routes[nodeId])) return null;
  const peers = state.nodes.filter(
    (n) =>
      n.id !== nodeId &&
      !n.down &&
      cuts.every((routes) => routes[n.id]) &&
      !state.links.some((l) => (l.aId === nodeId && l.bId === n.id) || (l.bId === nodeId && l.aId === n.id)),
  );
  const candidates = peers.map((node) => ({ node, cost: fibreConnectionCost(state, nodeId, node.id) }));
  candidates.sort((a, b) => a.cost - b.cost || a.node.id.localeCompare(b.node.id));
  return candidates[0] ?? null;
}

export function buildBackupRoute(state: GameState, nodeId: string): GameState | null {
  if (state.gameOver) return null;
  const quote = backupRouteEstimate(state, nodeId);
  if (!quote || state.money < quote.cost) return null;
  const result = projectBlueprint(state, [{ type: 'link', id: uid('backup'), aId: nodeId, bId: quote.node.id }]);
  return result.error ? null : result.state;
}
