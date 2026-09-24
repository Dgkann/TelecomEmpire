import { initialCompetition } from './competition';
import { initialProcurement, tickProcurement } from './procurement';
import { initialStrategy } from './board';
import { DIFFICULTY, GRID, MINUTES_PER_DAY, SAVE_VERSION, nodeCapacity } from './constants';
import { clamp } from './util';
import { generateCity } from './cityGen';
import { personName } from './names';
import { initialEnergy } from './energy';
import { initialSignalTraining } from './signalTraining';
import { line } from './lang';
import { CAMPAIGN_STAGES } from './scenarios';
import { makeRng, randInt, uid, type Rng } from './rng';
import type { Difficulty, GameState, Technician } from './types';
import { emptyServiceTraffic, redistributePackages } from './simulation';

// Setting up a new company and city; the simulation advances it from here.

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
