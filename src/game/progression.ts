import { playerShareTarget } from './competitors';
import { clamp } from './util';
import type { GameState } from './types';

// The company ladder.

export interface RankRequirement {
  label: string;
  // 0..1 so the UI can draw a bar without knowing what the rule is.
  progress: (s: GameState) => number;
  detail: (s: GameState) => string;
}

export interface Rank {
  id: string;
  name: string;
  blurb: string;
  requirements: RankRequirement[];
  // Bigger operators borrow on better terms.
  creditMultiplier: number;
}

// Counted locally rather than imported.
export function customerCount(s: GameState) {
  const fixed = s.buildings.reduce(
    (sum, b) => (b.segment === 'residential' ? sum + b.households * b.connected : sum),
    0,
  );
  const mobile = s.districts.reduce((sum, d) => sum + d.mobileSubs, 0);
  return fixed + mobile + s.contracts.length;
}

// Your share of the whole city, weighted by how many people live in each district.
export function cityShare(s: GameState) {
  const weight = s.districts.reduce((sum, d) => sum + d.potential, 0);
  if (weight <= 0) return 0;
  return s.districts.reduce((sum, d) => sum + playerShareTarget(s, d) * d.potential, 0) / weight;
}

const customers = (target: number): RankRequirement => ({
  label: `${target.toLocaleString()} customers`,
  progress: (s) => clamp(customerCount(s) / target, 0, 1),
  detail: (s) => `${Math.round(customerCount(s)).toLocaleString()} / ${target.toLocaleString()}`,
});

const districts = (target: number): RankRequirement => ({
  label: `${target} districts licensed`,
  progress: (s) => clamp(s.districts.filter((d) => d.unlocked).length / target, 0, 1),
  detail: (s) => `${s.districts.filter((d) => d.unlocked).length} / ${target}`,
});

const share = (target: number): RankRequirement => ({
  label: `${Math.round(target * 100)}% of the city`,
  progress: (s) => clamp(cityShare(s) / target, 0, 1),
  detail: (s) => `${Math.round(cityShare(s) * 100)}% / ${Math.round(target * 100)}%`,
});

const research = (id: string, label: string): RankRequirement => ({
  label,
  progress: (s) => (s.researchDone.includes(id) ? 1 : 0),
  detail: (s) => (s.researchDone.includes(id) ? 'done' : 'not researched'),
});

const dataCentres = (target: number): RankRequirement => ({
  label: `${target} data centre${target > 1 ? 's' : ''}`,
  progress: (s) => clamp(s.nodes.filter((n) => n.kind === 'datacenter').length / target, 0, 1),
  detail: (s) => `${s.nodes.filter((n) => n.kind === 'datacenter').length} / ${target}`,
});

export const RANKS: Rank[] = [
  {
    id: 'local',
    name: 'Local ISP',
    blurb: 'One district, a few hundred customers, and a lot to prove.',
    requirements: [],
    creditMultiplier: 1,
  },
  {
    id: 'city',
    name: 'City Operator',
    blurb: 'You are no longer a hobby. Two districts and a real subscriber base.',
    requirements: [customers(1500), districts(2)],
    creditMultiplier: 1.2,
  },
  {
    id: 'regional',
    name: 'Regional Operator',
    blurb: 'Fixed and mobile, across most of the city.',
    requirements: [customers(4000), districts(4), research('mobile_4g', 'Mobile launched')],
    creditMultiplier: 1.5,
  },
  {
    id: 'national',
    name: 'National Operator',
    blurb: 'The whole city, a third of the market, and your own data centre.',
    requirements: [customers(9000), districts(5), share(0.35), dataCentres(1)],
    creditMultiplier: 2,
  },
  {
    id: 'global',
    name: 'Global Telecom',
    blurb: 'You are the network everyone else is measured against.',
    requirements: [
      customers(15000),
      share(0.5),
      research('mobile_5g', '5G Standalone'),
      research('backbone100g', '100G Backbone'),
    ],
    creditMultiplier: 2.6,
  },
];

export const rankOf = (s: GameState) => RANKS[Math.min(s.rank, RANKS.length - 1)];
export const nextRank = (s: GameState): Rank | null => RANKS[s.rank + 1] ?? null;

// A rung is earned only when every requirement on it is fully met.
export function meetsRank(s: GameState, rank: Rank) {
  return rank.requirements.every((r) => r.progress(s) >= 1);
}

export function rankProgress(s: GameState) {
  const next = nextRank(s);
  if (!next) return 1;
  if (!next.requirements.length) return 1;
  return next.requirements.reduce((sum, r) => sum + r.progress(s), 0) / next.requirements.length;
}

// Called once a day. Returns the rank just earned, if any.
export function checkPromotion(s: GameState): Rank | null {
  const next = nextRank(s);
  if (!next || !meetsRank(s, next)) return null;
  s.rank += 1;
  return next;
}

export const isTopRank = (s: GameState) => s.rank >= RANKS.length - 1;
