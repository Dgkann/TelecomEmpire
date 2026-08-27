import { NODE_SPECS, SAVE_KEY, SAVE_VERSION, SPECTRUM_BANDS, TRANSIT_TIERS } from './constants';
import { RANKS } from './progression';
import { RESEARCH } from './research';
import type { GameState, Package } from './types';

interface SaveSlot {
  version: number;
  savedAt: number;
  state: GameState;
}

type LegacyState = Record<string, unknown>;

// One entry per version bump, keyed by the version it upgrades from.
const MIGRATIONS: Record<number, (s: LegacyState) => LegacyState> = {
  // 1 -> 2: the mobile layer added spectrum, auctions and per-district radio coverage, plus three mobile packages.
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
            {
              id: 'pkg_mob_lite',
              name: 'Mobile Lite',
              speedMbps: 40,
              price: 12,
              segment: 'mobile',
              active: true,
              subscribers: 0,
            },
            {
              id: 'pkg_mob_std',
              name: 'Mobile Standard',
              speedMbps: 100,
              price: 22,
              segment: 'mobile',
              active: true,
              subscribers: 0,
            },
            {
              id: 'pkg_mob_max',
              name: 'Mobile Unlimited',
              speedMbps: 300,
              price: 38,
              segment: 'mobile',
              active: true,
              subscribers: 0,
            },
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

  // 5 -> 6: equipment ages from its last service.
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

  // 8 -> 9: the company ladder.
  8: (s) => ({ ...s, rank: s.rank ?? 0, victoryAt: s.victoryAt ?? null }),

  // 9 -> 10: lightweight NOC telemetry powers the daily load timeline.
  9: (s) => ({ ...s, telemetry: s.telemetry ?? [] }),
  // Faults in flight get their unscaled size back.
  10: (s) => ({
    ...s,
    incidents: ((s.incidents ?? []) as any[]).map((i: any) => ({
      ...i,
      repairBaseMinutes: i.repairBaseMinutes ?? i.repairTotalMinutes,
    })),
  }),
  // A rung was inserted at index 1, so anything above it shifts up.
  11: (s) => {
    const tier = (s.transitTier as number) ?? 0;
    return { ...s, transitTier: tier >= 1 ? tier + 1 : tier };
  },
  // Contracts signed before redundancy mattered keep their terms.
  12: (s) => ({
    ...s,
    contracts: ((s.contracts ?? []) as any[]).map((c: any) => ({
      ...c,
      requiresRedundancy: c.requiresRedundancy ?? false,
    })),
    offers: ((s.offers ?? []) as any[]).map((o: any) => ({ ...o, requiresRedundancy: o.requiresRedundancy ?? false })),
  }),
  13: (s) => ({
    ...s,
    competitors: ((s.competitors ?? []) as any[]).map((competitor: any) => ({
      ...competitor,
      spectrum: competitor.spectrum ?? [],
    })),
    finance: {
      revenueMobile: 0,
      revenueHosting: 0,
      costLoanPayments: 0,
      ...((s.finance ?? {}) as object),
    },
    stats: {
      fixedDemandGbps: 0,
      mobileDemandGbps: 0,
      transitGbps: isRecord(s.stats) && typeof s.stats.servedGbps === 'number' ? s.stats.servedGbps : 0,
      ...((s.stats ?? {}) as object),
    },
    ledger: s.ledger ?? [],
  }),
  // Planned work, commercial strategy and service policy became persistent systems.
  14: (s) => ({
    ...s,
    technicians: ((s.technicians ?? []) as any[]).map((technician: any) => ({
      ...technician,
      maintenanceId: technician.maintenanceId ?? null,
    })),
    maintenanceOrders: s.maintenanceOrders ?? [],
    campaigns: s.campaigns ?? [],
    trafficPolicy: s.trafficPolicy ?? 'balanced',
    interconnectPlan: s.interconnectPlan ?? 'transit',
    wholesaleFixed: s.wholesaleFixed ?? false,
    mvnoEnabled: s.mvnoEnabled ?? false,
    dataCenterModes: s.dataCenterModes ?? {},
    finance: {
      revenueWholesale: 0,
      ...((s.finance ?? {}) as object),
    },
  }),
  // Service-class telemetry makes QoS and wholesale delivery observable. Older
  // data centres are explicitly assigned their historical colocation default.
  15: (s) => {
    const nodes = Array.isArray(s.nodes) ? s.nodes : [];
    const existingModes = isRecord(s.dataCenterModes) ? s.dataCenterModes : {};
    const dataCenterModes = { ...existingModes };
    for (const entry of nodes) {
      if (
        isRecord(entry) &&
        entry.kind === 'datacenter' &&
        typeof entry.id === 'string' &&
        !(entry.id in dataCenterModes)
      ) {
        dataCenterModes[entry.id] = 'colocation';
      }
    }
    const emptyTraffic = { residential: 0, business: 0, mobile: 0, wholesale: 0, workload: 0 };
    const districts = Array.isArray(s.districts) ? s.districts : [];
    const buildings = Array.isArray(s.buildings) ? s.buildings : [];
    const contracts = Array.isArray(s.contracts) ? s.contracts : [];
    const campaigns = (Array.isArray(s.campaigns) ? s.campaigns : []).map((entry) => {
      if (!isRecord(entry) || typeof entry.districtId !== 'string') return entry;
      const district = districts.find((candidate) => isRecord(candidate) && candidate.id === entry.districtId);
      const fixed = buildings.reduce((sum, building) => {
        if (!isRecord(building) || building.districtId !== entry.districtId || building.segment !== 'residential')
          return sum;
        return (
          sum +
          (typeof building.households === 'number' && typeof building.connected === 'number'
            ? building.households * building.connected
            : 0)
        );
      }, 0);
      const mobile = isRecord(district) && typeof district.mobileSubs === 'number' ? district.mobileSubs : 0;
      return {
        ...entry,
        baselineCustomers: entry.baselineCustomers ?? fixed + mobile,
        baselineSatisfaction:
          entry.baselineSatisfaction ??
          (isRecord(district) && typeof district.satisfaction === 'number' ? district.satisfaction : 70),
        baselineContracts:
          entry.baselineContracts ??
          contracts.filter((contract) => isRecord(contract) && contract.districtId === entry.districtId).length,
      };
    });
    return {
      ...s,
      dataCenterModes,
      dataCenterModeChangedAt: Object.fromEntries(
        Object.keys(dataCenterModes).map((id) => [
          id,
          Math.max(0, (typeof s.minutes === 'number' ? s.minutes : 0) - 2880),
        ]),
      ),
      campaigns,
      campaignHistory: s.campaignHistory ?? [],
      stats: {
        ...((s.stats ?? {}) as object),
        serviceDemandGbps: emptyTraffic,
        serviceServedGbps: emptyTraffic,
      },
    };
  },
};

