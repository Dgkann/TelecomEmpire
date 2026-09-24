import { MINUTES_PER_DAY } from '../../src/game/constants';
import { createNewGame, step } from '../../src/game/simulation';
import type { GameState } from '../../src/game/types';

// Headless check harness: a localStorage stand-in for the store, the tally and shared fixtures.

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

let failures = 0;
let checks = 0;

export function check(name: string, condition: boolean, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `  (${detail})` : ''}`);
  }
}

export function finite(name: string, value: number) {
  check(name, Number.isFinite(value), `got ${value}`);
}

export function group(name: string) {
  console.log(`\n${name}`);
}

export const newGame = (seed: number) =>
  createNewGame({ companyName: 'CoreLink', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed });

export const runDays = (g: GameState, days: number, onDay?: (g: GameState) => GameState) => {
  let s = g;
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < MINUTES_PER_DAY / 5; i++) s = step(s);
    if (onDay) s = onDay(s);
  }
  return s;
};

export function repairAll(g: GameState): GameState {
  let s = g;
  for (const inc of s.incidents) {
    if (inc.resolved || inc.assignedTechId) continue;
    const tech = s.technicians.find((t) => t.state === 'idle');
    if (!tech) break;
    s = {
      ...s,
      incidents: s.incidents.map((x) =>
        x.id === inc.id
          ? { ...x, repairMinutesLeft: Math.round(x.repairTotalMinutes * 0.28), assignedTechId: tech.id }
          : x,
      ),
      technicians: s.technicians.map((t) =>
        t.id === tech.id ? { ...t, incidentId: inc.id, state: 'driving' as const } : t,
      ),
    };
  }
  return s;
}

// Prints the tally once every topic has run, and fails the process on any failed check.
export function finish() {
  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
}
