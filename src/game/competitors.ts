import { BASELINE_ARPU } from './constants';
import { priceIndex } from './economy';
import { clamp } from './util';
import { pick, rand, type Rng } from './rng';
import type { Competitor, District, GameState } from './types';

// Rivals are not a drifting number. They hold cash, roll out coverage district by
// district, react to your pricing and defend ground they already hold.

// Cheap looks good, expensive looks bad. Index 1 is the market average.
const priceAttract = (index: number) => clamp(1.6 - index * 0.6, 0.2, 1.6);

// Friction stands in for people who will not switch to anyone. Without it a
// district with two weak operators would still end up fully subscribed.
const MARKET_FRICTION = 0.35;

// You are the operator being played, with the local brand and the shopfront.
// Without this a four-operator market caps a perfect player near a quarter of
// the city, which is realistic and no fun.
const HOME_ADVANTAGE = 1.7;

// No operator can price below its own running costs for long.
const PRICE_FLOOR = 0.72;

export interface DistrictPull {
  player: number;
  rivals: Array<{ id: string; pull: number }>;
  total: number;
}

// How attractive each operator looks in one district. Mobile counts, which is
// what stops a rival walking into a district you cover with radio only.
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

// What it costs them to run that footprint. Coverage they are not selling from
// is dead weight, which is what stops a rival blanketing the city and coasting.
function rivalOpex(s: GameState, c: Competitor) {
  return s.districts.reduce((sum, d) => sum + (c.coverage[d.id] ?? 0) * d.potential * 9, 0);
}

// Where a rival would rather spend: lots of people, little of their own
// coverage, and no strong incumbent already sitting there.
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
    const target = bestExpansion(s, c);
    if (target) {
      const cost = target.potential * COVERAGE_STEP * COVERAGE_COST_PER_POINT * 0.01;
      if (cash > cost * 3 && rng() < 0.18 * aggression) {
        cash -= cost;
        coverage[target.id] = clamp((coverage[target.id] ?? 0) + COVERAGE_STEP * rand(rng, 0.6, 1.4), 0, 0.85);
        lastMove = `building in ${target.name}`;
      }
    }

    // Radio follows fibre, a little behind it.
    if (s.researchDone.includes('mobile_4g') && rng() < 0.25 * aggression) {
      const d = pick(rng, s.districts);
      const cost = 40000;
      if (cash > cost * 2) {
        cash -= cost;
        mobileCoverage[d.id] = clamp((mobileCoverage[d.id] ?? 0) + 0.05 * rand(rng, 0.5, 1.5), 0, 0.9);
      }
    }

    // Technology, which lifts how attractive they look everywhere at once.
    if (cash > 700000 && rng() < 0.05 * aggression) {
      cash -= 500000;
      tech = clamp(tech + 0.05, 0, 1);
      lastMove = 'upgrading their network';
    }

    // They aim to sit just under you rather than chasing whatever you do. An
    // earlier version cut whenever you looked expensive, which fed back into
    // your own index and raced every rival to the floor.
    let priceTarget = Math.min(myIndex * (0.94 - 0.06 * aggression), 1.2);
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

// Share of a district you would settle at with your current reach, price and
// reputation. This already accounts for the competition, so callers must not
// discount for rivals a second time.
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
