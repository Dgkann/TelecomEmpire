import type { GameState } from './types';
import { clamp } from './util';

export function averageSatisfaction(state: GameState) {
  const active = state.districts.filter((district) => district.unlocked);
  if (!active.length) return 70;
  const customers = new Map<string, number>();
  for (const building of state.buildings) {
    if (building.segment === 'residential')
      customers.set(
        building.districtId,
        (customers.get(building.districtId) ?? 0) + building.households * building.connected,
      );
  }
  const total = active.reduce((sum, district) => sum + Math.max(1, customers.get(district.id) ?? 0), 0);
  return (
    active.reduce((sum, district) => sum + district.satisfaction * Math.max(1, customers.get(district.id) ?? 0), 0) /
    total
  );
}

// The same target is used by the simulation and the player-facing explanation.
// Incidents and regulatory decisions can additionally cause immediate changes.
export function reputationOutlook(state: GameState) {
  const satisfaction = averageSatisfaction(state);
  const outages = Object.values(state.stats.outages).filter(Boolean).length;
  const healthImpact = (state.stats.health - 70) * 0.7;
  const satisfactionImpact = (satisfaction - 60) * 0.35;
  const outageImpact = -outages * 8;
  const target = clamp(50 + healthImpact + satisfactionImpact + outageImpact, 0, 100);
  return { satisfaction, outages, healthImpact, satisfactionImpact, outageImpact, target };
}