const DEFAULTS = {
  researchPoints: 0,
  contracts: [],
  offers: [],
  incidents: [],
  maintenanceOrders: [],
  technicians: [],
  employees: [],
  researchDone: [],
  researchActive: null,
  competitors: [],
  posts: [],
  log: [],
  history: [],
  ledger: [],
  monthAccumulator: { revenue: 0, expense: 0 },
  marketingBudget: 0,
  retentionBudget: 0,
  campaigns: [],
  campaignHistory: [],
  churn: [],
  trafficPolicy: 'balanced',
  interconnectPlan: 'transit',
  wholesaleFixed: false,
  mvnoEnabled: false,
  dataCenterModes: {},
  dataCenterModeChangedAt: {},
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

const BUILDING_KINDS = new Set([
  'house',
  'apartment',
  'office',
  'shop',
  'industrial',
  'hospital',
  'university',
  'park',
]);
const CUSTOMER_SEGMENTS = new Set(['residential', 'business', 'enterprise']);
const PACKAGE_SEGMENTS = new Set([...CUSTOMER_SEGMENTS, 'mobile']);
const NODE_KINDS = new Set(Object.keys(NODE_SPECS));
const INCIDENT_KINDS = new Set([
  'fiber_cut',
  'router_failure',
  'switch_failure',
  'ddos',
  'power_outage',
  'cooling_failure',
  'dns_failure',
  'bgp_leak',
  'bad_upgrade',
  'overheating',
]);
const STAFF_ROLES = new Set(['network_engineer', 'noc_engineer', 'field_tech', 'support', 'sales', 'security']);
const CHURN_REASONS = new Set(['price', 'outage', 'congestion', 'support', 'coverage', 'competition', 'satisfaction']);
const TRAFFIC_CLASSES = ['residential', 'business', 'mobile', 'wholesale', 'workload'] as const;
const RESEARCH_IDS = new Set(RESEARCH.map((r) => r.id));
const BAND_IDS = new Set(Object.keys(SPECTRUM_BANDS));
const MAINTENANCE_MODES = new Set(['urgent', 'overnight', 'defer']);
const MAINTENANCE_STATUSES = new Set(['scheduled', 'active', 'completed']);
const CAMPAIGN_KINDS = new Set(['acquisition', 'retention', 'business', 'mobile']);
const TRAFFIC_POLICIES = new Set(['balanced', 'residential', 'business', 'mobile']);
const INTERCONNECT_PLANS = new Set(['transit', 'ixp', 'cdn']);
const DATA_CENTER_MODES = new Set(['cache', 'colocation', 'cloud', 'recovery']);
const FINANCE_CATEGORIES = new Set([
  'residential',
  'mobile',
  'business',
  'enterprise',
  'hosting',
  'wholesale',
  'salaries',
  'power',
  'maintenance',
  'transit',
  'marketing',
  'retention',
  'sla_penalty',
  'loan_draw',
  'loan_payment',
  'spectrum',
  'research',
  'staff',
  'network_build',
  'network_upgrade',
  'network_service',
  'district_licence',
  'incident_response',
  'contract_bonus',
  'campaign',
  'asset_sale',
  'regulatory_fine',
]);

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown, max = 4000): value is string => typeof value === 'string' && value.length <= max;
const isId = (value: unknown): value is string => isText(value, 160) && value.length > 0;
const isBool = (value: unknown): value is boolean => typeof value === 'boolean';
const isNumber = (value: unknown, min = -Infinity, max = Infinity): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isInteger = (value: unknown, min = -Infinity, max = Infinity): value is number =>
  isNumber(value, min, max) && Number.isInteger(value);
const isEnum = (value: unknown, values: Set<string>): value is string => typeof value === 'string' && values.has(value);
const isNullable = (value: unknown, check: (candidate: unknown) => boolean) => value === null || check(value);
const isArrayOf = (value: unknown, check: (candidate: unknown) => boolean, max: number): value is unknown[] =>
  Array.isArray(value) && value.length <= max && value.every(check);

function isPoint(value: unknown, gridSize: number, integer = true) {
  if (!isRecord(value)) return false;
  const coordinate = integer
    ? (candidate: unknown) => isInteger(candidate, 0, gridSize - 1)
    : (candidate: unknown) => isNumber(candidate, -gridSize, gridSize * 2);
  return coordinate(value.gx) && coordinate(value.gy);
}

function isFractionRecord(value: unknown) {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 500 &&
    Object.entries(value).every(([key, entry]) => isId(key) && isNumber(entry, 0, 1))
  );
}

function isBooleanRecord(value: unknown) {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 500 &&
    Object.entries(value).every(([key, entry]) => isId(key) && isBool(entry))
  );
}

