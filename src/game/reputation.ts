import type { GameState } from './types';
import { clamp } from './util';

// Every district's satisfaction heads for satisfactionTarget, and reputation heads for the target in
// reputationOutlook. The simulation and the player-facing explanation share these weights.
const SATISFACTION = { base: 92, perReputation: 0.12, retention: 6, outage: 8 };
const REPUTATION = {
  base: 50,
  healthFrom: 70,
  perHealth: 0.7,
  satisfactionFrom: 60,
  perSatisfaction: 0.35,
  perOutage: 8,
};

// Reputation moves toward its target by at most this much a day.
export const REPUTATION_PER_DAY = 1.2;

// Satisfaction lost once the busiest element on a district's path runs above 85%.
export const pressurePenalty = (pressure: number) => clamp((pressure - 0.85) * 110, 0, 70);
// Satisfaction lost to prices above the market reference; cheaper prices win up to 12 points back.
export const pricePenalty = (index: number) => clamp((index - 1) * 55, -12, 30);

export function satisfactionTarget(input: {
  outage: boolean;
  pressure: number;
  priceIndex: number;
  reputation: number;
  support: number;
  retention: boolean;
}) {
  if (input.outage) return SATISFACTION.outage;
  return clamp(
    SATISFACTION.base -
      pressurePenalty(input.pressure) -
      pricePenalty(input.priceIndex) +
      (input.reputation - REPUTATION.base) * SATISFACTION.perReputation +
      input.support +
      (input.retention ? SATISFACTION.retention : 0),
    0,
    100,
  );
}

// Residential households each district serves; district averages are weighted by them.
function householdWeights(state: GameState) {
  const customers = new Map<string, number>();
  for (const building of state.buildings) {
    if (building.segment === 'residential')
      customers.set(
        building.districtId,
        (customers.get(building.districtId) ?? 0) + building.households * building.connected,
      );
  }
  return (districtId: string) => Math.max(1, customers.get(districtId) ?? 0);
}

export function averageSatisfaction(state: GameState) {
  const active = state.districts.filter((district) => district.unlocked);
  if (!active.length) return 70;
  const weight = householdWeights(state);
  const total = active.reduce((sum, district) => sum + weight(district.id), 0);
  return active.reduce((sum, district) => sum + district.satisfaction * weight(district.id), 0) / total;
}

// The same target is used by the simulation and the player-facing explanation.
// Incidents and regulatory decisions can additionally cause immediate changes.
export function reputationOutlook(state: GameState) {
  const satisfaction = averageSatisfaction(state);
  const outages = Object.values(state.stats.outages).filter(Boolean).length;
  const healthImpact = (state.stats.health - REPUTATION.healthFrom) * REPUTATION.perHealth;
  const satisfactionImpact = (satisfaction - REPUTATION.satisfactionFrom) * REPUTATION.perSatisfaction;
  const outageImpact = -outages * REPUTATION.perOutage;
  const target = clamp(REPUTATION.base + healthImpact + satisfactionImpact + outageImpact, 0, 100);
  return { satisfaction, outages, healthImpact, satisfactionImpact, outageImpact, target };
}
