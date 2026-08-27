import {
  BASELINE_ARPU,
  DATACENTER_HOSTING_BASE,
  FIBER_MAINTENANCE_PER_UNIT,
  NODE_SPECS,
  POWER_COST_PER_KW_MONTH,
  TRANSIT_TIERS,
  BACKUP_TRANSIT_MONTHLY,
} from './constants';
import type { GameState, Package } from './types';
import type { ResearchMods } from './research';
import { staffModifiers } from './staff';
import {
  DATA_CENTER_MODE_CONFIG,
  INTERCONNECT_CONFIG,
  dataCenterMode,
  operationalDataCenters,
  wholesaleRevenue,
} from './strategy';

export interface MonthlyBreakdown {
  revenueResidential: number;
  revenueMobile: number;
  revenueBusiness: number;
  revenueEnterprise: number;
  revenueHosting: number;
  revenueWholesale: number;
  costSalaries: number;
  costPower: number;
  costMaintenance: number;
  costTransit: number;
  costMarketing: number;
  costRetention: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
}

export function monthlyBreakdown(state: GameState, mods: ResearchMods): MonthlyBreakdown {
  const staff = staffModifiers(state);
  const revenueResidential = state.packages
    .filter((p) => p.segment === 'residential' && p.active)
    .reduce((s, p) => s + p.subscribers * p.price, 0);

  const revenueMobile = state.packages
    .filter((p) => p.segment === 'mobile' && p.active)
    .reduce((s, p) => s + p.subscribers * p.price * mods.mobileRevenueMul, 0);

  const revenueBusiness = state.contracts
    .filter((c) => c.segment === 'business')
    .reduce((s, c) => s + c.monthlyRevenue, 0);
  const revenueEnterprise = state.contracts
    .filter((c) => c.segment === 'enterprise')
    .reduce((s, c) => s + c.monthlyRevenue, 0);

  const costSalaries =
    state.employees.reduce((s, e) => s + e.salary, 0) + state.technicians.reduce((s, t) => s + t.salary, 0);

  const powerKw = state.nodes.reduce((s, n) => {
    const modePower =
      n.kind === 'datacenter' ? DATA_CENTER_MODE_CONFIG[dataCenterMode(state, n.id)].powerMultiplier : 1;
    return s + NODE_SPECS[n.kind].powerKw * (1 + (n.tier - 1) * 0.55) * modePower;
  }, 0);
  const costPower = powerKw * POWER_COST_PER_KW_MONTH;

  const costMaintenance =
    (state.nodes.reduce((s, n) => s + NODE_SPECS[n.kind].maintenance * (1 + (n.tier - 1) * 0.5), 0) +
      state.links.reduce((s, l) => s + l.length * FIBER_MAINTENANCE_PER_UNIT * l.tier, 0)) *
    staff.maintenanceCostMul *
    mods.maintenanceCostMul;

  const transit = TRANSIT_TIERS[state.transitTier];
  const costTransit =
    (transit.monthly +
      (state.backupTransit ? BACKUP_TRANSIT_MONTHLY : 0) +
      INTERCONNECT_CONFIG[state.interconnectPlan].monthly) *
    mods.transitCostMul;

  const revenueHosting = hostingRevenue(state);
  const revenueWholesale = wholesaleRevenue(state);

  const totalRevenue =
    revenueResidential + revenueMobile + revenueBusiness + revenueEnterprise + revenueHosting + revenueWholesale;
  const totalCost =
    costSalaries + costPower + costMaintenance + costTransit + state.marketingBudget + state.retentionBudget;

  return {
    revenueResidential,
    revenueMobile,
    revenueBusiness,
    revenueEnterprise,
    revenueHosting,
    revenueWholesale,
    costSalaries,
    costPower,
    costMaintenance,
    costTransit,
    costMarketing: state.marketingBudget,
    costRetention: state.retentionBudget,
    totalRevenue,
    totalCost,
    profit: totalRevenue - totalCost,
  };
}

// Value per lira. Cheap gigabit is irresistible, which is how players overload themselves.
export function packageAppeal(p: Package) {
  const valuePerLira = p.speedMbps / Math.max(1, p.price);
  return Math.pow(Math.max(0.05, valuePerLira), 0.85);
}

export function packageMix(packages: Package[], segment: Package['segment'] = 'residential') {
  // Mobile and fixed are priced independently, so mixes never cross segments.
  const active = packages.filter((p) => p.active && p.segment === segment);
  if (!active.length) return [] as Array<{ pkg: Package; share: number }>;
  const appeals = active.map((p) => packageAppeal(p));
  const total = appeals.reduce((a, b) => a + b, 0) || 1;
  return active.map((p, i) => ({ pkg: p, share: appeals[i] / total }));
}

export function averagePrice(packages: Package[]) {
  const mix = packageMix(packages);
  if (!mix.length) return 0;
  return mix.reduce((s, m) => s + m.pkg.price * m.share, 0);
}

export function averageSpeed(packages: Package[]) {
  const mix = packageMix(packages);
  if (!mix.length) return 100;
  return mix.reduce((s, m) => s + m.pkg.speedMbps * m.share, 0);
}

// What the data centres bring in.
export function hostingRevenue(state: GameState) {
  return operationalDataCenters(state).reduce((sum, n) => {
    const district = state.districts.find((d) => d.id === n.districtId);
    const demand = 0.7 + (district?.businessDensity ?? 0.3);
    const mode = DATA_CENTER_MODE_CONFIG[dataCenterMode(state, n.id)];
    return sum + DATACENTER_HOSTING_BASE * (1 + (n.tier - 1) * 1.2) * demand * mode.revenueMultiplier;
  }, 0);
}

// Below 1 means you are the cheap option against the market reference price.
export function priceIndex(state: GameState) {
  const price = averagePrice(state.packages);
  // Use a neutral price index until the simulation restores a missing active fixed tariff.
  return price > 0 ? price / BASELINE_ARPU : 1;
}

export const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 10000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
};

export const fmtMoneyExact = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export const fmtNum = (n: number) => {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString('en-US');
};
