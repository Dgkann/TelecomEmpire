import { SAVE_KEY, SAVE_VERSION } from './constants';
import type { GameState, Package } from './types';

interface SaveSlot {
  version: number;
  savedAt: number;
  state: GameState;
}

type LegacyState = Record<string, unknown>;

// One entry per version bump, keyed by the version it upgrades from. Add a field to
// GameState, add a migration here, or old saves load with it missing.
const MIGRATIONS: Record<number, (s: LegacyState) => LegacyState> = {
  // 1 -> 2: the mobile layer added spectrum, auctions and per-district radio
  // coverage, plus three mobile packages.
  1: (s) => {
    const packages = Array.isArray(s.packages) ? (s.packages as Package[]) : [];
    const hasMobilePackages = packages.some((p) => p.segment === 'mobile');
    return {
      ...s,
      spectrum: s.spectrum ?? [],
      auction: s.auction ?? null,
      nextAuctionAt: s.nextAuctionAt ?? Infinity,
      districts: (Array.isArray(s.districts) ? s.districts : []).map((d) => ({
        mobileCoverage: 0,
        mobileSubs: 0,
        ...(d as object),
      })),
      packages: hasMobilePackages
        ? packages
        : [
            ...packages,
            { id: 'pkg_mob_lite', name: 'Mobile Lite', speedMbps: 40, price: 12, segment: 'mobile', active: true, subscribers: 0 },
            { id: 'pkg_mob_std', name: 'Mobile Standard', speedMbps: 100, price: 22, segment: 'mobile', active: true, subscribers: 0 },
            { id: 'pkg_mob_max', name: 'Mobile Unlimited', speedMbps: 300, price: 38, segment: 'mobile', active: true, subscribers: 0 },
          ],
    };
  },

  // 2 -> 3: rivals gained a balance sheet, their own coverage and a tech level.
  2: (s) => ({
    ...s,
    competitors: (Array.isArray(s.competitors) ? s.competitors : []).map((c) => {
      const rival = c as Record<string, unknown>;
      const share = (rival.share ?? {}) as Record<string, number>;
      // Back the share they already had with coverage, so nothing jumps on load.
      const coverage: Record<string, number> = {};
      for (const [districtId, value] of Object.entries(share)) {
        coverage[districtId] = Math.min(0.9, value * 1.8);
      }
      return {
        cash: 250000,
        tech: 0.2,
        lastMove: null,
        mobileCoverage: {},
        coverage,
        ...rival,
      };
    }),
  }),

  // 3 -> 4: churn is recorded per event and retention spend became a lever.
  3: (s) => ({ ...s, churn: s.churn ?? [], retentionBudget: s.retentionBudget ?? 0 }),

  // 4 -> 5: borrowing, credit limits and a way to lose.
  4: (s) => ({ ...s, loans: s.loans ?? [], insolventSince: null, gameOver: null }),

  // 5 -> 6: equipment ages from its last service, so existing kit counts as
  // just serviced rather than instantly decrepit.
  5: (s) => ({
    ...s,
    nodes: (Array.isArray(s.nodes) ? s.nodes : []).map((n) => {
      const node = n as Record<string, unknown>;
      return { ...node, servicedAt: node.servicedAt ?? s.minutes ?? 0 };
    }),
  }),

  // 6 -> 7: the regulator started handing out obligations.
  6: (s) => ({
    ...s,
    regulations: s.regulations ?? [],
    nextRegulationAt: s.nextRegulationAt ?? (typeof s.minutes === 'number' ? s.minutes : 0) + 1440 * 60,
  }),

  // 7 -> 8: daily peak demand is recorded so the forecast has something to fit.
  7: (s) => ({ ...s, demandHistory: s.demandHistory ?? [], dayPeakDemand: s.dayPeakDemand ?? 0 }),

  // 8 -> 9: the company ladder. Existing saves start at the bottom rung and
  // climb on their next day, so nothing is lost.
  8: (s) => ({ ...s, rank: s.rank ?? 0, victoryAt: s.victoryAt ?? null }),

  // 9 -> 10: lightweight NOC telemetry powers the daily load timeline.
  9: (s) => ({ ...s, telemetry: s.telemetry ?? [] }),
};