function isNonNegativeNumberRecord(value: unknown) {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 500 &&
    Object.entries(value).every(([key, entry]) => isId(key) && isNumber(entry, 0))
  );
}

function isDataCenterModeRecord(value: unknown) {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 500 &&
    Object.entries(value).every(([key, entry]) => isId(key) && isEnum(entry, DATA_CENTER_MODES))
  );
}

function hasUniqueIds(value: unknown[]) {
  const ids = value.map((entry) => (isRecord(entry) ? entry.id : undefined));
  return ids.every(isId) && new Set(ids).size === ids.length;
}

function isBuilding(value: unknown, gridSize: number) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isInteger(value.gx, 0, gridSize - 1) &&
    isInteger(value.gy, 0, gridSize - 1) &&
    isId(value.districtId) &&
    isEnum(value.kind, BUILDING_KINDS) &&
    isInteger(value.floors, 0, 200) &&
    isInteger(value.households, 0, 1_000_000) &&
    isEnum(value.segment, CUSTOMER_SEGMENTS) &&
    isNumber(value.connected, 0, 1) &&
    isNumber(value.lastConnectedAt) &&
    isInteger(value.seed)
  );
}

function isDistrict(value: unknown, gridSize: number) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.name, 200) &&
    isText(value.color, 40) &&
    isArrayOf(value.cells, (cell) => isPoint(cell, gridSize), gridSize * gridSize) &&
    value.cells.length > 0 &&
    isInteger(value.population, 0, 100_000_000) &&
    isInteger(value.potential, 0, 100_000_000) &&
    isEnum(value.incomeLevel, new Set(['low', 'medium', 'high'])) &&
    isNumber(value.businessDensity, 0, 1) &&
    isNumber(value.demandFactor, 0, 1) &&
    isNumber(value.competition, 0, 1) &&
    isNumber(value.coverage, 0, 1) &&
    isNumber(value.mobileCoverage, 0, 1) &&
    isNumber(value.mobileSubs, 0, 100_000_000) &&
    isNumber(value.satisfaction, 0, 100) &&
    isBool(value.unlocked) &&
    isNumber(value.entryCost, 0) &&
    isPoint(value.center, gridSize)
  );
}

function isNode(value: unknown, gridSize: number) {
  if (!isRecord(value) || !isEnum(value.kind, NODE_KINDS)) return false;
  const spec = NODE_SPECS[value.kind as keyof typeof NODE_SPECS];
  return (
    isId(value.id) &&
    isText(value.name, 240) &&
    isInteger(value.gx, 0, gridSize - 1) &&
    isInteger(value.gy, 0, gridSize - 1) &&
    isId(value.districtId) &&
    isInteger(value.tier, 1, spec.maxTier) &&
    isNumber(value.capacityGbps, 0, 1_000_000) &&
    isNumber(value.trafficGbps, 0, 1_000_000_000) &&
    isNumber(value.health, 0, 100) &&
    isBool(value.down) &&
    isNumber(value.builtAt, 0) &&
    isNumber(value.servicedAt, 0)
  );
}

function isLink(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.aId) &&
    isId(value.bId) &&
    isNumber(value.capacityGbps, 0.001, 10_000_000) &&
    isNumber(value.trafficGbps, 0, 1_000_000_000) &&
    isBool(value.down) &&
    isInteger(value.tier, 1, 3) &&
    isNumber(value.length, 0, 100_000) &&
    isNumber(value.builtAt, 0)
  );
}

function isPackage(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.name, 240) &&
    isNumber(value.speedMbps, 0.001, 10_000_000) &&
    isNumber(value.price, 0, 1_000_000) &&
    isEnum(value.segment, PACKAGE_SEGMENTS) &&
    isBool(value.active) &&
    isNumber(value.subscribers, 0, 100_000_000)
  );
}

function isContract(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.clientName, 240) &&
    isId(value.districtId) &&
    isId(value.buildingId) &&
    isNumber(value.bandwidthGbps, 0.001, 1_000_000) &&
    isNumber(value.monthlyRevenue, 0, 1_000_000_000) &&
    isNumber(value.slaPercent, 0, 100) &&
    isNumber(value.downtimeMinutes, 0) &&
    isNumber(value.penaltyPaid, 0) &&
    isNumber(value.startedAt) &&
    isInteger(value.termMonths, 1, 1200) &&
    (value.segment === 'business' || value.segment === 'enterprise') &&
    isBool(value.requiresRedundancy)
  );
}

function isOffer(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.clientName, 240) &&
    isId(value.districtId) &&
    isId(value.buildingId) &&
    isNumber(value.bandwidthGbps, 0.001, 1_000_000) &&
    isNumber(value.monthlyRevenue, 0, 1_000_000_000) &&
    isNumber(value.slaPercent, 0, 100) &&
    isInteger(value.termMonths, 1, 1200) &&
    (value.segment === 'business' || value.segment === 'enterprise') &&
    isBool(value.requiresRedundancy) &&
    isNumber(value.expiresAt) &&
    isNumber(value.signingBonus, 0)
  );
}

function isIncident(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isEnum(value.kind, INCIDENT_KINDS) &&
    isText(value.title, 240) &&
    isText(value.description) &&
    isId(value.targetId) &&
    (value.targetType === 'node' || value.targetType === 'link') &&
    isId(value.districtId) &&
    isNumber(value.startedAt) &&
    isNullable(value.repairMinutesLeft, (entry) => isNumber(entry, 0)) &&
    isNumber(value.repairTotalMinutes, 0.001) &&
    isNumber(value.repairBaseMinutes, 0.001) &&
    isNullable(value.assignedTechId, isId) &&
    isNumber(value.affected, 0) &&
    isBool(value.resolved) &&
    isBool(value.degrade)
  );
}

