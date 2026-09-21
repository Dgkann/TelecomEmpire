import { initialCompetition, tickCompetition, marketEffects } from './competition';
import { averageSatisfaction, reputationOutlook } from './reputation';
import { initialProcurement, tickProcurement } from './procurement';
import { fixedCoverageTarget } from './reach';
import { initialStrategy, tickBoard, developDistrict } from './board';
import {
  CONTRACT_CONTENTION,
  ENERGY,
  DIFFICULTY,
  GRID,
  HOURLY_DEMAND_CURVE,
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  MINUTES_PER_STEP,
  SLA_PENALTY_CAP,
  MOBILE_AVG_SPEED,
  MOBILE_MARKET_SHARE,
  MOBILE_OVERSUBSCRIPTION,
  OVERSUBSCRIPTION,
  SAVE_VERSION,
  SPECTRUM_BANDS,
  START_DATE,
  TRANSIT_TIERS,
  nodeCapacity,
  towerRadius,
} from './constants';
import { effectiveNodeCapacity } from './capacity';
import { DATACENTER_PILOT_SHARE } from './constants';
import { createAuction, grantStarterSpectrum, settleAuction } from './spectrum';
import { playerShareTarget, strongestRival, tickCompetitors } from './competitors';
import { chargeLoans, checkSolvency } from './finance';
import { recordLedger, recordOperatingMonth } from './financeLedger';
import { makeRegulation, regulationCopy, settleRegulations, shouldIssue } from './regulator';
import { checkPromotion, customerCount, isTopRank } from './progression';
import { approach, clamp, plural } from './util';
import { generateCity } from './cityGen';
import { averageSpeed, fmtMoneyExact, monthlyBreakdown, packageMix, priceIndex } from './economy';
import {
  incidentCopy,
  repairCost,
  repairMinutes,
  incidentLocation,
  dispatchCandidates,
  pendingIncidents,
  CREW_SPEED,
  rollIncident,
  type RepairMode,
} from './incidents';
import { contractProfile } from './contracts';
import {
  CITY_EVENTS,
  cityEventCopy,
  companyName,
  enterpriseName,
  handleName,
  makePost,
  makeSwitchPost,
  personName,
} from './names';
import { computeRoutes, loadServices, servingNodes, type TrafficService } from './network';
import { initialEnergy, siteDrawKw, tickEnergyMonth } from './energy';
import { initialSignalTraining } from './signalTraining';
import { researchModifiers, researchById, type ResearchMods } from './research';
import { researchCopy } from './researchCopy';
import { line } from './lang';
import { CAMPAIGN_STAGES, scenarioStatus } from './scenarios';
import { staffModifiers, trainEmployee, trainTechnician } from './staff';
import {
  DATA_CENTER_MODE_CONFIG,
  INTERCONNECT_CONFIG,
  TRAFFIC_POLICY_CONFIG,
  activeCampaign,
  dataCenterMode,
  interconnectOperational,
  operationalDataCenters,
  wholesaleDemand,
  maintenanceCost,
  maintenanceStart,
  MAINTENANCE_CONFIG,
} from './strategy';
import { makeRng, pick, rand, randInt, uid, type Rng } from './rng';
import type {
  Building,
  ChurnReason,
  Difficulty,
  District,
  GameState,
  Incident,
  NetNode,
  ServiceTraffic,
  Technician,
  TrafficClass,
} from './types';

const emptyServiceTraffic = (): ServiceTraffic => ({
  residential: 0,
  business: 0,
  mobile: 0,
  wholesale: 0,
  workload: 0,
});

export const trafficClassOf = (serviceId: string): TrafficClass => {
  if (serviceId.startsWith('residential:')) return 'residential';
  if (serviceId.startsWith('business:')) return 'business';
  if (serviceId.startsWith('mobile:')) return 'mobile';
  if (serviceId.startsWith('wholesale-')) return 'wholesale';
  return 'workload';
};

// Weighted max-min allocation keeps priority meaningful at the upstream edge
// without leaving capacity idle when a protected class asks for very little.
export function allocateTransit(
  offered: ServiceTraffic,
  priorities: Record<TrafficClass, number>,
  capacity: number,
): ServiceTraffic {
  const carried = emptyServiceTraffic();
  let remainingCapacity = Math.max(0, capacity);
  let remaining = (Object.keys(offered) as TrafficClass[]).filter((key) => offered[key] > 0);

  while (remaining.length && remainingCapacity > 0.000001) {
    const weighted = remaining.reduce((sum, key) => sum + offered[key] * priorities[key], 0);
    if (weighted <= 0) break;
    const roundCapacity = remainingCapacity;
    const saturated: TrafficClass[] = [];
    for (const key of remaining) {
      const share = (roundCapacity * offered[key] * priorities[key]) / weighted;
      const need = offered[key] - carried[key];
      if (share >= need) {
        carried[key] += need;
        remainingCapacity -= need;
        saturated.push(key);
      }
    }
    if (!saturated.length) {
      for (const key of remaining) {
        carried[key] += (remainingCapacity * offered[key] * priorities[key]) / weighted;
      }
      break;
    }
    remaining = remaining.filter((key) => !saturated.includes(key));
  }
  return carried;
}

export function dateFromMinutes(minutes: number) {
  return new Date(START_DATE.getTime() + minutes * 60000);
}

export function hourOfDay(minutes: number) {
  return (minutes % MINUTES_PER_DAY) / 60;
}

export function demandCurve(minutes: number) {
  const h = hourOfDay(minutes);
  const i = Math.floor(h) % 24;
  const j = (i + 1) % 24;
  const t = h - Math.floor(h);
  return HOURLY_DEMAND_CURVE[i] * (1 - t) + HOURLY_DEMAND_CURVE[j] * t;
}

// 0 = deep night, 1 = midday. Drives the map's day/night wash.
export function daylight(minutes: number) {
  const h = hourOfDay(minutes);
  return Math.max(0, Math.min(1, Math.sin(((h - 6) / 12) * Math.PI)));
}

