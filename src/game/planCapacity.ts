import { HOURLY_DEMAND_CURVE, OVERSUBSCRIPTION } from './constants';
import { averageSpeed } from './economy';
import { computeRoutes, loadNetwork } from './network';
import type { GameState } from './types';

// A conservative residential-only stress test; caches, transit and other
// services are deliberately excluded, so this is not a total-network forecast.
export function residentialPeakEstimate(state: GameState) {
  const peak =
    Math.max(...HOURLY_DEMAND_CURVE) *
    (state.activeEvent && state.activeEvent.endsAt > state.minutes ? state.activeEvent.mul : 1);
  const rate = (averageSpeed(state.packages) * OVERSUBSCRIPTION * peak) / 1000;
  const demand: Record<string, number> = {};
  for (const b of state.buildings)
    if (b.segment === 'residential')
      demand[b.districtId] = (demand[b.districtId] ?? 0) + b.households * b.connected * rate;
  const result = loadNetwork(state, demand, computeRoutes(state));
  return {
    districtDemand: demand,
    districtServed: result.districtServed,
    districtPressure: result.districtPressure,
    demand: result.totalDemand,
    served: result.totalServed,
    pressure: Math.max(0, ...Object.values(result.districtPressure)),
  };
}
