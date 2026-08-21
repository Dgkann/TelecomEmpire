import { MINUTES_PER_DAY } from './constants';
import { priceIndex } from './economy';
import { computeRoutes, isRedundant } from './network';
import { pick, randInt, uid, type Rng } from './rng';
import { clamp } from './util';
import type { GameState, Regulation } from './types';

// The regulator is the part of the pressure curve you cannot outgrow.

// Nothing is asked of a company too small to matter.
const MIN_CUSTOMERS = 600;

export function makeRegulation(s: GameState, rng: Rng, customers: number): Regulation | null {
  const live = s.districts.filter((d) => d.unlocked);
  if (!live.length) return null;

  const roll = rng();
  const wantsCoverage = roll < 0.5;

  if (wantsCoverage) {
    // Pick somewhere you are thin, and ask for a reachable improvement.
    const thin = [...live].sort((a, b) => a.coverage - b.coverage)[0];
    const target = clamp(thin.coverage + 0.2 + rng() * 0.15, 0.3, 0.9);
    return {
      id: uid('reg'),
      kind: 'coverage',
      title: 'Coverage obligation',
      detail: `Reach ${Math.round(target * 100)}% of ${thin.name} or pay the shortfall levy.`,
      districtId: thin.id,
      target,
      dueAt: s.minutes + MINUTES_PER_DAY * randInt(rng, 60, 120),
      fine: Math.round((30000 + customers * 22) / 1000) * 1000,
      status: 'pending',
    };
  }

  if (roll < 0.75) {
    const current = networkResilience(s);
    const target = clamp(current + 0.2 + rng() * 0.15, 0.35, 0.9);
    return {
      id: uid('reg'),
      kind: 'resilience',
      title: 'Resilience audit',
      detail: `Protect ${Math.round(target * 100)}% of customer-facing sites with a second fibre path.`,
      districtId: null,
      target,
      dueAt: s.minutes + MINUTES_PER_DAY * randInt(rng, 60, 110),
      fine: Math.round((35000 + customers * 20) / 1000) * 1000,
      status: 'pending',
    };
  }

  // Or a cap on what you may charge, which bites if you are running premium.
  const cap = clamp(priceIndex(s) * 0.92, 0.8, 1.25);
  return {
    id: uid('reg'),
    kind: 'price_cap',
    title: 'Price review',
    detail: `Keep average pricing at or below ${cap.toFixed(2)}x the reference tariff.`,
    districtId: null,
    target: cap,
    dueAt: s.minutes + MINUTES_PER_DAY * randInt(rng, 45, 90),
    fine: Math.round((25000 + customers * 16) / 1000) * 1000,
    status: 'pending',
  };
}

export interface RegulationOutcome {
  regulation: Regulation;
  met: boolean;
}

// Judges anything that has come due and returns what happened.
export function settleRegulations(s: GameState): RegulationOutcome[] {
  const outcomes: RegulationOutcome[] = [];
  if (!s.regulations.length) return outcomes;

  s.regulations = s.regulations.map((r) => {
    if (r.status !== 'pending' || s.minutes < r.dueAt) return r;

    let met: boolean;
    if (r.kind === 'coverage') {
      const d = s.districts.find((x) => x.id === r.districtId);
      met = !!d && d.coverage >= r.target;
    } else if (r.kind === 'price_cap') {
      met = priceIndex(s) <= r.target;
    } else {
      met = networkResilience(s) >= r.target;
    }

    outcomes.push({ regulation: r, met });
    return { ...r, status: met ? 'met' : 'failed' };
  });

  // Keep a short history so the panel does not grow forever.
  s.regulations = s.regulations.filter((r) => r.status === 'pending' || s.minutes - r.dueAt < MINUTES_PER_DAY * 30);
  return outcomes;
}

export const pendingRegulations = (s: GameState) => s.regulations.filter((r) => r.status === 'pending');

// Only ask for one thing at a time, and only of a company big enough to notice.
export function shouldIssue(s: GameState, customers: number) {
  return customers >= MIN_CUSTOMERS && pendingRegulations(s).length === 0;
}

export function regulationProgress(s: GameState, r: Regulation) {
  if (r.kind === 'coverage') {
    const d = s.districts.find((x) => x.id === r.districtId);
    return d ? clamp(d.coverage / r.target, 0, 1) : 0;
  }
  if (r.kind === 'price_cap') return priceIndex(s) <= r.target ? 1 : clamp(r.target / priceIndex(s), 0, 1);
  return clamp(networkResilience(s) / Math.max(0.01, r.target), 0, 1);
}

export function networkResilience(s: GameState) {
  const routes = computeRoutes(s);
  const sites = s.nodes.filter((node) => node.kind === 'pop' || node.kind === 'access' || node.kind === 'tower');
  if (!sites.length) return 1;
  return sites.filter((node) => isRedundant(s, node.id, routes)).length / sites.length;
}

export const randomRegulator = (rng: Rng) => pick(rng, ['the regulator', 'the ministry', 'the telecoms authority']);