export const fmtClock = (minutes: number) => {
  const d = dateFromMinutes(minutes);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const fmtDate = (minutes: number) => {
  const d = dateFromMinutes(minutes);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export interface NewGameOptions {
  companyName: string;
  logo: string;
  difficulty: Difficulty;
  cityName: string;
  seed?: number;
  mode?: GameState['mode'];
  scenarioId?: GameState['scenarioId'];
  campaignStage?: number;
}

export function createNewGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rng = makeRng(seed);
  const mode = opts.mode ?? 'sandbox';
  const campaignStage = Math.max(0, Math.min(CAMPAIGN_STAGES.length - 1, opts.campaignStage ?? 0));
  const campaign = CAMPAIGN_STAGES[campaignStage];
  const cityName = mode === 'campaign' ? campaign.cityName : opts.cityName;
  const scenarioId = mode === 'campaign' ? campaign.scenarioId : (opts.scenarioId ?? 'freeplay');
  const { districts, buildings } = generateCity(seed, cityName);
  const diff = DIFFICULTY[opts.difficulty];

  const home = districts[0];
  const coreGx = home.center.gx;
  const coreGy = home.center.gy;

  const core = {
    id: uid('n'),
    kind: 'core' as const,
    name: `${home.name} Core`,
    gx: coreGx,
    gy: coreGy,
    districtId: home.id,
    tier: 1,
    capacityGbps: nodeCapacity('core', 1),
    trafficGbps: 0,
    health: 100,
    down: false,
    builtAt: 0,
    servicedAt: 0,
  };

  const popGx = Math.max(1, Math.min(GRID - 2, coreGx + 3));
  const popGy = Math.max(1, Math.min(GRID - 2, coreGy + 2));
  const pop = {
    id: uid('n'),
    kind: 'pop' as const,
    name: `${home.name} POP`,
    gx: popGx,
    gy: popGy,
    districtId: home.id,
    tier: 1,
    capacityGbps: nodeCapacity('pop', 1),
    trafficGbps: 0,
    health: 100,
    down: false,
    builtAt: 0,
    servicedAt: 0,
  };

  const length = Math.hypot(core.gx - pop.gx, core.gy - pop.gy);
  const link = {
    id: uid('l'),
    aId: core.id,
    bId: pop.id,
    capacityGbps: 10,
    trafficGbps: 0,
    down: false,
    tier: 1,
    length,
    builtAt: 0,
  };

  const state: GameState = {
    version: SAVE_VERSION,
    companyName: opts.companyName,
    logo: opts.logo,
    difficulty: opts.difficulty,
    cityName,
    mode,
    scenarioId,
    scenarioCompletedAt: null,
    campaignStage,
    minutes: 8 * 60,
    speed: 1,
    money: diff.startMoney,
    reputation: 50,
    researchPoints: 0,
    gridSize: GRID,
    buildings,
    districts,
    nodes: [core, pop],
    links: [link],
    packages: [
      {
        id: 'pkg_start',
        name: 'Starter Fibre',
        speedMbps: 100,
        price: 400,
        segment: 'residential',
        active: true,
        subscribers: 0,
      },
      {
        id: 'pkg_plus',
        name: 'Fibre Plus',
        speedMbps: 500,
        price: 700,
        segment: 'residential',
        active: true,
        subscribers: 0,
      },
      {
        id: 'pkg_ultra',
        name: 'Ultra Fibre',
        speedMbps: 1000,
        price: 1000,
        segment: 'residential',
        active: true,
        subscribers: 0,
      },
      // Sold only once you have radios and spectrum to run them on.
      {
        id: 'pkg_mob_lite',
        name: 'Mobile Lite',
        speedMbps: 40,
        price: 240,
        segment: 'mobile',
        active: true,
        subscribers: 0,
      },
      {
        id: 'pkg_mob_std',
        name: 'Mobile Standard',
        speedMbps: 100,
        price: 440,
        segment: 'mobile',
        active: true,
        subscribers: 0,
      },
      {
        id: 'pkg_mob_max',
        name: 'Mobile Unlimited',
        speedMbps: 300,
        price: 760,
        segment: 'mobile',
        active: true,
        subscribers: 0,
      },
    ],
    contracts: [],
    offers: [],
    incidents: [],
    maintenanceOrders: [],
    technicians: [makeTechnician(rng, popGx, popGy), makeTechnician(rng, popGx, popGy)],
    employees: [
      { id: uid('e'), name: personName(rng), role: 'network_engineer', salary: 84000, skill: 3, experience: 0 },
      { id: uid('e'), name: personName(rng), role: 'support', salary: 48000, skill: 2, experience: 0 },
    ],
    researchDone: [],
    researchActive: null,
    competitors: [
      {
        id: 'novatel',
        name: 'NovaTel',
        color: '#ff9f43',
        aggression: 0.9,
        share: {},
        priceIndex: 1,
        cash: 5000000,
        coverage: {},
        mobileCoverage: {},
        spectrum: [],
        tech: 0.2,
        lastMove: null,
      },
      {
        id: 'hypernet',
        name: 'HyperNet',
        color: '#a78bfa',
        aggression: 1.1,
        share: {},
        priceIndex: 0.92,
        cash: 5000000,
        coverage: {},
        mobileCoverage: {},
        spectrum: [],
        tech: 0.2,
        lastMove: null,
      },
      {
        id: 'telestar',
        name: 'Telestar',
        color: '#7ee787',
        aggression: 0.7,
        share: {},
        priceIndex: 1.12,
        cash: 5000000,
        coverage: {},
        mobileCoverage: {},
        spectrum: [],
        tech: 0.2,
        lastMove: null,
      },
    ],
    posts: [],
    log: [
      {
        id: uid('log'),
        at: 8 * 60,
        text: line(
          `${opts.companyName} is licensed to operate in ${home.name}.`,
          `${opts.companyName} ${home.name} ilçesinde faaliyet lisansı aldı.`,
        ),
        tone: 'info',
      },
    ],
    stats: {
      demandGbps: 0,
      fixedDemandGbps: 0,
      mobileDemandGbps: 0,
      transitGbps: 0,
      servedGbps: 0,
      coreUtilization: 0,
      packetLoss: 0,
      latencyMs: 12,
      health: 100,
      serviceDemandGbps: emptyServiceTraffic(),
      serviceServedGbps: emptyServiceTraffic(),
      outages: {},
    },
    finance: {
      revenueResidential: 0,
      revenueMobile: 0,
      revenueBusiness: 0,
      revenueEnterprise: 0,
      revenueHosting: 0,
      revenueWholesale: 0,
      costSalaries: 0,
      costPower: 0,
      costMaintenance: 0,
      costTransit: 0,
      costMarketing: 0,
      costRetention: 0,
      costLoanPayments: 0,
      penalties: 0,
    },
    ledger: [],
    history: [],
    monthAccumulator: { revenue: 0, expense: 0 },
    marketingBudget: 40000,
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
    demandHistory: [],
    dayPeakDemand: 0,
    telemetry: [],
    rank: 0,
    victoryAt: null,
    regulations: [],
    nextRegulationAt: MINUTES_PER_DAY * 120,
    loans: [],
    insolventSince: null,
    gameOver: null,
    transitTier: 0,
    backupTransit: false,
    autoDispatch: false,
    spectrum: [],
    auction: null,
    nextAuctionAt: Infinity,
    activeEvent: null,
    nextEventAt: MINUTES_PER_DAY * randInt(rng, 6, 12),
    nextGrowthAt: MINUTES_PER_DAY * 20,
    tutorialStep: 0,
    claimedMilestones: [],
    strategy: initialStrategy(8 * 60),
    energy: initialEnergy(8 * 60),
    signalTraining: initialSignalTraining(),
    procurement: initialProcurement(8 * 60),
    competition: initialCompetition(8 * 60),
    tutorialDone: false,
    autosaveAt: 0,
    rngSeed: seed,
  };

  for (const d of state.districts) {
    let remaining = d.competition;
    for (const c of state.competitors) {
      const take = remaining * (0.25 + rng() * 0.3);
      c.share[d.id] = take;
      // Their share has to be backed by coverage they actually built.
      c.coverage[d.id] = clamp(take * 1.3, 0, 0.9);
      c.mobileCoverage[d.id] = 0;
      remaining -= take;
    }
  }

  seedStartingCustomers(state, 200, home.id);
  tickProcurement(state, 0);
  return state;
}

function makeTechnician(rng: Rng, gx: number, gy: number): Technician {
  return {
    id: uid('t'),
    name: personName(rng),
    skill: randInt(rng, 1, 3),
    salary: 44000 + randInt(rng, 0, 12000),
    experience: 0,
    incidentId: null,
    maintenanceId: null,
    gx,
    gy,
    homeGx: gx,
    homeGy: gy,
    state: 'idle',
  };
}

function seedStartingCustomers(state: GameState, count: number, districtId: string) {
  const pool = state.buildings.filter(
    (b) => b.districtId === districtId && b.segment === 'residential' && b.households > 0,
  );
  let left = count;
  let i = 0;
  while (left > 0 && i < pool.length * 4) {
    const b = pool[i % pool.length];
    const take = Math.min(left, Math.ceil(b.households * 0.5));
    b.connected = Math.min(1, b.connected + take / b.households);
    left -= take;
    i++;
  }
  const district = state.districts.find((d) => d.id === districtId);
  if (district) district.coverage = 0.05;
  redistributePackages(state);
}

// Fraction of popular traffic served locally by connected data centres and partners.
export function cacheRatio(s: GameState) {
  const routes = computeRoutes(s);
  const local = operationalDataCenters(s, routes).reduce(
    (sum, n) => sum + DATA_CENTER_MODE_CONFIG[dataCenterMode(s, n.id)].cachePerTier * n.tier,
    0,
  );
  const partner = interconnectOperational(s, routes) ? INTERCONNECT_CONFIG[s.interconnectPlan].cacheOffload : 0;
  return Math.min(0.3, local + partner);
}

export function residentialSubs(state: GameState, districtId?: string) {
  return state.buildings.reduce(
    (s, b) =>
      b.segment === 'residential' && (!districtId || b.districtId === districtId) ? s + b.households * b.connected : s,
    0,
  );
}

// One definition, shared with the rank ladder, so the two cannot drift apart.
export const totalCustomers = (state: GameState) => Math.round(customerCount(state));

// Keeps package subscriber counts consistent with what the map actually shows.
export function redistributePackages(state: GameState) {
  const total = residentialSubs(state);
  const mix = packageMix(state.packages, 'residential');
  const shares = new Map(mix.map((m) => [m.pkg.id, m.share]));
  state.packages = state.packages.map((p) =>
    p.segment === 'residential' ? { ...p, subscribers: Math.round(total * (shares.get(p.id) ?? 0)) } : p,
  );
}

// Restore the busiest or first tariff when a segment has none active before calculating revenue and demand.
function ensureActiveTariffs(s: GameState) {
  const restore = (segment: 'residential' | 'mobile', label: string, labelTr: string) => {
    const plans = s.packages.filter((p) => p.segment === segment);
    if (!plans.length || plans.some((p) => p.active)) return false;
    const fallback = plans.reduce((best, p) => (p.subscribers > best.subscribers ? p : best), plans[0]);
    s.packages = s.packages.map((p) => (p.id === fallback.id ? { ...p, active: true } : p));
    pushLog(
      s,
      line(
        `${fallback.name} was kept active; ${label} service needs at least one tariff.`,
        `${fallback.name} etkin bırakıldı; ${labelTr} hizmeti için en az bir tarife gerekiyor.`,
      ),
      'info',
    );
    return true;
  };

  const fixedRestored = restore('residential', 'fixed', 'sabit');
  const mobileRestored = restore('mobile', 'mobile', 'mobil');
  if (fixedRestored) redistributePackages(s);
  if (mobileRestored) redistributeMobilePackages(s);
}

// Shared offered-load model for live simulation and the capacity planning lab.
export function offeredTraffic(
  s: GameState,
  curve = demandCurve(s.minutes) * (s.activeEvent && s.minutes < s.activeEvent.endsAt ? s.activeEvent.mul : 1),
) {
  const avgSpeed = averageSpeed(s.packages);

  // Edge caches serve popular traffic locally, so it never touches the network.
  const routes = computeRoutes(s);
  const cacheOffload = cacheRatio(s);

  const residentialDemand: Record<string, number> = {};
  const businessDemand: Record<string, number> = {};
  const mobileDemand: Record<string, number> = {};
  const wholesaleFixedDemand: Record<string, number> = {};
  const wholesaleMobileDemand: Record<string, number> = {};
  for (const d of s.districts) {
    const subs = residentialSubs(s, d.id);
    const resDemand = (subs * avgSpeed * OVERSUBSCRIPTION * curve) / 1000; // Gbps
    const bizDemand = s.contracts
      .filter((c) => c.districtId === d.id)
      .reduce((sum, c) => sum + c.bandwidthGbps * CONTRACT_CONTENTION * (0.45 + 0.55 * curve), 0);
    const mobile = (d.mobileSubs * MOBILE_AVG_SPEED * MOBILE_OVERSUBSCRIPTION * curve) / 1000;
    const wholesale = wholesaleDemand(s, resDemand, mobile);
    residentialDemand[d.id] = resDemand * (1 - cacheOffload);
    businessDemand[d.id] = bizDemand;
    mobileDemand[d.id] = mobile * (1 - cacheOffload);
    wholesaleFixedDemand[d.id] = wholesale.fixed * (1 - cacheOffload);
    wholesaleMobileDemand[d.id] = wholesale.mobile * (1 - cacheOffload);
  }

  // 2. Route and load
  const liveTowers = s.nodes.filter((node) => node.kind === 'tower' && !node.down && routes[node.id]);
  const priorities = TRAFFIC_POLICY_CONFIG[s.trafficPolicy].priorities;
  const services: TrafficService[] = s.districts.flatMap((district) => {
    const fixedNodes = servingNodes(s, district.id).map((node) => node.id);
    const towers = mobileServingTowers(s, district, liveTowers).map((node) => node.id);
    return [
      {
        id: `residential:${district.id}`,
        districtId: district.id,
        demandGbps: residentialDemand[district.id] ?? 0,
        servingNodeIds: fixedNodes,
        priority: priorities.residential,
      },
      {
        id: `business:${district.id}`,
        districtId: district.id,
        demandGbps: businessDemand[district.id] ?? 0,
        servingNodeIds: fixedNodes,
        priority: priorities.business,
      },
      {
        id: `mobile:${district.id}`,
        districtId: district.id,
        demandGbps: mobileDemand[district.id] ?? 0,
        servingNodeIds: towers,
        priority: priorities.mobile,
      },
      {
        id: `wholesale-fixed:${district.id}`,
        districtId: district.id,
        demandGbps: wholesaleFixedDemand[district.id] ?? 0,
        servingNodeIds: fixedNodes,
        priority: priorities.wholesale,
      },
      {
        id: `wholesale-mobile:${district.id}`,
        districtId: district.id,
        demandGbps: wholesaleMobileDemand[district.id] ?? 0,
        servingNodeIds: towers,
        priority: priorities.wholesale,
      },
    ];
  });
  for (const node of s.nodes.filter((entry) => entry.kind === 'datacenter' && !entry.down && routes[entry.id])) {
    const mode = DATA_CENTER_MODE_CONFIG[dataCenterMode(s, node.id)];
    services.push({
      id: `workload:${node.id}`,
      districtId: node.districtId,
      demandGbps: mode.workloadPerTier * (node.tier === 0 ? DATACENTER_PILOT_SHARE : node.tier) * (0.45 + 0.55 * curve),
      servingNodeIds: [node.id],
      priority: priorities.workload,
    });
  }
  return {
    avgSpeed,
    services,
    routes,
    priorities,
    liveTowers,
    residentialDemand,
    businessDemand,
    mobileDemand,
    wholesaleFixedDemand,
    wholesaleMobileDemand,
  };
}

export function step(prev: GameState): GameState {
  if (prev.gameOver || prev.signalTraining.active) return prev;
  const s: GameState = { ...prev };
  ensureActiveTariffs(s);
  const rng = makeRng((s.minutes * 2654435761 + s.rngSeed) >>> 0);
  const mods = researchModifiers(s.researchDone);
  const staff = staffModifiers(s);
  const diff = DIFFICULTY[s.difficulty];
  const dt = MINUTES_PER_STEP;
  const dayFrac = dt / MINUTES_PER_DAY;
  const monthFrac = dt / MINUTES_PER_MONTH;

  const prevDay = Math.floor(s.minutes / MINUTES_PER_DAY);
  const prevMonth = Math.floor(s.minutes / MINUTES_PER_MONTH);
  s.minutes += dt;
  const newDay = Math.floor(s.minutes / MINUTES_PER_DAY) > prevDay;
  const newMonth = Math.floor(s.minutes / MINUTES_PER_MONTH) > prevMonth;

  const expiredCampaigns = s.campaigns.filter((campaign) => campaign.endsAt <= s.minutes);
  if (expiredCampaigns.length) {
    for (const campaign of expiredCampaigns) {
      const district = s.districts.find((entry) => entry.id === campaign.districtId);
      const customers = residentialSubs(s, campaign.districtId) + (district?.mobileSubs ?? 0);
      const contracts = s.contracts.filter((contract) => contract.districtId === campaign.districtId).length;
      s.campaignHistory = [
        ...s.campaignHistory.slice(-39),
        {
          id: campaign.id,
          districtId: campaign.districtId,
          kind: campaign.kind,
          completedAt: s.minutes,
          cost: campaign.cost,
          customerDelta: Math.round(customers - campaign.baselineCustomers),
          satisfactionDelta: (district?.satisfaction ?? campaign.baselineSatisfaction) - campaign.baselineSatisfaction,
          contractDelta: contracts - campaign.baselineContracts,
        },
      ];
      pushLog(
        s,
        line(
          `${district?.name ?? 'District'} campaign completed.`,
          `${district?.name ?? 'İlçe'} kampanyası tamamlandı.`,
        ),
        'info',
      );
    }
    s.campaigns = s.campaigns.filter((campaign) => campaign.endsAt > s.minutes);
  }
  autoScheduleMaintenance(s, mods);
  tickMaintenance(s, dt);

  // 1. Demand
  const eventMul = s.activeEvent && s.minutes < s.activeEvent.endsAt ? s.activeEvent.mul : 1;
  if (s.activeEvent && s.minutes >= s.activeEvent.endsAt) {
    pushLog(
      s,
      line(
        `${s.activeEvent.name} is over. Traffic is settling back down.`,
        `${cityEventCopy(s.activeEvent, true).name} sona erdi. Trafik normale dönüyor.`,
      ),
      'info',
    );
    s.activeEvent = null;
  }
  const curve = demandCurve(s.minutes) * eventMul;
  const {
    avgSpeed,
    services,
    routes,
    priorities,
    liveTowers,
    residentialDemand,
    businessDemand,
    mobileDemand,
    wholesaleFixedDemand,
    wholesaleMobileDemand,
  } = offeredTraffic(s, curve);
  const load = loadServices(s, services, routes, mods.hasAutoBalance);

  const transit = TRANSIT_TIERS[s.transitTier];
  const activeInterconnect = interconnectOperational(s, routes)
    ? INTERCONNECT_CONFIG[s.interconnectPlan]
    : INTERCONNECT_CONFIG.transit;
  const transitCap = transit.capacity * (s.backupTransit ? 1.35 : 1) + activeInterconnect.capacityBonus;
  const transitRaw = load.totalServed / Math.max(0.01, transitCap);
  const serviceDemandGbps = emptyServiceTraffic();
  const serviceOfferedUpstream = emptyServiceTraffic();
  for (const service of services) {
    const kind = trafficClassOf(service.id);
    serviceDemandGbps[kind] += service.demandGbps;
    serviceOfferedUpstream[kind] += service.demandGbps * (load.serviceServed[service.id] ?? 0);
  }
  const serviceServedGbps =
    load.totalServed <= transitCap
      ? { ...serviceOfferedUpstream }
      : allocateTransit(serviceOfferedUpstream, priorities, transitCap);
  const transitFraction = (kind: TrafficClass) =>
    serviceOfferedUpstream[kind] > 0 ? clamp(serviceServedGbps[kind] / serviceOfferedUpstream[kind], 0, 1) : 1;
  const transitPressureFor = (kind: TrafficClass) => {
    const fraction = transitFraction(kind);
    return fraction < 0.999 ? 1 / Math.max(0.001, fraction) : transitRaw;
  };
  const totalTransitServed = Object.values(serviceServedGbps).reduce((sum, value) => sum + value, 0);

  s.nodes = s.nodes.map((n) => {
    const traffic = load.nodeTraffic[n.id] ?? 0;
    // DDoS and overheating chew capacity instead of killing the box outright.
    const degradation = s.incidents.find((i) => !i.resolved && i.degrade && i.targetId === n.id);
    // A tower is only worth as much as the spectrum you are allowed to run on it.
    const rated = effectiveNodeCapacity(n.kind, n.tier, s.spectrum, s.researchDone);
    const ddosMul = mods.ddosMul * staff.ddosImpactMul;
    const effCap = degradation ? rated * (degradation.kind === 'ddos' ? 0.35 + 0.3 * (1 - ddosMul) : 0.35) : rated;
    const util = traffic / Math.max(0.01, effCap);
    // Kit does not stay new.
    const yearsSinceService = (s.minutes - (n.servicedAt ?? n.builtAt)) / (MINUTES_PER_DAY * 365);
    const ceiling = clamp(100 - yearsSinceService * 14, 45, 100);
    const wear = util > 0.92 ? -0.05 : util < 0.7 ? 0.02 : 0;
    const health = clamp(Math.min(n.health + wear + staff.healthRecoveryPerStep, ceiling), 20, 100);
    return { ...n, trafficGbps: traffic, capacityGbps: effCap, health };
  });
  s.links = s.links.map((l) => ({ ...l, trafficGbps: load.linkTraffic[l.id] ?? 0 }));

  // 3. Quality of service
  let weightedPressure = 0;
  let weightTotal = 0;
  const outages: Record<string, boolean> = {};
  const contractImpaired: Record<string, boolean> = {};
  for (const d of s.districts) {
    const fixedCustomers = residentialSubs(s, d.id);
    const fixedKey = `residential:${d.id}`;
    const businessKey = `business:${d.id}`;
    const mobileKey = `mobile:${d.id}`;
    const fixedOutage = fixedCustomers > 0 && (load.serviceOutage[fixedKey] ?? false);
    const mobileOutage = d.mobileSubs > 0 && (load.serviceOutage[mobileKey] ?? false);
    outages[d.id] = fixedOutage;
    contractImpaired[d.id] =
      (businessDemand[d.id] ?? 0) > 0 &&
      ((load.serviceOutage[businessKey] ?? false) ||
        (load.serviceServed[businessKey] ?? 1) * transitFraction('business') < 0.995);
    if (fixedCustomers > 0) {
      const fixedPressure = Math.max(load.servicePressure[fixedKey] ?? 0, transitPressureFor('residential'));
      weightedPressure += (fixedOutage ? 2.5 : fixedPressure) * fixedCustomers;
      weightTotal += fixedCustomers;
    }
    if (d.mobileSubs > 0) {
      const mobilePressure = Math.max(load.servicePressure[mobileKey] ?? 0, transitPressureFor('mobile'));
      weightedPressure += (mobileOutage ? 2.5 : mobilePressure) * d.mobileSubs;
      weightTotal += d.mobileSubs;
    }
  }
  const pressure = weightTotal > 0 ? weightedPressure / weightTotal : 0;
  const packetLoss = clamp((pressure - 1) * 0.35, 0, 0.85) * mods.lossImpactMul;
  const latency = Math.max(4, 9 + Math.pow(Math.max(0, pressure - 0.7), 2) * 90 + activeInterconnect.latencyDelta);
  const avgNodeHealth = s.nodes.length
    ? s.nodes.reduce((a, n) => a + (n.down ? 0 : n.health), 0) / s.nodes.length
    : 100;
  const health = clamp(
    avgNodeHealth * (1 - packetLoss * 0.8) - Object.values(outages).filter(Boolean).length * 6,
    0,
    100,
  );

  s.dayPeakDemand = Math.max(s.dayPeakDemand, load.totalDemand);
  s.stats = {
    demandGbps: load.totalDemand,
    fixedDemandGbps:
      Object.values(residentialDemand).reduce((sum, demand) => sum + demand, 0) +
      Object.values(businessDemand).reduce((sum, demand) => sum + demand, 0) +
      Object.values(wholesaleFixedDemand).reduce((sum, demand) => sum + demand, 0),
    mobileDemandGbps:
      Object.values(mobileDemand).reduce((sum, demand) => sum + demand, 0) +
      Object.values(wholesaleMobileDemand).reduce((sum, demand) => sum + demand, 0),
    transitGbps: load.totalServed,
    servedGbps: totalTransitServed,
    coreUtilization: pressure,
    packetLoss,
    latencyMs: latency,
    health,
    serviceDemandGbps,
    serviceServedGbps,
    outages,
  };

  // 4. Coverage, satisfaction and customers
  s.districts = s.districts.map((d) => {
    if (!d.unlocked) return d;
    const coverageTarget = fixedCoverageTarget(s, d.id, routes, mods.coverageCeiling);
    const coverage = approach(d.coverage, coverageTarget, 0.035 * dayFrac * MINUTES_PER_DAY * 0.02 + 0.03 * dayFrac);

    const dPressure = Math.max(
      load.servicePressure[`residential:${d.id}`] ?? 0,
      load.servicePressure[`mobile:${d.id}`] ?? 0,
      transitPressureFor('residential'),
      transitPressureFor('mobile'),
    );
    const outage = outages[d.id];
    const pIndex = priceIndex(s);
    let satTarget = 92;
    if (outage) satTarget = 8;
    else {
      satTarget -= clamp((dPressure - 0.85) * 110, 0, 70);
      satTarget -= clamp((pIndex - 1) * 55, -12, 30);
      satTarget += (s.reputation - 50) * 0.12;
      satTarget += staff.supportSatisfaction;
      if (activeCampaign(s, d.id, 'retention')) satTarget += 6;
    }
    const satisfaction = approach(
      d.satisfaction,
      clamp(satTarget, 0, 100),
      outage ? 0.5 * dayFrac * 24 : 1.6 * dayFrac,
    );

    const mobileCoverage = approach(d.mobileCoverage, mobileCoverageTarget(s, d, liveTowers), 0.06 * dayFrac * 24);

    return { ...d, coverage, satisfaction, mobileCoverage };
  });

  growCustomers(s, diff, dayFrac, rng);
  growMobile(s, diff, dayFrac);

  // 5. Money
  const money = monthlyBreakdown(s, mods);
  const revenueTick = money.totalRevenue * monthFrac * (1 - packetLoss * 0.25);
  const costTick = money.totalCost * monthFrac;
  s.money += revenueTick - costTick;
  s.monthAccumulator = {
    revenue: s.monthAccumulator.revenue + revenueTick,
    expense: s.monthAccumulator.expense + costTick,
  };
  s.finance = {
    revenueResidential: money.revenueResidential,
    revenueMobile: money.revenueMobile,
    revenueBusiness: money.revenueBusiness,
    revenueEnterprise: money.revenueEnterprise,
    revenueHosting: money.revenueHosting,
    revenueWholesale: money.revenueWholesale,
    costSalaries: money.costSalaries,
    costPower: money.costPower,
    costMaintenance: money.costMaintenance,
    costTransit: money.costTransit,
    costMarketing: money.costMarketing,
    costRetention: money.costRetention,
    costLoanPayments: s.finance.costLoanPayments,
    penalties: s.finance.penalties,
  };

  // One compact sample per in-game hour.
  if (Math.floor(prev.minutes / 60) < Math.floor(s.minutes / 60)) {
    s.telemetry = [
      ...(s.telemetry ?? []),
      {
        at: s.minutes,
        demandGbps: s.stats.demandGbps,
        servedGbps: s.stats.servedGbps,
        packetLoss: s.stats.packetLoss,
        latencyMs: s.stats.latencyMs,
        customers: totalCustomers(s),
        cash: s.money,
      },
    ].slice(-24 * 14);
  }

  // 6. Reputation
  const { target: repTarget, outages: outageCount } = reputationOutlook(s);
  s.reputation = approach(s.reputation, repTarget, 1.2 * dayFrac);

  // 7. Incidents, technicians, contracts
  tickIncidents(s, mods, diff, dt, rng, staff);
  tickTechnicians(s, dt);
  tickContracts(s, mods, dt, rng, contractImpaired);

  // 8. Research
  if (s.researchActive) {
    const daysLeft = s.researchActive.daysLeft - dayFrac * staff.researchSpeedMul;
    if (daysLeft <= 0) {
      const doneId = s.researchActive.id;
      s.researchDone = [...s.researchDone, doneId];
      s.researchActive = null;
      const doneNode = researchById(doneId);
      pushLog(
        s,
        line(
          `Research complete: ${doneId.replace(/_/g, ' ')}.`,
          `Araştırma tamamlandı: ${doneNode ? researchCopy(doneNode, 'tr').name : doneId}.`,
        ),
        'good',
      );

      if (doneId === 'mobile_4g') {
        // The regulator hands every new entrant a starter block.
        grantStarterSpectrum(s);
        pushLog(
          s,
          line(
            'Regulator granted a starter block at 1800 MHz. Towers can go live.',
            'Düzenleyici 1800 MHz’te başlangıç bloğu tahsis etti. Kuleler devreye alınabilir.',
          ),
          'good',
        );
      }
    } else {
      s.researchActive = { ...s.researchActive, daysLeft };
    }
  }

  tickAuction(s, rng);

  tickProcurement(s, dt);
  tickCompetition(s, dt, newDay);
  const failure = checkSolvency(s);
  if (failure) {
    s.gameOver = { reason: failure, at: s.minutes };
    s.speed = 0;
    pushLog(s, line('The company has gone under.', 'Şirket battı.'), 'bad');
  }

  // 9. Daily / monthly beats
  if (newDay) {
    maybeSocialPost(s, rng, packetLoss, outageCount, avgSpeed);
    tickCompetitors(s, rng, diff.competitorAggression);
    s.demandHistory = [...s.demandHistory, s.dayPeakDemand].slice(-45);
    s.dayPeakDemand = 0;
    tickRegulator(s, rng);
    s.employees = s.employees.map((employee) =>
      trainEmployee(
        employee,
        s.researchActive && (employee.role === 'network_engineer' || employee.role === 'noc_engineer') ? 2 : 1,
      ),
    );

    const promoted = checkPromotion(s);
    if (!s.gameOver) tickBoard(s);
    if (promoted) {
      s.reputation = clamp(s.reputation + 5, 0, 100);
      pushLog(
        s,
        line(`${s.companyName} is now a ${promoted.name}.`, `${s.companyName} artık ${promoted.nameTr}.`),
        'good',
      );
      // Reaching the top rung is the win, but the game carries on afterwards.
      if (s.scenarioId === 'freeplay' && isTopRank(s) && s.victoryAt === null) s.victoryAt = s.minutes;
    }
    if (!s.gameOver && s.scenarioId !== 'freeplay' && s.scenarioCompletedAt === null) {
      const status = scenarioStatus(s);
      if (status.complete) {
        s.scenarioCompletedAt = s.minutes;
        s.victoryAt = s.minutes;
        pushLog(s, line(`${status.scenario.name} completed.`, `${status.scenario.nameTr} tamamlandı.`), 'good');
      } else if (status.expired) {
        s.gameOver = {
          reason: line(`${status.scenario.name} missed its deadline.`, `${status.scenario.nameTr} için süre doldu.`),
          at: s.minutes,
        };
        s.speed = 0;
        pushLog(s, line('The scenario deadline was missed.', 'Senaryonun süresi doldu.'), 'bad');
      }
    }
    if (s.minutes > s.nextEventAt) startCityEvent(s, rng);
    if (s.minutes > s.nextGrowthAt) growCity(s, rng);
    s.researchPoints += staff.researchPointsPerDay + Math.max(0, Math.round(totalCustomers(s) / 2500));
  }
  if (newMonth) {
    // Wholesale power resets, and any carbon levy lands with it.
    const drawKw = s.nodes.reduce(
      (sum, n) =>
        sum +
        siteDrawKw(
          s,
          n,
          n.kind === 'datacenter' ? DATA_CENTER_MODE_CONFIG[dataCenterMode(s, n.id)].powerMultiplier : 1,
        ),
      0,
    );
    for (const event of tickEnergyMonth(s, rng, drawKw)) pushLog(s, event.text, event.tone);
    if (s.energy.plan === 'green') s.reputation = clamp(s.reputation + ENERGY.greenReputationPerMonth, 0, 100);

    const completedRevenue = s.monthAccumulator.revenue;
    const completedExpense = s.monthAccumulator.expense;
    const completedPenalties = s.finance.penalties;
    s.history = [
      ...s.history.slice(-23),
      {
        month: Math.floor(s.minutes / MINUTES_PER_MONTH),
        revenue: s.monthAccumulator.revenue,
        expense: s.monthAccumulator.expense,
        customers: totalCustomers(s),
      },
    ];
    const debtPaid = chargeLoans(s);
    recordOperatingMonth(s, money, completedRevenue, completedExpense, completedPenalties, debtPaid);
    s.monthAccumulator = { revenue: 0, expense: 0 };
    if (debtPaid > 0)
      pushLog(
        s,
        line(
          `Loan repayments of ${fmtMoneyExact(debtPaid)} went out.`,
          `${fmtMoneyExact(debtPaid)} tutarında kredi ödemesi yapıldı.`,
        ),
        'info',
      );
    s.contracts = s.contracts.map((contract) => ({ ...contract, downtimeMinutes: 0 }));
    s.finance = { ...s.finance, penalties: 0, costLoanPayments: debtPaid };
  }

  return s;
}

const CUSTOMER_ACQUISITION_RATE = 0.09;
const CUSTOMER_MARKET_LOSS_RATE = 0.05;
const STARTER_CUSTOMER_GRACE_DAYS = 7;
const STARTER_CUSTOMER_RAMP_DAYS = 7;

export interface CustomerGrowthSnapshot {
  addressable: number;
  current: number;
  targetShare: number;
  priceMultiplier: number;
  satisfactionMultiplier: number;
  reputationMultiplier: number;
  demandMultiplier: number;
  marketingMultiplier: number;
  projectedDailyDelta: number;
  marketLossExposure: number;
}

// One shared explanation of customer momentum for both simulation and UI.
export function customerGrowthSnapshot(s: GameState, d: District): CustomerGrowthSnapshot {
  const pIndex = priceIndex(s);
  const staff = staffModifiers(s);
  const diff = DIFFICULTY[s.difficulty];
  const targetShare = playerShareTarget(s, d);
  const addressable = d.potential * targetShare;
  const current = residentialSubs(s, d.id);
  const priceMultiplier = clamp(1.55 - pIndex * 0.75, 0.2, 2);
  const satisfactionMultiplier = clamp(d.satisfaction / 65, 0.15, 1.5);
  const reputationMultiplier = clamp(0.6 + s.reputation / 110, 0.4, 1.6);
  const demandMultiplier = 0.8 + d.demandFactor * 0.4;
  const marketingMultiplier = (1 + Math.min(1.2, s.marketingBudget / 500000)) * staff.customerGrowthMul;
  const appeal =
    priceMultiplier *
    satisfactionMultiplier *
    reputationMultiplier *
    demandMultiplier *
    marketingMultiplier *
    diff.growthMul;
  const gap = addressable - current;
  const campaignRetention = activeCampaign(s, d.id, 'retention') ? 0.6 : 1;
  const retention =
    clamp(1 - s.retentionBudget / 600000, 0.45, 1) * campaignRetention * marketEffects(s, d.id).retention;
  const companyAgeDays = Math.max(0, (s.minutes - 8 * 60) / MINUTES_PER_DAY);
  const marketLossExposure = clamp((companyAgeDays - STARTER_CUSTOMER_GRACE_DAYS) / STARTER_CUSTOMER_RAMP_DAYS, 0, 1);
  const marketLoss = gap < 0 ? -gap * CUSTOMER_MARKET_LOSS_RATE * retention * marketLossExposure : 0;
  const churnRate = clamp((62 - d.satisfaction) / 62, 0, 1) * 0.18 * diff.churnMul * retention;
  const unhappyLoss = current * churnRate;
  const acquisition = activeCampaign(s, d.id, 'acquisition') ? 1.45 : 1;
  const projectedDailyDelta =
    (gap > 0 ? gap * CUSTOMER_ACQUISITION_RATE * appeal * acquisition : -marketLoss) - unhappyLoss;

  return {
    addressable,
    current,
    targetShare,
    priceMultiplier,
    satisfactionMultiplier,
    reputationMultiplier,
    demandMultiplier,
    marketingMultiplier,
    projectedDailyDelta,
    marketLossExposure,
  };
}

function growCustomers(s: GameState, diff: (typeof DIFFICULTY)[Difficulty], dayFrac: number, rng: Rng) {
  const changed = new Map<string, Building>();

  for (const d of s.districts) {
    if (!d.unlocked || d.coverage <= 0.001) continue;
    const growth = customerGrowthSnapshot(s, d);
    const gap = growth.addressable - growth.current;
    const campaignRetention = activeCampaign(s, d.id, 'retention') ? 0.6 : 1;
    const retention =
      clamp(1 - s.retentionBudget / 600000, 0.45, 1) * campaignRetention * marketEffects(s, d.id).retention;
    // Two different ways to lose people.
    const marketLoss = gap < 0 ? -gap * CUSTOMER_MARKET_LOSS_RATE * dayFrac * retention * growth.marketLossExposure : 0;
    const churnRate = clamp((62 - d.satisfaction) / 62, 0, 1) * 0.18 * diff.churnMul * retention;
    const unhappyLoss = growth.current * churnRate * dayFrac;

    const acquisition = activeCampaign(s, d.id, 'acquisition') ? 1.45 : 1;
    const appeal =
      growth.priceMultiplier *
      growth.satisfactionMultiplier *
      growth.reputationMultiplier *
      growth.demandMultiplier *
      growth.marketingMultiplier *
      diff.growthMul;
    let delta = gap > 0 ? gap * CUSTOMER_ACQUISITION_RATE * appeal * acquisition * dayFrac : -marketLoss;
    delta -= unhappyLoss;

    const lost = marketLoss + unhappyLoss;
    if (lost > 0.0001) recordChurn(s, d, lost, rng, marketLoss > unhappyLoss);
    if (Math.abs(delta) < 0.0001) continue;
    applyDelta(s, d.id, delta, rng, changed);
  }

  if (changed.size) {
    s.buildings = s.buildings.map((b) => changed.get(b.id) ?? b);
    redistributePackages(s);
  }
}

// Spreads a subscriber delta over individual buildings so the map reacts.
function applyDelta(s: GameState, districtId: string, delta: number, rng: Rng, changed: Map<string, Building>) {
  const pool = s.buildings.filter(
    (b) => b.districtId === districtId && b.segment === 'residential' && b.households > 0,
  );
  if (!pool.length) return;

  if (delta > 0) {
    const targets = pool.filter((b) => b.connected < 0.999);
    if (!targets.length) return;
    let left = delta;
    let guard = 0;
    while (left > 0.001 && guard++ < 60) {
      const b = pick(rng, targets);
      const cur = changed.get(b.id) ?? b;
      if (cur.connected >= 0.999) continue;
      const room = (1 - cur.connected) * cur.households;
      const take = Math.min(left, room, Math.max(1, cur.households * rand(rng, 0.15, 0.6)));
      const next: Building = {
        ...cur,
        connected: Math.min(1, cur.connected + take / cur.households),
        lastConnectedAt: s.minutes,
      };
      changed.set(b.id, next);
      left -= take;
    }
  } else {
    const targets = pool.filter((b) => b.connected > 0.001);
    if (!targets.length) return;
    let left = -delta;
    let guard = 0;
    while (left > 0.001 && guard++ < 60) {
      const b = pick(rng, targets);
      const cur = changed.get(b.id) ?? b;
      if (cur.connected <= 0.001) continue;
      const take = Math.min(left, cur.connected * cur.households);
      changed.set(b.id, { ...cur, connected: Math.max(0, cur.connected - take / cur.households) });
      left -= take;
    }
  }
}

export function mobileServingTowers(s: GameState, d: District, liveTowers?: NetNode[]) {
  const towers = liveTowers ?? s.nodes.filter((node) => node.kind === 'tower' && !node.down);
  if (!s.spectrum.length) return [];
  return towers.filter((tower) => {
    const radius = towerRadius(s.spectrum, tower.tier);
    return d.cells.some((cell) => Math.hypot(tower.gx - cell.gx, tower.gy - cell.gy) <= radius);
  });
}

// Share of a district's tiles sitting inside the footprint of a live tower.
export function mobileCoverageTarget(s: GameState, d: District, liveTowers?: NetNode[]) {
  // Callers that know the routing table pass in only towers that reach a core.
  const towers = liveTowers ?? s.nodes.filter((n) => n.kind === 'tower' && !n.down);
  if (!towers.length || !s.spectrum.length) return 0;
  let covered = 0;
  for (const cell of d.cells) {
    for (const t of towers) {
      const r = towerRadius(s.spectrum, t.tier);
      if (Math.hypot(t.gx - cell.gx, t.gy - cell.gy) <= r) {
        covered++;
        break;
      }
    }
  }
  return d.cells.length ? covered / d.cells.length : 0;
}

function growMobile(s: GameState, diff: (typeof DIFFICULTY)[Difficulty], dayFrac: number) {
  if (!s.spectrum.length) return;
  const mix = packageMix(s.packages, 'mobile');
  if (!mix.length) return;
  const avgPrice = mix.reduce((sum, m) => sum + m.pkg.price * m.share, 0);

  let changed = false;
  const districts = s.districts.map((d) => {
    if (!d.unlocked || d.mobileCoverage <= 0.001) return d;

    const rivalRadio = s.competitors.reduce((sum, c) => sum + (c.mobileCoverage[d.id] ?? 0), 0);
    const addressable = d.population * MOBILE_MARKET_SHARE * d.mobileCoverage * clamp(1 - rivalRadio * 0.5, 0.15, 1);

    const appeal =
      clamp(1.5 - avgPrice / 26, 0.25, 1.9) *
      clamp(d.satisfaction / 70, 0.2, 1.4) *
      clamp(0.6 + s.reputation / 110, 0.4, 1.6) *
      diff.growthMul;

    const gap = addressable - d.mobileSubs;
    const mobileCampaign = activeCampaign(s, d.id, 'mobile') ? 1.5 : 1;
    const retention = activeCampaign(s, d.id, 'retention') ? 0.6 : 1;
    let delta = gap > 0 ? gap * 0.11 * appeal * mobileCampaign * dayFrac : gap * 0.06 * dayFrac;
    delta -= d.mobileSubs * clamp((62 - d.satisfaction) / 62, 0, 1) * 0.2 * diff.churnMul * retention * dayFrac;

    if (Math.abs(delta) < 0.01) return d;
    changed = true;
    return { ...d, mobileSubs: Math.max(0, d.mobileSubs + delta) };
  });

  if (changed) {
    s.districts = districts;
    redistributeMobilePackages(s);
  }
}

export function mobileSubs(s: GameState) {
  return s.districts.reduce((sum, d) => sum + d.mobileSubs, 0);
}

export function redistributeMobilePackages(s: GameState) {
  const total = mobileSubs(s);
  const mix = packageMix(s.packages, 'mobile');
  const shares = new Map(mix.map((m) => [m.pkg.id, m.share]));
  s.packages = s.packages.map((p) =>
    p.segment === 'mobile' ? { ...p, subscribers: Math.round(total * (shares.get(p.id) ?? 0)) } : p,
  );
}

// ---------------------------------------------------------------------------

// Customers leaving is more useful to a player as "who took them and why" than as a falling number.
function recordChurn(s: GameState, d: District, count: number, rng: Rng, toMarket: boolean) {
  const outage = s.stats.outages[d.id];
  const residentialDemand = s.stats.serviceDemandGbps.residential;
  const residentialDelivery = residentialDemand > 0 ? s.stats.serviceServedGbps.residential / residentialDemand : 1;
  const pressure = s.stats.packetLoss > 0.02 || residentialDelivery < 0.97;
  const pIndex = priceIndex(s);
  const rivalPrice = s.competitors.length
    ? s.competitors.reduce((sum, competitor) => sum + competitor.priceIndex, 0) / s.competitors.length
    : 1;
  const overpriced = pIndex > 1.03 && pIndex > rivalPrice * 1.08;
  const playerReach = Math.max(d.coverage, d.mobileCoverage * 0.8);
  const bestRivalReach = s.competitors.reduce(
    (best, competitor) => Math.max(best, competitor.coverage[d.id] ?? 0, (competitor.mobileCoverage[d.id] ?? 0) * 0.8),
    0,
  );
  const underCovered = playerReach + 0.05 < bestRivalReach;
  const support = staffModifiers(s).supportSatisfaction;
  const reason: ChurnReason = outage
    ? 'outage'
    : pressure
      ? 'congestion'
      : overpriced
        ? 'price'
        : toMarket
          ? underCovered
            ? 'coverage'
            : 'competition'
          : support < 1
            ? 'support'
            : 'satisfaction';

  const rival = strongestRival(s, d.id);
  // Losing ground to the market means somebody picked them up.
  const poached = rival && rng() < (toMarket ? 0.9 : 0.45);

  // Losses arrive a fraction at a time.
  const openIndex = s.churn.findIndex(
    (c) => c.districtId === d.id && c.reason === reason && s.minutes - c.at < MINUTES_PER_DAY,
  );
  if (openIndex >= 0) {
    const open = s.churn[openIndex];
    const merged = { ...open, count: open.count + count, at: s.minutes };
    s.churn = [merged, ...s.churn.filter((_, i) => i !== openIndex)];
    return;
  }

  s.churn = [
    {
      id: uid('churn'),
      at: s.minutes,
      districtId: d.id,
      count,
      toId: poached ? rival!.id : null,
      toName: poached ? rival!.name : line('left the market', 'pazardan ayrıldı'),
      reason,
    },
    ...s.churn,
  ].slice(0, 30);
}

export const INCIDENT_LOAD_FLOOR = 0.45;

export function boundedIncidentMultipliers(rateMul: number, durationMul: number) {
  const rawRate = clamp(rateMul, 0.01, 1);
  const rawDuration = clamp(durationMul, 0.01, 1);
  const rawLoad = rawRate * rawDuration;
  if (rawLoad >= INCIDENT_LOAD_FLOOR) return { rate: rawRate, duration: rawDuration, load: rawLoad };

  const scale = Math.sqrt(INCIDENT_LOAD_FLOOR / rawLoad);
  let rate = Math.min(1, rawRate * scale);
  let duration = Math.min(1, rawDuration * scale);
  if (rate * duration < INCIDENT_LOAD_FLOOR) {
    if (rate < 1) rate = Math.min(1, INCIDENT_LOAD_FLOOR / duration);
    else duration = Math.min(1, INCIDENT_LOAD_FLOOR / rate);
  }
  return { rate, duration, load: rate * duration };
}

export // Telemetry books the cheap window itself once a site starts drifting.
function autoScheduleMaintenance(s: GameState, mods: ResearchMods) {
  if (!mods.hasMaintenanceForecast) return;
  for (const node of s.nodes) {
    if (node.down || node.health > 72) continue;
    if (s.incidents.some((incident) => !incident.resolved && incident.targetId === node.id)) continue;
    if (s.maintenanceOrders.some((order) => order.nodeId === node.id && order.status !== 'completed')) continue;
    const cost = maintenanceCost(node, 'overnight');
    if (s.money < cost * 3) continue;
    s.money -= cost;
    recordLedger(s, 'network_service', line(`Predicted service: ${node.name}`, `Öngörülü bakım: ${node.name}`), -cost);
    s.maintenanceOrders = [
      ...s.maintenanceOrders,
      {
        id: uid('maint'),
        nodeId: node.id,
        mode: 'overnight' as const,
        status: 'scheduled' as const,
        scheduledAt: maintenanceStart(s.minutes, 'overnight'),
        startedAt: null,
        minutesLeft: MAINTENANCE_CONFIG.overnight.durationMinutes,
        technicianId: null,
        cost,
      },
    ];
    pushLog(
      s,
      line(
        `Telemetry booked overnight work for ${node.name} before it fails.`,
        `Telemetri, arıza çıkmadan ${node.name} için gece bakımı planladı.`,
      ),
      'info',
    );
    return;
  }
}

export function tickMaintenance(s: GameState, dt: number) {
  const unavailableNodes = new Set(
    s.incidents
      .filter((incident) => !incident.resolved && incident.targetType === 'node')
      .map((incident) => incident.targetId),
  );

  for (const order of s.maintenanceOrders) {
    if (order.status !== 'scheduled' || order.scheduledAt > s.minutes || unavailableNodes.has(order.nodeId)) continue;
    const technician = s.technicians.find(
      (entry) => entry.state === 'idle' && entry.incidentId === null && entry.maintenanceId === null,
    );
    const node = s.nodes.find((entry) => entry.id === order.nodeId && !entry.down);
    if (!technician || !node) continue;
    s.maintenanceOrders = s.maintenanceOrders.map((entry) =>
      entry.id === order.id ? { ...entry, status: 'active', startedAt: s.minutes, technicianId: technician.id } : entry,
    );
    s.technicians = s.technicians.map((entry) =>
      entry.id === technician.id ? { ...entry, maintenanceId: order.id, state: 'driving' as const } : entry,
    );
    pushLog(
      s,
      line(
        `${technician.name} dispatched for planned work at ${node.name}.`,
        `${technician.name}, ${node.name} noktasındaki planlı iş için yola çıktı.`,
      ),
      'info',
    );
  }

  for (const order of s.maintenanceOrders) {
    if (order.status !== 'active' || !order.technicianId) continue;
    const technician = s.technicians.find((entry) => entry.id === order.technicianId);
    const node = s.nodes.find((entry) => entry.id === order.nodeId);
    if (!technician || !node || technician.maintenanceId !== order.id || technician.state !== 'working') continue;

    const minutesLeft = order.minutesLeft - dt;
    if (minutesLeft > 0) {
      s.nodes = s.nodes.map((entry) => (entry.id === node.id ? { ...entry, down: true } : entry));
      s.maintenanceOrders = s.maintenanceOrders.map((entry) =>
        entry.id === order.id ? { ...entry, minutesLeft } : entry,
      );
      continue;
    }

    s.nodes = s.nodes.map((entry) =>
      entry.id === node.id ? { ...entry, down: false, health: 100, servicedAt: s.minutes } : entry,
    );
    s.maintenanceOrders = s.maintenanceOrders.map((entry) =>
      entry.id === order.id ? { ...entry, status: 'completed', minutesLeft: 0, technicianId: null } : entry,
    );
    s.technicians = s.technicians.map((entry) =>
      entry.id === technician.id
        ? { ...trainTechnician(entry), maintenanceId: null, incidentId: null, state: 'returning' as const }
        : entry,
    );
    pushLog(
      s,
      line(
        `Planned work at ${node.name} completed. Equipment health restored.`,
        `${node.name} noktasındaki planlı iş tamamlandı. Donanım sağlığı yenilendi.`,
      ),
      'good',
    );
  }

  if (s.maintenanceOrders.length > 20) {
    s.maintenanceOrders = s.maintenanceOrders.filter(
      (order) =>
        order.status !== 'completed' || s.minutes - (order.startedAt ?? order.scheduledAt) < MINUTES_PER_DAY * 14,
    );
  }
}

function tickIncidents(
  s: GameState,
  mods: ResearchMods,
  diff: (typeof DIFFICULTY)[Difficulty],
  dt: number,
  rng: Rng,
  staff: ReturnType<typeof staffModifiers>,
) {
  const incidentCurve = boundedIncidentMultipliers(
    mods.incidentRateMul * staff.incidentRateMul,
    mods.incidentDurationMul * staff.incidentDurationMul,
  );
  // Roughly one incident every few days, flattened so growth is not self-punishing.
  const kit = s.nodes.length + s.links.length * 0.8;
  const exposure = (0.2 + Math.pow(Math.max(kit, 0), 0.58) * 0.165) * incidentCurve.rate;
  // Worn equipment fails more often, which is what makes servicing worth doing.
  const avgHealth = s.nodes.length ? s.nodes.reduce((a, n) => a + n.health, 0) / s.nodes.length : 100;
  const condition = 1 + clamp((90 - avgHealth) / 60, 0, 1.2);
  const perDay = 0.16 * exposure * diff.incidentRate * condition;
  const chance = perDay * (dt / MINUTES_PER_DAY);
  const unresolved = s.incidents.filter((i) => !i.resolved);

  if (rng() < chance && unresolved.length < 4) {
    const inc = rollIncident(s, rng, {
      incidentDurationMul: incidentCurve.duration,
      ddosRateMul: staff.ddosRateMul,
    });
    if (inc) {
      // A fault on a large network takes longer to find and reach.
      const scale = 1 + Math.min(0.8, s.nodes.length / 30);
      inc.repairTotalMinutes = Math.round(inc.repairTotalMinutes * scale);
      s.incidents = [...s.incidents, inc];
      applyIncidentDown(s, inc, true);
      const where = s.districts.find((d) => d.id === inc.districtId)?.name;
      pushLog(
        s,
        line(`${inc.title} in ${where ?? 'network'}`, `${where ?? 'Şebeke'}: ${incidentCopy(inc, s, true).title}`),
        'bad',
      );
      s.reputation = clamp(s.reputation - (inc.degrade ? 0.5 : 1.5), 0, 100);
    }
  }

  let touched = false;
  const next = s.incidents.map((inc) => {
    if (inc.resolved || inc.repairMinutesLeft === null) return inc;
    const tech = s.technicians.find((t) => t.id === inc.assignedTechId);
    // Work only progresses once the crew is on site.
    if (!tech || tech.state !== 'working' || tech.incidentId !== inc.id) return inc;
    const left = inc.repairMinutesLeft - dt;
    touched = true;
    if (left <= 0) {
      applyIncidentDown(s, inc, false);
      pushLog(s, line(`${inc.title} resolved.`, `${incidentCopy(inc, s, true).title} giderildi.`), 'good');
      return { ...inc, repairMinutesLeft: 0, resolved: true };
    }
    return { ...inc, repairMinutesLeft: left };
  });
  if (touched) s.incidents = next;

  if (s.autoDispatch && mods.hasAutoDispatch) {
    for (const inc of pendingIncidents(s)) {
      const free = dispatchCandidates(s, inc, 'normal')[0]?.technician;
      if (!free) break;
      dispatch(s, inc.id, free.id, 'normal', true);
    }
  }

  // Drop resolved incidents after a while so the list stays readable.
  if (s.incidents.length > 12) s.incidents = s.incidents.filter((i) => !i.resolved || s.minutes - i.startedAt < 3000);
}

export function applyIncidentDown(s: GameState, inc: Incident, down: boolean) {
  if (inc.degrade) return; // handled through capacity, not hard down
  if (inc.targetType === 'node') {
    s.nodes = s.nodes.map((n) => (n.id === inc.targetId ? { ...n, down } : n));
  } else {
    s.links = s.links.map((l) => (l.id === inc.targetId ? { ...l, down } : l));
  }
}

export function dispatch(s: GameState, incidentId: string, techId: string, mode: RepairMode, free = false) {
  const inc = s.incidents.find((i) => i.id === incidentId);
  const tech = s.technicians.find((t) => t.id === techId);
  if (
    !inc ||
    inc.resolved ||
    inc.assignedTechId !== null ||
    inc.repairMinutesLeft !== null ||
    !tech ||
    tech.state !== 'idle' ||
    tech.incidentId !== null ||
    tech.maintenanceId !== null
  ) {
    return false;
  }
  const minutes = repairMinutes(inc, tech.skill, mode);
  const cost = repairCost(inc, mode);
  if (!free && mode === 'emergency' && s.money < cost) return false;
  if (!free) {
    s.money -= cost;
    recordLedger(
      s,
      'incident_response',
      line(
        `${mode === 'emergency' ? 'Emergency' : 'Scheduled'} repair: ${inc.title}`,
        `${mode === 'emergency' ? 'Acil' : 'Planlı'} onarım: ${incidentCopy(inc, s, true).title}`,
      ),
      -cost,
    );
  }

  s.incidents = s.incidents.map((i) =>
    i.id === incidentId ? { ...i, repairMinutesLeft: minutes, assignedTechId: techId } : i,
  );
  const target = incidentLocation(s, inc);
  s.technicians = s.technicians.map((t) =>
    t.id === techId ? { ...t, incidentId, state: 'driving' as const, homeGx: target.gx, homeGy: target.gy } : t,
  );
  return true;
}

export { incidentLocation } from './incidents';

function tickTechnicians(s: GameState, dt: number) {
  const speed = CREW_SPEED * dt; // grid units per game minute
  let changed = false;
  const next = s.technicians.map((t) => {
    if (t.state === 'idle') return t;
    const inc = s.incidents.find((i) => i.id === t.incidentId);
    const maintenance = s.maintenanceOrders.find((order) => order.id === t.maintenanceId && order.status === 'active');

    if (t.state === 'driving') {
      if (!inc && !maintenance) {
        return { ...t, state: 'idle' as const, incidentId: null, maintenanceId: null };
      }
      const target = inc
        ? incidentLocation(s, inc)
        : (() => {
            const node = s.nodes.find((entry) => entry.id === maintenance!.nodeId);
            return node ? { gx: node.gx, gy: node.gy } : { gx: t.gx, gy: t.gy };
          })();
      const moved = moveToward(t, target, speed);
      changed = true;
      if (moved.arrived) return { ...t, gx: target.gx, gy: target.gy, state: 'working' as const };
      return { ...t, gx: moved.gx, gy: moved.gy };
    }

    if (t.state === 'working') {
      if (inc && !inc.resolved) return t;
      if (maintenance) return t;
      if (!inc || inc.resolved) {
        changed = true;
        return {
          ...trainTechnician(t),
          state: 'returning' as const,
          incidentId: null,
          maintenanceId: null,
        };
      }
    }

    // returning
    const base = nearestDepot(s, t);
    const moved = moveToward(t, base, speed);
    changed = true;
    if (moved.arrived) return { ...t, gx: base.gx, gy: base.gy, state: 'idle' as const };
    return { ...t, gx: moved.gx, gy: moved.gy };
  });
  if (changed) s.technicians = next;
}

function nearestDepot(s: GameState, t: Technician) {
  const candidates = s.nodes.filter((n) => n.kind === 'pop' || n.kind === 'core');
  if (!candidates.length) return { gx: t.gx, gy: t.gy };
  let best = candidates[0];
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.gx - t.gx, c.gy - t.gy);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { gx: best.gx, gy: best.gy };
}