function isTechnician(value: unknown, gridSize: number) {
  const states = new Set(['idle', 'driving', 'working', 'returning']);
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.name, 240) &&
    isInteger(value.skill, 1, 5) &&
    isNumber(value.salary, 0) &&
    isInteger(value.experience, 0) &&
    isNullable(value.incidentId, isId) &&
    isNullable(value.maintenanceId, isId) &&
    isPoint(value, gridSize, false) &&
    isNumber(value.homeGx, -gridSize, gridSize * 2) &&
    isNumber(value.homeGy, -gridSize, gridSize * 2) &&
    isEnum(value.state, states)
  );
}

function isMaintenanceOrder(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.nodeId) &&
    isEnum(value.mode, MAINTENANCE_MODES) &&
    isEnum(value.status, MAINTENANCE_STATUSES) &&
    isNumber(value.scheduledAt, 0) &&
    isNullable(value.startedAt, (entry) => isNumber(entry, 0)) &&
    isNumber(value.minutesLeft, 0) &&
    isNullable(value.technicianId, isId) &&
    isNumber(value.cost, 0)
  );
}

function isCampaign(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.districtId) &&
    isEnum(value.kind, CAMPAIGN_KINDS) &&
    isNumber(value.startedAt, 0) &&
    isNumber(value.endsAt, 0) &&
    value.endsAt > value.startedAt &&
    isNumber(value.cost, 0) &&
    isNumber(value.baselineCustomers, 0) &&
    isNumber(value.baselineSatisfaction, 0, 100) &&
    isInteger(value.baselineContracts, 0)
  );
}

function isCampaignResult(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.districtId) &&
    isEnum(value.kind, CAMPAIGN_KINDS) &&
    isNumber(value.completedAt, 0) &&
    isNumber(value.cost, 0) &&
    isNumber(value.customerDelta) &&
    isNumber(value.satisfactionDelta) &&
    isInteger(value.contractDelta)
  );
}

function isEmployee(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.name, 240) &&
    isEnum(value.role, STAFF_ROLES) &&
    isNumber(value.salary, 0) &&
    isInteger(value.skill, 1, 5) &&
    isInteger(value.experience, 0)
  );
}

function isCompetitor(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.name, 240) &&
    isText(value.color, 40) &&
    isNumber(value.aggression, 0, 20) &&
    isFractionRecord(value.share) &&
    isNumber(value.priceIndex, 0, 20) &&
    isNumber(value.cash) &&
    isFractionRecord(value.coverage) &&
    isFractionRecord(value.mobileCoverage) &&
    isArrayOf(value.spectrum, isSpectrumHolding, Object.keys(SPECTRUM_BANDS).length) &&
    isNumber(value.tech, 0, 1) &&
    isNullable(value.lastMove, (entry) => isText(entry, 500))
  );
}

function isPost(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isText(value.handle, 240) &&
    isText(value.text) &&
    isInteger(value.stars, 1, 5) &&
    isNumber(value.at)
  );
}

function isLog(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isNumber(value.at) &&
    isText(value.text) &&
    (value.tone === 'good' || value.tone === 'bad' || value.tone === 'info')
  );
}

function isFinance(value: unknown) {
  if (!isRecord(value)) return false;
  return [
    'revenueResidential',
    'revenueMobile',
    'revenueBusiness',
    'revenueEnterprise',
    'revenueHosting',
    'revenueWholesale',
    'costSalaries',
    'costPower',
    'costMaintenance',
    'costTransit',
    'costMarketing',
    'costRetention',
    'costLoanPayments',
    'penalties',
  ].every((key) => isNumber(value[key], 0));
}

function isLedgerEntry(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isNumber(value.at, 0) &&
    isEnum(value.category, FINANCE_CATEGORIES) &&
    isText(value.label, 240) &&
    isNumber(value.amount)
  );
}

function isServiceTraffic(value: unknown) {
  return (
    isRecord(value) &&
    TRAFFIC_CLASSES.every((key) => isNumber(value[key], 0)) &&
    Object.keys(value).every((key) => TRAFFIC_CLASSES.includes(key as (typeof TRAFFIC_CLASSES)[number]))
  );
}

function isStats(value: unknown) {
  return (
    isRecord(value) &&
    isNumber(value.demandGbps, 0) &&
    isNumber(value.fixedDemandGbps, 0) &&
    isNumber(value.mobileDemandGbps, 0) &&
    isNumber(value.transitGbps, 0) &&
    isNumber(value.servedGbps, 0) &&
    isNumber(value.coreUtilization, 0) &&
    isNumber(value.packetLoss, 0, 1) &&
    isNumber(value.latencyMs, 0) &&
    isNumber(value.health, 0, 100) &&
    isServiceTraffic(value.serviceDemandGbps) &&
    isServiceTraffic(value.serviceServedGbps) &&
    isBooleanRecord(value.outages)
  );
}

function isHistoryPoint(value: unknown) {
  return (
    isRecord(value) &&
    isInteger(value.month, 0) &&
    isNumber(value.revenue, 0) &&
    isNumber(value.expense, 0) &&
    isNumber(value.customers, 0)
  );
}

function isChurn(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isNumber(value.at) &&
    isId(value.districtId) &&
    isNumber(value.count, 0.000001) &&
    isNullable(value.toId, isId) &&
    isText(value.toName, 240) &&
    isEnum(value.reason, CHURN_REASONS)
  );
}

function isTelemetry(value: unknown) {
  return (
    isRecord(value) &&
    isNumber(value.at) &&
    isNumber(value.demandGbps, 0) &&
    isNumber(value.servedGbps, 0) &&
    isNumber(value.packetLoss, 0, 1) &&
    isNumber(value.latencyMs, 0) &&
    isNumber(value.customers, 0) &&
    isNumber(value.cash)
  );
}

