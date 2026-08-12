import {
  CONTRACT_CONTENTION,
  DIFFICULTY,
  GRID,
  HOURLY_DEMAND_CURVE,
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  MINUTES_PER_STEP,
  MOBILE_AVG_SPEED,
  MOBILE_MARKET_SHARE,
  MOBILE_OVERSUBSCRIPTION,
  OVERSUBSCRIPTION,
  SPECTRUM_BANDS,
  START_DATE,
  TRANSIT_TIERS,
  nodeCapacity,
  towerCapacity,
  towerRadius,
} from './constants';
import { createAuction, settleAuction } from './spectrum';
import { playerShareTarget, strongestRival, tickCompetitors } from './competitors';
import { chargeLoans, checkSolvency } from './finance';
import { makeRegulation, settleRegulations, shouldIssue } from './regulator';
import { approach, clamp } from './util';
import { generateCity } from './cityGen';
import { averageSpeed, monthlyBreakdown, packageMix, priceIndex } from './economy';
import { rollIncident } from './incidents';
import { CITY_EVENTS, companyName, enterpriseName, handleName, makePost, makeSwitchPost, personName } from './names';
import { computeRoutes, loadNetwork, servingNodes } from './network';
import { researchModifiers, type ResearchMods } from './research';
import { makeRng, pick, rand, randInt, uid, type Rng } from './rng';
import type { Building, ChurnReason, Difficulty, District, GameState, Incident, NetNode, Technician } from './types';

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
}

export function createNewGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rng = makeRng(seed);
  const { districts, buildings } = generateCity(seed);
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
    version: 1,
    companyName: opts.companyName,
    logo: opts.logo,
    difficulty: opts.difficulty,
    cityName: opts.cityName,
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
      { id: 'pkg_start', name: 'Starter Fibre', speedMbps: 100, price: 20, segment: 'residential', active: true, subscribers: 0 },
      { id: 'pkg_plus', name: 'Fibre Plus', speedMbps: 500, price: 35, segment: 'residential', active: true, subscribers: 0 },
      { id: 'pkg_ultra', name: 'Ultra Fibre', speedMbps: 1000, price: 50, segment: 'residential', active: true, subscribers: 0 },
      // Sold only once you have radios and spectrum to run them on.
      { id: 'pkg_mob_lite', name: 'Mobile Lite', speedMbps: 40, price: 12, segment: 'mobile', active: true, subscribers: 0 },
      { id: 'pkg_mob_std', name: 'Mobile Standard', speedMbps: 100, price: 22, segment: 'mobile', active: true, subscribers: 0 },
      { id: 'pkg_mob_max', name: 'Mobile Unlimited', speedMbps: 300, price: 38, segment: 'mobile', active: true, subscribers: 0 },
    ],
    contracts: [],
    offers: [],
    incidents: [],
    technicians: [makeTechnician(rng, popGx, popGy), makeTechnician(rng, popGx, popGy)],
    employees: [
      { id: uid('e'), name: personName(rng), role: 'network_engineer', salary: 4200, skill: 3, experience: 0 },
      { id: uid('e'), name: personName(rng), role: 'support', salary: 2400, skill: 2, experience: 0 },
    ],
    researchDone: [],
    researchActive: null,
    competitors: [
      { id: 'novatel', name: 'NovaTel', color: '#ff9f43', aggression: 0.9, share: {}, priceIndex: 1, cash: 250000, coverage: {}, mobileCoverage: {}, tech: 0.2, lastMove: null },
      { id: 'hypernet', name: 'HyperNet', color: '#a78bfa', aggression: 1.1, share: {}, priceIndex: 0.92, cash: 250000, coverage: {}, mobileCoverage: {}, tech: 0.2, lastMove: null },
      { id: 'telestar', name: 'Telestar', color: '#7ee787', aggression: 0.7, share: {}, priceIndex: 1.12, cash: 250000, coverage: {}, mobileCoverage: {}, tech: 0.2, lastMove: null },
    ],
    posts: [],
    log: [{ id: uid('log'), at: 8 * 60, text: `${opts.companyName} is licensed to operate in ${home.name}.`, tone: 'info' }],
    stats: {
      demandGbps: 0,
      servedGbps: 0,
      coreUtilization: 0,
      packetLoss: 0,
      latencyMs: 12,
      health: 100,
      outages: {},
    },
    finance: {
      revenueResidential: 0,
      revenueBusiness: 0,
      revenueEnterprise: 0,
      costSalaries: 0,
      costPower: 0,
      costMaintenance: 0,
      costTransit: 0,
      costMarketing: 0,
      penalties: 0,
    },
    history: [],
    monthAccumulator: { revenue: 0, expense: 0 },
    marketingBudget: 2000,
    retentionBudget: 0,
    churn: [],
    demandHistory: [],
    dayPeakDemand: 0,
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
  return state;
}