function moveToward(from: { gx: number; gy: number }, to: { gx: number; gy: number }, speed: number) {
  const dx = to.gx - from.gx;
  const dy = to.gy - from.gy;
  const dist = Math.hypot(dx, dy);
  if (dist <= speed) return { gx: to.gx, gy: to.gy, arrived: true };
  return { gx: from.gx + (dx / dist) * speed, gy: from.gy + (dy / dist) * speed, arrived: false };
}

function tickContracts(s: GameState, mods: ResearchMods, dt: number, rng: Rng, impaired: Record<string, boolean>) {
  const routes = computeRoutes(s);
  const recoverySites = operationalDataCenters(s, routes).filter(
    (node) => dataCenterMode(s, node.id) === 'recovery',
  ).length;
  const recoveryMultiplier = Math.max(0.5, Math.pow(0.75, recoverySites));
  if (s.contracts.length) {
    let penalties = 0;
    s.contracts = s.contracts.map((c) => {
      const out = impaired[c.districtId];
      if (!out) return c;
      const downtimeMinutes = c.downtimeMinutes + dt * recoveryMultiplier;
      const allowed = MINUTES_PER_MONTH * (1 - c.slaPercent / 100);
      // Owed so far this month, capped, so a bad month cannot cost unbounded money.
      const owed = (mins: number) =>
        Math.min(c.monthlyRevenue * SLA_PENALTY_CAP, (Math.max(0, mins - allowed) / 60) * c.monthlyRevenue * 0.02);
      const fee = owed(downtimeMinutes) - owed(c.downtimeMinutes);
      penalties += fee;
      return { ...c, downtimeMinutes, penaltyPaid: c.penaltyPaid + fee };
    });
    if (penalties > 0) {
      s.money -= penalties;
      s.finance = { ...s.finance, penalties: s.finance.penalties + penalties };
    }
  }

  // At expiry, healthy accounts renew while breached or unhappy accounts leave and release their building.
  if (s.contracts.length) {
    const endedBuildings = new Set<string>();
    const nextContracts: typeof s.contracts = [];
    for (const contract of s.contracts) {
      const endsAt = contract.startedAt + contract.termMonths * MINUTES_PER_MONTH;
      if (s.minutes < endsAt) {
        nextContracts.push(contract);
        continue;
      }

      const district = s.districts.find((d) => d.id === contract.districtId);
      const allowance = MINUTES_PER_MONTH * (1 - contract.slaPercent / 100);
      const slaMet = contract.downtimeMinutes <= allowance;
      const satisfaction = (district?.satisfaction ?? 50) / 100;
      const renewalChance = clamp(0.25 + satisfaction * 0.45 + (s.reputation / 100) * 0.2, 0.15, 0.9);

      if (slaMet && rng() < renewalChance) {
        const termMonths = randInt(rng, 12, 36);
        const monthlyRevenue = Math.round((contract.monthlyRevenue * rand(rng, 1.01, 1.06)) / 50) * 50;
        nextContracts.push({
          ...contract,
          monthlyRevenue,
          termMonths,
          startedAt: s.minutes,
          downtimeMinutes: 0,
          penaltyPaid: 0,
        });
        pushLog(
          s,
          line(
            `${contract.clientName} renewed for ${termMonths} ${plural(termMonths, 'month')} at ${fmtMoneyExact(monthlyRevenue)}/mo.`,
            `${contract.clientName} sözleşmesini ${termMonths} ay için ayda ${fmtMoneyExact(monthlyRevenue)} bedelle yeniledi.`,
          ),
          'good',
        );
      } else {
        endedBuildings.add(contract.buildingId);
        pushLog(
          s,
          slaMet
            ? line(
                `${contract.clientName} completed its contract and moved on.`,
                `${contract.clientName} sözleşmesini tamamladı ve ayrıldı.`,
              )
            : line(
                `${contract.clientName} declined to renew after missed SLA targets.`,
                `${contract.clientName}, SLA hedefleri tutturulamadığı için yenilemedi.`,
              ),
          slaMet ? 'info' : 'bad',
        );
      }
    }
    s.contracts = nextContracts;

    if (endedBuildings.size) {
      const stillContracted = new Set(s.contracts.map((c) => c.buildingId));
      s.buildings = s.buildings.map((b) =>
        endedBuildings.has(b.id) && !stillContracted.has(b.id) ? { ...b, connected: 0 } : b,
      );
    }
  }

  const live = s.offers.filter((o) => o.expiresAt > s.minutes);
  if (live.length !== s.offers.length) s.offers = live;

  const staff = staffModifiers(s);
  const maxOffers = (mods.hasEnterprise ? 3 : 2) + (mods.hasPrivate5g ? 1 : 0);
  const businessCampaignBoost = s.campaigns.some(
    (campaign) => campaign.kind === 'business' && campaign.endsAt > s.minutes,
  )
    ? 1.75
    : 1;
  const chance = 0.35 * (dt / MINUTES_PER_DAY) * (1 + s.reputation / 90) * staff.offerRateMul * businessCampaignBoost;
  if (s.offers.length < maxOffers && rng() < chance) {
    const offer = makeOffer(s, mods, rng);
    if (offer) s.offers = [...s.offers, offer];
  }
}