function isRegulation(value: unknown) {
  if (!isRecord(value) || (value.kind !== 'coverage' && value.kind !== 'price_cap' && value.kind !== 'resilience'))
    return false;
  return (
    isId(value.id) &&
    isText(value.title, 240) &&
    isText(value.detail) &&
    isNullable(value.districtId, isId) &&
    isNumber(value.target, 0, value.kind === 'price_cap' ? 20 : 1) &&
    isNumber(value.dueAt, 0) &&
    isNumber(value.fine, 0) &&
    (value.status === 'pending' || value.status === 'met' || value.status === 'failed') &&
    (value.kind === 'coverage' ? value.districtId !== null : value.districtId === null)
  );
}

function isLoan(value: unknown) {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isNumber(value.principal, 0.001) &&
    isNumber(value.remaining, 0) &&
    isNumber(value.rateAnnual, 0, 10) &&
    isNumber(value.monthlyPayment, 0.001) &&
    isInteger(value.termMonths, 1, 1200) &&
    isNumber(value.takenAt)
  );
}

function isSpectrumHolding(value: unknown) {
  return (
    isRecord(value) &&
    isEnum(value.band, BAND_IDS) &&
    isInteger(value.blocks, 1, 1_000_000) &&
    isNumber(value.wonAt) &&
    isNumber(value.paid, 0)
  );
}

function isAuctionBid(value: unknown) {
  return isRecord(value) && isId(value.bidderId) && isText(value.bidderName, 240) && isNumber(value.amount, 0);
}

function isAuction(value: unknown) {
  if (!isRecord(value)) return false;
  const validResult =
    value.result === null ||
    (isRecord(value.result) &&
      isId(value.result.winnerId) &&
      isText(value.result.winnerName, 240) &&
      isNumber(value.result.price, 0) &&
      isArrayOf(value.result.bids, isAuctionBid, 100));
  return (
    isId(value.id) &&
    isEnum(value.band, BAND_IDS) &&
    isInteger(value.blocks, 1, 1_000_000) &&
    isNumber(value.reserve, 0) &&
    isNumber(value.closesAt, 0) &&
    isNullable(value.playerBid, (entry) => isNumber(entry, 0)) &&
    validResult
  );
}

function isVersion(value: unknown) {
  return isInteger(value, 1, SAVE_VERSION);
}

// Keep the first contract or offer per building to prevent duplicate demand from older saves.
function normalizePortfolioReferences(state: LegacyState): LegacyState {
  if (!Array.isArray(state.contracts) || !Array.isArray(state.offers)) return state;
  const contractedBuildings = new Set<string>();
  const contracts = state.contracts.filter((entry) => {
    if (!isRecord(entry) || !isId(entry.buildingId)) return true;
    if (contractedBuildings.has(entry.buildingId)) return false;
    contractedBuildings.add(entry.buildingId);
    return true;
  });
  const offeredBuildings = new Set<string>();
  const offers = state.offers.filter((entry) => {
    if (!isRecord(entry) || !isId(entry.buildingId)) return true;
    if (contractedBuildings.has(entry.buildingId) || offeredBuildings.has(entry.buildingId)) return false;
    offeredBuildings.add(entry.buildingId);
    return true;
  });
  return { ...state, contracts, offers };
}

// Drop faults for removed assets and keep a dispatch only when both sides reference the same unresolved fault.
function normalizeIncidentReferences(state: LegacyState): LegacyState {
  const finance = isRecord(state.finance)
    ? {
        ...state.finance,
        costRetention: state.finance.costRetention ?? 0,
        revenueWholesale: state.finance.revenueWholesale ?? 0,
      }
    : state.finance;
  if (
    !Array.isArray(state.nodes) ||
    !Array.isArray(state.links) ||
    !Array.isArray(state.incidents) ||
    !Array.isArray(state.maintenanceOrders) ||
    !Array.isArray(state.technicians)
  ) {
    return { ...state, version: SAVE_VERSION, finance };
  }

  const nodeIds = new Set(
    state.nodes
      .filter(isRecord)
      .map((entry) => entry.id)
      .filter(isId),
  );
  const linkIds = new Set(
    state.links
      .filter(isRecord)
      .map((entry) => entry.id)
      .filter(isId),
  );
  const incidents = state.incidents.filter((entry) => {
    if (!isRecord(entry) || !isId(entry.targetId)) return true;
    if (entry.targetType === 'node') return nodeIds.has(entry.targetId);
    if (entry.targetType === 'link') return linkIds.has(entry.targetId);
    return true;
  });
  const technicianById = new Map(
    state.technicians
      .filter(isRecord)
      .filter((entry) => isId(entry.id))
      .map((entry) => [entry.id as string, entry]),
  );
  const validAssignments = new Map<string, string>();
  const normalizedIncidents = incidents.map((entry) => {
    if (!isRecord(entry)) return entry;
    const assignedTechId = entry.assignedTechId;
    const technician = isId(assignedTechId) ? technicianById.get(assignedTechId) : undefined;
    const validAssignment =
      entry.resolved === false &&
      isId(entry.id) &&
      isId(assignedTechId) &&
      technician?.incidentId === entry.id &&
      technician?.maintenanceId === null &&
      (technician.state === 'driving' || technician.state === 'working') &&
      isNumber(entry.repairMinutesLeft, 0);
    if (validAssignment) {
      validAssignments.set(entry.id as string, assignedTechId as string);
      return entry;
    }
    return entry.assignedTechId === null && entry.repairMinutesLeft === null
      ? entry
      : { ...entry, assignedTechId: null, repairMinutesLeft: null };
  });
  const validMaintenanceAssignments = new Map<string, string>();
  const maintenanceOrders = state.maintenanceOrders
    .filter((entry) => !isRecord(entry) || !isId(entry.nodeId) || nodeIds.has(entry.nodeId))
    .map((entry) => {
      if (!isRecord(entry) || entry.status !== 'active') return entry;
      const technician = isId(entry.technicianId) ? technicianById.get(entry.technicianId) : undefined;
      const validAssignment =
        isId(entry.id) &&
        isId(entry.technicianId) &&
        technician?.maintenanceId === entry.id &&
        technician?.incidentId === null &&
        (technician.state === 'driving' || technician.state === 'working');
      if (validAssignment) {
        validMaintenanceAssignments.set(entry.id as string, entry.technicianId as string);
        return entry;
      }
      return { ...entry, status: 'scheduled', technicianId: null, startedAt: null };
    });
  const technicians = state.technicians.map((entry) => {
    if (!isRecord(entry)) return entry;
    const hasValidIncident =
      isId(entry.id) && isId(entry.incidentId) && validAssignments.get(entry.incidentId) === entry.id;
    const hasValidMaintenance =
      isId(entry.id) && isId(entry.maintenanceId) && validMaintenanceAssignments.get(entry.maintenanceId) === entry.id;
    if (
      hasValidIncident ||
      hasValidMaintenance ||
      (entry.incidentId === null &&
        entry.maintenanceId === null &&
        (entry.state === 'idle' || entry.state === 'returning'))
    ) {
      return entry;
    }
    return { ...entry, incidentId: null, maintenanceId: null, state: 'idle' };
  });

  return { ...state, version: SAVE_VERSION, finance, incidents: normalizedIncidents, maintenanceOrders, technicians };
}

