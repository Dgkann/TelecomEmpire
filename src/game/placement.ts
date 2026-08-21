import { FIBER_COST_PER_UNIT, NODE_SPECS } from './constants';
import { researchModifiers } from './research';
import type { GameState, NodeKind } from './types';

export function nodePlacementCost(state: GameState, kind: NodeKind) {
  const mods = researchModifiers(state.researchDone);
  return Math.round(NODE_SPECS[kind].baseCost * (kind === 'access' ? mods.accessCostMul : 1));
}

export function nodePlacementIssue(state: GameState, kind: NodeKind, gx: number, gy: number) {
  const spec = NODE_SPECS[kind];
  if (spec.requires && !state.researchDone.includes(spec.requires)) return `${spec.label} needs research first.`;
  const district = state.districts.find((entry) => entry.cells.some((cell) => cell.gx === gx && cell.gy === gy));
  if (!district) return 'Choose a tile inside the city.';
  if (!district.unlocked) return `${district.name} is not licensed yet.`;
  if (state.nodes.some((node) => node.gx === gx && node.gy === gy)) return 'A network site already occupies this tile.';
  const cost = nodePlacementCost(state, kind);
  if (state.money < cost) return `Need $${Math.ceil((cost - state.money) / 100) * 100} more.`;
  return null;
}

export function fibreConnectionCost(state: GameState, sourceId: string, destinationId: string) {
  const source = state.nodes.find((node) => node.id === sourceId);
  const destination = state.nodes.find((node) => node.id === destinationId);
  if (!source || !destination) return 0;
  return Math.round(Math.hypot(source.gx - destination.gx, source.gy - destination.gy) * FIBER_COST_PER_UNIT);
}

export function fibreConnectionIssue(state: GameState, sourceId: string, destinationId: string) {
  const source = state.nodes.find((node) => node.id === sourceId);
  const destination = state.nodes.find((node) => node.id === destinationId);
  if (!source || !destination) return 'Choose a network site.';
  if (source.id === destination.id) return 'Choose a different destination site.';
  if (
    state.links.some(
      (link) =>
        (link.aId === source.id && link.bId === destination.id) ||
        (link.aId === destination.id && link.bId === source.id),
    )
  ) {
    return 'These sites are already connected.';
  }
  const cost = fibreConnectionCost(state, source.id, destination.id);
  if (state.money < cost) return `Need $${Math.ceil((cost - state.money) / 100) * 100} more.`;
  return null;
}