function makeOffer(s: GameState, mods: ResearchMods, rng: Rng) {
  const eligible = s.districts.filter((d) => d.unlocked && d.coverage > 0.12);
  if (!eligible.length) return null;
  const promoted = eligible.filter((district) => activeCampaign(s, district.id, 'business'));
  const d = pick(rng, promoted.length && rng() < 0.8 ? promoted : eligible);
  const wantEnterprise = mods.hasEnterprise && rng() < 0.4;
  const reservedBuildings = new Set([
    ...s.contracts.map((c) => c.buildingId),
    ...s.offers.filter((o) => o.expiresAt > s.minutes).map((o) => o.buildingId),
  ]);
  // Parks fall through segmentOf into 'business' and have nobody in them.
  const pool = s.buildings.filter(
    (b) =>
      b.districtId === d.id &&
      b.kind !== 'park' &&
      !reservedBuildings.has(b.id) &&
      (wantEnterprise ? b.segment === 'enterprise' : b.segment === 'business'),
  );
  if (!pool.length) return null;
  const building = pick(rng, pool);
  const profile = contractProfile(building.kind);

  const baseBandwidth = wantEnterprise ? rand(rng, 4, 12) : rand(rng, 0.5, 2);
  const bandwidth = wantEnterprise
    ? Math.max(1, Math.round(baseBandwidth * profile.bandwidthMul))
    : Math.max(0.2, Math.round(baseBandwidth * profile.bandwidthMul * 10) / 10);
  // Priced per Gbps of headline bandwidth. Enterprise pays a premium for the SLA.
  const rate = wantEnterprise ? rand(rng, 20000, 32000) : rand(rng, 9000, 14000);
  const monthlyRevenue = Math.round((bandwidth * rate * profile.revenueMul * mods.contractRevenueMul) / 1000) * 1000;
  const sampledSla = wantEnterprise ? pick(rng, [99.9, 99.95, 99.99]) : pick(rng, [99, 99.5, 99.9]);
  const sla = Math.max(sampledSla, profile.slaFloor);

  return {
    id: uid('off'),
    clientName: wantEnterprise ? enterpriseName(rng) : companyName(rng),
    districtId: d.id,
    buildingId: building.id,
    bandwidthGbps: bandwidth,
    monthlyRevenue,
    slaPercent: sla,
    termMonths: randInt(rng, 12, 36),
    segment: (wantEnterprise ? 'enterprise' : 'business') as 'business' | 'enterprise',
    requiresRedundancy: wantEnterprise || profile.requiresRedundancy || (building.kind !== 'shop' && sla >= 99.9),
    expiresAt: s.minutes + MINUTES_PER_DAY * randInt(rng, 2, 5),
    signingBonus: Math.round(monthlyRevenue * rand(rng, 0.5, 2) * staffModifiers(s).signingBonusMul),
  };
}