function validateState(value: unknown): GameState | null {
  if (!isRecord(value)) return null;
  const gridSize = value.gridSize;
  if (!isInteger(gridSize, 5, 500)) return null;

  const scalarFieldsValid =
    value.version === SAVE_VERSION &&
    isText(value.companyName, 240) &&
    isText(value.logo, 80) &&
    (value.difficulty === 'casual' || value.difficulty === 'standard' || value.difficulty === 'hard') &&
    isText(value.cityName, 240) &&
    isNumber(value.minutes, 0) &&
    (value.speed === 0 || value.speed === 1 || value.speed === 2 || value.speed === 4) &&
    isNumber(value.money) &&
    isNumber(value.reputation, 0, 100) &&
    isNumber(value.researchPoints, 0) &&
    isNumber(value.marketingBudget, 0) &&
    isNumber(value.retentionBudget, 0) &&
    isEnum(value.trafficPolicy, TRAFFIC_POLICIES) &&
    isEnum(value.interconnectPlan, INTERCONNECT_PLANS) &&
    isBool(value.wholesaleFixed) &&
    isBool(value.mvnoEnabled) &&
    isNumber(value.dayPeakDemand, 0) &&
    isInteger(value.rank, 0, RANKS.length - 1) &&
    isNullable(value.victoryAt, (entry) => isNumber(entry, 0)) &&
    isNumber(value.nextRegulationAt, 0) &&
    isNullable(value.insolventSince, (entry) => isNumber(entry, 0)) &&
    isInteger(value.transitTier, 0, TRANSIT_TIERS.length - 1) &&
    isBool(value.backupTransit) &&
    isBool(value.autoDispatch) &&
    (value.nextAuctionAt === Infinity || isNumber(value.nextAuctionAt, 0)) &&
    isNumber(value.nextEventAt, 0) &&
    isNumber(value.nextGrowthAt, 0) &&
    isInteger(value.tutorialStep, 0, 1000) &&
    isBool(value.tutorialDone) &&
    isNumber(value.autosaveAt, 0) &&
    isInteger(value.rngSeed);
  if (!scalarFieldsValid) return null;

  const arraysValid =
    isArrayOf(value.buildings, (entry) => isBuilding(entry, gridSize), gridSize * gridSize) &&
    isArrayOf(value.districts, (entry) => isDistrict(entry, gridSize), 500) &&
    value.districts.length > 0 &&
    isArrayOf(value.nodes, (entry) => isNode(entry, gridSize), gridSize * gridSize) &&
    isArrayOf(value.links, isLink, 100_000) &&
    isArrayOf(value.packages, isPackage, 500) &&
    value.packages.length > 0 &&
    isArrayOf(value.contracts, isContract, 10_000) &&
    isArrayOf(value.offers, isOffer, 1000) &&
    isArrayOf(value.incidents, isIncident, 1000) &&
    isArrayOf(value.maintenanceOrders, isMaintenanceOrder, 5000) &&
    isArrayOf(value.technicians, (entry) => isTechnician(entry, gridSize), 5000) &&
    isArrayOf(value.employees, isEmployee, 5000) &&
    isArrayOf(value.researchDone, (entry) => typeof entry === 'string' && RESEARCH_IDS.has(entry), RESEARCH.length) &&
    isArrayOf(value.competitors, isCompetitor, 100) &&
    isArrayOf(value.posts, isPost, 1000) &&
    isArrayOf(value.log, isLog, 5000) &&
    isArrayOf(value.history, isHistoryPoint, 1000) &&
    isArrayOf(value.ledger, isLedgerEntry, 1000) &&
    isArrayOf(value.churn, isChurn, 5000) &&
    isArrayOf(value.campaigns, isCampaign, 1000) &&
    isArrayOf(value.campaignHistory, isCampaignResult, 1000) &&
    isArrayOf(value.demandHistory, (entry) => isNumber(entry, 0), 1000) &&
    isArrayOf(value.telemetry, isTelemetry, 10_000) &&
    isArrayOf(value.regulations, isRegulation, 1000) &&
    isArrayOf(value.loans, isLoan, 10_000) &&
    isArrayOf(value.spectrum, isSpectrumHolding, Object.keys(SPECTRUM_BANDS).length);
  if (!arraysValid) return null;

  const objectsValid =
    isStats(value.stats) &&
    isFinance(value.finance) &&
    isDataCenterModeRecord(value.dataCenterModes) &&
    isNonNegativeNumberRecord(value.dataCenterModeChangedAt) &&
    isRecord(value.monthAccumulator) &&
    isNumber(value.monthAccumulator.revenue, 0) &&
    isNumber(value.monthAccumulator.expense, 0) &&
    (value.researchActive === null ||
      (isRecord(value.researchActive) &&
        typeof value.researchActive.id === 'string' &&
        RESEARCH_IDS.has(value.researchActive.id) &&
        isNumber(value.researchActive.daysLeft, 0))) &&
    (value.gameOver === null ||
      (isRecord(value.gameOver) && isText(value.gameOver.reason) && isNumber(value.gameOver.at, 0))) &&
    (value.auction === null || isAuction(value.auction)) &&
    (value.activeEvent === null ||
      (isRecord(value.activeEvent) &&
        isText(value.activeEvent.name, 240) &&
        isNumber(value.activeEvent.mul, 0.01, 100) &&
        isNumber(value.activeEvent.endsAt, 0) &&
        isText(value.activeEvent.blurb)));
  if (!objectsValid) return null;

  const state = value as unknown as GameState;
  const collections = [
    state.buildings,
    state.districts,
    state.nodes,
    state.links,
    state.packages,
    state.contracts,
    state.offers,
    state.incidents,
    state.maintenanceOrders,
    state.technicians,
    state.employees,
    state.competitors,
    state.posts,
    state.log,
    state.ledger,
    state.churn,
    state.campaigns,
    state.regulations,
    state.loans,
  ];
  if (collections.some((collection) => !hasUniqueIds(collection))) return null;
  if (new Set(state.researchDone).size !== state.researchDone.length) return null;
  if (new Set(state.spectrum.map((entry) => entry.band)).size !== state.spectrum.length) return null;

  const districtIds = new Set(state.districts.map((entry) => entry.id));
  const buildingById = new Map(state.buildings.map((entry) => [entry.id, entry]));
  const nodeIds = new Set(state.nodes.map((entry) => entry.id));
  const linkIds = new Set(state.links.map((entry) => entry.id));
  const technicianIds = new Set(state.technicians.map((entry) => entry.id));
  const incidentIds = new Set(state.incidents.map((entry) => entry.id));
  const maintenanceIds = new Set(state.maintenanceOrders.map((entry) => entry.id));
  const technicianById = new Map(state.technicians.map((entry) => [entry.id, entry]));
  const incidentById = new Map(state.incidents.map((entry) => [entry.id, entry]));
  const maintenanceById = new Map(state.maintenanceOrders.map((entry) => [entry.id, entry]));
  const referencesValid =
    state.buildings.every((entry) => districtIds.has(entry.districtId)) &&
    state.nodes.every((entry) => districtIds.has(entry.districtId)) &&
    state.links.every((entry) => entry.aId !== entry.bId && nodeIds.has(entry.aId) && nodeIds.has(entry.bId)) &&
    state.contracts.every((entry) => {
      const building = buildingById.get(entry.buildingId);
      return districtIds.has(entry.districtId) && building?.districtId === entry.districtId;
    }) &&
    state.offers.every((entry) => {
      const building = buildingById.get(entry.buildingId);
      return districtIds.has(entry.districtId) && building?.districtId === entry.districtId;
    }) &&
    state.incidents.every((entry) => {
      const technician = entry.assignedTechId === null ? null : technicianById.get(entry.assignedTechId);
      const assignmentValid =
        entry.assignedTechId === null
          ? entry.repairMinutesLeft === null
          : !entry.resolved &&
            technicianIds.has(entry.assignedTechId) &&
            technician?.incidentId === entry.id &&
            technician?.maintenanceId === null &&
            (technician.state === 'driving' || technician.state === 'working') &&
            entry.repairMinutesLeft !== null;
      return (
        districtIds.has(entry.districtId) &&
        (entry.targetType === 'node' ? nodeIds.has(entry.targetId) : linkIds.has(entry.targetId)) &&
        assignmentValid
      );
    }) &&
    state.maintenanceOrders.every((entry) => {
      const technician = entry.technicianId === null ? null : technicianById.get(entry.technicianId);
      if (!nodeIds.has(entry.nodeId)) return false;
      if (entry.status !== 'active') return entry.technicianId === null;
      return (
        entry.startedAt !== null &&
        entry.technicianId !== null &&
        technician?.maintenanceId === entry.id &&
        technician.incidentId === null &&
        (technician.state === 'driving' || technician.state === 'working')
      );
    }) &&
    state.technicians.every((entry) => {
      if (entry.incidentId !== null && entry.maintenanceId !== null) return false;
      if (entry.incidentId !== null) {
        const incident = incidentById.get(entry.incidentId);
        return (
          incidentIds.has(entry.incidentId) &&
          incident?.assignedTechId === entry.id &&
          !incident.resolved &&
          (entry.state === 'driving' || entry.state === 'working')
        );
      }
      if (entry.maintenanceId !== null) {
        const order = maintenanceById.get(entry.maintenanceId);
        return (
          maintenanceIds.has(entry.maintenanceId) &&
          order?.technicianId === entry.id &&
          order.status === 'active' &&
          (entry.state === 'driving' || entry.state === 'working')
        );
      }
      return entry.state === 'idle' || entry.state === 'returning';
    }) &&
    state.churn.every((entry) => districtIds.has(entry.districtId)) &&
    state.campaigns.every((entry) => districtIds.has(entry.districtId)) &&
    state.campaignHistory.every((entry) => districtIds.has(entry.districtId)) &&
    state.regulations.every((entry) => entry.districtId === null || districtIds.has(entry.districtId)) &&
    Object.keys(state.stats.outages).every((id) => districtIds.has(id)) &&
    state.competitors.every(
      (entry) =>
        Object.keys(entry.share).every((id) => districtIds.has(id)) &&
        Object.keys(entry.coverage).every((id) => districtIds.has(id)) &&
        Object.keys(entry.mobileCoverage).every((id) => districtIds.has(id)) &&
        new Set(entry.spectrum.map((holding) => holding.band)).size === entry.spectrum.length,
    ) &&
    Object.entries(state.dataCenterModes).every(([id]) =>
      state.nodes.some((node) => node.id === id && node.kind === 'datacenter'),
    ) &&
    Object.keys(state.dataCenterModeChangedAt).every((id) =>
      state.nodes.some((node) => node.id === id && node.kind === 'datacenter'),
    );
  if (!referencesValid) return null;

  const contractedBuildings = state.contracts.map((entry) => entry.buildingId);
  const offeredBuildings = state.offers.map((entry) => entry.buildingId);
  if (new Set(contractedBuildings).size !== contractedBuildings.length) return null;
  if (new Set(offeredBuildings).size !== offeredBuildings.length) return null;
  if (offeredBuildings.some((buildingId) => contractedBuildings.includes(buildingId))) return null;

  const cellKeys = state.districts.flatMap((district) => district.cells.map((cell) => `${cell.gx}:${cell.gy}`));
  const buildingKeys = state.buildings.map((entry) => `${entry.gx}:${entry.gy}`);
  const nodeKeys = state.nodes.map((entry) => `${entry.gx}:${entry.gy}`);
  if (new Set(cellKeys).size !== cellKeys.length) return null;
  if (new Set(buildingKeys).size !== buildingKeys.length) return null;
  if (new Set(nodeKeys).size !== nodeKeys.length) return null;

  for (const id of state.researchDone) {
    const node = RESEARCH.find((entry) => entry.id === id);
    if (!node || !node.requires.every((requirement) => state.researchDone.includes(requirement))) return null;
  }
  if (state.researchActive) {
    const node = RESEARCH.find((entry) => entry.id === state.researchActive?.id);
    if (!node || state.researchDone.includes(node.id) || !node.requires.every((id) => state.researchDone.includes(id)))
      return null;
  }

  return state;
}

