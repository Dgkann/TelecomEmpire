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

export function saveGame(state: GameState) {
  try {
    const slot: SaveSlot = { version: SAVE_VERSION, savedAt: Date.now(), state };
    localStorage.setItem(SAVE_KEY, JSON.stringify(slot));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const slot = JSON.parse(raw) as SaveSlot;
    // A save from a newer build than this one cannot be read backwards.
    if (typeof slot.version !== 'number' || slot.version > SAVE_VERSION) return null;
    return migrate(slot.state as unknown as LegacyState, slot.version);
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveMeta(): { savedAt: number; company: string; customers: number } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const slot = JSON.parse(raw) as SaveSlot;
    const buildings = Array.isArray(slot.state?.buildings) ? slot.state.buildings : [];
    const subs = buildings.reduce(
      (s, b) => (b.segment === 'residential' ? s + b.households * b.connected : s),
      0,
    );
    return { savedAt: slot.savedAt, company: slot.state.companyName, customers: Math.round(subs) };
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