function tickAuction(s: GameState, rng: Rng) {
  if (!s.researchDone.includes('mobile_4g')) return;

  if (!s.auction && s.minutes >= s.nextAuctionAt) {
    const auction = createAuction(s, rng);
    if (auction) {
      s.auction = auction;
      pushLog(
        s,
        line(
          `Spectrum auction announced: ${SPECTRUM_BANDS[auction.band].label}.`,
          `Spektrum ihalesi duyuruldu: ${SPECTRUM_BANDS[auction.band].label}.`,
        ),
        'info',
      );
    }
    s.nextAuctionAt = s.minutes + MINUTES_PER_DAY * randInt(rng, 40, 70);
    return;
  }

  if (!s.auction || s.auction.result) return;
  if (s.minutes < s.auction.closesAt) return;

  const settled = settleAuction(s, s.auction, rng);
  s.auction = settled;
  let result = settled.result!;
  let playerDefaulted = false;

  // The bid was sealed days ago and the cash behind it may have been spent since.
  if (result.winnerId === 'player' && result.price > s.money) {
    const next = result.bids.find((b) => b.bidderId !== 'player');
    s.auction = {
      ...settled,
      result: next
        ? { ...result, winnerId: next.bidderId, winnerName: next.bidderName, price: next.amount }
        : { ...result, winnerId: 'none', winnerName: 'Nobody', price: 0 },
    };
    result = s.auction.result!;
    playerDefaulted = true;
    pushLog(
      s,
      line(
        `You could not cover your ${fmtMoneyExact(result.price)} bid for ${SPECTRUM_BANDS[settled.band].label}. The lot went elsewhere.`,
        `${SPECTRUM_BANDS[settled.band].label} için verdiğin ${fmtMoneyExact(result.price)} teklifi karşılayamadın. Lot başkasına gitti.`,
      ),
      'bad',
    );
    s.reputation = clamp(s.reputation - 4, 0, 100);
  }

  if (result.winnerId === 'player') {
    s.money -= result.price;
    recordLedger(
      s,
      'spectrum',
      line(`${SPECTRUM_BANDS[settled.band].label} spectrum`, `${SPECTRUM_BANDS[settled.band].label} spektrumu`),
      -result.price,
    );
    const existing = s.spectrum.find((h) => h.band === settled.band);
    if (existing) {
      s.spectrum = s.spectrum.map((h) =>
        h.band === settled.band ? { ...h, blocks: h.blocks + settled.blocks, paid: h.paid + result.price } : h,
      );
    } else {
      s.spectrum = [
        ...s.spectrum,
        { band: settled.band, blocks: settled.blocks, wonAt: s.minutes, paid: result.price },
      ];
    }
    pushLog(
      s,
      line(
        `Won ${settled.blocks} ${plural(settled.blocks, 'block')} at ${SPECTRUM_BANDS[settled.band].label} for ${fmtMoneyExact(result.price)}.`,
        `${SPECTRUM_BANDS[settled.band].label} bandında ${settled.blocks} blok ${fmtMoneyExact(result.price)} bedelle kazanıldı.`,
      ),
      'good',
    );
    s.reputation = clamp(s.reputation + 2, 0, 100);
  } else if (result.winnerId === 'none') {
    pushLog(
      s,
      line(
        `The ${SPECTRUM_BANDS[settled.band].label} lot went unsold.`,
        `${SPECTRUM_BANDS[settled.band].label} lotu satılmadı.`,
      ),
      'info',
    );
  } else {
    const winner = s.competitors.find((competitor) => competitor.id === result.winnerId);
    if (!winner || winner.cash < result.price) {
      s.auction = {
        ...settled,
        result: { ...result, winnerId: 'none', winnerName: 'Nobody', price: 0 },
      };
      pushLog(
        s,
        line(
          `The ${SPECTRUM_BANDS[settled.band].label} lot went unsold after the winner defaulted.`,
          `Kazanan ödeme yapamayınca ${SPECTRUM_BANDS[settled.band].label} lotu satılmadan kaldı.`,
        ),
        'info',
      );
      return;
    }
    s.competitors = s.competitors.map((competitor) => {
      if (competitor.id !== winner.id) return competitor;
      const holding = competitor.spectrum.find((entry) => entry.band === settled.band);
      const spectrum = holding
        ? competitor.spectrum.map((entry) =>
            entry.band === settled.band
              ? { ...entry, blocks: entry.blocks + settled.blocks, paid: entry.paid + result.price }
              : entry,
          )
        : [
            ...competitor.spectrum,
            { band: settled.band, blocks: settled.blocks, wonAt: s.minutes, paid: result.price },
          ];
      return {
        ...competitor,
        cash: competitor.cash - result.price,
        spectrum,
        lastMove: `won ${SPECTRUM_BANDS[settled.band].label} spectrum`,
      };
    });
    if (!playerDefaulted)
      pushLog(
        s,
        line(
          `${result.winnerName} took the ${SPECTRUM_BANDS[settled.band].label} lot.`,
          `${SPECTRUM_BANDS[settled.band].label} lotunu ${result.winnerName} aldı.`,
        ),
        'bad',
      );
  }
}

