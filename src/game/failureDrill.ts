import { computeRoutes } from './network';
import { residentialPeakEstimate } from './planCapacity';
import type { GameState } from './types';

export type FailureTarget = { type: 'node' | 'link'; id: string };

export function failureDrill(state: GameState, target: FailureTarget) {
  const item = (target.type === 'node' ? state.nodes : state.links).find((n) => n.id === target.id);
  if (!item || item.down) return null;
  const disrupted: GameState = {
    ...state,
    nodes:
      target.type === 'node' ? state.nodes.map((n) => (n.id === target.id ? { ...n, down: true } : n)) : state.nodes,
    links:
      target.type === 'link' ? state.links.map((l) => (l.id === target.id ? { ...l, down: true } : l)) : state.links,
  };
  const before = residentialPeakEstimate(state),
    after = residentialPeakEstimate(disrupted);
  const live = computeRoutes(state),
    cut = computeRoutes(disrupted);
  const lostSites = state.nodes.filter((n) => live[n.id] && !cut[n.id]);
  const districts = state.districts
    .filter((d) => d.unlocked)
    .map((d) => {
      const demand = before.districtDemand[d.id] ?? 0;
      const servedBefore = demand ? (before.districtServed[d.id] ?? 0) : 1;
      const servedAfter = demand ? (after.districtServed[d.id] ?? 0) : 1;
      return {
        id: d.id,
        name: d.name,
        demand,
        before: servedBefore,
        after: servedAfter,
        loss: Math.max(0, servedBefore - servedAfter),
        disconnectedSites: lostSites.filter((n) => n.districtId === d.id).length,
      };
    });
  return { target, before, after, lostSites, districts, lostGbps: Math.max(0, before.served - after.served) };
}
export type FailureReport = NonNullable<ReturnType<typeof failureDrill>>;