function normalizeAndValidate(state: LegacyState) {
  return validateState(normalizeIncidentReferences(normalizePortfolioReferences(state)));
}

function parseSaveSlot(value: unknown): { version: number; savedAt: number; state: LegacyState } | null {
  if (!isRecord(value) || !isVersion(value.version) || !isNumber(value.savedAt, 0) || !isRecord(value.state))
    return null;
  return { version: value.version, savedAt: value.savedAt, state: value.state };
}

// JSON serializes Infinity as null, but a missing field remains invalid.
function reviveInfinities(s: LegacyState): LegacyState {
  return { ...s, nextAuctionAt: s.nextAuctionAt === null ? Infinity : s.nextAuctionAt };
}

export function migrate(state: LegacyState, fromVersion: number): GameState | null {
  if (!isVersion(fromVersion) || !isRecord(state)) return null;
  const isLegacy = fromVersion < SAVE_VERSION;
  let current = state;
  let version = fromVersion;

  try {
    while (version < SAVE_VERSION) {
      const migration = MIGRATIONS[version];
      if (!migration) return null;
      current = migration(current);
      version += 1;
    }

    current = reviveInfinities(isLegacy ? { ...DEFAULTS, ...current } : current);

    for (const key of REQUIRED) {
      if (!Array.isArray(current[key])) return null;
    }
    return normalizeAndValidate(current);
  } catch {
    return null;
  }
}