function maybeSocialPost(s: GameState, rng: Rng, packetLoss: number, outages: number, avgSpeed: number) {
  const subs = residentialSubs(s);
  if (subs < 20) return;
  const posts = 1 + (rng() < 0.4 ? 1 : 0);
  for (let i = 0; i < posts; i++) {
    const badChance = clamp(packetLoss * 1.6 + outages * 0.35 + (60 - averageSatisfaction(s)) / 90, 0.05, 0.92);
    const roll = rng();
    const mood = roll < badChance ? 'bad' : roll < badChance + 0.25 ? 'meh' : 'good';

    // If people have been defecting lately, some of the noise names the rival.
    const recentDefection = s.churn.find((c) => c.toId && s.minutes - c.at < MINUTES_PER_DAY * 3);
    const { text, stars } =
      mood === 'bad' && recentDefection && rng() < 0.5
        ? makeSwitchPost(rng, s.companyName, recentDefection.toName)
        : makePost(rng, s.companyName, mood, Math.round(avgSpeed * rand(rng, 0.88, 0.98)));
    // Back-to-back identical posts read as a bug rather than a busy timeline.
    if (s.posts[0]?.text === text) continue;
    s.posts = [{ id: uid('p'), handle: `@${handleName(rng)}`, text, stars, at: s.minutes }, ...s.posts].slice(0, 40);
  }
}

