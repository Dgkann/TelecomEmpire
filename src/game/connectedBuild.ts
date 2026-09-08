import { computeRoutes } from './network';
import { suggestedBackhaul } from './investment';
import { nodePlacementCost, nodePlacementIssue } from './placement';
import { projectBlueprint } from './blueprint';
import { uid } from './rng';
import type { GameState, NodeKind } from './types';

export function connectedSiteEstimate(
  state: GameState,
  kind: NodeKind,
  gx: number,
  gy: number,
  routes = computeRoutes(state),
) {
  const backhaul = kind === 'core' ? null : suggestedBackhaul(state, gx, gy, routes);
  const siteCost = nodePlacementCost(state, kind);
  const total = siteCost + (backhaul?.cost ?? 0);
  const error = state.gameOver
    ? 'This company has closed.'
    : (nodePlacementIssue(state, kind, gx, gy) ??
      (kind !== 'core' && !backhaul
        ? 'No live backhaul. Restore a core connection first.'
        : state.money < total
          ? `Site + fibre requires $${total.toLocaleString()}.`
          : null));
  return { backhaul, siteCost, total, error };
}

export function buildConnectedSite(state: GameState, kind: NodeKind, gx: number, gy: number) {
  const quote = connectedSiteEstimate(state, kind, gx, gy);
  if (quote.error) return { state, error: quote.error };
  const id = uid('site');
  return projectBlueprint(state, [
    { type: 'node', id, kind, gx, gy },
    ...(quote.backhaul ? [{ type: 'link' as const, id: uid('fibre'), aId: quote.backhaul.node.id, bId: id }] : []),
  ]);
}