export const SAVE_SLOT_COUNT = 3;

const keyForSlot = (slot: number) => (slot === 0 ? SAVE_KEY : `${SAVE_KEY}-slot-${slot + 1}`);
const safeSlot = (slot: number) => Math.max(0, Math.min(SAVE_SLOT_COUNT - 1, Math.floor(slot)));

export function saveGame(state: GameState, slot = 0) {
  try {
    const normalized = normalizeAndValidate(state as unknown as LegacyState);
    if (!normalized) return false;
    const payload: SaveSlot = { version: SAVE_VERSION, savedAt: Date.now(), state: normalized };
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
    const payload = parseSaveSlot(JSON.parse(raw));
    return payload ? migrate(payload.state, payload.version) : null;
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
    const payload = parseSaveSlot(JSON.parse(raw));
    if (!payload) return null;
    const state = migrate(payload.state, payload.version);
    if (!state) return null;
    const fixedSubs = state.buildings.reduce(
      (s, b) => (b.segment === 'residential' ? s + b.households * b.connected : s),
      0,
    );
    const mobileSubs = state.districts.reduce((sum, district) => sum + district.mobileSubs, 0);
    return {
      slot: resolvedSlot,
      savedAt: payload.savedAt,
      company: state.companyName,
      city: state.cityName,
      customers: Math.round(fixedSubs + mobileSubs) + state.contracts.length,
      minutes: state.minutes,
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
    return true;
  } catch {
    return false;
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
    const parsed = parseSaveSlot(JSON.parse(raw));
    if (!parsed) return null;
    const state = migrate(parsed.state, parsed.version);
    if (!state) return null;
    const payload: SaveSlot = { version: SAVE_VERSION, savedAt: Date.now(), state };
    localStorage.setItem(keyForSlot(safeSlot(slot)), JSON.stringify(payload));
    return state;
  } catch {
    return null;
  }
}