// The regulator only turns up once you are big enough to be worth regulating.
function tickRegulator(s: GameState, rng: Rng) {
  for (const outcome of settleRegulations(s)) {
    if (outcome.met) {
      s.reputation = clamp(s.reputation + 4, 0, 100);
      pushLog(
        s,
        line(`${outcome.regulation.title} met.`, `${regulationCopy(outcome.regulation, s, true).title} karşılandı.`),
        'good',
      );
    } else {
      s.money -= outcome.regulation.fine;
      recordLedger(
        s,
        'regulatory_fine',
        line(outcome.regulation.title, regulationCopy(outcome.regulation, s, true).title),
        -outcome.regulation.fine,
      );
      s.reputation = clamp(s.reputation - 8, 0, 100);
      pushLog(
        s,
        line(
          `${outcome.regulation.title} missed. Fined ${fmtMoneyExact(outcome.regulation.fine)}.`,
          `${regulationCopy(outcome.regulation, s, true).title} karşılanmadı. ${fmtMoneyExact(outcome.regulation.fine)} ceza kesildi.`,
        ),
        'bad',
      );
    }
  }

  const customers = residentialSubs(s) + mobileSubs(s);
  if (s.minutes >= s.nextRegulationAt && shouldIssue(s, customers)) {
    const reg = makeRegulation(s, rng, customers);
    if (reg) {
      s.regulations = [...s.regulations, reg];
      const regTr = regulationCopy(reg, s, true);
      pushLog(s, line(`${reg.title}: ${reg.detail}`, `${regTr.title}: ${regTr.detail}`), 'info');
    }
    s.nextRegulationAt = s.minutes + MINUTES_PER_DAY * randInt(rng, 90, 160);
  }
}