function makeTechnician(rng: Rng, gx: number, gy: number): Technician {
  return {
    id: uid('t'),
    name: personName(rng),
    skill: randInt(rng, 1, 3),
    salary: 2200 + randInt(rng, 0, 600),
    experience: 0,
    incidentId: null,
    gx,
    gy,
    homeGx: gx,
    homeGy: gy,
    state: 'idle',
  };
}

function seedStartingCustomers(state: GameState, count: number, districtId: string) {
  const pool = state.buildings.filter((b) => b.districtId === districtId && b.segment === 'residential' && b.households > 0);
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

export function residentialSubs(state: GameState, districtId?: string) {
  return state.buildings.reduce(
    (s, b) =>
      b.segment === 'residential' && (!districtId || b.districtId === districtId) ? s + b.households * b.connected : s,
    0,
  );
}

export function totalCustomers(state: GameState) {
  return Math.round(residentialSubs(state)) + Math.round(mobileSubs(state)) + state.contracts.length;
}

// Keeps package subscriber counts consistent with what the map actually shows.
export function redistributePackages(state: GameState) {
  const total = residentialSubs(state);
  const mix = packageMix(state.packages, 'residential');
  for (const p of state.packages) if (p.segment === 'residential') p.subscribers = 0;
  for (const m of mix) m.pkg.subscribers = Math.round(total * m.share);
}

export function step(prev: GameState): GameState {
  if (prev.gameOver) return prev;
  const s: GameState = { ...prev };
  const rng = makeRng((s.minutes * 2654435761 + s.rngSeed) >>> 0);
  const mods = researchModifiers(s.researchDone);
  const diff = DIFFICULTY[s.difficulty];
  const dt = MINUTES_PER_STEP;
  const dayFrac = dt / MINUTES_PER_DAY;
  const monthFrac = dt / MINUTES_PER_MONTH;

  const prevDay = Math.floor(s.minutes / MINUTES_PER_DAY);
  const prevMonth = Math.floor(s.minutes / MINUTES_PER_MONTH);
  s.minutes += dt;
  const newDay = Math.floor(s.minutes / MINUTES_PER_DAY) > prevDay;
  const newMonth = Math.floor(s.minutes / MINUTES_PER_MONTH) > prevMonth;

  // 1. Demand
  const eventMul = s.activeEvent && s.minutes < s.activeEvent.endsAt ? s.activeEvent.mul : 1;
  if (s.activeEvent && s.minutes >= s.activeEvent.endsAt) {
    pushLog(s, `${s.activeEvent.name} is over. Traffic is settling back down.`, 'info');
    s.activeEvent = null;
  }
  const curve = demandCurve(s.minutes) * eventMul;
  const avgSpeed = averageSpeed(s.packages);

  const districtDemand: Record<string, number> = {};
  for (const d of s.districts) {
    const subs = residentialSubs(s, d.id);
    const resDemand = (subs * avgSpeed * OVERSUBSCRIPTION * curve) / 1000; // Gbps
    const bizDemand = s.contracts
      .filter((c) => c.districtId === d.id)
      .reduce((sum, c) => sum + c.bandwidthGbps * CONTRACT_CONTENTION * (0.45 + 0.55 * curve), 0);
    const mobDemand = (d.mobileSubs * MOBILE_AVG_SPEED * MOBILE_OVERSUBSCRIPTION * curve) / 1000;
    districtDemand[d.id] = resDemand + bizDemand + mobDemand;
  }

  // 2. Route and load
  const routes = computeRoutes(s);
  const load = loadNetwork(s, districtDemand, routes);

  const transit = TRANSIT_TIERS[s.transitTier];
  const transitCap = transit.capacity * (s.backupTransit ? 1.35 : 1);
  const transitPressure = load.totalDemand / Math.max(0.01, transitCap);

  s.nodes = s.nodes.map((n) => {
    const traffic = load.nodeTraffic[n.id] ?? 0;
    // DDoS and overheating chew capacity instead of killing the box outright.
    const degraded = s.incidents.some((i) => !i.resolved && i.degrade && i.targetId === n.id);
    // A tower is only worth as much as the spectrum you are allowed to run on it.
    const rated = n.kind === 'tower' ? towerCapacity(s.spectrum, n.tier) : nodeCapacity(n.kind, n.tier);
    const effCap = degraded ? rated * (0.35 + 0.3 * (1 - mods.ddosMul)) : rated;
    const util = traffic / Math.max(0.01, effCap);
    // Kit does not stay new. Idle equipment recovers, but only up to a ceiling
    // that falls the longer it has gone without a crew looking at it, so a big
    // old network needs ongoing maintenance rather than none.
    const yearsSinceService = (s.minutes - (n.servicedAt ?? n.builtAt)) / (MINUTES_PER_DAY * 365);
    const ceiling = clamp(100 - yearsSinceService * 14, 45, 100);
    const wear = util > 0.92 ? -0.05 : util < 0.7 ? 0.02 : 0;
    const health = clamp(Math.min(n.health + wear, ceiling), 20, 100);
    return { ...n, trafficGbps: traffic, capacityGbps: effCap, health };
  });
  s.links = s.links.map((l) => ({ ...l, trafficGbps: load.linkTraffic[l.id] ?? 0 }));

  // 3. Quality of service
  let weightedPressure = 0;
  let weightTotal = 0;
  const outages: Record<string, boolean> = {};
  for (const d of s.districts) {
    // Mobile subscribers feel outages too, so they carry weight here.
    const subs = residentialSubs(s, d.id) + d.mobileSubs;
    if (subs <= 0 && !s.contracts.some((c) => c.districtId === d.id)) continue;
    const pressure = Math.max(load.districtPressure[d.id] ?? 0, transitPressure);
    const outage = load.districtOutage[d.id] ?? false;
    outages[d.id] = outage;
    weightedPressure += (outage ? 2.5 : pressure) * Math.max(1, subs);
    weightTotal += Math.max(1, subs);
  }
  const pressure = weightTotal > 0 ? weightedPressure / weightTotal : 0;
  const packetLoss = clamp((pressure - 1) * 0.35, 0, 0.85) * mods.lossImpactMul;
  const latency = 9 + Math.pow(Math.max(0, pressure - 0.7), 2) * 90;
  const avgNodeHealth = s.nodes.length ? s.nodes.reduce((a, n) => a + (n.down ? 0 : n.health), 0) / s.nodes.length : 100;
  const health = clamp(avgNodeHealth * (1 - packetLoss * 0.8) - Object.values(outages).filter(Boolean).length * 6, 0, 100);

  s.dayPeakDemand = Math.max(s.dayPeakDemand, load.totalDemand);
  s.stats = {
    demandGbps: load.totalDemand,
    servedGbps: load.totalServed,
    coreUtilization: pressure,
    packetLoss,
    latencyMs: latency,
    health,
    outages,
  };

  // 4. Coverage, satisfaction and customers
  const liveTowers = s.nodes.filter((n) => n.kind === 'tower' && !n.down && routes[n.id]);

  s.districts = s.districts.map((d) => {
    if (!d.unlocked) return d;
    const serving = servingNodes(s, d.id).filter((n) => routes[n.id]);
    let coverageTarget = 0;
    for (const n of serving) {
      const per = n.kind === 'pop' ? 0.32 : n.kind === 'tower' ? 0.26 : 0.13;
      coverageTarget += per * (1 + (n.tier - 1) * 0.18);
    }
    coverageTarget = Math.min(mods.coverageCeiling, coverageTarget);
    const coverage = approach(d.coverage, coverageTarget, 0.035 * dayFrac * MINUTES_PER_DAY * 0.02 + 0.03 * dayFrac);

    const dPressure = Math.max(load.districtPressure[d.id] ?? 0, transitPressure);
    const outage = outages[d.id];
    const pIndex = priceIndex(s);
    let satTarget = 92;
    if (outage) satTarget = 8;
    else {
      satTarget -= clamp((dPressure - 0.85) * 110, 0, 70);
      satTarget -= clamp((pIndex - 1) * 55, -12, 30);
      satTarget += (s.reputation - 50) * 0.12;
      satTarget += s.employees.filter((e) => e.role === 'support').length * 1.5;
    }
    const satisfaction = approach(d.satisfaction, clamp(satTarget, 0, 100), outage ? 0.5 * dayFrac * 24 : 1.6 * dayFrac);

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
    revenueResidential: money.revenueResidential + money.revenueMobile,
    revenueBusiness: money.revenueBusiness,
    revenueEnterprise: money.revenueEnterprise,
    costSalaries: money.costSalaries,
    costPower: money.costPower,
    costMaintenance: money.costMaintenance,
    costTransit: money.costTransit,
    costMarketing: money.costMarketing,
    penalties: s.finance.penalties,
  };

  // 6. Reputation
  const outageCount = Object.values(outages).filter(Boolean).length;
  const repTarget = clamp(
    50 + (health - 70) * 0.7 + (averageSatisfaction(s) - 60) * 0.35 - outageCount * 8,
    0,
    100,
  );
  s.reputation = approach(s.reputation, repTarget, 1.2 * dayFrac);

  // 7. Incidents, technicians, contracts
  tickIncidents(s, mods, diff, dt, rng);
  tickTechnicians(s, dt, mods);
  tickContracts(s, mods, dt, rng, outages);

  // 8. Research
  if (s.researchActive) {
    const daysLeft = s.researchActive.daysLeft - dayFrac;
    if (daysLeft <= 0) {
      const doneId = s.researchActive.id;
      s.researchDone = [...s.researchDone, doneId];
      s.researchActive = null;
      pushLog(s, `Research complete: ${doneId.replace(/_/g, ' ')}.`, 'good');

      if (doneId === 'mobile_4g') {
        // The regulator hands every new entrant a starter block, otherwise a
        // lost auction would leave your towers with nothing to transmit on.
        s.spectrum = [{ band: '1800', blocks: 1, wonAt: s.minutes, paid: 0 }];
        s.nextAuctionAt = s.minutes + MINUTES_PER_DAY * 12;
        pushLog(s, 'Regulator granted a starter block at 1800 MHz. Towers can go live.', 'good');
      }
    } else {
      s.researchActive = { ...s.researchActive, daysLeft };
    }
  }

  tickAuction(s, rng);

  const failure = checkSolvency(s);
  if (failure) {
    s.gameOver = { reason: failure, at: s.minutes };
    s.speed = 0;
    pushLog(s, 'The company has gone under.', 'bad');
  }

  // 9. Daily / monthly beats
  if (newDay) {
    maybeSocialPost(s, rng, packetLoss, outageCount, avgSpeed);
    tickCompetitors(s, rng, diff.competitorAggression);
    s.demandHistory = [...s.demandHistory, s.dayPeakDemand].slice(-45);
    s.dayPeakDemand = 0;
    tickRegulator(s, rng);
    if (s.minutes > s.nextEventAt) startCityEvent(s, rng);
    if (s.minutes > s.nextGrowthAt) growCity(s, rng);
    s.researchPoints += Math.max(0, Math.round(residentialSubs(s) / 500));
  }
  if (newMonth) {
    s.history = [
      ...s.history.slice(-23),
      {
        month: Math.floor(s.minutes / MINUTES_PER_MONTH),
        revenue: s.monthAccumulator.revenue,
        expense: s.monthAccumulator.expense,
        customers: totalCustomers(s),
      },
    ];
    s.monthAccumulator = { revenue: 0, expense: 0 };
    const debtPaid = chargeLoans(s);
    if (debtPaid > 0) pushLog(s, `Loan repayments of $${Math.round(debtPaid).toLocaleString()} went out.`, 'info');
    for (const c of s.contracts) c.downtimeMinutes = 0;
    s.finance = { ...s.finance, penalties: 0 };
  }

  return s;
}

function growCustomers(s: GameState, diff: (typeof DIFFICULTY)[Difficulty], dayFrac: number, rng: Rng) {
  const pIndex = priceIndex(s);
  const marketingBoost = 1 + Math.min(1.2, s.marketingBudget / 25000);
  const changed = new Map<string, Building>();

  for (const d of s.districts) {
    if (!d.unlocked || d.coverage <= 0.001) continue;
    const addressable = d.potential * playerShareTarget(s, d);
    const current = residentialSubs(s, d.id);

    const appeal =
      clamp(1.35 - pIndex * 0.55, 0.25, 1.9) *
      clamp(d.satisfaction / 65, 0.15, 1.5) *
      clamp(0.6 + s.reputation / 110, 0.4, 1.6) *
      marketingBoost *
      diff.growthMul;

    const gap = addressable - current;
    const retention = clamp(1 - s.retentionBudget / 30000, 0.45, 1);
    // Two different ways to lose people. The market shrinking under you as
    // rivals build out, and your own customers walking because they are unhappy.
    const marketLoss = gap < 0 ? -gap * 0.05 * dayFrac * retention : 0;
    const churnRate = clamp((62 - d.satisfaction) / 62, 0, 1) * 0.18 * diff.churnMul * retention;
    const unhappyLoss = current * churnRate * dayFrac;

    let delta = gap > 0 ? gap * 0.09 * appeal * dayFrac : -marketLoss;
    delta -= unhappyLoss;

    const lost = marketLoss + unhappyLoss;
    if (lost > 0.0001) recordChurn(s, d, lost, pIndex, rng, marketLoss > unhappyLoss);
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

// Signal strength at a point, 0 outside every footprint and 1 at a mast.
export function signalAt(s: GameState, gx: number, gy: number) {
  let best = 0;
  for (const t of s.nodes) {
    if (t.kind !== 'tower' || t.down) continue;
    const r = towerRadius(s.spectrum, t.tier);
    if (r <= 0) continue;
    best = Math.max(best, 1 - Math.min(1, Math.hypot(t.gx - gx, t.gy - gy) / r));
  }
  return best;
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
    const addressable =
      d.population * MOBILE_MARKET_SHARE * d.mobileCoverage * clamp(1 - rivalRadio * 0.5, 0.15, 1);

    const appeal =
      clamp(1.5 - avgPrice / 26, 0.25, 1.9) *
      clamp(d.satisfaction / 70, 0.2, 1.4) *
      clamp(0.6 + s.reputation / 110, 0.4, 1.6) *
      diff.growthMul;

    const gap = addressable - d.mobileSubs;
    let delta = gap > 0 ? gap * 0.11 * appeal * dayFrac : gap * 0.06 * dayFrac;
    delta -= d.mobileSubs * clamp((62 - d.satisfaction) / 62, 0, 1) * 0.2 * diff.churnMul * dayFrac;

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
  for (const p of s.packages) if (p.segment === 'mobile') p.subscribers = 0;
  for (const m of mix) m.pkg.subscribers = Math.round(total * m.share);
}

// ---------------------------------------------------------------------------

// Customers leaving is more useful to a player as "who took them and why" than
// as a falling number, so each loss is attributed to a rival and a cause.
function recordChurn(s: GameState, d: District, count: number, pIndex: number, rng: Rng, toMarket: boolean) {
  const outage = s.stats.outages[d.id];
  const pressure = s.stats.packetLoss > 0.02;
  const reason: ChurnReason = outage
    ? 'outage'
    : pressure
      ? 'congestion'
      : pIndex > 1.1
        ? 'price'
        : s.employees.filter((e) => e.role === 'support').length === 0
          ? 'support'
          : 'price';

  const rival = strongestRival(s, d.id);
  // Losing ground to the market means somebody picked them up. Losing your own
  // unhappy customers usually means they just went quiet.
  const poached = rival && rng() < (toMarket ? 0.9 : 0.45);

  // Losses arrive a fraction at a time, so same-day losses of the same kind in
  // the same district roll into one entry rather than flooding the list.
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
      toName: poached ? rival!.name : 'left the market',
      reason,
    },
    ...s.churn,
  ].slice(0, 30);
}

function averageSatisfaction(s: GameState) {
  const active = s.districts.filter((d) => d.unlocked);
  if (!active.length) return 70;
  let weighted = 0;
  let total = 0;
  for (const d of active) {
    const subs = Math.max(1, residentialSubs(s, d.id));
    weighted += d.satisfaction * subs;
    total += subs;
  }
  return weighted / total;
}

function tickIncidents(
  s: GameState,
  mods: ResearchMods,
  diff: (typeof DIFFICULTY)[Difficulty],
  dt: number,
  rng: Rng,
) {
  // Roughly one incident every few days, scaled by how much kit you own.
  const exposure = 0.35 + s.nodes.length * 0.06 + s.links.length * 0.05;
  // Worn equipment fails more often, which is what makes servicing worth doing.
  const avgHealth = s.nodes.length ? s.nodes.reduce((a, n) => a + n.health, 0) / s.nodes.length : 100;
  const condition = 1 + clamp((90 - avgHealth) / 60, 0, 1.2);
  const perDay = 0.16 * exposure * diff.incidentRate * condition;
  const chance = perDay * (dt / MINUTES_PER_DAY);
  const unresolved = s.incidents.filter((i) => !i.resolved);

  if (rng() < chance && unresolved.length < 4) {
    const inc = rollIncident(s, rng, mods);
    if (inc) {
      // A fault on a large network takes longer to find and reach.
      const scale = 1 + Math.min(0.8, s.nodes.length / 30);
      inc.repairTotalMinutes = Math.round(inc.repairTotalMinutes * scale);
      s.incidents = [...s.incidents, inc];
      applyIncidentDown(s, inc, true);
      pushLog(s, `${inc.title} in ${s.districts.find((d) => d.id === inc.districtId)?.name ?? 'network'}`, 'bad');
      s.reputation = clamp(s.reputation - (inc.degrade ? 0.5 : 1.5), 0, 100);
    }
  }

  let touched = false;
  const next = s.incidents.map((inc) => {
    if (inc.resolved || inc.repairMinutesLeft === null) return inc;
    const tech = s.technicians.find((t) => t.id === inc.assignedTechId);
    // Work only progresses once the crew is on site.
    if (tech && tech.state !== 'working') return inc;
    const left = inc.repairMinutesLeft - dt;
    touched = true;
    if (left <= 0) {
      applyIncidentDown(s, inc, false);
      pushLog(s, `${inc.title} resolved.`, 'good');
      return { ...inc, repairMinutesLeft: 0, resolved: true };
    }
    return { ...inc, repairMinutesLeft: left };
  });
  if (touched) s.incidents = next;

  if (s.autoDispatch && mods.hasAutoDispatch) {
    for (const inc of s.incidents) {
      if (inc.resolved || inc.assignedTechId) continue;
      const free = s.technicians.find((t) => t.state === 'idle');
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

export function dispatch(
  s: GameState,
  incidentId: string,
  techId: string,
  mode: 'emergency' | 'normal',
  free = false,
) {
  const inc = s.incidents.find((i) => i.id === incidentId);
  const tech = s.technicians.find((t) => t.id === techId);
  if (!inc || !tech) return;
  const skillMul = 1 - (tech.skill - 1) * 0.12;
  const minutes = Math.max(
    30,
    Math.round(inc.repairTotalMinutes * (mode === 'emergency' ? 0.28 : 1) * skillMul),
  );
  const cost = mode === 'emergency'
    ? Math.round((1200 + inc.repairTotalMinutes * 22) / 100) * 100
    : Math.round((300 + inc.repairTotalMinutes * 5) / 100) * 100;
  if (!free) s.money -= cost;

  s.incidents = s.incidents.map((i) =>
    i.id === incidentId ? { ...i, repairMinutesLeft: minutes, assignedTechId: techId } : i,
  );
  const target = incidentLocation(s, inc);
  s.technicians = s.technicians.map((t) =>
    t.id === techId ? { ...t, incidentId, state: 'driving' as const, homeGx: target.gx, homeGy: target.gy } : t,
  );
}

export function incidentLocation(s: GameState, inc: Incident): { gx: number; gy: number } {
  if (inc.targetType === 'node') {
    const n = s.nodes.find((x) => x.id === inc.targetId);
    if (n) return { gx: n.gx, gy: n.gy };
  } else {
    const l = s.links.find((x) => x.id === inc.targetId);
    if (l) {
      const a = s.nodes.find((n) => n.id === l.aId);
      const b = s.nodes.find((n) => n.id === l.bId);
      if (a && b) return { gx: (a.gx + b.gx) / 2, gy: (a.gy + b.gy) / 2 };
    }
  }
  const d = s.districts.find((x) => x.id === inc.districtId);
  return d ? d.center : { gx: 0, gy: 0 };
}

function tickTechnicians(s: GameState, dt: number, _mods: ResearchMods) {
  const speed = 0.02 * dt; // grid units per game minute
  let changed = false;
  const next = s.technicians.map((t) => {
    if (t.state === 'idle') return t;
    const inc = s.incidents.find((i) => i.id === t.incidentId);

    if (t.state === 'driving') {
      if (!inc) return { ...t, state: 'idle' as const, incidentId: null };
      const target = incidentLocation(s, inc);
      const moved = moveToward(t, target, speed);
      changed = true;
      if (moved.arrived) return { ...t, gx: target.gx, gy: target.gy, state: 'working' as const };
      return { ...t, gx: moved.gx, gy: moved.gy };
    }

    if (t.state === 'working') {
      if (!inc || inc.resolved) {
        changed = true;
        return { ...t, state: 'returning' as const, incidentId: null, experience: t.experience + 1 };
      }
      return t;
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

function tickContracts(
  s: GameState,
  mods: ResearchMods,
  dt: number,
  rng: Rng,
  outages: Record<string, boolean>,
) {
  if (s.contracts.length) {
    let penalties = 0;
    s.contracts = s.contracts.map((c) => {
      const out = outages[c.districtId];
      if (!out) return c;
      const downtimeMinutes = c.downtimeMinutes + dt;
      const allowed = MINUTES_PER_MONTH * (1 - c.slaPercent / 100);
      let penaltyPaid = c.penaltyPaid;
      if (downtimeMinutes > allowed) {
        const fee = c.monthlyRevenue * 0.02 * (dt / 60);
        penalties += fee;
        penaltyPaid += fee;
      }
      return { ...c, downtimeMinutes, penaltyPaid };
    });
    if (penalties > 0) {
      s.money -= penalties;
      s.finance = { ...s.finance, penalties: s.finance.penalties + penalties };
    }
  }

  const live = s.offers.filter((o) => o.expiresAt > s.minutes);
  if (live.length !== s.offers.length) s.offers = live;

  const maxOffers = mods.hasEnterprise ? 3 : 2;
  const chance = 0.35 * (dt / MINUTES_PER_DAY) * (1 + s.reputation / 90);
  if (s.offers.length < maxOffers && rng() < chance) {
    const offer = makeOffer(s, mods, rng);
    if (offer) s.offers = [...s.offers, offer];
  }
}

function makeOffer(s: GameState, mods: ResearchMods, rng: Rng) {
  const eligible = s.districts.filter((d) => d.unlocked && d.coverage > 0.12);
  if (!eligible.length) return null;
  const d = pick(rng, eligible);
  const wantEnterprise = mods.hasEnterprise && rng() < 0.4;
  const pool = s.buildings.filter(
    (b) => b.districtId === d.id && (wantEnterprise ? b.segment === 'enterprise' : b.segment === 'business'),
  );
  if (!pool.length) return null;
  const building = pick(rng, pool);
  if (s.contracts.some((c) => c.buildingId === building.id)) return null;

  const bandwidth = wantEnterprise ? Math.round(rand(rng, 4, 12)) : Math.round(rand(rng, 0.5, 2) * 10) / 10;
  // Priced per Gbps of headline bandwidth. Enterprise pays a premium for the SLA.
  const rate = wantEnterprise ? rand(rng, 1000, 1600) : rand(rng, 450, 700);
  const monthlyRevenue = Math.round((bandwidth * rate) / 50) * 50;
  const sla = wantEnterprise ? pick(rng, [99.9, 99.95, 99.99]) : pick(rng, [99, 99.5, 99.9]);

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
    expiresAt: s.minutes + MINUTES_PER_DAY * randInt(rng, 2, 5),
    signingBonus: Math.round(monthlyRevenue * rand(rng, 0.5, 2)),
  };
}

function tickAuction(s: GameState, rng: Rng) {
  if (!s.researchDone.includes('mobile_4g')) return;

  if (!s.auction && s.minutes >= s.nextAuctionAt) {
    const auction = createAuction(s, rng);
    if (auction) {
      s.auction = auction;
      pushLog(s, `Spectrum auction announced: ${SPECTRUM_BANDS[auction.band].label}.`, 'info');
    }
    s.nextAuctionAt = s.minutes + MINUTES_PER_DAY * randInt(rng, 40, 70);
    return;
  }

  if (!s.auction || s.auction.result) return;
  if (s.minutes < s.auction.closesAt) return;

  const settled = settleAuction(s, s.auction, rng);
  s.auction = settled;
  const result = settled.result!;

  if (result.winnerId === 'player') {
    s.money -= result.price;
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
      `Won ${settled.blocks} block(s) at ${SPECTRUM_BANDS[settled.band].label} for $${result.price.toLocaleString()}.`,
      'good',
    );
    s.reputation = clamp(s.reputation + 2, 0, 100);
  } else if (result.winnerId === 'none') {
    pushLog(s, `The ${SPECTRUM_BANDS[settled.band].label} lot went unsold.`, 'info');
  } else {
    pushLog(s, `${result.winnerName} took the ${SPECTRUM_BANDS[settled.band].label} lot.`, 'bad');
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


// The regulator only turns up once you are big enough to be worth regulating,
// and it keeps turning up as you grow.
function tickRegulator(s: GameState, rng: Rng) {
  for (const outcome of settleRegulations(s)) {
    if (outcome.met) {
      s.reputation = clamp(s.reputation + 4, 0, 100);
      pushLog(s, `${outcome.regulation.title} met.`, 'good');
    } else {
      s.money -= outcome.regulation.fine;
      s.reputation = clamp(s.reputation - 8, 0, 100);
      pushLog(s, `${outcome.regulation.title} missed. Fined $${outcome.regulation.fine.toLocaleString()}.`, 'bad');
    }
  }

  const customers = residentialSubs(s) + mobileSubs(s);
  if (s.minutes >= s.nextRegulationAt && shouldIssue(s, customers)) {
    const reg = makeRegulation(s, rng, customers);
    if (reg) {
      s.regulations = [...s.regulations, reg];
      pushLog(s, `${reg.title}: ${reg.detail}`, 'info');
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
  pushLog(s, `${ev.name}: expect roughly +${Math.round((ev.mul - 1) * 100)}% traffic for ${ev.hours}h.`, 'info');
}

function growCity(s: GameState, rng: Rng) {
  const unlocked = s.districts.filter((d) => d.unlocked);
  if (!unlocked.length) return;
  const d = pick(rng, unlocked);
  const candidates = s.buildings.filter((b) => b.districtId === d.id && b.kind !== 'park' && b.floors < 9);
  if (!candidates.length) return;

  const upgraded: string[] = [];
  for (let i = 0; i < 6; i++) {
    const b = pick(rng, candidates);
    upgraded.push(b.id);
  }
  s.buildings = s.buildings.map((b) => {
    if (!upgraded.includes(b.id)) return b;
    const extra = randInt(rng, 2, 8);
    return { ...b, floors: Math.min(10, b.floors + 1), households: b.households + extra };
  });
  s.districts = s.districts.map((x) =>
    x.id === d.id ? { ...x, potential: Math.round(x.potential * 1.04), population: Math.round(x.population * 1.04) } : x,
  );
  // Growth accelerates, so a network that was comfortable last year is not.
  const years = s.minutes / (MINUTES_PER_DAY * 365);
  const interval = Math.max(6, Math.round(randInt(rng, 14, 26) * clamp(1 - years * 0.18, 0.4, 1)));
  s.nextGrowthAt = s.minutes + MINUTES_PER_DAY * interval;
  pushLog(s, `${d.name} is growing, new residents mean new demand.`, 'info');
}

export { clamp } from './util';


export function pushLog(s: GameState, text: string, tone: 'good' | 'bad' | 'info') {
  s.log = [{ id: uid('log'), at: s.minutes, text, tone }, ...s.log].slice(0, 60);
}