const DEFAULTS = {
  researchPoints: 0,
  contracts: [],
  offers: [],
  incidents: [],
  technicians: [],
  employees: [],
  researchDone: [],
  researchActive: null,
  competitors: [],
  posts: [],
  log: [],
  history: [],
  monthAccumulator: { revenue: 0, expense: 0 },
  marketingBudget: 0,
  retentionBudget: 0,
  churn: [],
  rank: 0,
  victoryAt: null,
  regulations: [],
  demandHistory: [],
  dayPeakDemand: 0,
  telemetry: [],
  loans: [],
  insolventSince: null,
  gameOver: null,
  transitTier: 0,
  backupTransit: false,
  autoDispatch: false,
  spectrum: [],
  auction: null,
  activeEvent: null,
  tutorialStep: 0,
  tutorialDone: true,
  autosaveAt: 0,
} as const;

// Without these there is no game to resume.
const REQUIRED = ['buildings', 'districts', 'nodes', 'links', 'packages'] as const;

// JSON has no Infinity, so it comes back as null. nextAuctionAt is the only user.
function reviveInfinities(s: LegacyState): LegacyState {
  return { ...s, nextAuctionAt: s.nextAuctionAt == null ? Infinity : s.nextAuctionAt };
}

export function migrate(state: LegacyState, fromVersion: number): GameState | null {
  let current = state;
  let version = fromVersion;

  while (version < SAVE_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) return null;
    current = migration(current);
    version += 1;
  }

  current = reviveInfinities({ ...DEFAULTS, ...current });

  for (const key of REQUIRED) {
    if (!Array.isArray(current[key])) return null;
  }
  return current as unknown as GameState;
}

export const SAVE_SLOT_COUNT = 3;

const keyForSlot = (slot: number) => (slot === 0 ? SAVE_KEY : `${SAVE_KEY}-slot-${slot + 1}`);
const safeSlot = (slot: number) => Math.max(0, Math.min(SAVE_SLOT_COUNT - 1, Math.floor(slot)));

export function saveGame(state: GameState, slot = 0) {
  try {
    const payload: SaveSlot = { version: SAVE_VERSION, savedAt: Date.now(), state };
    localStorage.setItem(keyForSlot(safeSlot(slot)), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot = 0): GameState | null {
  try {
    const raw = localStorage.getItem(keyForSlot(safeSlot(slot)));
    if (!raw) return null;
    const payload = JSON.parse(raw) as SaveSlot;
    // A save from a newer build than this one cannot be read backwards.
    if (typeof payload.version !== 'number' || payload.version > SAVE_VERSION) return null;
    return migrate(payload.state as unknown as LegacyState, payload.version);
  } catch {
    return null;
  }
}

export function hasSave(slot = 0) {
  try {
    return localStorage.getItem(keyForSlot(safeSlot(slot))) !== null;
  } catch {
    return false;
  }
}

export interface SaveMeta {
  slot: number;
  savedAt: number;
  company: string;
  city: string;
  customers: number;
  minutes: number;
}

export function saveMeta(slot = 0): SaveMeta | null {
  try {
    const resolvedSlot = safeSlot(slot);
    const raw = localStorage.getItem(keyForSlot(resolvedSlot));
    if (!raw) return null;
    const payload = JSON.parse(raw) as SaveSlot;
    const buildings = Array.isArray(payload.state?.buildings) ? payload.state.buildings : [];
    const subs = buildings.reduce(
      (s, b) => (b.segment === 'residential' ? s + b.households * b.connected : s),
      0,
    );
    return {
      slot: resolvedSlot,
      savedAt: payload.savedAt,
      company: payload.state.companyName,
      city: payload.state.cityName,
      customers: Math.round(subs) + (payload.state.contracts?.length ?? 0),
      minutes: payload.state.minutes ?? 0,
    };
  } catch {
    return null;
  }
}

export function listSaveMeta() {
  return Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => saveMeta(slot));
}

export function clearSave(slot = 0) {
  try {
    localStorage.removeItem(keyForSlot(safeSlot(slot)));
  } catch {
    // ignore
  }
}

export function exportSave(slot = 0): string | null {
  try {
    return localStorage.getItem(keyForSlot(safeSlot(slot)));
  } catch {
    return null;
  }
}

export function importSave(raw: string, slot = 0): GameState | null {
  try {
    const parsed = JSON.parse(raw) as SaveSlot;
    if (typeof parsed.version !== 'number' || parsed.version > SAVE_VERSION || !parsed.state) return null;
    const state = migrate(parsed.state as unknown as LegacyState, parsed.version);
    if (!state) return null;
    const payload: SaveSlot = { version: SAVE_VERSION, savedAt: Date.now(), state };
    localStorage.setItem(keyForSlot(safeSlot(slot)), JSON.stringify(payload));
    return state;
  } catch {
    return null;
  }
}