function startCityEvent(s: GameState, rng: Rng) {
  const ev = pick(rng, CITY_EVENTS);
  s.activeEvent = {
    name: ev.name,
    mul: ev.mul,
    endsAt: s.minutes + ev.hours * 60,
    blurb: ev.blurb,
  };
  s.nextEventAt = s.minutes + MINUTES_PER_DAY * randInt(rng, 5, 14);
  pushLog(
    s,
    line(
      `${ev.name}: expect roughly +${Math.round((ev.mul - 1) * 100)}% traffic for ${ev.hours}h.`,
      `${cityEventCopy(ev, true).name}: ${ev.hours} saat boyunca yaklaşık %${Math.round((ev.mul - 1) * 100)} fazla trafik bekleniyor.`,
    ),
    'info',
  );
}

function growCity(s: GameState, rng: Rng) {
  const candidates = s.districts.filter((d) => d.unlocked && d.coverage >= 0.4 && d.satisfaction >= 65);
  if (candidates.length) developDistrict(s, pick(rng, candidates).id, 6);
  const years = s.minutes / (MINUTES_PER_DAY * 365);
  s.nextGrowthAt =
    s.minutes + MINUTES_PER_DAY * Math.max(6, Math.round(randInt(rng, 14, 26) * clamp(1 - years * 0.18, 0.4, 1)));
}

export { clamp } from './util';

export function pushLog(s: GameState, text: string, tone: 'good' | 'bad' | 'info') {
  s.log = [{ id: uid('log'), at: s.minutes, text, tone }, ...s.log].slice(0, 60);
}
