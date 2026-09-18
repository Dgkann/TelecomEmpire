import { computeRoutes } from './network';
import { fmtMoneyExact } from './economy';
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
  locale: 'en' | 'tr' = 'en',
) {
  const tr = locale === 'tr';
  const backhaul = kind === 'core' ? null : suggestedBackhaul(state, gx, gy, routes);
  const siteCost = nodePlacementCost(state, kind);
  const total = siteCost + (backhaul?.cost ?? 0);
  const error = state.gameOver
    ? tr
      ? 'Bu şirket kapandı.'
      : 'This company has closed.'
    : (nodePlacementIssue(state, kind, gx, gy, locale) ??
      (kind !== 'core' && !backhaul
        ? tr
          ? 'Canlı backhaul yok. Önce çekirdek bağlantısını geri getir.'
          : 'No live backhaul. Restore a core connection first.'
        : state.money < total
          ? tr
            ? `Nokta + fiber için ${fmtMoneyExact(total)} gerekiyor.`
            : `Site + fibre requires ${fmtMoneyExact(total)}.`
          : null));
  return { backhaul, siteCost, total, error };
}

export function buildConnectedSite(
  state: GameState,
  kind: NodeKind,
  gx: number,
  gy: number,
  locale: 'en' | 'tr' = 'en',
) {
  const quote = connectedSiteEstimate(state, kind, gx, gy, computeRoutes(state), locale);
  if (quote.error) return { state, error: quote.error };
  const id = uid('site');
  return projectBlueprint(
    state,
    [
      { type: 'node', id, kind, gx, gy },
      ...(quote.backhaul ? [{ type: 'link' as const, id: uid('fibre'), aId: quote.backhaul.node.id, bId: id }] : []),
    ],
    locale,
  );
}
