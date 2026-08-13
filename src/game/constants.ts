import type { BandId, Difficulty, GameState, NodeKind, SpectrumHolding } from './types';

export const SAVE_KEY = 'telecom-empire-save-v1';
export const SAVE_VERSION = 9;

export const MINUTES_PER_STEP = 5;
export const STEP_MS = 260;

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_MONTH = MINUTES_PER_DAY * 30;

export const START_DATE = new Date(2026, 0, 1);

export const GRID = 26;

export interface NodeSpec {
  kind: NodeKind;
  label: string;
  icon: string;
  baseCost: number;
  baseCapacity: number;
  tierCapacityMul: number;
  tierCostMul: number;
  maxTier: number;
  powerKw: number;
  maintenance: number;
  description: string;
  requires?: string;
}

export const NODE_SPECS: Record<NodeKind, NodeSpec> = {
  core: {
    kind: 'core',
    label: 'Core Router',
    icon: '◈',
    baseCost: 45000,
    baseCapacity: 10,
    tierCapacityMul: 2.4,
    tierCostMul: 2.2,
    maxTier: 5,
    powerKw: 12,
    maintenance: 900,
    description: 'The spine of your network. Everything ultimately routes through a core.',
  },
  pop: {
    kind: 'pop',
    label: 'POP',
    icon: '▣',
    baseCost: 18000,
    baseCapacity: 4,
    tierCapacityMul: 2.2,
    tierCostMul: 2.0,
    maxTier: 5,
    powerKw: 5,
    maintenance: 380,
    description: 'A point of presence brings your network into a district and serves local customers.',
  },
  access: {
    kind: 'access',
    label: 'Access Node',
    icon: '▤',
    baseCost: 6500,
    baseCapacity: 2,
    tierCapacityMul: 2.0,
    tierCostMul: 1.9,
    maxTier: 4,
    powerKw: 2,
    maintenance: 140,
    description: 'Street-level cabinet. Cheap way to push coverage deeper into a district.',
  },
  datacenter: {
    kind: 'datacenter',
    label: 'Data Center',
    icon: '▦',
    baseCost: 220000,
    baseCapacity: 40,
    tierCapacityMul: 2.5,
    tierCostMul: 2.4,
    maxTier: 3,
    powerKw: 90,
    maintenance: 5200,
    description: 'Hosting, caching and edge compute. Cuts transit costs and unlocks enterprise deals.',
    requires: 'edge_compute',
  },
  tower: {
    kind: 'tower',
    label: 'Mobile Tower',
    icon: '⌁',
    baseCost: 60000,
    baseCapacity: 6,
    tierCapacityMul: 2.0,
    tierCostMul: 2.0,
    maxTier: 4,
    powerKw: 8,
    maintenance: 700,
    description: 'Radio site for mobile subscribers. Needs fiber backhaul to a POP or core.',
    requires: 'mobile_4g',
  },
};

export const FIBER_COST_PER_UNIT = 1400;
export const FIBER_BASE_CAPACITY = 10;
export const FIBER_TIER_MUL = 4;
export const FIBER_UPGRADE_COST_PER_UNIT = 2200;
export const FIBER_MAINTENANCE_PER_UNIT = 22;

export const POWER_COST_PER_KW_MONTH = 130;

// The reference residential price the whole market is measured against. Both
// your price index and every rival's are relative to this, so nobody's price
// can chase anybody else's in a loop.
export const BASELINE_ARPU = 34;

export const TRANSIT_TIERS = [
  { label: 'Basic transit', capacity: 12, monthly: 3200, reliability: 0.9 },
  { label: 'Dual-homed transit', capacity: 45, monthly: 11000, reliability: 0.95 },
  { label: 'Tier-1 blend', capacity: 160, monthly: 34000, reliability: 0.98 },
  { label: 'Global backbone', capacity: 700, monthly: 96000, reliability: 0.995 },
];
export const BACKUP_TRANSIT_MONTHLY = 15000;

// Low bands reach far and carry little, high bands the reverse. That is the trade.
export interface BandSpec {
  id: BandId;
  label: string;
  radius: number;
  capacity: number;
  // Rough value of one block, used for reserve prices and rival bids.
  blockValue: number;
  requires?: string;
  note: string;
}

export const SPECTRUM_BANDS: Record<BandId, BandSpec> = {
  '700': {
    id: '700',
    label: '700 MHz',
    radius: 1.7,
    capacity: 0.5,
    blockValue: 210000,
    note: 'Reaches across a district and through walls. Not much room in it.',
  },
  '1800': {
    id: '1800',
    label: '1800 MHz',
    radius: 1.15,
    capacity: 1,
    blockValue: 180000,
    note: 'The workhorse. Decent reach, decent capacity, nothing spectacular.',
  },
  '2600': {
    id: '2600',
    label: '2600 MHz',
    radius: 0.8,
    capacity: 1.8,
    blockValue: 240000,
    note: 'Good capacity if you are willing to build more sites.',
  },
  '3500': {
    id: '3500',
    label: '3.5 GHz',
    radius: 0.6,
    capacity: 3.2,
    blockValue: 420000,
    requires: 'mobile_5g',
    note: 'The 5G mid band. Heavy capacity, and you will feel every metre of range you lost.',
  },
  '26000': {
    id: '26000',
    label: '26 GHz',
    radius: 0.28,
    capacity: 7,
    blockValue: 560000,
    requires: 'mobile_5g',
    note: 'Enormous capacity over a couple of streets. Stadiums and city centres only.',
  },
};

