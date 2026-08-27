import { BASELINE_ARPU, spectrumCapacityFactor, spectrumRadiusFactor } from './constants';
import { priceIndex } from './economy';
import { clamp } from './util';
import { pick, rand, type Rng } from './rng';
import type { Competitor, District, GameState } from './types';

// Rivals are not a drifting number.

// Cheap looks good, expensive looks bad. Index 1 is the market average.
export const priceAttract = (index: number) => clamp(1.8 - index * 0.8, 0.2, 1.7);

// Friction stands in for people who will not switch to anyone.
const MARKET_FRICTION = 0.35;

// You are the operator being played, with the local brand and the shopfront.
const HOME_ADVANTAGE = 1.7;

// No operator can price below its own running costs for long.
const PRICE_FLOOR = 0.72;

export interface DistrictPull {
  player: number;
  rivals: Array<{ id: string; pull: number }>;
  total: number;
}

// How attractive each operator looks in one district.
export function districtPull(s: GameState, d: District): DistrictPull {
  const playerReach = Math.max(d.coverage, d.mobileCoverage * 0.8);
  const player =
    playerReach *
    priceAttract(priceIndex(s)) *
    clamp(0.5 + s.reputation / 100, 0.3, 1.5) *
    clamp(d.satisfaction / 70, 0.2, 1.4) *
    HOME_ADVANTAGE;

  const rivals = s.competitors.map((c) => {
    const reach = Math.max(c.coverage[d.id] ?? 0, (c.mobileCoverage[d.id] ?? 0) * 0.8);
    return { id: c.id, pull: reach * priceAttract(c.priceIndex) * (0.75 + c.tech * 0.45) };
  });

  const total = player + rivals.reduce((sum, r) => sum + r.pull, 0) + MARKET_FRICTION;
  return { player, rivals, total };
}

// What a rival charges, relative to your own average price.
export const rivalArpu = (c: Competitor) => BASELINE_ARPU * c.priceIndex;

// Monthly income a rival draws from a district at its current share.
function rivalRevenue(s: GameState, c: Competitor) {
  return s.districts.reduce((sum, d) => sum + (c.share[d.id] ?? 0) * d.potential * rivalArpu(c), 0);
}

// What it costs them to run that footprint.
function rivalOpex(s: GameState, c: Competitor) {
  return s.districts.reduce(
    (sum, d) => sum + ((c.coverage[d.id] ?? 0) * 9 + (c.mobileCoverage[d.id] ?? 0) * 5) * d.potential,
    0,
  );
}

// Where a rival would rather spend: lots of people, little of their own coverage.
function bestExpansion(s: GameState, c: Competitor) {
  let best: { district: District; score: number } | null = null;
  for (const d of s.districts) {
    const theirs = c.coverage[d.id] ?? 0;
    if (theirs >= 0.85) continue;
    const playerStrength = Math.max(d.coverage, d.mobileCoverage * 0.8);
    const score = d.potential * (1 - theirs) * clamp(1.15 - playerStrength * 0.75, 0.15, 1.15);
    if (!best || score > best.score) best = { district: d, score };
  }
  return best?.district ?? null;
}

function bestDefence(s: GameState, c: Competitor) {
  let best: { district: District; score: number } | null = null;
  for (const district of s.districts) {
    const theirs = Math.max(c.coverage[district.id] ?? 0, (c.mobileCoverage[district.id] ?? 0) * 0.8);
    const player = Math.max(district.coverage, district.mobileCoverage * 0.8);
    const share = c.share[district.id] ?? 0;
    if (share < 0.06 || player <= theirs) continue;
    const score = district.potential * share * (player - theirs + 0.2);
    if (!best || score > best.score) best = { district, score };
  }
  return best?.district ?? null;
}

export function rivalPosture(s: GameState, c: Competitor) {
  const averageCoverage =
    s.districts.reduce(
      (sum, district) => sum + Math.max(c.coverage[district.id] ?? 0, c.mobileCoverage[district.id] ?? 0),
      0,
    ) / Math.max(1, s.districts.length);
  if (c.cash < 0) return { label: 'Recovery', detail: 'Raising margin and pausing expansion.' };
  const defence = bestDefence(s, c);
  if (defence) return { label: 'Defending', detail: `Protecting market share in ${defence.name}.` };
  if (averageCoverage < 0.35) return { label: 'Expansion', detail: 'Prioritising new district coverage.' };
  if (c.spectrum.length && s.districts.some((district) => (c.mobileCoverage[district.id] ?? 0) < 0.25)) {
    return { label: 'Mobile push', detail: 'Turning spectrum holdings into radio coverage.' };
  }
  if (c.tech < 0.65) return { label: 'Modernising', detail: 'Saving for network technology upgrades.' };
  return { label: 'Consolidating', detail: 'Balancing price, coverage and cash reserves.' };
}

const COVERAGE_STEP = 0.06;
const COVERAGE_COST_PER_POINT = 260;

