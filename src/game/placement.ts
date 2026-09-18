import { FIBER_COST_PER_UNIT, NODE_SPECS, DATACENTER_PILOT_COST } from './constants';
import { researchModifiers } from './research';
import type { GameState, NodeKind } from './types';

export function nodePlacementCost(state: GameState, kind: NodeKind) {
  if (kind === 'datacenter') return DATACENTER_PILOT_COST;
  const mods = researchModifiers(state.researchDone);
  return Math.round(NODE_SPECS[kind].baseCost * (kind === 'access' ? mods.accessCostMul : 1));
}

export function nodePlacementIssue(
  state: GameState,
  kind: NodeKind,
  gx: number,
  gy: number,
  locale: 'en' | 'tr' = 'en',
) {
  const tr = locale === 'tr';
  const spec = NODE_SPECS[kind];
  if (spec.requires && !state.researchDone.includes(spec.requires))
    return tr ? `${spec.labelTr} için önce araştırma gerekiyor.` : `${spec.label} needs research first.`;
  const district = state.districts.find((entry) => entry.cells.some((cell) => cell.gx === gx && cell.gy === gy));
  if (!district) return tr ? 'Şehir içinden bir kare seç.' : 'Choose a tile inside the city.';
  if (!district.unlocked)
    return tr ? `${district.name} için henüz lisansın yok.` : `${district.name} is not licensed yet.`;
  if (state.nodes.some((node) => node.gx === gx && node.gy === gy))
    return tr ? 'Bu karede zaten bir şebeke noktası var.' : 'A network site already occupies this tile.';
  const cost = nodePlacementCost(state, kind);
  if (state.money < cost)
    return tr
      ? `${Math.ceil((cost - state.money) / 2000) * 2000} daha gerekiyor.`
      : `Need ${Math.ceil((cost - state.money) / 2000) * 2000} more.`;
  return null;
}

export function fibreConnectionCost(state: GameState, sourceId: string, destinationId: string) {
  const source = state.nodes.find((node) => node.id === sourceId);
  const destination = state.nodes.find((node) => node.id === destinationId);
  if (!source || !destination) return 0;
  return Math.round(Math.hypot(source.gx - destination.gx, source.gy - destination.gy) * FIBER_COST_PER_UNIT);
}

export function fibreConnectionIssue(
  state: GameState,
  sourceId: string,
  destinationId: string,
  locale: 'en' | 'tr' = 'en',
) {
  const tr = locale === 'tr';
  const source = state.nodes.find((node) => node.id === sourceId);
  const destination = state.nodes.find((node) => node.id === destinationId);
  if (!source || !destination) return tr ? 'Bir şebeke noktası seç.' : 'Choose a network site.';
  if (source.id === destination.id) return tr ? 'Farklı bir hedef nokta seç.' : 'Choose a different destination site.';
  if (
    state.links.some(
      (link) =>
        (link.aId === source.id && link.bId === destination.id) ||
        (link.aId === destination.id && link.bId === source.id),
    )
  ) {
    return tr ? 'Bu noktalar zaten bağlı.' : 'These sites are already connected.';
  }
  const cost = fibreConnectionCost(state, source.id, destination.id);
  if (state.money < cost)
    return tr
      ? `${Math.ceil((cost - state.money) / 2000) * 2000} daha gerekiyor.`
      : `Need ${Math.ceil((cost - state.money) / 2000) * 2000} more.`;
  return null;
}
