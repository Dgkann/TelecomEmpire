import { priceIndex } from './economy';
import { staffModifiers } from './staff';
import { activeCampaign } from './strategy';
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

// Days reputation needs to climb to `required`, or null when it settles below it.
export function daysToReach(state: GameState, required: number, settle: number) {
  if (state.reputation >= required) return 0;
  if (settle < required) return null;
  return Math.ceil((required - state.reputation) / REPUTATION_PER_DAY);
}

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

// Where reputation heads if today's prices, network health, load and staff hold. Reputation also lifts
// the satisfaction target, so both targets are solved together. Load is the day-averaged penalty the
// simulation applied, so it covers every service and transit, and a price change shows at once.
// Every driver is expressed in reputation points.
export function reputationDrivers(state: GameState) {
  const active = state.districts.filter((district) => district.unlocked);
  const weight = householdWeights(state);
  const total = active.reduce((sum, district) => sum + weight(district.id), 0) || 1;
  const index = priceIndex(state);
  const price = pricePenalty(index);
  let load = 0;
  let campaigns = 0;
  for (const district of active) {
    load += ((district.loadPenalty ?? 0) * weight(district.id)) / total;
    if (activeCampaign(state, district.id, 'retention'))
      campaigns += (SATISFACTION.retention * weight(district.id)) / total;
  }
  const staff = staffModifiers(state).supportSatisfaction + campaigns;
  // The site running closest to its limit, which is where more capacity helps first.
  let busiest: { id: string; gx: number; gy: number; load: number } | null = null;
  for (const node of state.nodes) {
    if (node.down || node.capacityGbps <= 0) continue;
    const use = node.trafficGbps / node.capacityGbps;
    if (!busiest || use > busiest.load) busiest = { id: node.id, gx: node.gx, gy: node.gy, load: use };
  }
  const outages = Object.values(state.stats.outages).filter(Boolean).length;
  const feedback = 1 - REPUTATION.perSatisfaction * SATISFACTION.perReputation;
  const perSatisfaction = REPUTATION.perSatisfaction / feedback;
  const settle =
    (REPUTATION.base +
      (state.stats.health - REPUTATION.healthFrom) * REPUTATION.perHealth +
      REPUTATION.perSatisfaction *
        (SATISFACTION.base -
          REPUTATION.satisfactionFrom -
          REPUTATION.base * SATISFACTION.perReputation -
          price -
          load +
          staff) -
      REPUTATION.perOutage * outages) /
    feedback;
  return {
    settle: clamp(settle, 0, 100),
    premium: index - 1,
    price: -price * perSatisfaction,
    load: -load * perSatisfaction,
    staff: staff * perSatisfaction,
    outages: (-REPUTATION.perOutage * outages) / feedback,
    health: state.stats.health,
    perHealthPoint: REPUTATION.perHealth / feedback,
    busiest,
  };
}

export type ReputationCause = 'price' | 'load' | 'health' | 'outages';

// The largest drag on where reputation settles, if one is worth half a point. Health is measured from 95,
// where a well-maintained network sits; ageing keeps any network below 100.
export function mainReputationDrag(drivers: ReturnType<typeof reputationDrivers>): ReputationCause | null {
  const drags: Array<[ReputationCause, number]> = [
    ['price', -drivers.price],
    ['load', -drivers.load],
    ['health', drivers.perHealthPoint * Math.max(0, 95 - drivers.health)],
    ['outages', -drivers.outages],
  ];
  const [cause, size] = drags.sort((a, b) => b[1] - a[1])[0];
  return size >= 0.5 ? cause : null;
}