// One day of rival behaviour: earn, invest, reprice, then settle market share.
export function tickCompetitors(s: GameState, rng: Rng, aggressionMul: number) {
  const myIndex = priceIndex(s);

  s.competitors = s.competitors.map((c) => {
    const aggression = c.aggression * aggressionMul;
    let cash = c.cash + (rivalRevenue(s, c) - rivalOpex(s, c)) / 30;
    const coverage = { ...c.coverage };
    const mobileCoverage = { ...c.mobileCoverage };
    let tech = c.tech;
    let lastMove: string | null = null;

    // Rollout, paid for out of their own pocket.
    const defence = bestDefence(s, c);
    const target = defence && rng() < 0.55 * aggression ? defence : bestExpansion(s, c);
    if (target) {
      const cost = target.potential * COVERAGE_STEP * COVERAGE_COST_PER_POINT * 0.01;
      if (cash > cost * 3 && rng() < 0.18 * aggression) {
        cash -= cost;
        coverage[target.id] = clamp((coverage[target.id] ?? 0) + COVERAGE_STEP * rand(rng, 0.6, 1.4), 0, 0.85);
        lastMove = defence?.id === target.id ? `reinforcing ${target.name}` : `building in ${target.name}`;
      }
    }

    // Radio rollout requires spectrum and scales with the rival's own holdings.
    if (c.spectrum.length && rng() < 0.25 * aggression) {
      const d = bestExpansion(s, { ...c, coverage: mobileCoverage }) ?? pick(rng, s.districts);
      const cost = 40000;
      if (cash > cost * 2) {
        cash -= cost;
        const reach = spectrumRadiusFactor(c.spectrum);
        const capacity = spectrumCapacityFactor(c.spectrum);
        const ceiling = clamp(0.35 + capacity * 0.12 + tech * 0.2, 0.35, 0.95);
        mobileCoverage[d.id] = clamp((mobileCoverage[d.id] ?? 0) + 0.035 * reach * rand(rng, 0.5, 1.5), 0, ceiling);
        lastMove = `expanding mobile coverage in ${d.name}`;
      }
    }

    // Technology, which lifts how attractive they look everywhere at once.
    if (cash > 700000 && tech < 0.95 && rng() < (0.04 + (1 - tech) * 0.04) * aggression) {
      cash -= 500000;
      tech = clamp(tech + 0.05, 0, 1);
      lastMove = 'upgrading their network';
    }

    // They aim to sit just under you rather than chasing whatever you do.
    let priceTarget = Math.min(myIndex * (0.94 - 0.06 * aggression - (defence ? 0.025 : 0)), 1.2);
    // Nobody sells below what it costs them to run the network.
    if (cash < 0) priceTarget += 0.15;
    priceTarget = clamp(priceTarget, PRICE_FLOOR, 1.35);
    const priceIdx = clamp(c.priceIndex + (priceTarget - c.priceIndex) * 0.08, PRICE_FLOOR, 1.4);
    if (priceIdx < c.priceIndex - 0.004) lastMove = 'cutting prices';

    return { ...c, cash, coverage, mobileCoverage, tech, priceIndex: priceIdx, lastMove };
  });

  settleShares(s);
}

// Market share follows relative pull, easing toward it rather than snapping.
export function settleShares(s: GameState, rate = 0.09) {
  const next = s.competitors.map((c) => ({ ...c, share: { ...c.share } }));
  for (const d of s.districts) {
    const pull = districtPull(s, d);
    for (const r of pull.rivals) {
      const target = pull.total > 0 ? r.pull / pull.total : 0;
      const c = next.find((x) => x.id === r.id);
      if (!c) continue;
      const current = c.share[d.id] ?? 0;
      c.share[d.id] = clamp(current + (target - current) * rate, 0, 0.95);
    }
  }
  s.competitors = next;
}

// Who is winning a district right now, for the map overlay.
export function leaderOf(s: GameState, d: District): { id: string; name: string; color: string; share: number } {
  const pull = districtPull(s, d);
  const playerShare = pull.total > 0 ? pull.player / pull.total : 0;
  let best = { id: 'player', name: s.companyName, color: '#3ee6d6', share: playerShare };
  for (const c of s.competitors) {
    const share = c.share[d.id] ?? 0;
    if (share > best.share) best = { id: c.id, name: c.name, color: c.color, share };
  }
  return best;
}

// Share of a district you would settle at with your current reach, price and reputation.
export function playerShareTarget(s: GameState, d: District) {
  const pull = districtPull(s, d);
  return pull.total > 0 ? pull.player / pull.total : 0;
}

// The rival most likely to pick up a customer who leaves you in this district.
export function strongestRival(s: GameState, districtId: string): Competitor | null {
  let best: Competitor | null = null;
  for (const c of s.competitors) {
    const share = c.share[districtId] ?? 0;
    if (!best || share > (best.share[districtId] ?? 0)) best = c;
  }
  return best && (best.share[districtId] ?? 0) > 0.01 ? best : null;
}