export const TOWER_BASE_RADIUS = 5.2;

export const MOBILE_OVERSUBSCRIPTION = 0.02;
export const MOBILE_AVG_SPEED = 90;

// How much of a district's population will ever buy a mobile plan from anyone.
export const MOBILE_MARKET_SHARE = 0.62;

export const DIFFICULTY: Record<
  Difficulty,
  {
    label: string;
    startMoney: number;
    incidentRate: number;
    churnMul: number;
    growthMul: number;
    competitorAggression: number;
    blurb: string;
  }
> = {
  casual: {
    label: 'Casual',
    startMoney: 160000,
    incidentRate: 0.45,
    churnMul: 0.7,
    growthMul: 1.25,
    competitorAggression: 0.6,
    blurb: 'Rare incidents, forgiving customers. Build the network you want.',
  },
  standard: {
    label: 'Standard',
    startMoney: 100000,
    incidentRate: 1,
    churnMul: 1,
    growthMul: 1,
    competitorAggression: 1,
    blurb: 'The intended balance of growth, cost and risk.',
  },
  hard: {
    label: 'Hard',
    startMoney: 70000,
    incidentRate: 1.6,
    churnMul: 1.35,
    growthMul: 0.85,
    competitorAggression: 1.45,
    blurb: 'Fragile margins, hungry rivals, and a network that bites back.',
  },
};

// A data centre earns from hosting and colocation. Sited where the businesses
// are, it earns more.
export const DATACENTER_HOSTING_BASE = 38000;

// Edge caching serves popular traffic locally, so it never crosses your network
// at all. This is the real reason to build one: it adds headroom everywhere.
export const DATACENTER_CACHE_PER_TIER = 0.08;
export const DATACENTER_CACHE_CAP = 0.3;

// Share of a subscriber's headline speed really on the wire at peak. Biggest balance dial.
export const OVERSUBSCRIPTION = 0.005;

// The same contention for business circuits, which are also sold at a headline rate.
export const CONTRACT_CONTENTION = 0.15;

export const HOURLY_DEMAND_CURVE = [
  0.22, 0.16, 0.12, 0.1, 0.1, 0.14, 0.26, 0.42, 0.55, 0.58, 0.6, 0.62, 0.66, 0.64, 0.62, 0.64, 0.72, 0.84, 0.95, 1.0,
  0.98, 0.9, 0.7, 0.42,
];

export const COMPANY_COLOR = '#3ee6d6';

export const UTIL_COLORS = [
  { max: 0.5, color: '#4ade80' },
  { max: 0.75, color: '#facc15' },
  { max: 0.9, color: '#fb923c' },
  { max: Infinity, color: '#ff5c68' },
];

export function utilColor(u: number) {
  return (UTIL_COLORS.find((c) => u < c.max) ?? UTIL_COLORS[UTIL_COLORS.length - 1]).color;
}

export function nodeCapacity(kind: NodeKind, tier: number) {
  const spec = NODE_SPECS[kind];
  return spec.baseCapacity * Math.pow(spec.tierCapacityMul, tier - 1);
}

export function nodeUpgradeCost(kind: NodeKind, currentTier: number) {
  const spec = NODE_SPECS[kind];
  return Math.round(spec.baseCost * Math.pow(spec.tierCostMul, currentTier - 1) * 0.8);
}

export function linkCapacity(tier: number) {
  return FIBER_BASE_CAPACITY * Math.pow(FIBER_TIER_MUL, tier - 1);
}

// Reach comes from the best low band you hold, not from stacking blocks.
export function spectrumRadiusFactor(spectrum: SpectrumHolding[]) {
  if (!spectrum.length) return 0;
  return Math.max(...spectrum.map((h) => SPECTRUM_BANDS[h.band].radius));
}

// Capacity, on the other hand, is the sum of everything you own.
export function spectrumCapacityFactor(spectrum: SpectrumHolding[]) {
  if (!spectrum.length) return 0;
  const score = spectrum.reduce((s, h) => s + h.blocks * SPECTRUM_BANDS[h.band].capacity, 0);
  return Math.min(5, 0.35 + score * 0.3);
}

export function towerRadius(spectrum: SpectrumHolding[], tier: number) {
  return TOWER_BASE_RADIUS * spectrumRadiusFactor(spectrum) * (1 + (tier - 1) * 0.14);
}

export function towerCapacity(spectrum: SpectrumHolding[], tier: number) {
  return nodeCapacity('tower', tier) * spectrumCapacityFactor(spectrum);
}

export function blocksOf(state: Pick<GameState, 'spectrum'>, band: BandId) {
  return state.spectrum.filter((h) => h.band === band).reduce((s, h) => s + h.blocks, 0);
}
