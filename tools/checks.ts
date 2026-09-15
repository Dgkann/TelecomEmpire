import { levyOutlook, operatingPowerBill, solarQuote, tariffQuote } from '../src/game/energyPlanning';
import { researchPlan } from '../src/game/researchPlanning';
import { reputationOutlook } from '../src/game/reputation';
import { goalTiming } from '../src/game/goalTiming';
import { dataCenterOutlook } from '../src/game/dataCenterOutlook';
import { DATACENTER_PILOT_COST, nodeUpgradeCost, nodeCapitalCost } from '../src/game/constants';
import {
  beginSignalTraining,
  turnSignalTile,
  finishSignalTraining,
  signalConnection,
  signalBoard,
  validSignalTraining,
  TRAINING_REWARD,
  TRAINING_RESEARCH,
  TRAINING_COOLDOWN,
} from '../src/game/signalTraining';
import {
  initialCompetition,
  startMarketOperation,
  cancelMarketOperation,
  operationCost,
  marketEffects,
  rivalMarketEffects,
  servicePromiseReady,
  tickCompetition,
  OPERATION_MINUTES,
  RIVAL_MOVES,
} from '../src/game/competition';
import { capacityOptions, capacityPlan, commissionCapacityPlan, testCapacity } from '../src/game/capacityLab';
import {
  initialProcurement,
  tickProcurement,
  submitTenderBid,
  withdrawTenderBid,
  tenderProgress,
  bidBond,
  bidScore,
} from '../src/game/procurement';
import {
  DEFAULT_SMART_PAUSE,
  SMART_PAUSE_KEY,
  parseSmartPausePreferences,
  loadSmartPausePreferences,
  smartPauseEvents,
} from '../src/game/smartPause';
import { updateCompanyIdentity, COMPANY_EMBLEMS } from '../src/game/identity';
import { expansionQuote, expansionProgress, launchDistrict } from '../src/game/expansion';
import { fixedCoverageTarget, reachGain, networkReachGain } from '../src/game/reach';
import { failureDrill } from '../src/game/failureDrill';
import { connectedSiteEstimate, buildConnectedSite } from '../src/game/connectedBuild';
import { backupRouteEstimate, buildBackupRoute } from '../src/game/redundancyBuild';
import { projectBlueprint, MAX_PLAN_STEPS, type BuildStep } from '../src/game/blueprint';
import { initialStrategy, tickBoard, resolveDecision, developDistrict, claimChallenge } from '../src/game/board';
import { acquireCompany, acquisitionQuote } from '../src/game/acquisitions';
import { residentialPeakEstimate } from '../src/game/planCapacity';
// Invariant checks, run headless.
import {
  MINUTES_PER_DAY,
  ENERGY,
  MINUTES_PER_MONTH,
  MOBILE_MARKET_SHARE,
  NODE_SPECS,
  SAVE_VERSION,
  SLA_PENALTY_CAP,
  TRANSIT_TIERS,
  linkCapacity,
  nodeCapacity,
  towerCapacity,
  towerRadius,
} from '../src/game/constants';
import { effectiveNodeCapacity } from '../src/game/capacity';
import { monthlyBreakdown, priceIndex } from '../src/game/economy';
import { districtPull, leaderOf, playerShareTarget, rivalPosture, tickCompetitors } from '../src/game/competitors';
import {
  computeRoutes,
  daysUntilFull,
  districtIsRedundant,
  districtRedundancy,
  forecastDemand,
  servingCoverAfterLoss,
  isRedundant,
  loadNetwork,
  loadServices,
  servingCapacity,
} from '../src/game/network';
import { GRACE_DAYS, chargeLoans, createLoan, creditLimit, totalDebt } from '../src/game/finance';
import { RESEARCH, researchModifiers } from '../src/game/research';
import { makeRegulation, networkResilience, pendingRegulations, regulationProgress } from '../src/game/regulator';
import { RANKS, checkPromotion, cityShare, customerCount, meetsRank, rankOf } from '../src/game/progression';
import { cacheRatio, mobileServingTowers, tickMaintenance } from '../src/game/simulation';
import { contractRisk, operationsInsights } from '../src/game/operations';
import { repairCost, repairOptions, dispatchCandidates, pendingIncidents } from '../src/game/incidents';
import { hostingRevenue, potentialHostingRevenue } from '../src/game/economy';
import { currentMonthCashFlow } from '../src/game/financeLedger';
import { migrate } from '../src/game/save';
import { clearSave, exportSave, importSave, listSaveMeta, loadGame, saveGame } from '../src/game/saveStorage';
import {
  boundedIncidentMultipliers,
  createNewGame,
  customerGrowthSnapshot,
  dispatch,
  INCIDENT_LOAD_FLOOR,
  mobileSubs,
  residentialSubs,
  step,
  totalCustomers,
} from '../src/game/simulation';
import { makeRng } from '../src/game/rng';
import { staffModifiers, trainEmployee } from '../src/game/staff';
import { contractProfile, negotiatedTerms, premiumCounterChance, resolveNegotiation } from '../src/game/contracts';
import {
  fibreConnectionCost,
  fibreConnectionIssue,
  nodePlacementCost,
  nodePlacementIssue,
} from '../src/game/placement';
import {
  MAINTENANCE_CONFIG,
  DATA_CENTER_MODE_CONFIG,
  INTERCONNECT_CONFIG,
  interconnectOperational,
  maintenanceCost,
  wholesaleRevenue,
} from '../src/game/strategy';
import { useGame } from '../src/store/gameStore';
import { generateCity } from '../src/game/cityGen';
import { CAMPAIGN_STAGES, scenarioStatus } from '../src/game/scenarios';
import { claimMilestone, milestoneProgress } from '../src/game/milestones';
import { investmentEstimate, suggestedBackhaul } from '../src/game/investment';
import {
  buildSolar,
  energyPriceIndex,
  fixedExitFee,
  hasSolar,
  setEnergyPlan,
  siteDrawKw,
  tickEnergyMonth,
} from '../src/game/energy';
import type { ContractOffer, GameState, Incident, NetLink, NetNode } from '../src/game/types';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `  (${detail})` : ''}`);
  }
}

function finite(name: string, value: number) {
  check(name, Number.isFinite(value), `got ${value}`);
}

function group(name: string) {
  console.log(`\n${name}`);
}

const newGame = (seed: number) =>
  createNewGame({ companyName: 'CoreLink', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed });

const runDays = (g: GameState, days: number, onDay?: (g: GameState) => GameState) => {
  let s = g;
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < MINUTES_PER_DAY / 5; i++) s = step(s);
    if (onDay) s = onDay(s);
  }
  return s;
};

function repairAll(g: GameState): GameState {
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

group('a year of simulated play');
{
  let g = newGame(12345);
  g = runDays(g, 365, repairAll);

  finite('money is a real number', g.money);
  finite('demand is a real number', g.stats.demandGbps);
  finite('packet loss is a real number', g.stats.packetLoss);
  finite('reputation is a real number', g.reputation);
  check('packet loss stays within 0..1', g.stats.packetLoss >= 0 && g.stats.packetLoss <= 1, `${g.stats.packetLoss}`);
  check('reputation stays within 0..100', g.reputation >= 0 && g.reputation <= 100, `${g.reputation}`);
  check('network health stays within 0..100', g.stats.health >= 0 && g.stats.health <= 100, `${g.stats.health}`);

  const badDistrict = g.districts.find(
    (d) => !Number.isFinite(d.coverage) || !Number.isFinite(d.satisfaction) || !Number.isFinite(d.mobileSubs),
  );
  check('every district holds finite numbers', !badDistrict, badDistrict?.name);

  const badNode = g.nodes.find((n) => !Number.isFinite(n.trafficGbps) || !Number.isFinite(n.capacityGbps));
  check('every node holds finite traffic and capacity', !badNode, badNode?.name);

  const negative = g.districts.find((d) => d.mobileSubs < 0);
  check('mobile subscribers never go negative', !negative, negative?.name);

  const subs = residentialSubs(g);
  check('customers are still being served', subs > 0, `${Math.round(subs)}`);
  check('customer count is not runaway', subs < 1e7, `${Math.round(subs)}`);

  const money = monthlyBreakdown(g, researchModifiers(g.researchDone));
  finite('monthly revenue is a real number', money.totalRevenue);
  finite('monthly cost is a real number', money.totalCost);
  check('revenue is not negative', money.totalRevenue >= 0, `${money.totalRevenue}`);
}

group('an untouched network for 90 days');
{
  let g = newGame(777);
  g = runDays(g, 90);
  finite('money survives neglect', g.money);
  check('reputation stays in range while neglected', g.reputation >= 0 && g.reputation <= 100, `${g.reputation}`);
  check('the sim keeps a clock', g.minutes > MINUTES_PER_DAY * 89, `${g.minutes}`);
}

group('save and load');
{
  clearSave();
  let g = newGame(4242);
  g = runDays(g, 3);
  saveGame(g);
  const loaded = loadGame();

  check('a save can be loaded back', !!loaded);
  if (loaded) {
    check('company name survives', loaded.companyName === g.companyName);
    check('building count survives', loaded.buildings.length === g.buildings.length);
    check('node count survives', loaded.nodes.length === g.nodes.length);
    check('clock survives', loaded.minutes === g.minutes);
    // JSON turns Infinity into null, so this is the field most likely to rot.
    check('nextAuctionAt survives the JSON round-trip', loaded.nextAuctionAt === Infinity, `${loaded.nextAuctionAt}`);
    check('a loaded save can be stepped', Number.isFinite(step(loaded).money));
  }
  clearSave();
}

group('save archive and NOC telemetry');
{
  clearSave(0);
  clearSave(1);
  let first = newGame(1010);
  first = { ...first, companyName: 'Slot One' };
  const second = { ...newGame(2020), companyName: 'Slot Two' };
  saveGame(first, 0);
  saveGame(second, 1);
  check(
    'multiple slots stay independent',
    loadGame(0)?.companyName === 'Slot One' && loadGame(1)?.companyName === 'Slot Two',
  );
  check('slot metadata lists both companies', listSaveMeta()[1]?.company === 'Slot Two');
  const raw = exportSave(0);
  clearSave(2);
  const imported = raw ? importSave(raw, 2) : null;
  check(
    'a save exports and imports into another slot',
    imported?.companyName === 'Slot One' && loadGame(2)?.companyName === 'Slot One',
  );

  let sampled = newGame(3031);
  for (let i = 0; i < 13; i++) sampled = step(sampled);
  check('the NOC records hourly telemetry', sampled.telemetry.length >= 1);
  check(
    'telemetry values remain finite',
    sampled.telemetry.every((p) => Number.isFinite(p.demandGbps) && Number.isFinite(p.cash)),
  );

  const stressed = {
    ...sampled,
    links: sampled.links.map((l, i) => (i === 0 ? { ...l, trafficGbps: l.capacityGbps } : l)),
  };
  check(
    'operations detects a capacity priority',
    operationsInsights(stressed).some((i) => i.id.startsWith('capacity-')),
  );
  const synthetic = {
    id: 'c-test',
    clientName: 'Test Bank',
    districtId: stressed.districts[0].id,
    buildingId: stressed.buildings[0].id,
    bandwidthGbps: 1,
    monthlyRevenue: 1000,
    slaPercent: 99.9,
    downtimeMinutes: 50,
    penaltyPaid: 0,
    startedAt: 0,
    termMonths: 12,
    segment: 'enterprise' as const,
  };
  check('contract risk reports consumed SLA allowance', contractRisk(stressed, synthetic).usage > 0);
  clearSave(0);
  clearSave(1);
  clearSave(2);
}

group('migrating a version 1 save');
{
  const g = newGame(99);
  // Strip everything the mobile work introduced, as a v1 save would be.
  const legacy = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
  delete legacy.spectrum;
  delete legacy.auction;
  delete legacy.nextAuctionAt;
  legacy.packages = (legacy.packages as Array<{ segment: string }>).filter((p) => p.segment !== 'mobile');
  legacy.districts = (legacy.districts as Array<Record<string, unknown>>).map((d) => {
    const copy = { ...d };
    delete copy.mobileCoverage;
    delete copy.mobileSubs;
    return copy;
  });

  const migrated = migrate(legacy, 1);
  check('a v1 save migrates', !!migrated);
  if (migrated) {
    check('spectrum is backfilled', Array.isArray(migrated.spectrum) && migrated.spectrum.length === 0);
    check('auction is backfilled', migrated.auction === null);
    check('nextAuctionAt is backfilled', migrated.nextAuctionAt === Infinity, `${migrated.nextAuctionAt}`);
    check('mobile packages are backfilled', migrated.packages.filter((p) => p.segment === 'mobile').length === 3);
    check(
      'districts gain radio fields',
      migrated.districts.every((d) => d.mobileCoverage === 0 && d.mobileSubs === 0),
    );
    check('a migrated save can be stepped', Number.isFinite(step(migrated).money));
  }

  check('a save from a newer build is refused', migrate({}, SAVE_VERSION + 1) === null);
  check('a structurally broken save is refused', migrate({ buildings: 'nope' }, SAVE_VERSION) === null);
}

group('save validation and corruption recovery');
{
  const g = newGame(9911);
  const clone = () => JSON.parse(JSON.stringify(g)) as Record<string, unknown>;

  const normalized = migrate(clone(), SAVE_VERSION);
  check('a current save is deeply validated', normalized !== null);
  check('the state schema version is normalized to the envelope version', normalized?.version === SAVE_VERSION);

  const oldFinance = clone();
  delete (oldFinance.finance as Record<string, unknown>).costRetention;
  check(
    'a pre-retention finance snapshot is backfilled',
    migrate(oldFinance, SAVE_VERSION)?.finance.costRetention === 0,
  );

  const badDifficulty = clone();
  badDifficulty.difficulty = 'impossible';
  check('an unknown enum value is refused', migrate(badDifficulty, SAVE_VERSION) === null);

  const incompleteCurrent = clone();
  delete incompleteCurrent.researchDone;
  check('a current save with a missing progress field is refused', migrate(incompleteCurrent, SAVE_VERSION) === null);

  const badFinance = clone();
  (badFinance.finance as Record<string, unknown>).costPower = Number.NaN;
  check('a non-finite nested number is refused', migrate(badFinance, SAVE_VERSION) === null);

  const danglingLink = clone();
  const links = danglingLink.links as Array<Record<string, unknown>>;
  links[0] = { ...links[0], bId: 'missing-node' };
  check('a link to a missing node is refused', migrate(danglingLink, SAVE_VERSION) === null);

  const duplicateNode = clone();
  const nodes = duplicateNode.nodes as Array<Record<string, unknown>>;
  nodes[1] = { ...nodes[1], id: nodes[0].id };
  check('duplicate entity identifiers are refused', migrate(duplicateNode, SAVE_VERSION) === null);

  const target = g.nodes[0];
  const recoverable = clone();
  recoverable.incidents = [
    {
      id: 'orphan-fault',
      kind: 'router_failure',
      title: 'Orphan fault',
      description: '',
      targetId: 'removed-node',
      targetType: 'node',
      districtId: target.districtId,
      startedAt: g.minutes,
      repairMinutesLeft: null,
      repairTotalMinutes: 60,
      repairBaseMinutes: 60,
      assignedTechId: null,
      affected: 0,
      resolved: false,
      degrade: false,
    },
  ];
  const firstTech = (recoverable.technicians as Array<Record<string, unknown>>)[0];
  firstTech.incidentId = 'removed-fault';
  firstTech.state = 'working';
  const repaired = migrate(recoverable, SAVE_VERSION);
  check('a fault for a removed asset is safely discarded', repaired?.incidents.length === 0);
  check(
    'a crew orphaned by a removed fault returns idle',
    repaired?.technicians[0].incidentId === null && repaired.technicians[0].state === 'idle',
  );

  const mismatched = clone();
  mismatched.incidents = [
    {
      id: 'mismatched-fault',
      kind: 'router_failure',
      title: 'Mismatched fault',
      description: '',
      targetId: target.id,
      targetType: 'node',
      districtId: target.districtId,
      startedAt: g.minutes,
      repairMinutesLeft: null,
      repairTotalMinutes: 60,
      repairBaseMinutes: 60,
      assignedTechId: null,
      affected: 0,
      resolved: false,
      degrade: false,
    },
  ];
  const mismatchedTech = (mismatched.technicians as Array<Record<string, unknown>>)[0];
  mismatchedTech.incidentId = 'mismatched-fault';
  mismatchedTech.state = 'driving';
  const repairedMismatch = migrate(mismatched, SAVE_VERSION);
  check(
    'one-sided dispatch references are cleared on both sides',
    repairedMismatch?.incidents[0].assignedTechId === null &&
      repairedMismatch.technicians[0].incidentId === null &&
      repairedMismatch.technicians[0].state === 'idle',
  );

  const portfolio = clone();
  const clientBuildings = g.buildings.filter(
    (building) => building.kind !== 'park' && building.segment !== 'residential',
  );
  const contractedBuilding = clientBuildings[0];
  const offeredBuilding = clientBuildings[1];
  const contract = {
    id: 'contract-first',
    clientName: 'First Contract',
    districtId: contractedBuilding.districtId,
    buildingId: contractedBuilding.id,
    bandwidthGbps: 1,
    monthlyRevenue: 1000,
    slaPercent: 99,
    downtimeMinutes: 0,
    penaltyPaid: 0,
    startedAt: 0,
    termMonths: 12,
    segment: contractedBuilding.segment,
    requiresRedundancy: false,
  };
  const offer = {
    id: 'offer-first',
    clientName: 'First Offer',
    districtId: offeredBuilding.districtId,
    buildingId: offeredBuilding.id,
    bandwidthGbps: 1,
    monthlyRevenue: 1000,
    slaPercent: 99,
    termMonths: 12,
    segment: offeredBuilding.segment,
    requiresRedundancy: false,
    expiresAt: 1000,
    signingBonus: 0,
  };
  portfolio.contracts = [contract, { ...contract, id: 'contract-duplicate' }];
  portfolio.offers = [
    {
      ...offer,
      id: 'offer-on-contracted-building',
      districtId: contractedBuilding.districtId,
      buildingId: contractedBuilding.id,
    },
    offer,
    { ...offer, id: 'offer-duplicate' },
  ];
  const normalizedPortfolio = migrate(portfolio, SAVE_VERSION);
  check(
    'duplicate contracts keep the first client for a building',
    normalizedPortfolio?.contracts.map((entry) => entry.id).join() === 'contract-first',
  );
  check(
    'offers on reserved buildings are removed deterministically',
    normalizedPortfolio?.offers.map((entry) => entry.id).join() === 'offer-first',
  );

  clearSave(0);
  check('a valid state is accepted for storage', saveGame(g, 0));
  const before = exportSave(0);
  const invalidRuntime = { ...g, finance: { ...g.finance, costPower: Number.NaN } };
  check('saveGame refuses malformed runtime state', saveGame(invalidRuntime, 0) === false);
  check('a refused save does not overwrite the last good slot', exportSave(0) === before);

  const invalidEnvelope = JSON.stringify({ version: SAVE_VERSION + 0.5, savedAt: Date.now(), state: clone() });
  check('a fractional or future envelope version is refused', importSave(invalidEnvelope, 0) === null);
  check('a refused import does not overwrite the last good slot', exportSave(0) === before);

  const withMobile = {
    ...g,
    districts: g.districts.map((district, index) => ({ ...district, mobileSubs: index === 0 ? 123 : 0 })),
  };
  saveGame(withMobile, 0);
  const fixedCustomers = withMobile.buildings.reduce(
    (sum, building) => (building.segment === 'residential' ? sum + building.households * building.connected : sum),
    0,
  );
  check(
    'slot metadata includes mobile subscribers',
    listSaveMeta()[0]?.customers === Math.round(fixedCustomers + 123) + withMobile.contracts.length,
  );

  const workingStorage = globalThis.localStorage;
  try {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage unavailable');
      },
      removeItem: () => {
        throw new Error('storage unavailable');
      },
    };
    check('saveGame reports a storage write failure', saveGame(g) === false);
    check('clearSave reports a storage removal failure', clearSave() === false);
  } finally {
    (globalThis as unknown as { localStorage: unknown }).localStorage = workingStorage;
  }
  clearSave(0);
}

group('route cache follows topology changes');
{
  const g = newGame(31337);
  const pop = g.nodes.find((n) => n.kind === 'pop')!;
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const span = g.links[0];
  const routes = computeRoutes(g);
  const trafficOnly = {
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, trafficGbps: 99, capacityGbps: 200 })),
    links: g.links.map((l) => ({ ...l, trafficGbps: 99, capacityGbps: 200 })),
  };
  check('traffic and capacity updates reuse the same routes', computeRoutes(trafficOnly) === routes);
  check('a cut preview isolates the POP', !computeRoutes(g, span.id)[pop.id]);
  check('a cut preview cannot poison live routes', computeRoutes(g) === routes && !!routes[pop.id]);
  span.down = true;
  check('in-place fibre failures invalidate cached routes', !computeRoutes(g)[pop.id]);
  span.down = false;
  check('repair restores the POP route', !!computeRoutes(g)[pop.id]);
  const distance = computeRoutes(g)[pop.id].distance;
  span.length += 3;
  check('length changes refresh route distances', computeRoutes(g)[pop.id].distance === distance + 3);
  const endpoint = span.bId;
  span.bId = 'missing-endpoint';
  check('endpoint changes remove dangling routes', !computeRoutes(g)[pop.id]);
  span.bId = endpoint;
  core.down = true;
  check('a failed core invalidates routes', !computeRoutes(g)[pop.id]);
  core.down = false;
  core.kind = 'pop';
  check('a former core is no longer a route source', !computeRoutes(g)[pop.id]);
  check('previous results stay intact after topology changes', routes[pop.id].distance === distance);
}

group('bridge resilience matches exhaustive single-cut tests');
{
  for (let seed = 1; seed <= 24; seed++) {
    const base = newGame(31337),
      rng = makeRng(seed);
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      ...base.nodes[0],
      id: `graph-${i}`,
      kind: (i < (seed % 3) + 1 ? 'core' : 'pop') as NetNode['kind'],
      down: i === 7 && seed % 2 === 0,
    }));
    const links: NetLink[] = [];
    for (let a = 0; a < nodes.length; a++)
      for (let b = a + 1; b < nodes.length; b++) {
        if (rng() < 0.3)
          links.push({
            ...base.links[0],
            id: `edge-${a}-${b}`,
            aId: nodes[a].id,
            bId: nodes[b].id,
            length: 1 + rng() * 5,
            down: rng() < 0.1,
          });
      }
    if (links[0]) links.push({ ...links[0], id: 'parallel-edge' });
    const g = { ...base, nodes, links },
      routes = computeRoutes(g);
    check(
      `bridge protection agrees with every cut, topology ${seed}`,
      nodes.every((n) => {
        const expected = !!routes[n.id]?.path.length && links.every((l) => !!computeRoutes(g, l.id)[n.id]);
        return isRedundant(g, n.id, routes) === expected;
      }),
    );
  }
}

group('shared backhaul pressure and per-call balancing');
{
  const base = newGame(4242);
  const core = { ...base.nodes.find((n) => n.kind === 'core')!, capacityGbps: 10 };
  const pop = { ...base.nodes.find((n) => n.kind === 'pop')!, capacityGbps: 10 };
  const leaf = { ...pop, id: 'pressure-leaf' };
  const g = {
    ...base,
    nodes: [core, pop, leaf],
    links: [
      { ...base.links[0], capacityGbps: 10 },
      { ...base.links[0], id: 'pressure-tail', aId: pop.id, bId: leaf.id, length: 1, capacityGbps: 10 },
    ],
  };
  const services = [1, 3].map((priority) => ({
    id: 'class-' + priority,
    districtId: pop.districtId,
    demandGbps: 20,
    servingNodeIds: [pop.id, leaf.id],
    priority,
  }));
  const routes = computeRoutes(g);
  const load = loadServices(g, services, routes, true);
  check('shared hops preserve low-priority allocation', Math.abs(load.serviceServed['class-1'] * 20 - 2.5) < 1e-9);
  check('shared hops preserve premium allocation', Math.abs(load.serviceServed['class-3'] * 20 - 7.5) < 1e-9);
  check('shared core traffic stays inside its capacity', Math.abs(load.nodeTraffic[core.id] - 10) < 1e-9);
  const stronger = {
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, capacityGbps: 40 })),
    links: g.links.map((l) => ({ ...l, capacityGbps: 40 })),
  };
  check(
    'upgraded capacity recalculates balancing weights',
    Math.abs(loadServices(stronger, services, routes, true).totalServed - 40) < 1e-9,
  );
  const stopped = { ...g, nodes: g.nodes.map((n) => ({ ...n, capacityGbps: 0 })) };
  check(
    'zero-capacity resources cannot carry cached traffic',
    loadServices(stopped, services, routes, true).totalServed === 0,
  );
}

group('capacity lab snapshots and atomic commissioning');
{
  const initial = newGame(420),
    g = { ...initial, money: 2_000_000, buildings: initial.buildings.map((b) => ({ ...b, connected: 0.8 })) };
  const options = capacityOptions(g);
  const pop = options.find((o) => o.type === 'node' && g.nodes.find((n) => n.id === o.id)?.kind === 'pop')!;
  const fibre = options.find((o) => o.type === 'link')!;
  const order = [pop, fibre];
  const snapshot = JSON.stringify(g),
    preview = capacityPlan(g, order);
  const normal = testCapacity(g, { multiplier: 1, cutLinkId: null });
  const surge = testCapacity(g, { multiplier: 3, cutLinkId: null });
  check('stress tests scale offered traffic consistently', Math.abs(surge.demand - normal.demand * 3) < 1e-8);
  check(
    'traffic conservation holds at network and upstream limits',
    surge.served <= surge.demand + 1e-8 && surge.served >= 0,
  );
  const cut = testCapacity(g, { multiplier: 1, cutLinkId: fibre.id });
  check('a single-home fibre cut reduces delivered service', cut.served < normal.served);
  check('lab previews do not mutate money, clock, topology or customers', JSON.stringify(g) === snapshot);
  const built = commissionCapacityPlan(g, order)!;
  check(
    'an order upgrades both site and fibre atomically',
    built.nodes.find((n) => n.id === pop.id)!.tier === pop.tier + 1 &&
      built.links.find((l) => l.id === fibre.id)!.tier === fibre.tier + 1,
  );
  check('capital spend matches the reviewed quote', built.money === g.money - preview.cost);
  check('added running costs are included in the quote', preview.monthly > 0);
  check(
    'commissioning preserves the live clock and subscriptions',
    built.minutes === g.minutes && built.buildings === g.buildings,
  );
  check('a repeated stale order cannot charge twice', commissionCapacityPlan(built, order) === null);
  check(
    'insufficient funds prevent the whole order',
    commissionCapacityPlan({ ...g, money: preview.cost - 1 }, order) === null,
  );
  check('duplicate assets are rejected', commissionCapacityPlan(g, [pop, pop]) === null);
  check('empty orders are rejected', commissionCapacityPlan(g, []) === null);
  check(
    'missing assets invalidate the order',
    commissionCapacityPlan(g, [{ type: 'node', id: 'missing', tier: 1 }]) === null,
  );
  check(
    'new faults invalidate an old quote',
    commissionCapacityPlan({ ...g, links: g.links.map((l) => ({ ...l, down: true })) }, order) === null,
  );
  const maxed = { ...g, nodes: g.nodes.map((n) => ({ ...n, tier: 99 })) };
  check('research tier gates cannot be bypassed', commissionCapacityPlan(maxed, [{ ...pop, tier: 99 }]) === null);
  const saved = migrate(JSON.parse(JSON.stringify(built)), SAVE_VERSION);
  check(
    'commissioned upgrades survive a save reload',
    saved?.nodes.find((n) => n.id === pop.id)?.tier === pop.tier + 1 &&
      saved.links.find((l) => l.id === fibre.id)?.tier === fibre.tier + 1,
  );
  const prior = useGame.getState();
  useGame.setState({ game: g, planning: true, drillTarget: null });
  check(
    'lab cannot commit during blueprint planning',
    !useGame.getState().commissionUpgrades(order) && useGame.getState().game === g,
  );
  useGame.setState(prior);
}

group('redundancy');
{
  const g = newGame(31337);
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const pop = g.nodes.find((n) => n.kind === 'pop')!;

  const routes = computeRoutes(g);
  check('the starting POP reaches a core', !!routes[pop.id]);
  check('a single-homed POP is not redundant', !isRedundant(g, pop.id, routes));

  // Add a second core and a second span, then the POP should survive any one cut.
  const core2: NetNode = { ...core, id: 'core2', name: 'Second Core', gx: core.gx + 4, gy: core.gy + 4 };
  const span2: NetLink = {
    id: 'span2',
    aId: pop.id,
    bId: core2.id,
    capacityGbps: 10,
    trafficGbps: 0,
    down: false,
    tier: 1,
    length: 5,
    builtAt: 0,
  };
  const dual: GameState = { ...g, nodes: [...g.nodes, core2], links: [...g.links, span2] };
  const dualRoutes = computeRoutes(dual);
  check('a dual-homed POP is redundant', isRedundant(dual, pop.id, dualRoutes));

  const cut: GameState = { ...dual, links: dual.links.map((l) => (l.id === span2.id ? l : { ...l, down: true })) };
  check('a dual-homed POP survives one cut', !!computeRoutes(cut)[pop.id]);

  const bothCut: GameState = { ...dual, links: dual.links.map((l) => ({ ...l, down: true })) };
  check('cutting every span isolates the POP', !computeRoutes(bothCut)[pop.id]);
}

group('spectrum and mobile');
{
  let g = newGame(2026);
  g = {
    ...g,
    money: 5_000_000,
    researchDone: ['ftth', 'fiber10g', 'mobile_4g'],
    districts: g.districts.map((d) => ({ ...d, unlocked: true })),
    spectrum: [{ band: '1800', blocks: 1, wonAt: 0, paid: 0 }],
  };

  check('a tower with no spectrum has no capacity', towerCapacity([], 1) === 0);
  check('a tower with no spectrum has no reach', towerRadius([], 1) === 0);
  check('spectrum gives a tower capacity', towerCapacity(g.spectrum, 1) > 0);

  const radius1800 = towerRadius(g.spectrum, 1);
  const radiusWithLowBand = towerRadius([...g.spectrum, { band: '700', blocks: 1, wonAt: 0, paid: 0 }], 1);
  check('a low band widens tower reach', radiusWithLowBand > radius1800, `${radius1800} -> ${radiusWithLowBand}`);

  const capOneBlock = towerCapacity(g.spectrum, 1);
  const capTwoBlocks = towerCapacity([...g.spectrum, { band: '2600', blocks: 1, wonAt: 0, paid: 0 }], 1);
  check('more blocks give more capacity', capTwoBlocks > capOneBlock, `${capOneBlock} -> ${capTwoBlocks}`);

  // Plant a tower with backhaul and let it run.
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const home = g.districts[0];
  const tower: NetNode = {
    id: 'tower1',
    kind: 'tower',
    name: 'Test Tower',
    gx: home.center.gx,
    gy: home.center.gy,
    districtId: home.id,
    tier: 1,
    capacityGbps: towerCapacity(g.spectrum, 1),
    trafficGbps: 0,
    health: 100,
    down: false,
    builtAt: 0,
  };
  const backhaul: NetLink = {
    id: 'backhaul1',
    aId: tower.id,
    bId: core.id,
    capacityGbps: 40,
    trafficGbps: 0,
    down: false,
    tier: 2,
    length: Math.hypot(core.gx - tower.gx, core.gy - tower.gy),
    builtAt: 0,
  };
  g = { ...g, nodes: [...g.nodes, tower], links: [...g.links, backhaul] };
  g = runDays(g, 45, repairAll);

  check('radio coverage appears', g.districts[0].mobileCoverage > 0, `${g.districts[0].mobileCoverage}`);
  check('mobile customers sign up', mobileSubs(g) > 0, `${Math.round(mobileSubs(g))}`);
  check('mobile revenue is counted', monthlyBreakdown(g, researchModifiers(g.researchDone)).revenueMobile > 0);
  check('mobile subscribers count as customers', totalCustomers(g) > Math.round(residentialSubs(g)));
  finite('mobile subscriber count is a real number', mobileSubs(g));
}

group('competitors');
{
  let g = newGame(8080);
  const startCoverage = g.competitors.map((c) => Object.values(c.coverage).reduce((a, b) => a + b, 0));
  check(
    'rivals start with coverage behind their share',
    startCoverage.every((v) => v > 0),
  );
  check(
    'rivals start with cash',
    g.competitors.every((c) => c.cash > 0),
  );

  g = runDays(g, 180, repairAll);

  const grew = g.competitors.some(
    (c, i) => Object.values(c.coverage).reduce((a, b) => a + b, 0) > startCoverage[i] + 0.01,
  );
  check('rivals expand their own coverage over time', grew);

  const badShare = g.competitors.find((c) => Object.values(c.share).some((v) => !Number.isFinite(v) || v < 0 || v > 1));
  check('rival share stays a valid fraction', !badShare, badShare?.name);
  check(
    'rival cash stays finite',
    g.competitors.every((c) => Number.isFinite(c.cash)),
  );
  check(
    'rival prices stay in a sane band',
    g.competitors.every((c) => c.priceIndex >= 0.5 && c.priceIndex <= 1.5),
  );

  const d = g.districts[0];
  const pull = districtPull(g, d);
  check('pull totals exceed the parts, leaving people unserved', pull.total > pull.player);
  const leader = leaderOf(g, d);
  check('a district has a leader', !!leader.name);

  // Holding a district with radio alone should still count as presence.
  const bare = newGame(4321);
  const noReach = districtPull(bare, { ...bare.districts[1], coverage: 0, mobileCoverage: 0 }).player;
  const radioOnly = districtPull(bare, { ...bare.districts[1], coverage: 0, mobileCoverage: 0.8 }).player;
  check('mobile coverage counts as presence against rivals', radioOnly > noReach, `${noReach} -> ${radioOnly}`);
}

group('pricing does not spiral');
{
  // Rivals used to cut whenever you looked expensive, which moved the market average.
  let g = newGame(606);
  g = { ...g, packages: g.packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price * 2 } : p)) };
  const before = priceIndex(g);
  g = runDays(g, 240, repairAll);

  check('your price index does not move when you do not change prices', Math.abs(priceIndex(g) - before) < 0.001);
  check(
    'rivals do not all collapse to the price floor',
    g.competitors.some((c) => c.priceIndex > 0.8),
    g.competitors.map((c) => c.priceIndex.toFixed(2)).join('/'),
  );
  check(
    'rivals undercut an expensive player',
    g.competitors.every((c) => c.priceIndex < before),
  );

  // Cheap and well run should out-pull three rivals; expensive and neglected should not.
  const strong = newGame(707);
  const good = {
    ...strong,
    reputation: 90,
    districts: strong.districts.map((d) => ({ ...d, coverage: 0.9, satisfaction: 90 })),
  };
  const weak = {
    ...strong,
    reputation: 30,
    districts: strong.districts.map((d) => ({ ...d, coverage: 0.2, satisfaction: 40 })),
  };
  check(
    'a well run operator can lead its city',
    playerShareTarget(good, good.districts[0]) > 0.5,
    `${playerShareTarget(good, good.districts[0]).toFixed(2)}`,
  );
  check(
    'a neglected operator loses the city',
    playerShareTarget(weak, weak.districts[0]) < 0.3,
    `${playerShareTarget(weak, weak.districts[0]).toFixed(2)}`,
  );

  const marketPriced = {
    ...strong,
    packages: strong.packages.map((p) => (p.segment === 'residential' ? { ...p, price: 680 } : p)),
  };
  const valuePriced = {
    ...strong,
    packages: strong.packages.map((p) => (p.segment === 'residential' ? { ...p, price: 480 } : p)),
  };
  const marketPull = districtPull(marketPriced, marketPriced.districts[0]).player;
  const valuePull = districtPull(valuePriced, valuePriced.districts[0]).player;
  check(
    'a clear price lead materially lifts customer pull',
    valuePull > marketPull * 1.18,
    `${marketPull} -> ${valuePull}`,
  );

  const startGrowth = customerGrowthSnapshot(strong, strong.districts[0]);
  const rampGrowth = customerGrowthSnapshot({ ...strong, minutes: 11 * MINUTES_PER_DAY + 8 * 60 }, strong.districts[0]);
  const matureGrowth = customerGrowthSnapshot(
    { ...strong, minutes: 15 * MINUTES_PER_DAY + 8 * 60 },
    strong.districts[0],
  );
  check('starter customers have a seven-day market-loss grace period', startGrowth.marketLossExposure === 0);
  check(
    'market-loss exposure ramps in instead of switching on at once',
    rampGrowth.marketLossExposure > 0 && rampGrowth.marketLossExposure < 1,
  );
  check('market-loss exposure reaches normal after two weeks', matureGrowth.marketLossExposure === 1);
}

group('churn is attributed');
{
  // A network that cannot keep up should shed customers to somebody.
  let g = newGame(1212);
  g = { ...g, packages: g.packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price * 2.4 } : p)) };
  g = runDays(g, 200, repairAll);

  check('losses are recorded', g.churn.length > 0, `${g.churn.length} events`);
  check(
    'every loss names a district',
    g.churn.every((c) => g.districts.some((d) => d.id === c.districtId)),
  );
  check(
    'every loss has a reason',
    g.churn.every((c) =>
      ['price', 'outage', 'congestion', 'support', 'coverage', 'competition', 'satisfaction'].includes(c.reason),
    ),
  );
  check(
    'loss counts are positive and finite',
    g.churn.every((c) => Number.isFinite(c.count) && c.count > 0),
  );
  check('the log stays bounded', g.churn.length <= 30, `${g.churn.length}`);
  check(
    'at least some losses go to a named rival',
    g.churn.some((c) => c.toId !== null),
  );

  // Retention spend should visibly slow the bleeding.
  const base = {
    ...newGame(1313),
    packages: newGame(1313).packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price * 2.4 } : p)),
  };
  const without = runDays({ ...base, retentionBudget: 0 }, 120, repairAll);
  const withSpend = runDays({ ...base, retentionBudget: 30000 }, 120, repairAll);
  const lostWithout = without.churn.reduce((a, c) => a + c.count, 0);
  const lostWith = withSpend.churn.reduce((a, c) => a + c.count, 0);
  check(
    'retention spend reduces churn',
    lostWith < lostWithout,
    `${Math.round(lostWithout)} -> ${Math.round(lostWith)}`,
  );

  let cheap = newGame(1414);
  const homeId = cheap.districts.find((district) => district.unlocked)!.id;
  cheap = {
    ...cheap,
    minutes: 16 * MINUTES_PER_DAY,
    reputation: 80,
    packages: cheap.packages.map((p) => (p.segment === 'residential' ? { ...p, price: 12 } : p)),
    buildings: cheap.buildings.map((building) =>
      building.districtId === homeId && building.segment === 'residential' ? { ...building, connected: 1 } : building,
    ),
    districts: cheap.districts.map((district) =>
      district.id === homeId ? { ...district, coverage: 0.08, satisfaction: 85 } : district,
    ),
    competitors: cheap.competitors.map((competitor) => ({
      ...competitor,
      priceIndex: 1.1,
      coverage: { ...competitor.coverage, [homeId]: 0.8 },
      share: { ...competitor.share, [homeId]: 0.25 },
    })),
  };
  cheap = runDays(cheap, 3, repairAll);
  check('a cheap operator can still lose customers for non-price reasons', cheap.churn.length > 0);
  check(
    'cheap-operator losses are not falsely labelled as price churn',
    cheap.churn.every((entry) => entry.reason !== 'price'),
    cheap.churn.map((entry) => entry.reason).join(','),
  );
}

group('borrowing and solvency');
{
  const g = newGame(2468);
  const limit = creditLimit(g);
  check('a new company has a credit limit', limit > 0, `${limit}`);
  check('the limit is finite', Number.isFinite(limit));

  const loan = createLoan(g, 200000, 36);
  check('a loan amortises to a positive payment', loan.monthlyPayment > 0, `${loan.monthlyPayment}`);
  check('payments exceed pure principal, so interest is charged', loan.monthlyPayment * 36 > 200000);
  check('the rate is sane', loan.rateAnnual > 0.01 && loan.rateAnnual < 0.3, `${loan.rateAnnual}`);

  // Servicing a loan should shrink it and eventually clear it.
  let withLoan: GameState = { ...g, loans: [loan], money: 5_000_000 };
  const before = totalDebt(withLoan);
  chargeLoans(withLoan);
  check('a repayment reduces the balance', totalDebt(withLoan) < before, `${before} -> ${totalDebt(withLoan)}`);
  for (let i = 0; i < 40; i++) chargeLoans(withLoan);
  check('a loan clears by the end of its term', totalDebt(withLoan) === 0, `${totalDebt(withLoan)}`);

  // Borrowing is not free money: the balance sheet nets out.
  const drawn: GameState = { ...g, loans: [createLoan(g, 300000, 36)], money: g.money + 300000 };
  check('debt shows up against the cash it provided', totalDebt(drawn) > 250000);
}

group('you can actually lose');
{
  // Bury the company far past any credit limit and let the grace period run.
  let doomed: GameState = { ...newGame(1357), money: -50_000_000 };
  doomed = runDays(doomed, GRACE_DAYS + 10);
  check('sustained insolvency ends the game', !!doomed.gameOver, doomed.gameOver?.reason ?? 'still running');
  check('a finished game pauses itself', doomed.speed === 0);

  const frozen = step(doomed);
  check('a finished game stops advancing', frozen.minutes === doomed.minutes);

  // Being briefly overdrawn must not end anything.
  let dip: GameState = { ...newGame(2469), money: -50_000_000 };
  dip = runDays(dip, 5);
  check('a short overdraft is survivable', !dip.gameOver);
  check('the grace clock starts when you cross the limit', dip.insolventSince !== null);

  const recovered = runDays({ ...dip, money: 500000 }, 2);
  check('paying it back stops the clock', recovered.insolventSince === null);
  check('a solvent company keeps playing', !recovered.gameOver);
}

group('equipment ages');
{
  let g = newGame(9090);
  g = runDays(g, 400, repairAll);
  const oldest = g.nodes.reduce((a, b) => (a.servicedAt <= b.servicedAt ? a : b));
  check('unserviced kit drifts below pristine', oldest.health < 100, `${oldest.health.toFixed(0)}`);
  check(
    'ageing has a floor',
    g.nodes.every((n) => n.health >= 20),
  );

  // Servicing should visibly restore it.
  const serviced = { ...g, nodes: g.nodes.map((n) => ({ ...n, health: 100, servicedAt: g.minutes })) };
  const later = runDays(serviced, 5, repairAll);
  check(
    'a serviced node stays healthy for a while',
    later.nodes.every((n) => n.health > 95),
  );

  // A bigger network should take longer to fix, not the same time.
  const small = newGame(11);
  const big: GameState = {
    ...small,
    nodes: [...Array(40)].map((_, i) => ({ ...small.nodes[0], id: `n${i}` })),
  };
  const runs = 40;
  let smallTotal = 0;
  let bigTotal = 0;
  for (let i = 0; i < runs; i++) {
    smallTotal += runDays(small, 1).incidents.reduce((a, x) => a + x.repairTotalMinutes, 0);
    bigTotal += runDays(big, 1).incidents.reduce((a, x) => a + x.repairTotalMinutes, 0);
  }
  check('faults on a bigger network take longer', bigTotal >= smallTotal, `${smallTotal} vs ${bigTotal}`);
}

group('the regulator');
{
  // Too small to be worth regulating.
  let tiny = newGame(4141);
  tiny = runDays(tiny, 30, repairAll);
  check('a tiny operator is left alone', pendingRegulations(tiny).length === 0);

  // Force an obligation and let it fall due unmet.
  const g = newGame(4242);
  const doomed: GameState = {
    ...g,
    money: 500000,
    regulations: [
      {
        id: 'r1',
        kind: 'coverage',
        title: 'Coverage obligation',
        detail: 'test',
        districtId: g.districts[0].id,
        target: 0.99,
        dueAt: g.minutes + MINUTES_PER_DAY,
        fine: 50000,
        status: 'pending',
      },
    ],
  };
  const moneyBefore = doomed.money;
  const after = runDays(doomed, 3, repairAll);
  check('an unmet obligation is marked failed', after.regulations[0].status === 'failed');
  check(
    'an unmet obligation costs money',
    after.money < moneyBefore - 40000,
    `${Math.round(moneyBefore - after.money)}`,
  );

  // And one that is already satisfied should pass.
  const easy: GameState = {
    ...g,
    regulations: [{ ...doomed.regulations[0], id: 'r2', target: 0.001 }],
    districts: g.districts.map((d) => ({ ...d, coverage: 0.5 })),
  };
  const passed = runDays(easy, 3, repairAll);
  check('a met obligation is marked met', passed.regulations[0].status === 'met');
  check('progress is reported as a fraction', regulationProgress(g, doomed.regulations[0]) >= 0);
}

group('demand forecasting');
{
  const flat = forecastDemand([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], 5, 30);
  check('a flat history projects flat', Math.abs(flat.projected - 5) < 0.01, `${flat.projected}`);
  check('a flat history has no exhaustion date', daysUntilFull(flat, 10) === null);

  const rising = forecastDemand([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 12, 30);
  check('a rising history projects upward', rising.projected > 12, `${rising.projected.toFixed(1)}`);
  check('the slope is about one per day', Math.abs(rising.perDay - 1) < 0.01, `${rising.perDay.toFixed(3)}`);
  const untilFull = daysUntilFull(rising, 20);
  check('exhaustion is predicted', untilFull !== null && Math.abs(untilFull - 8) < 0.5, `${untilFull}`);
  check('already full reports zero days', daysUntilFull(rising, 5) === 0);

  const thin = forecastDemand([1, 2], 2, 30);
  check('too little history is flagged as not confident', !thin.confident);

  // The live game should fill the history and stay finite.
  let g = newGame(5150);
  g = runDays(g, 30, repairAll);
  check('the game records daily peaks', g.demandHistory.length >= 25, `${g.demandHistory.length}`);
  check(
    'recorded peaks are finite',
    g.demandHistory.every((v) => Number.isFinite(v) && v >= 0),
  );
  check('history is bounded', runDays(g, 60, repairAll).demandHistory.length <= 45);
  const live = forecastDemand(g.demandHistory, g.stats.demandGbps, 30);
  finite('the live forecast is a real number', live.projected);
  check('serving capacity is positive', servingCapacity(g.nodes) > 0);
}

group('data centres earn their keep');
{
  const g = newGame(3030);
  const dc: NetNode = {
    id: 'dc1',
    kind: 'datacenter',
    name: 'Test DC',
    gx: g.districts[0].center.gx,
    gy: g.districts[0].center.gy,
    districtId: g.districts[0].id,
    tier: 1,
    capacityGbps: 40,
    trafficGbps: 0,
    health: 100,
    down: false,
    builtAt: 0,
    servicedAt: 0,
  };
  const dcLink: NetLink = {
    id: 'dc-link',
    aId: dc.id,
    bId: g.nodes[0].id,
    capacityGbps: 100,
    trafficGbps: 0,
    down: false,
    tier: 1,
    length: 1,
    builtAt: 0,
  };
  const withDc: GameState = {
    ...g,
    nodes: [...g.nodes, dc],
    links: [...g.links, dcLink],
    dataCenterModes: { dc1: 'colocation' },
  };

  check('no data centre means no hosting income', hostingRevenue(g) === 0);
  check('a data centre earns hosting income', hostingRevenue(withDc) > 0, `${Math.round(hostingRevenue(withDc))}`);

  // It has to beat what it costs to run, otherwise building one is a trap.
  const before = monthlyBreakdown(g, researchModifiers(g.researchDone));
  const after = monthlyBreakdown(withDc, researchModifiers(withDc.researchDone));
  check(
    'a data centre is profitable to run',
    after.profit > before.profit,
    `${Math.round(before.profit)} -> ${Math.round(after.profit)}`,
  );

  check('no data centre means no caching', cacheRatio(g) === 0);
  check('a data centre offloads traffic', cacheRatio(withDc) > 0, `${cacheRatio(withDc)}`);
  const disconnected: GameState = {
    ...g,
    nodes: [...g.nodes, dc],
    dataCenterModes: { dc1: 'colocation' },
  };
  check('a disconnected data centre earns no hosting income', hostingRevenue(disconnected) === 0);
  check('a disconnected data centre provides no cache offload', cacheRatio(disconnected) === 0);
  const extraDcs = ['dc2', 'dc3', 'dc4', 'dc5'].map((id) => ({ ...dc, id }));
  const many: GameState = {
    ...withDc,
    nodes: [...withDc.nodes, ...extraDcs],
    links: [...withDc.links, ...extraDcs.map((node) => ({ ...dcLink, id: `${node.id}-link`, aId: node.id }))],
  };
  check('caching is capped', cacheRatio(many) <= 0.3, `${cacheRatio(many)}`);

  // Compare one identical demand tick: data-centre workload is its own class and
  // should not hide the reduction in customer traffic produced by the cache.
  const plain = step(g);
  const cached = step(withDc);
  const customerTraffic = (state: GameState) =>
    state.stats.serviceDemandGbps.residential +
    state.stats.serviceDemandGbps.mobile +
    state.stats.serviceDemandGbps.wholesale;
  check('caching lowers carried customer traffic', customerTraffic(cached) < customerTraffic(plain));
}

group('the company ladder');
{
  const g = newGame(6060);
  check('a new company starts at the bottom', g.rank === 0 && rankOf(g).id === 'local');
  check('the first rung has no requirements', RANKS[0].requirements.length === 0);
  check(
    'every later rung has requirements',
    RANKS.slice(1).every((r) => r.requirements.length > 0),
  );
  check('customer counting is finite', Number.isFinite(customerCount(g)));
  check('city share starts small', cityShare(g) >= 0 && cityShare(g) < 1, `${cityShare(g).toFixed(2)}`);

  // A brand new company cannot possibly qualify for the second rung.
  check('a new company is not promoted immediately', !meetsRank(g, RANKS[1]));

  // Force the requirements and it should climb exactly one rung per check.
  const big: GameState = {
    ...g,
    districts: g.districts.map((d) => ({ ...d, unlocked: true, coverage: 0.9, satisfaction: 90, mobileSubs: 3000 })),
    reputation: 90,
  };
  const promoted = { ...big };
  const gained = checkPromotion(promoted);
  check('meeting the requirements promotes you', !!gained, gained?.name ?? 'no promotion');
  check('promotion moves exactly one rung', promoted.rank === 1);

  // Ranks must be reachable in order, never skipped.
  let ladder = { ...big, rank: 0 };
  let steps = 0;
  while (checkPromotion(ladder) && steps < 10) steps += 1;
  check('the ladder stops at the top', ladder.rank <= RANKS.length - 1, `${ladder.rank}`);

  // Higher rank should mean a better credit limit.
  const low = creditLimit({ ...big, rank: 0 });
  const high = creditLimit({ ...big, rank: RANKS.length - 1 });
  check('rank improves what lenders offer', high > low, `${low} -> ${high}`);
}

group('the ladder is reachable');
{
  // A rank nobody can ever reach is worse than no rank at all.
  const g = newGame(12345);
  const residentialMarket = g.districts.reduce((a, d) => a + d.potential, 0);
  const mobileMarket = g.districts.reduce((a, d) => a + d.population, 0) * MOBILE_MARKET_SHARE;
  const market = residentialMarket + mobileMarket;

  const top = RANKS[RANKS.length - 1];
  const customerReq = top.requirements.find((r) => r.label.includes('customers'));
  const required = Number(customerReq?.label.replace(/[^0-9]/g, '') ?? 0);

  check(
    'the city is big enough for the top rank',
    required < market * 0.75,
    `needs ${required}, market ${Math.round(market)}`,
  );
  check(
    'the top rank is still an achievement',
    required > market * 0.3,
    `needs ${required}, market ${Math.round(market)}`,
  );

  // Every rung should ask for more than the one below it.
  const targets = RANKS.slice(1).map((r) => {
    const req = r.requirements.find((x) => x.label.includes('customers'));
    return Number(req?.label.replace(/[^0-9]/g, '') ?? 0);
  });
  check(
    'rungs get harder in order',
    targets.every((v, i) => i === 0 || v > targets[i - 1]),
    targets.join(' < '),
  );
}

group('a tower with no fibre behind it');
{
  let g = newGame(555);
  const home = g.districts[0];
  const orphan: NetNode = {
    id: 'orphan',
    kind: 'tower',
    name: 'Orphan Tower',
    gx: home.center.gx + 1,
    gy: home.center.gy + 1,
    districtId: home.id,
    tier: 1,
    capacityGbps: nodeCapacity('tower', 1),
    trafficGbps: 0,
    health: 100,
    down: false,
    builtAt: 0,
  };
  g = {
    ...g,
    researchDone: ['mobile_4g'],
    spectrum: [{ band: '700', blocks: 2, wonAt: 0, paid: 0 }],
    nodes: [...g.nodes, orphan],
  };
  g = runDays(g, 30, repairAll);
  check(
    'an unconnected tower gives no coverage',
    g.districts[0].mobileCoverage === 0,
    `${g.districts[0].mobileCoverage}`,
  );
  check('an unconnected tower sells nothing', mobileSubs(g) === 0, `${mobileSubs(g)}`);
}

// ---------------------------------------------------------------------------

group('growing the network is not self-defeating');
{
  // A new site must not raise the price of every future call-out.
  const g = newGame(4242);
  const fault: Incident = {
    id: 'i1',
    kind: 'fiber_cut',
    title: 'Fibre Cut',
    description: '',
    targetId: g.links[0].id,
    targetType: 'link',
    districtId: g.districts[0].id,
    startedAt: 0,
    repairMinutesLeft: null,
    repairTotalMinutes: 400,
    repairBaseMinutes: 400,
    assignedTechId: null,
    affected: 0,
    resolved: false,
    degrade: false,
  };
  const onABigNetwork: Incident = { ...fault, repairTotalMinutes: 720 };
  check(
    'a bigger network does not make the same fault dearer',
    repairCost(fault, 'emergency') === repairCost(onABigNetwork, 'emergency'),
    `${repairCost(fault, 'emergency')} vs ${repairCost(onABigNetwork, 'emergency')}`,
  );
  check(
    'a scheduled repair still undercuts an emergency',
    repairCost(fault, 'normal') * 2 < repairCost(fault, 'emergency'),
    `${repairCost(fault, 'normal')} vs ${repairCost(fault, 'emergency')}`,
  );
  check(
    'an emergency call-out costs less than the site it fixes',
    repairCost(fault, 'emergency') < NODE_SPECS.pop.baseCost,
    `${repairCost(fault, 'emergency')} vs ${NODE_SPECS.pop.baseCost}`,
  );
}

group('upstream transit is a signposted wall, not a hidden one');
{
  let g = newGame(777);
  g = runDays(g, 60, repairAll);
  const cap = TRANSIT_TIERS[g.transitTier].capacity;
  const saturated = { ...g, stats: { ...g.stats, transitGbps: cap * 1.4 }, demandHistory: [cap * 1.4] };
  const warned = operationsInsights(saturated).find((i) => i.id === 'transit-headroom');
  check('saturated transit reaches the priority list', Boolean(warned));
  check('it is raised as critical', warned?.severity === 'critical', warned?.severity ?? 'missing');

  const nearly = { ...g, stats: { ...g.stats, transitGbps: cap * 0.85 }, demandHistory: [cap * 0.85] };
  check(
    'the warning arrives before the wall, not on it',
    Boolean(operationsInsights(nearly).find((i) => i.id === 'transit-headroom')),
  );

  const roomy = { ...g, stats: { ...g.stats, transitGbps: cap * 0.4 }, demandHistory: [cap * 0.4] };
  check('headroom is not nagged about', !operationsInsights(roomy).find((i) => i.id === 'transit-headroom'));

  // Layout cannot be measured headlessly, so guard the input length instead.
  const detail = (d: number) => {
    const st = { ...g, transitTier: 0, stats: { ...g.stats, transitGbps: d }, demandHistory: [d] };
    return operationsInsights(st).find((i) => i.id === 'transit-headroom')?.detail ?? '';
  };
  check('the saturated wording fits the panel', detail(cap * 1.4).length <= 70, `${detail(cap * 1.4).length} chars`);
  check('the warning wording fits the panel', detail(cap * 0.85).length <= 70, `${detail(cap * 0.85).length} chars`);

  // The first step up used to treble the bill at the poorest moment.
  const steps = TRANSIT_TIERS.map((t) => t.monthly);
  check(
    'no rung more than doubles the one below it until the top',
    steps.slice(1, 3).every((m, k) => m <= steps[k] * 2.2),
    steps.join(' / '),
  );
}

group('automatic balancing earns its 900k');
{
  // ai_ops set a flag nobody read.
  let g = newGame(999);
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const home = g.districts[0];
  const pop = (id: string, dx: number): NetNode => ({
    id,
    kind: 'pop',
    name: `POP ${id}`,
    gx: core.gx + dx,
    gy: core.gy + 1,
    districtId: home.id,
    tier: 1,
    capacityGbps: nodeCapacity('pop', 1),
    trafficGbps: 0,
    health: 100,
    down: false,
    builtAt: 0,
    servicedAt: 0,
  });
  const span = (id: string, b: string, cap: number): NetLink => ({
    id,
    aId: core.id,
    bId: b,
    capacityGbps: cap,
    trafficGbps: 0,
    down: false,
    tier: 1,
    length: 2,
    builtAt: 0,
  });
  g = { ...g, nodes: [core, pop('wide', 2), pop('thin', -2)], links: [span('lw', 'wide', 10), span('lt', 'thin', 1)] };

  const demand: Record<string, number> = {};
  for (const d of g.districts) demand[d.id] = d.id === home.id ? 6 : 0;
  const routes = computeRoutes(g);
  const off = loadNetwork(g, demand, routes, false);
  const on = loadNetwork(g, demand, routes, true);

  check(
    'balancing carries more of the same demand',
    on.districtServed[home.id] > off.districtServed[home.id] * 1.5,
    `${(off.districtServed[home.id] * 100).toFixed(0)}% -> ${(on.districtServed[home.id] * 100).toFixed(0)}%`,
  );
  check(
    'it puts more carried traffic on the healthy path',
    on.nodeTraffic['wide'] > off.nodeTraffic['wide'],
    `${off.nodeTraffic['wide'].toFixed(2)} -> ${on.nodeTraffic['wide'].toFixed(2)}`,
  );
  check('the research actually sets the flag', researchModifiers(['ai_ops']).hasAutoBalance);

  let e = newGame(999);
  e = { ...e, nodes: [core, pop('a', 2), pop('b', -2)], links: [span('la', 'a', 10), span('lb', 'b', 10)] };
  const er = computeRoutes(e);
  const evenOff = loadNetwork(e, demand, er, false);
  const evenOn = loadNetwork(e, demand, er, true);
  check(
    'an even network is left alone',
    Math.abs(evenOn.districtServed[home.id] - evenOff.districtServed[home.id]) < 1e-9,
  );
}

group('a client is somewhere a client could be');
{
  let g = newGame(12345);
  g = runDays(g, 200, (s) => {
    let n = s;
    for (const o of n.offers)
      n = { ...n, contracts: [...n.contracts, { ...o, downtimeMinutes: 0, penaltyPaid: 0, startedAt: n.minutes }] };
    return { ...n, offers: [] };
  });
  const parks = g.contracts.filter((c) => g.buildings.find((b) => b.id === c.buildingId)?.kind === 'park');
  check('no contract is sited in a park', parks.length === 0, `${parks.length} of ${g.contracts.length}`);
  check('contracts are still being signed', g.contracts.length > 0, `${g.contracts.length}`);
}

group('an SLA breach cannot cost unbounded money');
{
  // A month of downtime used to be billed at 2% of the fee per hour with no ceiling.
  let g = newGame(4321);
  g = runDays(g, 120, (s) => {
    let n = s;
    for (const o of n.offers)
      n = { ...n, contracts: [...n.contracts, { ...o, downtimeMinutes: 0, penaltyPaid: 0, startedAt: n.minutes }] };
    return { ...n, offers: [] };
  });
  check('the run produced contracts to test', g.contracts.length > 0, `${g.contracts.length}`);

  // The month boundary is wherever the sim resets the counter.
  const paidAtMonthStart = new Map(g.contracts.map((c) => [c.id, c.penaltyPaid]));
  const lastDowntime = new Map(g.contracts.map((c) => [c.id, c.downtimeMinutes]));
  let worst = 0;
  for (let step_ = 0; step_ < (MINUTES_PER_DAY / 5) * 120; step_++) {
    g = step(g);
    for (const c of g.contracts) {
      const before = lastDowntime.get(c.id) ?? 0;
      if (c.downtimeMinutes < before) {
        const spent = c.penaltyPaid - (paidAtMonthStart.get(c.id) ?? 0);
        worst = Math.max(worst, spent / c.monthlyRevenue);
        paidAtMonthStart.set(c.id, c.penaltyPaid);
      }
      lastDowntime.set(c.id, c.downtimeMinutes);
    }
  }
  check(
    'no month bills more than the cap',
    worst <= SLA_PENALTY_CAP + 1e-6,
    `worst month ${worst.toFixed(2)}x, cap ${SLA_PENALTY_CAP}x`,
  );
  check('the cap is a real ceiling, not zero', SLA_PENALTY_CAP > 0);
}

group('a sealed bid you can no longer cover');
{
  // The bid is sealed days before it settles, so the cash behind it can be gone.
  let g = newGame(2468);
  g = runDays(g, 30, repairAll);
  g = {
    ...g,
    researchDone: ['ftth', 'fiber10g', 'mobile_4g'],
    // Far above anything a rival can raise.
    auction: {
      id: 'a1',
      band: '700',
      blocks: 2,
      reserve: 50000,
      closesAt: g.minutes + 60,
      playerBid: 5000000,
      result: null,
    },
    money: 120000,
  };
  const before = g.money;
  g = runDays(g, 2, repairAll);
  const bids = g.auction?.result?.bids ?? [];
  check(
    'the player really was the top bid',
    bids[0]?.bidderId === 'player',
    JSON.stringify(bids.map((b) => b.bidderId)),
  );
  check('the lot is not awarded to them', g.auction?.result?.winnerId !== 'player', `${g.auction?.result?.winnerId}`);
  check('they are not charged for it', g.money > before - 50000, `${Math.round(before)} -> ${Math.round(g.money)}`);
  check('they do not receive the spectrum', !g.spectrum.some((h) => h.band === '700'), JSON.stringify(g.spectrum));
  check(
    'the default is not silent',
    g.log.some((l) => /could not cover/i.test(l.text)),
  );
}

group('a second path is worth building');
{
  // Redundancy used to cost money and buy nothing. The best clients now insist.
  let g = newGame(31337);
  g = runDays(g, 60, repairAll);
  const home = g.districts[0];
  check('a chain network is not redundant', !districtIsRedundant(g, home.id));

  // Close the loop: every serving site gets a second way back to the core.
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const serving = g.nodes.filter((n) => n.districtId === home.id && n.kind !== 'core');
  // A genuine second span for every serving site, parallel to whatever it has.
  const looped = {
    ...g,
    links: [
      ...g.links,
      ...serving.map((n) => ({
        id: `loop-${n.id}`,
        aId: n.id,
        bId: core.id,
        capacityGbps: linkCapacity(2),
        trafficGbps: 0,
        down: false,
        tier: 2,
        length: 3,
        builtAt: 0,
      })),
    ],
  };
  check('closing the loop makes it redundant', districtIsRedundant(looped, home.id));

  // And the requirement is actually asked for by the offers that matter.
  let seen = 0;
  let demanding = 0;
  let s2 = newGame(555);
  for (let d = 0; d < 220; d++) {
    for (let i = 0; i < MINUTES_PER_DAY / 5; i++) s2 = step(s2);
    for (const o of s2.offers) {
      seen += 1;
      if (o.requiresRedundancy) demanding += 1;
    }
    s2 = { ...s2, offers: [] };
  }
  check('some clients demand a second path', demanding > 0, `${demanding} of ${seen}`);
  check('but not all of them do', demanding < seen, `${demanding} of ${seen}`);

  let shopState = newGame(556);
  const shopDistrict = shopState.districts[0];
  shopState = {
    ...shopState,
    districts: shopState.districts.map((district) =>
      district.id === shopDistrict.id ? { ...district, coverage: 0.5, unlocked: true } : district,
    ),
    buildings: shopState.buildings.map((building) =>
      building.districtId === shopDistrict.id && building.segment === 'business'
        ? { ...building, kind: 'shop' as const }
        : building,
    ),
  };
  let shopOffers = 0;
  let demandingShops = 0;
  for (let d = 0; d < 120; d++) {
    for (let i = 0; i < MINUTES_PER_DAY / 5; i++) shopState = step(shopState);
    for (const offer of shopState.offers) {
      shopOffers += 1;
      if (offer.requiresRedundancy) demandingShops += 1;
    }
    shopState = { ...shopState, offers: [] };
  }
  check(
    'shops are exempt from the second-path gate',
    shopOffers > 0 && demandingShops === 0,
    `${demandingShops} of ${shopOffers}`,
  );
}

group('pricing is a lever the game points at');
{
  let g = newGame(8080);
  g = runDays(g, 45, repairAll);
  const rivalsAt = (index: number) => ({ ...g, competitors: g.competitors.map((c) => ({ ...c, priceIndex: index })) });
  const priced = (s: GameState, price: number) => ({
    ...s,
    packages: s.packages.map((p) => (p.segment === 'residential' ? { ...p, price } : p)),
  });
  const idOf = (s: GameState) => operationsInsights(s).map((i) => i.id);

  check('being well above the market is raised', idOf(priced(rivalsAt(0.8), 1200)).includes('pricing-high'));
  check('being well under it is raised', idOf(priced(rivalsAt(1.2), 360)).includes('pricing-low'));

  const matched = priced(rivalsAt(1), 680);
  check(
    'sitting at the market is left alone',
    !idOf(matched).some((id) => id.startsWith('pricing-')),
    idOf(matched).join(','),
  );

  // Undercutting a full network is not an opportunity, it is a problem.
  const busy = { ...priced(rivalsAt(1.2), 360), stats: { ...g.stats, demandGbps: 999 } };
  check('cheap is not suggested when the network is full', !idOf(busy).includes('pricing-low'));

  const high = operationsInsights(priced(rivalsAt(0.8), 1200)).find((i) => i.id === 'pricing-high');
  check('it sends you to the pricing panel', high?.target.type === 'screen' && high.target.anchor === 'pricing');
}

group('redundancy progress is visible before it is complete');
{
  // Covering four of five sites used to look identical to covering none.
  let g = newGame(12345);
  g = runDays(g, 40, repairAll);
  g = { ...g, nodes: g.nodes.map((n) => ({ ...n, down: false })), links: g.links.map((l) => ({ ...l, down: false })) };
  const home = g.districts[0];
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const before = districtRedundancy(g, home.id);
  check('a chain starts with nothing covered', before.done === 0 && before.total > 0, JSON.stringify(before));

  const serving = g.nodes.filter((n) => n.districtId === home.id && n.kind !== 'core');
  const one = {
    ...g,
    links: [
      ...g.links,
      {
        id: 'alt1',
        aId: serving[0].id,
        bId: core.id,
        capacityGbps: linkCapacity(1),
        trafficGbps: 0,
        down: false,
        tier: 1,
        length: 4,
        builtAt: 0,
      },
    ],
  };
  const after = districtRedundancy(one, home.id);
  check('one span moves the count', after.done > before.done, `${before.done} -> ${after.done}`);
  check('but does not finish it on its own', !after.complete || after.total === 1, JSON.stringify(after));
  check('the boolean still agrees with the count', districtIsRedundant(one, home.id) === after.complete);
}

group('phase-one economic and network invariants');
{
  const g = newGame(9101);

  const facility = creditLimit(g);
  const maxed: GameState = { ...g, loans: [createLoan(g, facility, 36)] };
  check(
    'drawing the full facility leaves no renewable minimum headroom',
    creditLimit(maxed) === 0,
    `${creditLimit(maxed)}`,
  );

  const noRetention = monthlyBreakdown({ ...g, retentionBudget: 0 }, researchModifiers(g.researchDone));
  const fullRetention = monthlyBreakdown({ ...g, retentionBudget: 30000 }, researchModifiers(g.researchDone));
  check('retention appears as its own monthly cost', fullRetention.costRetention === 30000);
  check(
    'retention spend increases total operating cost exactly once',
    Math.abs(fullRetention.totalCost - noRetention.totalCost - 30000) < 1e-6,
    `${fullRetention.totalCost - noRetention.totalCost}`,
  );
  const retainedStep = step({ ...g, retentionBudget: 30000 });
  check('the finance snapshot carries retention cost', retainedStep.finance.costRetention === 30000);

  const d1 = g.districts[0];
  const d2 = g.districts[1];
  const baseCore = g.nodes.find((n) => n.kind === 'core')!;
  const basePop = g.nodes.find((n) => n.kind === 'pop')!;
  const core: NetNode = { ...baseCore, id: 'shared-core', capacityGbps: 10, trafficGbps: 0, down: false };
  const accessA: NetNode = {
    ...basePop,
    id: 'access-a',
    kind: 'access',
    districtId: d1.id,
    capacityGbps: 100,
    trafficGbps: 0,
    down: false,
  };
  const accessB: NetNode = {
    ...basePop,
    id: 'access-b',
    kind: 'access',
    districtId: d2.id,
    capacityGbps: 100,
    trafficGbps: 0,
    down: false,
  };
  const sharedLinks: NetLink[] = [
    {
      id: 'shared-a',
      aId: accessA.id,
      bId: core.id,
      capacityGbps: 100,
      trafficGbps: 0,
      down: false,
      tier: 1,
      length: 1,
      builtAt: 0,
    },
    {
      id: 'shared-b',
      aId: accessB.id,
      bId: core.id,
      capacityGbps: 100,
      trafficGbps: 0,
      down: false,
      tier: 1,
      length: 1,
      builtAt: 0,
    },
  ];
  const shared: GameState = { ...g, nodes: [core, accessA, accessB], links: sharedLinks };
  const sharedDemand = { [d1.id]: 8, [d2.id]: 8 };
  const forward = loadNetwork(shared, sharedDemand, computeRoutes(shared));
  const reversed: GameState = { ...shared, districts: [...shared.districts].reverse() };
  const backward = loadNetwork(reversed, sharedDemand, computeRoutes(reversed));
  check(
    'shared bottleneck service is independent of district order',
    Math.abs(forward.districtServed[d1.id] - backward.districtServed[d1.id]) < 1e-9 &&
      Math.abs(forward.districtServed[d2.id] - backward.districtServed[d2.id]) < 1e-9,
    `${forward.districtServed[d1.id]}/${forward.districtServed[d2.id]}`,
  );
  check(
    'a 10 Gbps core never carries more than 10 Gbps',
    forward.nodeTraffic[core.id] <= 10 + 1e-9,
    `${forward.nodeTraffic[core.id]}`,
  );
  check(
    'reported service is conserved through the shared core',
    Math.abs(forward.totalServed - 10) < 1e-9,
    `${forward.totalServed}`,
  );
  check(
    'both districts see the same final shared pressure',
    Math.abs(forward.districtPressure[d1.id] - 1.6) < 1e-9 && Math.abs(forward.districtPressure[d2.id] - 1.6) < 1e-9,
    `${forward.districtPressure[d1.id]}/${forward.districtPressure[d2.id]}`,
  );
}

group('tariff, contract and repair lifecycle invariants');
{
  const g = newGame(9201);
  const inactive: GameState = {
    ...g,
    packages: g.packages.map((p) => ({
      ...p,
      active: false,
      subscribers: p.segment === 'mobile' ? 1000 : p.subscribers,
    })),
  };
  const inactiveMoney = monthlyBreakdown(inactive, researchModifiers(inactive.researchDone));
  check(
    'inactive fixed tariffs earn no revenue',
    inactiveMoney.revenueResidential === 0,
    `${inactiveMoney.revenueResidential}`,
  );
  check(
    'inactive mobile tariffs earn no stale revenue',
    inactiveMoney.revenueMobile === 0,
    `${inactiveMoney.revenueMobile}`,
  );
  check('an unavailable fixed service is not treated as free', priceIndex(inactive) === 1, `${priceIndex(inactive)}`);

  const normalized = step(inactive);
  check(
    'the simulation restores one tariff per service segment',
    normalized.packages.filter((p) => p.segment === 'residential' && p.active).length === 1 &&
      normalized.packages.filter((p) => p.segment === 'mobile' && p.active).length === 1,
  );
  check(
    'inactive plans hold no subscribers after normalization',
    normalized.packages.filter((p) => !p.active).every((p) => p.subscribers === 0),
  );

  const building = g.buildings.find((b) => b.kind !== 'park' && b.segment !== 'residential')!;
  const district = g.districts.find((d) => d.id === building.districtId)!;
  const expiredContract = {
    id: 'expired-contract',
    clientName: 'Term Test Ltd',
    districtId: district.id,
    buildingId: building.id,
    bandwidthGbps: 1,
    monthlyRevenue: 1000,
    slaPercent: 99.9,
    downtimeMinutes: MINUTES_PER_MONTH,
    penaltyPaid: 0,
    startedAt: g.minutes - MINUTES_PER_MONTH,
    termMonths: 1,
    segment: 'business' as const,
    requiresRedundancy: false,
  };
  const expiredState: GameState = {
    ...g,
    money: 5_000_000,
    contracts: [expiredContract],
    offers: [],
    districts: g.districts.map((d) => (d.id === district.id ? { ...d, unlocked: true, satisfaction: 100 } : d)),
    buildings: g.buildings.map((b) => (b.id === building.id ? { ...b, connected: 1 } : b)),
  };
  const afterExpiry = step(expiredState);
  check(
    'an expired contract with a missed SLA leaves the portfolio',
    !afterExpiry.contracts.some((c) => c.id === expiredContract.id),
  );
  check(
    'an ended contract releases its building',
    afterExpiry.buildings.find((b) => b.id === building.id)?.connected === 0,
  );

  let renewed: GameState['contracts'][number] | null = null;
  for (let seed = 9202; seed < 9232 && !renewed; seed++) {
    const candidate = newGame(seed);
    const candidateBuilding = candidate.buildings.find((b) => b.kind !== 'park' && b.segment !== 'residential')!;
    const candidateDistrict = candidate.districts.find((d) => d.id === candidateBuilding.districtId)!;
    const contract = {
      ...expiredContract,
      id: `renew-${seed}`,
      districtId: candidateDistrict.id,
      buildingId: candidateBuilding.id,
      downtimeMinutes: 0,
      startedAt: candidate.minutes - MINUTES_PER_MONTH,
    };
    const after = step({
      ...candidate,
      money: 5_000_000,
      contracts: [contract],
      offers: [],
      districts: candidate.districts.map((d) =>
        d.id === candidateDistrict.id ? { ...d, unlocked: true, satisfaction: 100 } : d,
      ),
    });
    renewed = after.contracts.find((c) => c.id === contract.id) ?? null;
    if (renewed) {
      check('a healthy renewal starts a fresh term', renewed.startedAt === after.minutes && renewed.termMonths >= 12);
    }
  }
  check('healthy expired contracts can renew', renewed !== null);

  const offerBase = newGame(9250);
  const offerBuilding = offerBase.buildings.find((b) => b.kind !== 'park' && b.segment === 'business')!;
  const reservedOffer = {
    id: 'reserved-offer',
    clientName: 'Reserved Client',
    districtId: offerBuilding.districtId,
    buildingId: offerBuilding.id,
    bandwidthGbps: 1,
    monthlyRevenue: 1000,
    slaPercent: 99,
    termMonths: 12,
    segment: 'business' as const,
    requiresRedundancy: false,
    expiresAt: offerBase.minutes + MINUTES_PER_DAY * 60,
    signingBonus: 500,
  };
  let offerState: GameState = {
    ...offerBase,
    reputation: 100,
    offers: [reservedOffer],
    districts: offerBase.districts.map((d) => ({ ...d, unlocked: true, coverage: Math.max(d.coverage, 0.5) })),
  };
  let sawSecondOffer = false;
  let duplicateOffer = false;
  for (let i = 0; i < (MINUTES_PER_DAY / 5) * 30; i++) {
    offerState = step(offerState);
    const buildingIds = offerState.offers.map((o) => o.buildingId);
    if (buildingIds.length > 1) sawSecondOffer = true;
    if (new Set(buildingIds).size !== buildingIds.length) duplicateOffer = true;
  }
  check('the run produced another live offer beside the reservation', sawSecondOffer);
  check('live offers never reserve the same building twice', !duplicateOffer);

  const pop = g.nodes.find((n) => n.kind === 'pop')!;
  const incident: Incident = {
    id: 'dispatch-invariant',
    kind: 'router_failure',
    title: 'Dispatch invariant',
    description: '',
    targetId: pop.id,
    targetType: 'node',
    districtId: pop.districtId,
    startedAt: g.minutes,
    repairMinutesLeft: null,
    repairTotalMinutes: 100,
    repairBaseMinutes: 100,
    assignedTechId: null,
    affected: 1,
    resolved: false,
    degrade: false,
  };
  const dispatched: GameState = {
    ...g,
    money: 100000,
    incidents: [incident],
    technicians: g.technicians.map((t) => ({ ...t })),
  };
  const firstTech = dispatched.technicians[0];
  const secondTech = dispatched.technicians[1];
  check('a valid idle crew can be dispatched', dispatch(dispatched, incident.id, firstTech.id, 'normal') === true);
  check(
    'paid repairs appear in the finance ledger',
    dispatched.ledger.some((entry) => entry.category === 'incident_response' && entry.amount < 0),
  );
  const afterFirstDispatch = dispatched.money;
  check(
    'an assigned incident rejects a second dispatch',
    dispatch(dispatched, incident.id, secondTech.id, 'normal') === false,
  );
  check('a rejected dispatch never charges money', dispatched.money === afterFirstDispatch);

  const remaining = dispatched.incidents[0].repairMinutesLeft!;
  const orphaned = step({ ...dispatched, technicians: [] });
  check(
    'an incident with a missing assigned crew does not repair itself',
    orphaned.incidents[0].repairMinutesLeft === remaining,
  );

  const working = step({
    ...dispatched,
    technicians: dispatched.technicians.map((t) =>
      t.id === firstTech.id ? { ...t, state: 'working' as const, incidentId: incident.id } : t,
    ),
  });
  check('the matching on-site crew advances repair work', working.incidents[0].repairMinutesLeft === remaining - 5);
}

group('effective node capacity is shared and persistent');
{
  check(
    'GPON raises tier-one access capacity by 20%',
    Math.abs(effectiveNodeCapacity('access', 1, [], ['gpon']) - nodeCapacity('access', 1) * 1.2) < 1e-9,
  );
  const g = newGame(15);
  const pop = g.nodes.find((n) => n.kind === 'pop')!;
  const accessId = pop.id;
  const withGpon: GameState = {
    ...g,
    researchDone: ['ftth', 'gpon'],
    nodes: g.nodes.map((n) =>
      n.id === accessId
        ? { ...n, kind: 'access', capacityGbps: effectiveNodeCapacity('access', n.tier, g.spectrum, ['ftth', 'gpon']) }
        : n,
    ),
  };
  const after = step(withGpon);
  check(
    'a simulation tick preserves the GPON capacity bonus',
    Math.abs(after.nodes.find((n) => n.id === accessId)!.capacityGbps - 2.4) < 1e-9,
  );

  const degrading: Incident = {
    id: 'gpon-degrade',
    kind: 'overheating',
    title: 'Overheating',
    description: '',
    targetId: accessId,
    targetType: 'node',
    districtId: pop.districtId,
    startedAt: withGpon.minutes,
    repairMinutesLeft: null,
    repairTotalMinutes: 100,
    repairBaseMinutes: 100,
    assignedTechId: null,
    affected: 1,
    resolved: false,
    degrade: true,
  };
  const degraded = step({ ...withGpon, incidents: [degrading] });
  check(
    'incident degradation is based on GPON-rated capacity',
    Math.abs(degraded.nodes.find((n) => n.id === accessId)!.capacityGbps - 2.4 * 0.35) < 1e-9,
  );
}

group('store command and persistence guards');
{
  const originalToast = useGame.getState().toast;
  useGame.setState({ toast: () => undefined });

  const g = newGame(9301);
  const node = g.nodes.find((entry) => entry.kind === 'pop')!;
  const attachedLink = g.links.find((entry) => entry.aId === node.id || entry.bId === node.id)!;
  const incidentFor = (targetType: 'node' | 'link', targetId: string): Incident => ({
    id: `store-${targetType}-fault`,
    kind: targetType === 'node' ? 'router_failure' : 'fiber_cut',
    title: 'Store guard fault',
    description: '',
    targetId,
    targetType,
    districtId: node.districtId,
    startedAt: g.minutes,
    repairMinutesLeft: null,
    repairTotalMinutes: 60,
    repairBaseMinutes: 60,
    assignedTechId: null,
    affected: 1,
    resolved: false,
    degrade: false,
  });

  useGame.setState({
    game: { ...g, incidents: [incidentFor('node', node.id)] },
    started: true,
    activeSaveSlot: 0,
    persistenceError: null,
    selection: { type: 'node', id: node.id },
  });
  const beforeNodeSale = useGame.getState().game!;
  useGame.getState().sellNode(node.id);
  check(
    'a node with an unresolved fault cannot be sold',
    useGame.getState().game?.nodes.some((entry) => entry.id === node.id) === true,
  );
  check(
    'a blocked node sale changes no money or topology',
    useGame.getState().game?.money === beforeNodeSale.money &&
      useGame.getState().game?.links.length === beforeNodeSale.links.length,
  );
  check('a blocked node sale preserves selection', useGame.getState().selection?.id === node.id);

  useGame.setState({
    game: { ...g, incidents: [incidentFor('link', attachedLink.id)] },
    selection: { type: 'node', id: node.id },
  });
  useGame.getState().sellNode(node.id);
  check(
    'a node cannot be sold around a faulted attached span',
    useGame.getState().game?.nodes.some((entry) => entry.id === node.id) === true,
  );
  useGame.getState().sellLink(attachedLink.id);
  check(
    'a faulted fibre span cannot be sold',
    useGame.getState().game?.links.some((entry) => entry.id === attachedLink.id) === true,
  );

  const technician = g.technicians[0];
  useGame.setState({
    game: {
      ...g,
      technicians: g.technicians.map((entry) =>
        entry.id === technician.id ? { ...entry, state: 'driving' as const, incidentId: 'busy-fault' } : entry,
      ),
    },
  });
  useGame.getState().fireStaff(technician.id);
  check(
    'a deployed technician cannot be fired',
    useGame.getState().game?.technicians.some((entry) => entry.id === technician.id) === true,
  );
  useGame.setState({ game: { ...g, technicians: g.technicians.map((entry) => ({ ...entry })) } });
  useGame.getState().fireStaff(technician.id);
  check(
    'an idle technician can be released',
    useGame.getState().game?.technicians.some((entry) => entry.id === technician.id) === false,
  );

  const residential = g.packages.filter((entry) => entry.segment === 'residential');
  const soleResidential = residential[0];
  useGame.setState({
    game: {
      ...g,
      packages: g.packages.map((entry) =>
        entry.segment === 'residential' ? { ...entry, active: entry.id === soleResidential.id } : { ...entry },
      ),
    },
  });
  useGame.getState().updatePackage(soleResidential.id, { active: false });
  check(
    'the store protects the final active fixed tariff',
    useGame.getState().game?.packages.find((entry) => entry.id === soleResidential.id)?.active === true,
  );

  const mobile = g.packages.filter((entry) => entry.segment === 'mobile');
  useGame.setState({
    game: {
      ...g,
      districts: g.districts.map((entry, index) => ({ ...entry, mobileSubs: index === 0 ? 900 : 0 })),
      packages: g.packages.map((entry) =>
        entry.segment === 'mobile' ? { ...entry, active: true, subscribers: 300 } : { ...entry },
      ),
    },
  });
  useGame.getState().updatePackage(mobile[0].id, { active: false });
  const mobileAfterEdit = useGame.getState().game!.packages.filter((entry) => entry.segment === 'mobile');
  check('a disabled mobile tariff immediately loses stale subscribers', mobileAfterEdit[0].subscribers === 0);
  check(
    'mobile edits redistribute the full radio customer base',
    mobileAfterEdit.reduce((sum, entry) => sum + entry.subscribers, 0) === 900,
  );

  const access: NetNode = { ...node, kind: 'access', tier: 1, capacityGbps: 2 };
  const gponState: GameState = {
    ...g,
    money: 1_000_000,
    researchDone: ['ftth', 'gpon'],
    nodes: g.nodes.map((entry) => (entry.id === node.id ? access : { ...entry })),
    incidents: [],
  };
  useGame.setState({ game: gponState });
  useGame.getState().upgradeNode(access.id);
  const upgradedAccess = useGame.getState().game!.nodes.find((entry) => entry.id === access.id)!;
  check(
    'store upgrades preserve the GPON capacity multiplier',
    upgradedAccess.tier === 2 && Math.abs(upgradedAccess.capacityGbps - 4.8) < 1e-9,
  );
  check(
    'network upgrades appear in the finance ledger',
    useGame.getState().game!.ledger.some((entry) => entry.category === 'network_upgrade' && entry.amount < 0),
  );

  useGame.setState({ game: { ...gponState, incidents: [incidentFor('node', access.id)] } });
  const moneyBeforeFaultedUpgrade = useGame.getState().game!.money;
  useGame.getState().upgradeNode(access.id);
  check(
    'a faulted node cannot be upgraded around its incident',
    useGame.getState().game?.nodes.find((entry) => entry.id === access.id)?.tier === 1 &&
      useGame.getState().game?.money === moneyBeforeFaultedUpgrade,
  );

  const fibreTarget: NetNode = {
    ...node,
    id: 'store-fibre-target',
    gx: node.gx + 2,
    gy: node.gy + 1,
    name: 'Store fibre target',
  };
  useGame.setState({
    game: { ...g, money: 1_000_000, nodes: [...g.nodes, fibreTarget], incidents: [] },
    tool: 'fiber',
    linkFrom: null,
  });
  const linksBeforeFibre = useGame.getState().game!.links.length;
  useGame.getState().clickNodeForLink(node.id);
  check('the first fibre click selects its source site', useGame.getState().linkFrom === node.id);
  useGame.getState().clickNodeForLink(fibreTarget.id);
  check(
    'the second fibre click builds an unconnected span',
    useGame.getState().game!.links.length === linksBeforeFibre + 1 && useGame.getState().linkFrom === null,
  );
  check(
    'new fibre appears in the finance ledger',
    useGame.getState().game!.ledger.some((entry) => entry.category === 'network_build' && entry.amount < 0),
  );

  useGame.setState({ game: g, started: true, activeSaveSlot: 0, persistenceError: null });
  check(
    'invalid public save slots are rejected',
    useGame.getState().saveToSlot(99) === false && useGame.getState().activeSaveSlot === 0,
  );
  check('invalid public continue slots are rejected', useGame.getState().continueGame(-1) === false);

  const workingStorage = globalThis.localStorage;
  try {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage unavailable');
      },
      removeItem: () => {
        throw new Error('storage unavailable');
      },
    };
    useGame.setState({ game: g, started: true, activeSaveSlot: 0, persistenceError: null });
    check(
      'manual save failure is reported and retains the game',
      useGame.getState().save() === false && useGame.getState().game === g,
    );
    check(
      'failed save-and-exit keeps the running game open',
      useGame.getState().quitToMenu() === false && useGame.getState().started === true,
    );
    useGame.getState().resetSave();
    check(
      'failed deletion cannot discard the in-memory game',
      useGame.getState().started === true && useGame.getState().game === g,
    );
    useGame.setState({ game: null, started: false, persistenceError: null });
    check(
      'a new game does not start without its initial snapshot',
      useGame
        .getState()
        .newGame(
          { companyName: 'No Storage', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 9302 },
          0,
        ) === false &&
        useGame.getState().started === false &&
        useGame.getState().game === null,
    );
    check('storage failures leave a durable explanation', useGame.getState().persistenceError !== null);
  } finally {
    (globalThis as unknown as { localStorage: unknown }).localStorage = workingStorage;
  }

  useGame.setState({ game: g, started: true, activeSaveSlot: 0, persistenceError: 'old failure' });
  check(
    'a successful manual save clears the persistent error',
    useGame.getState().save() === true && useGame.getState().persistenceError === null,
  );
  clearSave(0);
  useGame.setState({ toast: originalToast });
}

group('phase-two traffic separation and transit accounting');
{
  const g = newGame(9401);
  const district = g.districts[0];
  const otherDistrict = g.districts[1];
  const originalCore = g.nodes.find((node) => node.kind === 'core')!;
  const originalPop = g.nodes.find((node) => node.kind === 'pop')!;
  const core: NetNode = { ...originalCore, id: 'class-core', capacityGbps: 100 };
  const access: NetNode = { ...originalPop, id: 'fixed-access', kind: 'access', capacityGbps: 100 };
  const tower: NetNode = { ...originalPop, id: 'mobile-tower', kind: 'tower', capacityGbps: 100 };
  const classified: GameState = {
    ...g,
    spectrum: [{ band: '1800', blocks: 1, wonAt: 0, paid: 0 }],
    nodes: [core, access, tower],
    links: [
      { ...g.links[0], id: 'fixed-span', aId: access.id, bId: core.id, capacityGbps: 100 },
      { ...g.links[0], id: 'mobile-span', aId: tower.id, bId: core.id, capacityGbps: 100 },
    ],
  };
  const classifiedLoad = loadServices(
    classified,
    [
      { id: 'fixed', districtId: district.id, demandGbps: 5, servingNodeIds: [access.id] },
      { id: 'mobile', districtId: district.id, demandGbps: 4, servingNodeIds: [tower.id] },
    ],
    computeRoutes(classified),
  );
  check('fixed demand terminates only on fixed access', Math.abs(classifiedLoad.nodeTraffic[access.id] - 5) < 1e-9);
  check('mobile demand terminates only on radio towers', Math.abs(classifiedLoad.nodeTraffic[tower.id] - 4) < 1e-9);
  check('both service classes share the same core', Math.abs(classifiedLoad.nodeTraffic[core.id] - 9) < 1e-9);

  const boundaryDistrict = { ...otherDistrict, cells: [{ gx: tower.gx, gy: tower.gy }] };
  check(
    'a tower can serve a neighbouring district inside its footprint',
    mobileServingTowers(classified, boundaryDistrict, [tower]).some((node) => node.id === tower.id),
  );

  const crowded = newGame(9402);
  const crowdedHome = crowded.districts[0];
  const transitBuilding = crowded.buildings.find((building) => building.kind !== 'park')!;
  const transitState: GameState = {
    ...crowded,
    money: 5_000_000,
    nodes: crowded.nodes.map((node) =>
      node.kind === 'core' || node.kind === 'pop'
        ? { ...node, tier: 5, capacityGbps: nodeCapacity(node.kind, 5) }
        : node,
    ),
    links: crowded.links.map((link) => ({ ...link, capacityGbps: 1000 })),
    packages: crowded.packages.map((pack) =>
      pack.segment === 'residential' ? { ...pack, speedMbps: 1_000_000 } : pack,
    ),
    buildings: crowded.buildings.map((building) =>
      building.districtId === crowdedHome.id && building.segment === 'residential'
        ? { ...building, connected: 1 }
        : building,
    ),
    contracts: [
      {
        id: 'transit-contract',
        clientName: 'Transit Stress Client',
        districtId: crowdedHome.id,
        buildingId: transitBuilding.id,
        bandwidthGbps: 1000,
        monthlyRevenue: 1000,
        slaPercent: 99,
        downtimeMinutes: 0,
        penaltyPaid: 0,
        startedAt: crowded.minutes,
        termMonths: 12,
        segment: 'business',
        requiresRedundancy: false,
      },
    ],
  };
  const transitStep = step(transitState);
  const transitCap = TRANSIT_TIERS[transitStep.transitTier].capacity;
  check(
    'transit load is based on traffic carried by the local network',
    transitStep.stats.transitGbps > transitCap,
    `${transitStep.stats.transitGbps}`,
  );
  check('reported service cannot exceed upstream transit capacity', transitStep.stats.servedGbps <= transitCap + 1e-9);
  check(
    'fixed and mobile demand remain separately observable',
    transitStep.stats.fixedDemandGbps > 0 && transitStep.stats.mobileDemandGbps === 0,
  );
}

group('phase-two rival spectrum and balance sheets');
{
  const g = newGame(9501);
  const richRival = g.competitors[0];
  const auctionState: GameState = {
    ...g,
    researchDone: ['ftth', 'fiber10g', 'mobile_4g'],
    competitors: g.competitors.map((competitor, index) => ({
      ...competitor,
      cash: index === 0 ? 1_000_000 : 0,
      spectrum: [],
    })),
    auction: {
      id: 'rival-auction',
      band: '1800',
      blocks: 1,
      reserve: 1000,
      closesAt: g.minutes + 5,
      playerBid: null,
      result: null,
    },
    nextAuctionAt: Infinity,
  };
  const settled = step(auctionState);
  const winner = settled.competitors.find((competitor) => competitor.id === richRival.id)!;
  check('a rival winner pays from its own cash', winner.cash < 1_000_000 && winner.cash >= 0, `${winner.cash}`);
  check(
    'a rival winner records the spectrum holding',
    winner.spectrum.some((holding) => holding.band === '1800'),
  );
  check(
    'cashless rivals cannot submit funded bids',
    settled.competitors.slice(1).every((competitor) => competitor.cash === 0),
  );

  const withSpectrum = newGame(9502);
  withSpectrum.competitors = withSpectrum.competitors.map((competitor, index) => ({
    ...competitor,
    cash: 5_000_000,
    spectrum: index === 0 ? [{ band: '1800', blocks: 1, wonAt: 0, paid: 100000 }] : [],
  }));
  const withoutSpectrum = newGame(9502);
  withoutSpectrum.competitors = withoutSpectrum.competitors.map((competitor) => ({
    ...competitor,
    cash: 5_000_000,
    spectrum: [],
  }));
  for (let day = 0; day < 120; day++) {
    tickCompetitors(withSpectrum, makeRng(day + 100), 1);
    tickCompetitors(withoutSpectrum, makeRng(day + 100), 1);
  }
  const radioWith = Object.values(withSpectrum.competitors[0].mobileCoverage).reduce((sum, value) => sum + value, 0);
  const radioWithout = Object.values(withoutSpectrum.competitors[0].mobileCoverage).reduce(
    (sum, value) => sum + value,
    0,
  );
  check('owned spectrum enables rival mobile rollout', radioWith > 0, `${radioWith}`);
  check('a rival without spectrum cannot create mobile coverage', radioWithout === 0, `${radioWithout}`);
}

group('phase-two staff, research points and finance ledger');
{
  const g = newGame(9601);
  const bare: GameState = { ...g, employees: [] };
  const staffed: GameState = {
    ...g,
    employees: [
      { id: 'eng', name: 'Engineer', role: 'network_engineer', salary: 1, skill: 5, experience: 0 },
      { id: 'noc', name: 'NOC', role: 'noc_engineer', salary: 1, skill: 5, experience: 0 },
      { id: 'support', name: 'Support', role: 'support', salary: 1, skill: 5, experience: 0 },
      { id: 'sales', name: 'Sales', role: 'sales', salary: 1, skill: 5, experience: 0 },
      { id: 'security', name: 'Security', role: 'security', salary: 1, skill: 5, experience: 0 },
    ],
  };
  const bareMods = staffModifiers(bare);
  const staffMods = staffModifiers(staffed);
  check(
    'network engineers reduce maintenance cost',
    monthlyBreakdown(staffed, researchModifiers([])).costMaintenance <
      monthlyBreakdown(bare, researchModifiers([])).costMaintenance,
  );
  check(
    'NOC engineers reduce incident frequency and duration',
    staffMods.incidentRateMul < 1 && staffMods.incidentDurationMul < 1,
  );
  check('support skill creates a visible satisfaction bonus', staffMods.supportSatisfaction > 0);
  check(
    'sales skill improves growth and contract generation',
    staffMods.customerGrowthMul > 1 && staffMods.offerRateMul > 1,
  );
  check('security skill reduces DDoS frequency and impact', staffMods.ddosRateMul < 1 && staffMods.ddosImpactMul < 1);
  check(
    'staff generate research points while an empty team does not',
    staffMods.researchPointsPerDay > bareMods.researchPointsPerDay,
  );
  check(
    'experience can raise an employee skill level',
    trainEmployee({ id: 'trainee', name: 'Trainee', role: 'sales', salary: 1, skill: 1, experience: 119 }, 1).skill ===
      2,
  );

  const originalToast = useGame.getState().toast;
  useGame.setState({ toast: () => undefined });
  const researchState: GameState = { ...g, money: 2000000, researchPoints: 12, researchActive: null, ledger: [] };
  useGame.setState({ game: researchState, started: true });
  useGame.getState().startResearch('ftth');
  const researching = useGame.getState().game!;
  check('research consumes its research-point cost', researching.researchPoints === 0);
  check('research still consumes its cash cost', researching.money === 1200000);
  check(
    'research spending appears in the finance ledger',
    researching.ledger.some((entry) => entry.category === 'research' && entry.amount === -800000),
  );

  useGame.setState({ game: { ...researchState, researchPoints: 11, researchActive: null } });
  useGame.getState().startResearch('ftth');
  check('research cannot start without enough research points', useGame.getState().game?.researchActive === null);

  useGame.setState({ game: { ...g, money: 1_000_000, ledger: [] } });
  useGame.getState().takeLoan(10000, 12);
  check(
    'loan drawdowns appear in the finance ledger',
    useGame.getState().game?.ledger.some((entry) => entry.category === 'loan_draw' && entry.amount === 10000) === true,
  );
  useGame.setState({ toast: originalToast });

  const pointState: GameState = {
    ...g,
    researchPoints: 0,
    employees: [{ id: 'researcher', name: 'Researcher', role: 'network_engineer', salary: 1, skill: 3, experience: 0 }],
  };
  const afterDay = runDays(pointState, 1);
  check('engineering staff add research points each day', afterDay.researchPoints >= 3, `${afterDay.researchPoints}`);

  const monthEnd: GameState = {
    ...g,
    minutes: MINUTES_PER_MONTH - 5,
    money: 1_000_000,
    monthAccumulator: { revenue: 3000, expense: 2000 },
    finance: { ...g.finance, penalties: 125 },
    ledger: [],
  };
  const closedMonth = step(monthEnd);
  check(
    'the ledger records salary costs at month close',
    closedMonth.ledger.some((entry) => entry.category === 'salaries' && entry.amount < 0),
  );
  check(
    'the ledger records maintenance costs at month close',
    closedMonth.ledger.some((entry) => entry.category === 'maintenance' && entry.amount < 0),
  );
  check(
    'the ledger records SLA penalties at month close',
    closedMonth.ledger.some((entry) => entry.category === 'sla_penalty' && entry.amount === -125),
  );
  check(
    'finance ledger identifiers remain unique',
    new Set(closedMonth.ledger.map((entry) => entry.id)).size === closedMonth.ledger.length,
  );
}

group('phase-two save migration');
{
  const current = newGame(9701);
  const legacy = { ...current, version: 13 } as unknown as Record<string, unknown>;
  legacy.competitors = current.competitors.map(({ spectrum: _spectrum, ...competitor }) => competitor);
  const { revenueMobile: _mobile, revenueHosting: _hosting, costLoanPayments: _loans, ...oldFinance } = current.finance;
  legacy.finance = oldFinance;
  const { fixedDemandGbps: _fixed, mobileDemandGbps: _radio, transitGbps: _transit, ...oldStats } = current.stats;
  legacy.stats = oldStats;
  delete legacy.ledger;
  const migrated = migrate(legacy, 13);
  check(
    'version 13 saves gain rival spectrum holdings',
    migrated?.competitors.every((competitor) => Array.isArray(competitor.spectrum)) === true,
  );
  check(
    'version 13 saves gain separated traffic statistics',
    migrated?.stats.fixedDemandGbps === 0 && migrated.stats.mobileDemandGbps === 0,
  );
  check(
    'version 13 saves gain an empty finance ledger',
    Array.isArray(migrated?.ledger) && migrated?.ledger.length === 0,
  );
}

group('phase-three planning, progression and strategy');
{
  const g = newGame(9801);
  const unlockedCell = g.districts
    .find((district) => district.unlocked)!
    .cells.find((cell) => !g.nodes.some((node) => node.gx === cell.gx && node.gy === cell.gy))!;
  const lockedCell = g.districts.find((district) => !district.unlocked)!.cells[0];
  check('a valid site preview is accepted', nodePlacementIssue(g, 'pop', unlockedCell.gx, unlockedCell.gy) === null);
  check(
    'a locked district explains why placement is invalid',
    nodePlacementIssue(g, 'pop', lockedCell.gx, lockedCell.gy)?.includes('not licensed') === true,
  );
  check(
    'an occupied tile explains why placement is invalid',
    nodePlacementIssue(g, 'pop', g.nodes[0].gx, g.nodes[0].gy)?.includes('already occupies') === true,
  );
  check(
    'GPON placement preview uses the discounted access cost',
    nodePlacementCost({ ...g, researchDone: ['ftth', 'gpon'] }, 'access') < nodePlacementCost(g, 'access'),
  );

  const source = g.nodes[0];
  const destination = g.nodes[1];
  check(
    'existing fibre is rejected before a player spends money',
    fibreConnectionIssue(g, source.id, destination.id)?.includes('already connected') === true,
  );
  const unlinked: NetNode = {
    ...destination,
    id: 'phase-three-unlinked',
    gx: destination.gx + 3,
    gy: destination.gy + 1,
  };
  const fibreState: GameState = { ...g, nodes: [...g.nodes, unlinked], money: 1_000_000 };
  check(
    'an unconnected fibre destination is accepted',
    fibreConnectionIssue(fibreState, source.id, unlinked.id) === null,
  );
  check(
    'fibre preview and construction share a positive price',
    fibreConnectionCost(fibreState, source.id, unlinked.id) > 0,
  );

  const protectedState: GameState = {
    ...g,
    nodes: [...g.nodes, { ...source, id: 'backup-core', kind: 'core', gx: source.gx + 4, gy: source.gy + 2 }],
    links: [
      ...g.links,
      {
        ...g.links[0],
        id: 'backup-path',
        aId: destination.id,
        bId: 'backup-core',
      },
    ],
  };
  check(
    'resilience reports independently protected customer sites',
    networkResilience(protectedState) === 1,
    `${networkResilience(protectedState)}`,
  );
  const resilienceRule = makeRegulation(protectedState, () => 0.6, 2000);
  check('the regulator can issue a resilience audit', resilienceRule?.kind === 'resilience');

  const advancedFixed = researchModifiers(['ftth', 'fiber10g', 'backbone100g', 'metro_mesh']);
  check('metro mesh unlocks fibre tier four', advancedFixed.maxLinkTier === 4);
  check(
    'metro mesh adds capacity beyond 10G fibre',
    advancedFixed.linkCapacityMul > researchModifiers(['ftth', 'fiber10g']).linkCapacityMul,
  );
  const predictive = researchModifiers(['noc', 'auto_dispatch', 'ddos_scrub', 'predictive_maintenance']);
  check(
    'predictive maintenance reduces both incidents and maintenance cost',
    predictive.incidentRateMul < researchModifiers(['noc']).incidentRateMul && predictive.maintenanceCostMul === 0.8,
  );
  check(
    'private 5G raises the value and volume of new offers',
    researchModifiers(['private_5g']).contractRevenueMul === 1.2 && researchModifiers(['private_5g']).hasPrivate5g,
  );

  check(
    'critical-care contracts pay a premium for stricter service',
    contractProfile('hospital').revenueMul > contractProfile('office').revenueMul &&
      contractProfile('hospital').slaFloor === 99.99,
  );
  const insolventRival = { ...g.competitors[0], cash: -1 };
  check('rival intelligence exposes a recovery strategy', rivalPosture(g, insolventRival).label === 'Recovery');
}

group('cash-flow clarity and bounded incident suppression');
{
  const cashState = newGame(9901);
  cashState.minutes = MINUTES_PER_DAY * 10;
  cashState.monthAccumulator = { revenue: 100000, expense: 25000 };
  cashState.finance = { ...cashState.finance, penalties: 5000 };
  cashState.ledger = [
    { id: 'cash-research', at: cashState.minutes, category: 'research', label: 'Research', amount: -40000 },
    { id: 'cash-service', at: cashState.minutes, category: 'network_service', label: 'Service', amount: -5000 },
    { id: 'cash-bonus', at: cashState.minutes, category: 'contract_bonus', label: 'Signing bonus', amount: 10000 },
    { id: 'cash-loan', at: cashState.minutes, category: 'loan_draw', label: 'Loan', amount: 50000 },
  ];
  const cash = currentMonthCashFlow(cashState);
  check('cash flow starts from actual operating cash MTD', cash.operatingCash === 70000, `${cash.operatingCash}`);
  check('capital spending is separated from operating profit', cash.capitalSpend === 40000, `${cash.capitalSpend}`);
  check('repairs and bonuses remain visible as one-offs', cash.otherOneOffNet === 5000, `${cash.otherOneOffNet}`);
  check('free cash flow includes capital and one-off activity', cash.freeCashFlow === 35000, `${cash.freeCashFlow}`);
  check(
    'financing is separated from free cash flow',
    cash.financing === 50000 && cash.netCashMovement === 85000,
    `${cash.financing}/${cash.netCashMovement}`,
  );

  const mild = boundedIncidentMultipliers(0.8, 0.8);
  const fullyStacked = boundedIncidentMultipliers(0.298, 0.44);
  check('ordinary incident reductions keep their designed strength', Math.abs(mild.load - 0.64) < 1e-9, `${mild.load}`);
  check(
    'stacked incident reductions stop at the combined load floor',
    Math.abs(fullyStacked.load - INCIDENT_LOAD_FLOOR) < 1e-9,
    `${fullyStacked.load}`,
  );
  check(
    'the incident floor still leaves both prevention and duration benefits',
    fullyStacked.rate < 1 && fullyStacked.duration < 1,
    `${fullyStacked.rate}/${fullyStacked.duration}`,
  );
}

group('contract negotiation');
{
  const g = newGame(10021);
  const building = g.buildings.find((entry) => entry.kind !== 'park' && entry.segment === 'business')!;
  const offer: ContractOffer = {
    id: 'negotiation-base',
    clientName: 'Northstar Systems',
    districtId: building.districtId,
    buildingId: building.id,
    bandwidthGbps: 1.5,
    monthlyRevenue: 40000,
    slaPercent: 99.9,
    termMonths: 24,
    segment: 'business',
    requiresRedundancy: false,
    expiresAt: g.minutes + MINUTES_PER_DAY * 10,
    signingBonus: 20000,
  };

  const standard = negotiatedTerms(offer, 'standard');
  check(
    'standard negotiation preserves the offered terms',
    standard.monthlyRevenue === offer.monthlyRevenue &&
      standard.slaPercent === offer.slaPercent &&
      standard.signingBonus === offer.signingBonus,
  );

  const flexible = negotiatedTerms(offer, 'flexible');
  const oldAllowance = 100 - offer.slaPercent;
  const flexibleAllowance = 100 - flexible.slaPercent;
  check('flexible terms lower recurring revenue', flexible.monthlyRevenue < offer.monthlyRevenue);
  check(
    'flexible terms double the monthly downtime allowance',
    Math.abs(flexibleAllowance - oldAllowance * 2) < 1e-9,
    `${oldAllowance} -> ${flexibleAllowance}`,
  );

  const premium = negotiatedTerms(offer, 'premium');
  check(
    'a premium counter raises recurring revenue and trims the bonus',
    premium.monthlyRevenue > offer.monthlyRevenue && premium.signingBonus < offer.signingBonus,
  );

  const weakDistricts = g.districts.map((district) =>
    district.id === offer.districtId ? { ...district, satisfaction: 0 } : district,
  );
  const strongDistricts = g.districts.map((district) =>
    district.id === offer.districtId ? { ...district, satisfaction: 100 } : district,
  );
  const weakCompetitors = g.competitors.map((competitor, index) => ({
    ...competitor,
    share: { ...competitor.share, [offer.districtId]: index === 0 ? 0.9 : 0 },
  }));
  const strongCompetitors = g.competitors.map((competitor) => ({
    ...competitor,
    share: { ...competitor.share, [offer.districtId]: 0 },
  }));
  const weakState: GameState = {
    ...g,
    reputation: 0,
    districts: weakDistricts,
    competitors: weakCompetitors,
    employees: g.employees.filter((employee) => employee.role !== 'sales'),
  };
  const strongState: GameState = {
    ...g,
    reputation: 100,
    districts: strongDistricts,
    competitors: strongCompetitors,
    employees: [
      ...g.employees,
      { id: 'negotiation-sales', name: 'Ari Bell', role: 'sales', salary: 4000, skill: 5, experience: 480 },
    ],
  };
  const weakChance = premiumCounterChance(weakState, offer);
  const strongChance = premiumCounterChance(strongState, offer);
  check(
    'reputation, service and sales improve premium close chance',
    strongChance > weakChance,
    `${weakChance} -> ${strongChance}`,
  );
  check('premium close chance stays bounded', weakChance >= 0.25 && strongChance <= 0.9);
  check(
    'the same premium counter always resolves the same way',
    resolveNegotiation(g, offer, 'premium').accepted === resolveNegotiation(g, offer, 'premium').accepted,
  );

  const flexibleState: GameState = {
    ...g,
    money: 100000,
    contracts: [],
    offers: [offer],
    buildings: g.buildings.map((entry) => ({ ...entry })),
    ledger: [],
  };
  useGame.setState({ game: flexibleState, started: true });
  useGame.getState().acceptOffer(offer.id, 'flexible');
  const afterFlexible = useGame.getState().game!;
  const flexibleContract = afterFlexible.contracts.find((contract) => contract.buildingId === offer.buildingId);
  check(
    'the store signs the displayed flexible terms',
    flexibleContract?.monthlyRevenue === flexible.monthlyRevenue && flexibleContract.slaPercent === flexible.slaPercent,
  );
  check(
    'a negotiated deal records its adjusted signing bonus',
    afterFlexible.money === flexibleState.money + flexible.signingBonus,
  );
  check(
    'a negotiated signing bonus reaches the ledger',
    afterFlexible.ledger.some((entry) => entry.category === 'contract_bonus' && entry.amount === flexible.signingBonus),
  );

  let rejectedOffer: ContractOffer | null = null;
  let acceptedOffer: ContractOffer | null = null;
  for (let index = 0; index < 100 && (!rejectedOffer || !acceptedOffer); index++) {
    const candidate = { ...offer, id: `premium-${index}` };
    if (resolveNegotiation(g, candidate, 'premium').accepted) acceptedOffer ??= candidate;
    else rejectedOffer ??= candidate;
  }
  check(
    'deterministic counters include both accepted and rejected outcomes',
    rejectedOffer !== null && acceptedOffer !== null,
  );

  if (rejectedOffer) {
    const rejectedState: GameState = {
      ...g,
      money: 100000,
      contracts: [],
      offers: [rejectedOffer],
      buildings: g.buildings.map((entry) => ({ ...entry })),
      ledger: [],
    };
    const connectedBefore = rejectedState.buildings.find((entry) => entry.id === rejectedOffer!.buildingId)?.connected;
    useGame.setState({ game: rejectedState, started: true });
    useGame.getState().acceptOffer(rejectedOffer.id, 'premium');
    const rejected = useGame.getState().game!;
    check(
      'a rejected premium counter consumes the offer without a contract',
      rejected.offers.length === 0 && rejected.contracts.length === 0,
    );
    check(
      'a rejected counter changes no cash or connection',
      rejected.money === rejectedState.money &&
        rejected.buildings.find((entry) => entry.id === rejectedOffer!.buildingId)?.connected === connectedBefore,
    );
  }

  if (acceptedOffer) {
    const acceptedTerms = negotiatedTerms(acceptedOffer, 'premium');
    const acceptedState: GameState = {
      ...g,
      money: 100000,
      contracts: [],
      offers: [acceptedOffer],
      buildings: g.buildings.map((entry) => ({ ...entry })),
      ledger: [],
    };
    useGame.setState({ game: acceptedState, started: true });
    useGame.getState().acceptOffer(acceptedOffer.id, 'premium');
    const accepted = useGame.getState().game!;
    check(
      'an accepted premium counter signs its higher recurring fee',
      accepted.contracts[0]?.monthlyRevenue === acceptedTerms.monthlyRevenue &&
        accepted.money === acceptedState.money + acceptedTerms.signingBonus,
    );
    saveGame(accepted, 2);
    const reloaded = loadGame(2);
    check(
      'negotiated contract terms survive a save round-trip',
      reloaded?.contracts[0]?.monthlyRevenue === acceptedTerms.monthlyRevenue,
    );
    clearSave(2);
  }

  const gatedOffer: ContractOffer = { ...offer, id: 'negotiation-gated', requiresRedundancy: true };
  useGame.setState({ game: { ...g, contracts: [], offers: [gatedOffer] }, started: true });
  useGame.getState().acceptOffer(gatedOffer.id, 'premium');
  check(
    'negotiation cannot bypass a redundancy requirement',
    useGame.getState().game?.offers[0]?.id === gatedOffer.id && useGame.getState().game?.contracts.length === 0,
  );
}

group('integrated operator strategy mechanics');
{
  const current = newGame(11001);
  const legacy = { ...current, version: 14 } as unknown as Record<string, unknown>;
  legacy.technicians = current.technicians.map(({ maintenanceId: _maintenanceId, ...technician }) => technician);
  const { revenueWholesale: _wholesale, ...legacyFinance } = current.finance;
  legacy.finance = legacyFinance;
  delete legacy.maintenanceOrders;
  delete legacy.campaigns;
  delete legacy.trafficPolicy;
  delete legacy.interconnectPlan;
  delete legacy.wholesaleFixed;
  delete legacy.mvnoEnabled;
  delete legacy.dataCenterModes;
  const migrated = migrate(legacy, 14);
  check(
    'version 14 saves gain the complete strategy state',
    Boolean(
      migrated &&
      migrated.maintenanceOrders.length === 0 &&
      migrated.campaigns.length === 0 &&
      migrated.trafficPolicy === 'balanced' &&
      migrated.interconnectPlan === 'transit' &&
      migrated.finance.revenueWholesale === 0,
    ),
  );

  const occupiedCells = new Set(current.nodes.map((node) => `${node.gx}:${node.gy}`));
  const legacyDcCell = current.districts
    .flatMap((district) => district.cells)
    .find((cell) => !occupiedCells.has(`${cell.gx}:${cell.gy}`))!;
  const legacy15 = {
    ...current,
    version: 15,
    nodes: [
      ...current.nodes,
      {
        ...current.nodes[1],
        id: 'legacy-dc',
        kind: 'datacenter',
        name: 'Legacy DC',
        gx: legacyDcCell.gx,
        gy: legacyDcCell.gy,
      },
    ],
    campaigns: [
      {
        id: 'legacy-campaign',
        districtId: current.districts[0].id,
        kind: 'acquisition',
        startedAt: current.minutes,
        endsAt: current.minutes + MINUTES_PER_DAY,
        cost: 1000,
      },
    ],
    dataCenterModes: {},
    stats: { ...current.stats },
  } as unknown as Record<string, unknown>;
  delete legacy15.campaignHistory;
  delete legacy15.dataCenterModeChangedAt;
  delete (legacy15.stats as Record<string, unknown>).serviceDemandGbps;
  delete (legacy15.stats as Record<string, unknown>).serviceServedGbps;
  const migrated15 = migrate(legacy15, 15);
  check(
    'version 15 saves gain service telemetry and campaign baselines',
    Boolean(
      migrated15 &&
      migrated15.dataCenterModes['legacy-dc'] === 'colocation' &&
      migrated15.dataCenterModeChangedAt['legacy-dc'] === 0 &&
      migrated15.campaignHistory.length === 0 &&
      migrated15.campaigns[0]?.baselineCustomers >= 0 &&
      migrated15.stats.serviceDemandGbps.workload === 0 &&
      migrated15.stats.serviceServedGbps.wholesale === 0,
    ),
    migrated15
      ? JSON.stringify({
          mode: migrated15.dataCenterModes['legacy-dc'],
          changedAt: migrated15.dataCenterModeChangedAt['legacy-dc'],
          history: migrated15.campaignHistory.length,
          campaign: migrated15.campaigns[0],
          demand: migrated15.stats.serviceDemandGbps,
          served: migrated15.stats.serviceServedGbps,
        })
      : 'migration returned null',
  );

  const traffic = newGame(11002);
  const access = traffic.nodes.find((node) => node.kind === 'pop')!;
  access.capacityGbps = 100;
  traffic.nodes.find((node) => node.kind === 'core')!.capacityGbps = 10;
  traffic.links[0].capacityGbps = 100;
  const routes = computeRoutes(traffic);
  const prioritised = loadServices(
    traffic,
    [
      { id: 'home', districtId: access.districtId, demandGbps: 10, servingNodeIds: [access.id], priority: 0.7 },
      { id: 'sla', districtId: access.districtId, demandGbps: 10, servingNodeIds: [access.id], priority: 2 },
    ],
    routes,
  );
  check(
    'QoS gives the protected service a larger congested share',
    prioritised.serviceServed.sla > prioritised.serviceServed.home,
    `${prioritised.serviceServed.home}/${prioritised.serviceServed.sla}`,
  );
  check(
    'QoS still conserves shared core capacity',
    prioritised.nodeTraffic[traffic.nodes[0].id] <= 10.0001,
    `${prioritised.nodeTraffic[traffic.nodes[0].id]}`,
  );

  const transitBase = monthlyBreakdown(traffic, researchModifiers(traffic.researchDone));
  const peered = { ...traffic, interconnectPlan: 'ixp' as const };
  const transitPeered = monthlyBreakdown(peered, researchModifiers(peered.researchDone));
  check(
    'an IXP has a visible monthly commitment',
    Math.abs(transitPeered.costTransit - transitBase.costTransit - INTERCONNECT_CONFIG.ixp.monthly) < 0.01,
  );
  const suspendedCdn = { ...traffic, interconnectPlan: 'cdn' as const };
  check('a CDN partnership is suspended without a routed data centre', !interconnectOperational(suspendedCdn));
  check('a suspended CDN provides no cache offload', cacheRatio(suspendedCdn) === 0);
  check(
    'a suspended CDN commitment still appears on the bill',
    Math.abs(
      monthlyBreakdown(suspendedCdn, researchModifiers(suspendedCdn.researchDone)).costTransit -
        transitBase.costTransit -
        INTERCONNECT_CONFIG.cdn.monthly,
    ) < 0.01,
  );

  const wholesale = {
    ...traffic,
    wholesaleFixed: true,
    districts: traffic.districts.map((district) => ({
      ...district,
      coverage: district.unlocked ? 0.5 : district.coverage,
    })),
  };
  check('fixed wholesale earns positive monthly revenue', wholesaleRevenue(wholesale) > 0);
  check(
    'wholesale revenue reaches the operating statement',
    monthlyBreakdown(wholesale, researchModifiers(wholesale.researchDone)).revenueWholesale > 0,
  );
  const wholesaleFull: GameState = {
    ...wholesale,
    stats: {
      ...wholesale.stats,
      serviceDemandGbps: { ...wholesale.stats.serviceDemandGbps, wholesale: 10 },
      serviceServedGbps: { ...wholesale.stats.serviceServedGbps, wholesale: 10 },
    },
  };
  const wholesaleQuarter: GameState = {
    ...wholesaleFull,
    stats: {
      ...wholesaleFull.stats,
      serviceServedGbps: { ...wholesaleFull.stats.serviceServedGbps, wholesale: 2.5 },
    },
  };
  check(
    'wholesale income follows delivered service quality',
    Math.abs(wholesaleRevenue(wholesaleQuarter) / wholesaleRevenue(wholesaleFull) - 0.25) < 0.001,
  );
  const measured = step(wholesale);
  const trafficClasses = ['residential', 'business', 'mobile', 'wholesale', 'workload'] as const;
  check(
    'service telemetry remains finite and conserves delivery',
    trafficClasses.every(
      (kind) =>
        Number.isFinite(measured.stats.serviceDemandGbps[kind]) &&
        Number.isFinite(measured.stats.serviceServedGbps[kind]) &&
        measured.stats.serviceDemandGbps[kind] >= 0 &&
        measured.stats.serviceServedGbps[kind] <= measured.stats.serviceDemandGbps[kind] + 0.0001,
    ),
  );

  const dataCentre: NetNode = {
    ...access,
    id: 'strategy-dc',
    kind: 'datacenter',
    name: 'Strategy DC',
    tier: 2,
    capacityGbps: 100,
  };
  const colocated: GameState = {
    ...traffic,
    nodes: [...traffic.nodes, dataCentre],
    links: [
      ...traffic.links,
      {
        id: 'strategy-dc-link',
        aId: dataCentre.id,
        bId: traffic.nodes[0].id,
        capacityGbps: 100,
        trafficGbps: 0,
        down: false,
        tier: 1,
        length: 1,
        builtAt: traffic.minutes,
      },
    ],
    dataCenterModes: { 'strategy-dc': 'colocation' },
  };
  const cloud: GameState = { ...colocated, dataCenterModes: { 'strategy-dc': 'cloud' } };
  const cached: GameState = { ...colocated, dataCenterModes: { 'strategy-dc': 'cache' } };
  check(
    'cloud mode trades extra load for more hosting income',
    hostingRevenue(cloud) > hostingRevenue(colocated) &&
      DATA_CENTER_MODE_CONFIG.cloud.workloadPerTier > DATA_CENTER_MODE_CONFIG.colocation.workloadPerTier,
  );
  check('edge-cache mode offloads more traffic than colocation', cacheRatio(cached) > cacheRatio(colocated));
  check(
    'cloud mode draws more power than colocation',
    monthlyBreakdown(cloud, researchModifiers(cloud.researchDone)).costPower >
      monthlyBreakdown(colocated, researchModifiers(colocated.researchDone)).costPower,
  );

  const maintenance = newGame(11003);
  const site = maintenance.nodes[1];
  site.health = 55;
  const cost = maintenanceCost(site, 'urgent');
  maintenance.maintenanceOrders = [
    {
      id: 'planned-work',
      nodeId: site.id,
      mode: 'urgent',
      status: 'scheduled',
      scheduledAt: maintenance.minutes,
      startedAt: null,
      minutesLeft: 5,
      technicianId: null,
      cost,
    },
  ];
  tickMaintenance(maintenance, 5);
  const assigned = maintenance.maintenanceOrders[0];
  const crew = maintenance.technicians.find((technician) => technician.id === assigned.technicianId)!;
  crew.gx = site.gx;
  crew.gy = site.gy;
  crew.state = 'working';
  tickMaintenance(maintenance, 5);
  check('planned maintenance consumes a real crew', assigned.technicianId !== null);
  check(
    'planned maintenance restores site condition',
    maintenance.nodes.find((node) => node.id === site.id)?.health === 100,
  );
  check(
    'the crew returns after planned maintenance',
    maintenance.technicians.find((technician) => technician.id === crew.id)?.state === 'returning',
  );

  const commercial = newGame(11004);
  commercial.money = 1_000_000;
  useGame.setState({ game: commercial, started: true });
  const district = commercial.districts.find((entry) => entry.unlocked)!;
  useGame.getState().startCampaign(district.id, 'acquisition');
  const campaigned = useGame.getState().game!;
  check(
    'district campaigns charge once and become active',
    campaigned.campaigns.length === 1 && campaigned.money < commercial.money,
  );
  check(
    'campaign spending is visible in the finance ledger',
    campaigned.ledger.some((entry) => entry.category === 'campaign'),
  );
  useGame.getState().toggleWholesaleFixed();
  check('wholesale access is a reversible company policy', useGame.getState().game?.wholesaleFixed === true);
}

group('planned maintenance keeps its promises');
{
  let g = newGame(2024);
  g = runDays(g, 40, repairAll);
  g = {
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, down: false, health: 100 })),
    links: g.links.map((l) => ({ ...l, down: false })),
    incidents: [],
  };
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const pop = g.nodes.find((n) => n.kind === 'pop')!;

  // A spare fibre path does not save a district, because the work powers the site down.
  const spare = {
    ...g,
    links: [
      ...g.links,
      {
        id: 'spare',
        aId: pop.id,
        bId: core.id,
        capacityGbps: linkCapacity(1),
        trafficGbps: 0,
        down: false,
        tier: 1,
        length: 14,
        builtAt: 0,
      },
    ],
  };
  check('a second path alone does not cover planned work', !servingCoverAfterLoss(spare, pop.id).safe);

  const cell = g.districts[0].cells.find((c) => !g.nodes.some((n) => Math.hypot(n.gx - c.gx, n.gy - c.gy) < 2.5))!;
  const twoSites = {
    ...g,
    nodes: [...g.nodes, { ...pop, id: 'pop2', name: 'Second POP', gx: cell.gx, gy: cell.gy }],
    links: [
      ...g.links,
      {
        id: 'l2',
        aId: 'pop2',
        bId: core.id,
        capacityGbps: linkCapacity(1),
        trafficGbps: 0,
        down: false,
        tier: 1,
        length: 6,
        builtAt: 0,
      },
    ],
  };
  check('a second serving site does cover it', servingCoverAfterLoss(twoSites, pop.id).safe);
  check('and the panel can say how many stand in', servingCoverAfterLoss(twoSites, pop.id).others === 1);

  check('waiting is offered as a real option', MAINTENANCE_CONFIG.defer.costMultiplier === 0);
  check('the research promises what it now does', researchModifiers(['predictive_maintenance']).hasMaintenanceForecast);
  check('without it nothing is booked automatically', !researchModifiers([]).hasMaintenanceForecast);

  // Telemetry should book the cheap window on a drifting site by itself.
  let auto = { ...g, money: 400000, researchDone: ['auto_dispatch', 'ddos_scrub', 'predictive_maintenance'] };
  auto = { ...auto, nodes: auto.nodes.map((n) => (n.id === pop.id ? { ...n, health: 60 } : n)) };
  auto = runDays(auto, 2);
  check(
    'telemetry books the work itself',
    auto.maintenanceOrders.some((o) => o.nodeId === pop.id),
    `${auto.maintenanceOrders.length} orders`,
  );
}

group('scenarios and the multi-city campaign');
{
  const current = newGame(17001);
  const legacy = { ...current, version: 16 } as unknown as Record<string, unknown>;
  delete legacy.mode;
  delete legacy.scenarioId;
  delete legacy.scenarioCompletedAt;
  delete legacy.campaignStage;
  const migrated = migrate(legacy, 16);
  check(
    'version 16 saves become free-play sandbox games',
    Boolean(
      migrated &&
      migrated.mode === 'sandbox' &&
      migrated.scenarioId === 'freeplay' &&
      migrated.scenarioCompletedAt === null &&
      migrated.campaignStage === 0,
    ),
  );

  const marmara = generateCity(17002, 'Marmara');
  const karadeniz = generateCity(17002, 'Karadeniz');
  const ege = generateCity(17002, 'Ege');
  check(
    'cities have distinct district identities',
    marmara.districts[0].name !== karadeniz.districts[0].name && karadeniz.districts[0].name !== ege.districts[0].name,
  );
  check(
    'city profiles materially change the generated market',
    marmara.districts[0].competition !== karadeniz.districts[0].competition &&
      (marmara.buildings.length !== karadeniz.buildings.length ||
        marmara.districts[1].entryCost !== karadeniz.districts[1].entryCost),
  );

  const rapid = createNewGame({
    companyName: 'Scenario Test',
    logo: 'S',
    difficulty: 'standard',
    cityName: 'Marmara',
    scenarioId: 'rapid_expansion',
    seed: 17003,
  });
  rapid.districts[1].unlocked = true;
  rapid.districts[0].mobileSubs = 1500;
  check('scenario objectives detect a completed launch', scenarioStatus(rapid).complete);
  rapid.minutes = MINUTES_PER_DAY * 181;
  rapid.districts[0].mobileSubs = 0;
  check('scenario deadlines detect a missed objective', scenarioStatus(rapid).expired);

  const campaign = createNewGame({
    companyName: 'Campaign Test',
    logo: 'C',
    difficulty: 'standard',
    cityName: 'ignored',
    mode: 'campaign',
    campaignStage: 0,
    seed: 17004,
  });
  check(
    'campaign stage chooses its city and objective',
    campaign.cityName === CAMPAIGN_STAGES[0].cityName && campaign.scenarioId === CAMPAIGN_STAGES[0].scenarioId,
  );
  useGame.setState({ game: { ...campaign, victoryAt: campaign.minutes }, started: true, activeSaveSlot: 0 });
  check('a completed campaign stage can advance', useGame.getState().advanceCampaign());
  check(
    'campaign advancement opens the next city',
    useGame.getState().game?.cityName === CAMPAIGN_STAGES[1].cityName && useGame.getState().game?.campaignStage === 1,
  );
}

group('development grants and investment planning');
{
  const g = newGame(2031);
  const originalCash = g.money;
  check('an unfinished milestone cannot pay out', claimMilestone(g, 'customers') === null);
  check('an unknown milestone cannot pay out', claimMilestone(g, 'made-up') === null);
  const residential = g.packages.find((p) => p.segment === 'residential')!;
  g.packages = g.packages.map((p) => ({ ...p, subscribers: p.id === residential.id ? 450 : 0 }));
  const granted = claimMilestone(g, 'customers')!;
  check(
    'a completed milestone pays its grant',
    granted.money === originalCash + 70000 && granted.researchPoints === g.researchPoints + 5,
  );
  check('claim leaves the previous state untouched', g.money === originalCash && g.claimedMilestones.length === 0);
  check(
    'milestone grants are recorded as one-off cash',
    granted.ledger[0].category === 'milestone_reward' && currentMonthCashFlow(granted).otherOneOffNet === 70000,
  );
  check('milestones cannot pay twice', claimMilestone(granted, 'customers') === null);
  const restored = migrate(JSON.parse(JSON.stringify(granted)), SAVE_VERSION)!;
  check(
    'claimed grants survive a save round trip',
    restored?.claimedMilestones.includes('customers') && claimMilestone(restored, 'customers') === null,
  );
  const legacy = JSON.parse(JSON.stringify(g));
  delete legacy.claimedMilestones;
  const upgraded = migrate(legacy, 17);
  check(
    'v17 saves acquire an empty grant history without changing cash',
    upgraded?.claimedMilestones.length === 0 && upgraded.money === originalCash * 20,
  );
  check(
    'duplicate grant history is rejected',
    migrate({ ...JSON.parse(JSON.stringify(granted)), claimedMilestones: ['customers', 'customers'] }, SAVE_VERSION) ===
      null,
  );
  check(
    'unknown grant history is rejected',
    migrate({ ...JSON.parse(JSON.stringify(granted)), claimedMilestones: ['unknown'] }, SAVE_VERSION) === null,
  );
  const pop = g.nodes.find((n) => n.kind === 'pop')!;
  const isolated = { ...g, nodes: [...g.nodes, { ...pop, id: 'isolated', gx: pop.gx + 1 }] };
  check(
    'isolated POPs do not satisfy the connected goal',
    milestoneProgress(isolated).find((m) => m.id === 'connected')?.progress === 0.5,
  );
  const before = monthlyBreakdown(g, researchModifiers(g.researchDone));
  const next = { ...g, nodes: g.nodes.map((n) => (n.id === pop.id ? { ...n, tier: n.tier + 1 } : n)) };
  const after = monthlyBreakdown(next, researchModifiers(g.researchDone));
  const estimate = investmentEstimate(g, pop.kind, pop.id);
  check(
    'upgrade upkeep matches the simulation economy',
    Math.abs(after.totalCost - before.totalCost - estimate.monthlyCost) < 0.001,
  );
  const built = { ...g, nodes: [...g.nodes, { ...pop, id: 'planned', tier: 1 }] };
  const buildEstimate = investmentEstimate(g, 'pop');
  check(
    'new site upkeep matches the simulation economy',
    Math.abs(
      monthlyBreakdown(built, researchModifiers(g.researchDone)).totalCost -
        before.totalCost -
        buildEstimate.monthlyCost,
    ) < 0.001,
  );
  check(
    'investment projections stay finite',
    Number.isFinite(estimate.monthlyCost) &&
      Number.isFinite(estimate.remaining) &&
      (estimate.runwayMonths === null || Number.isFinite(estimate.runwayMonths)),
  );
  const backhaul = suggestedBackhaul(isolated, pop.gx + 2, pop.gy);
  const debtEstimate = investmentEstimate({ ...g, loans: [createLoan(g, 100000, 12)] }, 'pop');
  check(
    'cash runway accounts for loan payments',
    debtEstimate.runwayMonths !== null &&
      (buildEstimate.runwayMonths === null || debtEstimate.runwayMonths < buildEstimate.runwayMonths),
  );
  check('backhaul suggestions exclude isolated sites', !!backhaul && backhaul.node.id !== 'isolated');
  check(
    'a dead network has no suggested backhaul',
    suggestedBackhaul({ ...g, nodes: g.nodes.map((n) => ({ ...n, down: true })) }, 2, 2) === null,
  );
  check(
    'failed companies cannot claim grants',
    claimMilestone({ ...g, gameOver: { reason: 'test', at: g.minutes } }, 'customers') === null,
  );
}

group('Atomic network planning and strategy persistence');
{
  const g = newGame(9191);
  g.money = 50000000;
  g.speed = 0;
  const district = g.districts.find((d) => d.unlocked)!;
  const cell = district.cells.find((c) => !g.nodes.some((n) => n.gx === c.gx && n.gy === c.gy))!;
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const steps: BuildStep[] = [
    { type: 'node', id: 'test-plan', kind: 'pop', gx: cell.gx, gy: cell.gy },
    { type: 'link', id: 'test-plan-link', aId: core.id, bId: 'test-plan' },
  ];
  const original = JSON.stringify(g);
  const preview = projectBlueprint(g, steps);
  check('blueprint projection does not mutate the original', JSON.stringify(g) === original);
  check(
    'connected blueprint adds nodes and charges exact ledger cost',
    !preview.error &&
      preview.disconnected === 0 &&
      preview.state.nodes.length === g.nodes.length + 1 &&
      preview.cost > 18000 &&
      preview.state.money === g.money - preview.cost,
  );
  const poor = { ...g, money: 18000 };
  const failed = projectBlueprint(poor, steps);
  check(
    'a later unaffordable link rolls back the whole plan',
    !!failed.error && failed.state === poor && failed.cost === 0,
  );
  check('unconnected sites are reported', projectBlueprint(g, steps.slice(0, 1)).disconnected === 1);
  check('duplicate placement rolls back', projectBlueprint(g, [steps[0], { ...steps[0], id: 'second' }]).state === g);
  check(
    'plan size limit is enforced',
    !!projectBlueprint(
      g,
      Array.from({ length: MAX_PLAN_STEPS + 1 }, () => steps[0]),
    ).error,
  );
  check(
    'Turkish plan errors come from validation',
    projectBlueprint(poor, steps, 'tr').error?.includes('gerekiyor') === true,
  );
  const peak = residentialPeakEstimate(preview.state);
  check(
    'peak estimate conserves demand and is finite',
    Number.isFinite(peak.pressure) && peak.served <= peak.demand && peak.served >= 0,
  );
  const toast = useGame.getState().toast;
  useGame.setState({ game: g, started: true, planning: true, blueprint: steps.slice(0, 1), toast: () => undefined });
  useGame.getState().setSpeed(4);
  useGame.getState().tick();
  check(
    'time and speed remain paused while planning',
    useGame.getState().game!.minutes === g.minutes && useGame.getState().game!.speed === 0,
  );
  useGame.getState().commitBlueprint();
  check('store refuses a disconnected blueprint', useGame.getState().planning && useGame.getState().game === g);
  check('draft must be resolved before exit', useGame.getState().quitToMenu() === false);
  useGame.setState({ blueprint: steps });
  useGame.getState().commitBlueprint();
  check(
    'store commits all sites once',
    !useGame.getState().planning && useGame.getState().game!.nodes.length === g.nodes.length + 1,
  );
  const committedMoney = useGame.getState().game!.money;
  useGame.getState().commitBlueprint();
  check('repeat commissioning does not charge twice', useGame.getState().game!.money === committedMoney);
  useGame.setState({ toast });
  const legacy = JSON.parse(JSON.stringify(g));
  delete legacy.strategy;
  legacy.version = 18;
  const migrated = migrate(legacy, 18);
  check(
    'v18 saves migrate without changing money',
    !!migrated && migrated.money === g.money * 20 && migrated.strategy.decision === null,
  );
  check('current strategy saves round-trip', !!migrate(JSON.parse(JSON.stringify(g)), SAVE_VERSION));
  for (const bad of [
    null,
    { ...g.strategy, history: [{ id: 'x', at: 0, text: 'bad' }] },
    { ...g.strategy, challenge: { kind: 'unknown', target: 2, dueAt: 100 } },
    { ...g.strategy, nextDecisionAt: -1 },
  ])
    check(
      'malformed strategy rejected',
      migrate({ ...JSON.parse(JSON.stringify(g)), strategy: bad }, SAVE_VERSION) === null,
    );
  const proposal = {
    ...g,
    strategy: {
      ...initialStrategy(g.minutes),
      decision: { id: 'decision-test', kind: 'renewal' as const, districtId: district.id, dueAt: g.minutes + 100 },
    },
  };
  const before = JSON.stringify(proposal);
  const chosen = resolveDecision(proposal, 'decision-test', 'survey')!;
  check(
    'decision charges once and awards research',
    chosen.money === g.money - 70000 &&
      chosen.researchPoints === g.researchPoints + 12 &&
      chosen.strategy.decision === null,
  );
  check('decision does not mutate original', JSON.stringify(proposal) === before);
  check('decision cannot be replayed', resolveDecision(chosen, 'decision-test', 'survey') === null);
  check(
    'expired and unaffordable decisions are refused',
    resolveDecision({ ...proposal, minutes: proposal.minutes + 100 }, 'decision-test', 'survey') === null &&
      resolveDecision({ ...proposal, money: 0 }, 'decision-test', 'survey') === null,
  );
  check('strategic ledger saves round-trip', !!migrate(JSON.parse(JSON.stringify(chosen)), SAVE_VERSION));
  const sponsor = resolveDecision(
    { ...proposal, strategy: { ...proposal.strategy, decision: { ...proposal.strategy.decision, kind: 'festival' } } },
    'decision-test',
    'sponsor',
  )!;
  check(
    'sponsorship adds real temporary traffic',
    sponsor.activeEvent?.mul === 1.6 && sponsor.activeEvent.endsAt === g.minutes + 3 * MINUTES_PER_DAY,
  );
  const grown = { ...g, strategy: { ...g.strategy } };
  const subscribers = residentialSubs(g);
  const added = developDistrict(grown, district.id, 8);
  check(
    'development creates homes without subscribers',
    added > 0 &&
      Math.abs(residentialSubs(grown) - subscribers) < 0.000001 &&
      grown.districts.find((d) => d.id === district.id)!.potential === district.potential + added,
  );
  check('development respects its building limit', grown.strategy.developments[0].buildingIds.length <= 8);
  check('developed cities save correctly', !!migrate(JSON.parse(JSON.stringify(grown)), SAVE_VERSION));
  const scheduled = { ...g, minutes: g.strategy.nextDecisionAt, strategy: { ...g.strategy } };
  tickBoard(scheduled);
  check('board schedules a proposal when due', !!scheduled.strategy.decision);
  const charter = {
    ...g,
    stats: { ...g.stats, health: 100 },
    districts: g.districts.map((d, i) => ({ ...d, mobileSubs: i === 0 ? 600 : 0 })),
    strategy: { ...g.strategy, challenge: { kind: 'mobile' as const, target: 500, dueAt: g.minutes + 100 } },
  };
  const reward = claimChallenge(charter)!;
  check(
    'charter pays once and schedules next evaluation',
    reward.money === g.money + 15000 && reward.strategy.challengesCompleted === 1 && claimChallenge(reward) === null,
  );
  check(
    'charter needs healthy network',
    claimChallenge({ ...charter, stats: { ...charter.stats, health: 84 } }) === null,
  );
  const rival = g.competitors[0];
  const acq = {
    ...g,
    rank: 2,
    auction: null,
    competitors: g.competitors.map((c) => ({ ...c, coverage: { ...c.coverage, [district.id]: 0.5 } })),
  };
  const q = acquisitionQuote(acq, rival.id);
  const acqBefore = JSON.stringify(acq);
  const merged = acquireCompany(acq, rival.id);
  check(
    'acquisition quote has separate integration cost',
    !q.issue && q.integrationCost > 0 && q.total === q.price + q.integrationCost,
  );
  check(
    'acquisition integrates and charges exactly once',
    !!merged &&
      merged.money === acq.money - q.total &&
      merged.competitors.length === acq.competitors.length - 1 &&
      acquireCompany(merged, rival.id) === null,
  );
  check('acquisition leaves the source immutable', JSON.stringify(acq) === acqBefore);
  check(
    'acquisition refuses debt and low rank',
    acquireCompany({ ...acq, money: q.total - 1 }, rival.id) === null &&
      acquireCompany({ ...acq, rank: 0 }, rival.id) === null,
  );
  check(
    'the last independent rival cannot be acquired',
    acquireCompany({ ...acq, competitors: [acq.competitors[0]] }, rival.id) === null,
  );
  check('integrated company remains saveable', !!merged && !!migrate(JSON.parse(JSON.stringify(merged)), SAVE_VERSION));
}
group('Connected construction and independent backup routes');
{
  const g = newGame(8181);
  g.money = 1000000;
  const d = g.districts.find((d) => d.unlocked)!;
  const cell = d.cells.find((c) => !g.nodes.some((n) => n.gx === c.gx && n.gy === c.gy))!;
  const original = JSON.stringify(g);
  const quote = connectedSiteEstimate(g, 'pop', cell.gx, cell.gy);
  const built = buildConnectedSite(g, 'pop', cell.gx, cell.gy);
  check('connected build matches its preview price', !built.error && built.state.money === g.money - quote.total);
  check(
    'connected build commissions site and fibre together',
    built.state.nodes.length === g.nodes.length + 1 && built.state.links.length === g.links.length + 1,
  );
  check('connected build leaves original state unchanged', JSON.stringify(g) === original);
  const poor = { ...g, money: quote.total - 1 };
  const denied = buildConnectedSite(poor, 'pop', cell.gx, cell.gy);
  check('insufficient combined cash cannot buy a partial site', !!denied.error && denied.state === poor);
  const dark = { ...g, nodes: g.nodes.map((n) => ({ ...n, down: true })) };
  check('connected placement refuses a dead backhaul', !!buildConnectedSite(dark, 'pop', cell.gx, cell.gy).error);
  const pop = g.nodes.find((n) => n.kind === 'pop')!;
  const branch = projectBlueprint(g, [
    { type: 'node', id: 'backup-target', kind: 'pop', gx: cell.gx, gy: cell.gy },
    { type: 'link', id: 'branch-span', aId: pop.id, bId: 'backup-target' },
  ]).state;
  const route = backupRouteEstimate(branch, 'backup-target');
  check('backup rejects peers behind the same upstream cut', !!route && route.node.kind === 'core');
  const protectedGame = buildBackupRoute(branch, 'backup-target')!;
  check(
    'suggested backup actually survives every primary cut',
    !!protectedGame && isRedundant(protectedGame, 'backup-target', computeRoutes(protectedGame)),
  );
  check(
    'backup price is exact and cannot be charged twice',
    !!route &&
      protectedGame.money === branch.money - route.cost &&
      buildBackupRoute(protectedGame, 'backup-target') === null,
  );
  check('unaffordable backup changes nothing', buildBackupRoute({ ...branch, money: 0 }, 'backup-target') === null);
  check('backup survives save validation', !!migrate(JSON.parse(JSON.stringify(protectedGame)), SAVE_VERSION));
}
group('Reach projections and non-destructive failure drills');
{
  const g = newGame(7171);
  g.money = 1000000;
  g.speed = 0;
  const d = g.districts.find((d) => d.unlocked)!;
  const pop = g.nodes.find((n) => n.kind === 'pop')!;
  const core = g.nodes.find((n) => n.kind === 'core')!;
  const routes = computeRoutes(g);
  const expected = g.nodes
    .filter((n) => n.districtId === d.id && !n.down && routes[n.id])
    .reduce(
      (sum, n) => sum + (n.kind === 'pop' ? 0.32 : n.kind === 'access' ? 0.13 : 0) * (1 + (n.tier - 1) * 0.18),
      0,
    );
  check(
    'shared reach target preserves the simulation formula',
    Math.abs(fixedCoverageTarget(g, d.id) - Math.min(expected, researchModifiers(g.researchDone).coverageCeiling)) <
      0.000001,
  );
  const gain = reachGain(g, d.id, 'pop');
  check('connected POP projects incremental homes', gain.homes > 0 && gain.after > gain.before);
  check('non-serving equipment does not create fixed reach', reachGain(g, d.id, 'datacenter').homes === 0);
  const dark = { ...g, nodes: g.nodes.map((n) => (n.id === pop.id ? { ...n, down: true } : n)) };
  check('isolated upgrades promise no new reach', reachGain(dark, d.id, 'pop', pop.id).homes === 0);
  const saturated = {
    ...g,
    nodes: [...g.nodes, ...Array.from({ length: 4 }, (_, i) => ({ ...pop, id: 'full' + i, kind: 'pop' as const }))],
    links: [
      ...g.links,
      ...Array.from({ length: 4 }, (_, i) => ({ ...g.links[0], id: 'full-link' + i, aId: core.id, bId: 'full' + i })),
    ],
  };
  check('coverage ceiling prevents inflated reach claims', reachGain(saturated, d.id, 'pop').homes === 0);
  const original = JSON.stringify(g);
  const cut = g.links[0];
  const drill = failureDrill(g, { type: 'link', id: cut.id })!;
  check('failure drill does not mutate real infrastructure or finance', JSON.stringify(g) === original);
  check(
    'a primary cut exposes downstream sites',
    drill.lostSites.some((n) => n.id === pop.id),
  );
  check('a primary cut reduces residential delivery', drill.lostGbps > 0 && drill.after.served < drill.before.served);
  check(
    'unknown and already failed targets are rejected',
    failureDrill(g, { type: 'node', id: 'missing' }) === null &&
      failureDrill(dark, { type: 'node', id: pop.id }) === null,
  );
  const cell = d.cells.find((c) => !g.nodes.some((n) => n.gx === c.gx && n.gy === c.gy))!;
  const expanded = projectBlueprint(g, [
    { type: 'node', id: 'extra-pop', kind: 'pop', gx: cell.gx, gy: cell.gy },
    { type: 'link', id: 'extra-feed', aId: core.id, bId: 'extra-pop' },
  ]).state;
  check('plan reach matches its connected topology', networkReachGain(g, expanded) === gain.homes);
  const protectedGame = buildBackupRoute(expanded, pop.id)!;
  const safe = failureDrill(protectedGame, { type: 'link', id: cut.id })!;
  check(
    'a real backup avoids disconnection in the drill',
    !safe.lostSites.some((n) => n.id === pop.id) && safe.lostGbps < 0.00001,
  );
  const toast = useGame.getState().toast;
  useGame.setState({ game: g, planning: false, drillTarget: null, toast: () => undefined });
  useGame.getState().beginFailureDrill({ type: 'link', id: cut.id });
  useGame.getState().setSpeed(4);
  useGame.getState().tick();
  useGame.getState().placeNode('pop', cell.gx, cell.gy);
  check(
    'drills freeze time and block construction',
    useGame.getState().game!.minutes === g.minutes &&
      useGame.getState().game!.money === g.money &&
      useGame.getState().game!.nodes.length === g.nodes.length,
  );
  useGame.getState().endFailureDrill();
  check(
    'ending the drill restores ordinary play without a cut',
    useGame.getState().drillTarget === null && !useGame.getState().game!.links[0].down,
  );
  useGame.setState({ toast });
}

group('dispatch decisions and travel-aware restoration');
{
  const base = newGame(9412);
  const site = base.nodes.find((n) => n.kind === 'pop')!;
  const fault: Incident = {
    id: 'crew-choice',
    kind: 'router_failure',
    title: 'Crew choice',
    description: 'Router fault',
    targetId: site.id,
    targetType: 'node',
    districtId: site.districtId,
    startedAt: base.minutes,
    repairMinutesLeft: null,
    repairTotalMinutes: 100,
    repairBaseMinutes: 100,
    assignedTechId: null,
    affected: 800,
    resolved: false,
    degrade: false,
  };
  const far = { ...base.technicians[0], id: 'far-expert', skill: 5, gx: site.gx + 10, gy: site.gy };
  const near = { ...base.technicians[1], id: 'near-trainee', skill: 1, gx: site.gx, gy: site.gy };
  const g: GameState = {
    ...base,
    money: 100000,
    incidents: [fault],
    technicians: [far, near],
    nodes: base.nodes.map((n) => (n.id === site.id ? { ...n, down: true } : n)),
  };
  const quote = dispatchCandidates(g, fault, 'normal');
  check(
    'nearby novice beats a distant expert when travel dominates',
    quote[0].technician.id === near.id && quote[0].totalMinutes === 105,
  );
  const skilled = dispatchCandidates({ ...g, technicians: [{ ...far, gx: site.gx }, near] }, fault, 'normal');
  check('skill wins when crews start at the same place', skilled[0].technician.id === far.id);
  const fast = dispatchCandidates(g, fault, 'emergency');
  check(
    'emergency shortens repair without shortening the drive',
    fast[0].travelMinutes === quote[0].travelMinutes && fast[0].workMinutes < quote[0].workMinutes,
  );
  check(
    'crews reserved for maintenance are excluded',
    dispatchCandidates({ ...g, technicians: [{ ...near, maintenanceId: 'planned-work' }] }, fault, 'normal').length ===
      0,
  );
  let repaired = structuredClone(g);
  dispatch(repaired, fault.id, near.id, 'normal');
  let elapsed = 0;
  while (!repaired.incidents[0].resolved && elapsed < 1000) {
    repaired = step(repaired);
    elapsed += 5;
  }
  check(
    'restoration forecast matches actual driving and repair ticks',
    elapsed === quote[0].totalMinutes && !repaired.nodes.find((n) => n.id === site.id)!.down,
    String(elapsed),
  );
  const shortFault = { ...fault, repairTotalMinutes: 40 };
  const shortState = { ...g, incidents: [shortFault] };
  dispatch(shortState, fault.id, far.id, 'normal');
  check(
    'short repair preview agrees with the simulation floor',
    repairOptions(shortFault, far.skill).find((o) => o.key === 'normal')!.minutes ===
      shortState.incidents[0].repairMinutesLeft,
  );
  const low = { ...fault, id: 'low-impact', affected: 10, startedAt: base.minutes - 60, targetId: base.nodes[0].id };
  const old = { ...fault, id: 'older-impact', startedAt: base.minutes - 10 };
  check(
    'triage uses impact then age without mutating the incident list',
    pendingIncidents({ ...g, incidents: [low, fault, old] })
      .map((i) => i.id)
      .join(',') === 'older-impact,crew-choice,low-impact' && g.incidents[0] === fault,
  );
  const auto = step({
    ...g,
    autoDispatch: true,
    researchDone: ['auto_dispatch'],
    incidents: [low, fault],
    technicians: [near],
  });
  check(
    'automatic dispatch sends the available crew to the higher-impact fault',
    auto.incidents.find((i) => i.id === fault.id)!.assignedTechId === near.id &&
      auto.incidents.find((i) => i.id === low.id)!.assignedTechId === null,
  );
  const autoBoth = step({ ...g, autoDispatch: true, researchDone: ['auto_dispatch'] });
  check(
    'automatic dispatch chooses the quickest restoration instead of array order',
    autoBoth.incidents[0].assignedTechId === near.id,
  );
  const toast = useGame.getState().toast;
  useGame.setState({ game: structuredClone(g), planning: false, drillTarget: null, toast: () => {} });
  useGame.getState().dispatchTech(fault.id, 'normal', far.id);
  check(
    'manual crew choice overrides the fastest recommendation',
    useGame.getState().game!.incidents[0].assignedTechId === far.id,
  );
  useGame.setState({ game: structuredClone(g) });
  useGame.getState().dispatchTech(fault.id, 'normal', 'missing-crew');
  check(
    'stale crew selection cannot silently dispatch or charge another crew',
    useGame.getState().game!.money === g.money && useGame.getState().game!.incidents[0].assignedTechId === null,
  );
  useGame.setState({ game: { ...structuredClone(g), money: 0 } });
  useGame.getState().dispatchTech(fault.id, 'emergency', near.id);
  check(
    'emergency dispatch still requires upfront cash',
    useGame.getState().game!.incidents[0].assignedTechId === null && useGame.getState().game!.money === 0,
  );
  useGame.setState({ toast });
}

group('district starter networks');
{
  const g = { ...newGame(9502), money: 20000000 };
  const district = g.districts.find((d) => !d.unlocked)!;
  const before = JSON.stringify(g);
  const access = expansionQuote(g, district.id, 'access')!;
  const pop = expansionQuote(g, district.id, 'pop')!;
  check(
    'starter choices trade lower cost for wider reach',
    !access.issue && !pop.issue && access.total < pop.total && access.homes < pop.homes,
  );
  check(
    'starter quote includes licence, site and exact fibre cost',
    access.total ===
      district.entryCost + nodePlacementCost(g, 'access') + Math.round(access.placement!.distance * 28000),
  );
  const routes = computeRoutes(g);
  const freeCells = district.cells.filter((c) => !g.nodes.some((n) => n.gx === c.gx && n.gy === c.gy));
  const shortest = Math.min(
    ...freeCells.flatMap((c) => g.nodes.filter((n) => routes[n.id]).map((n) => Math.hypot(c.gx - n.gx, c.gy - n.gy))),
  );
  check(
    'starter construction picks the shortest legal live connection',
    Math.abs(shortest - access.placement!.distance) < 1e-9,
  );
  const launched = launchDistrict(g, district.id, 'access')!;
  const site = launched.nodes[launched.nodes.length - 1];
  check(
    'launch licenses and connects the new district atomically',
    launched.districts.find((d) => d.id === district.id)!.unlocked &&
      !!computeRoutes(launched)[site.id] &&
      launched.links.length === g.links.length + 1 &&
      launched.money === g.money - access.total,
  );
  const mods = researchModifiers(g.researchDone);
  check(
    'quoted monthly upkeep equals the actual simulation increase',
    Math.abs(monthlyBreakdown(launched, mods).totalCost - monthlyBreakdown(g, mods).totalCost - access.monthlyCost) <
      1e-8,
  );
  check(
    'commissioning never grants instant subscribers',
    launched.buildings === g.buildings && launched.packages === g.packages,
  );
  check('launch and quote leave the original state untouched', JSON.stringify(g) === before);
  const poor = { ...g, money: access.total - 1 };
  check(
    'one dollar short rejects the entire launch',
    expansionQuote(poor, district.id, 'access')!.fundingGap === 1 &&
      launchDistrict(poor, district.id, 'access') === null &&
      !poor.districts.find((d) => d.id === district.id)!.unlocked,
  );
  check(
    'double submission cannot buy the same starter network twice',
    launchDistrict(launched, district.id, 'pop') === null,
  );
  check(
    'a down core blocks a misleading connected launch',
    launchDistrict(
      { ...g, nodes: g.nodes.map((n) => (n.kind === 'core' ? { ...n, down: true } : n)) },
      district.id,
      'access',
    ) === null,
  );
  const licensed = { ...g, districts: g.districts.map((d) => (d.id === district.id ? { ...d, unlocked: true } : d)) };
  check(
    'an already owned licence is not charged again',
    expansionQuote(licensed, district.id, 'access')!.total === access.total - district.entryCost,
  );
  check(
    'GPON discounts also apply to district starter construction',
    expansionQuote({ ...g, researchDone: [...g.researchDone, 'gpon'] }, district.id, 'access')!.siteCost ===
      Math.round(130000 * 0.75),
  );
  check(
    'launch ledger and assets survive strict save validation',
    !!migrate(JSON.parse(JSON.stringify(launched)), SAVE_VERSION),
  );
  const progress = expansionProgress(launched, district.id);
  check(
    'district checklist reflects the real new network',
    progress.connected && !progress.protected && progress.customers === 0,
  );
  const entries = launched.ledger.filter((e) => !g.ledger.some((old) => old.id === e.id));
  check(
    'launch ledger accounts for every dollar exactly once',
    Math.abs(entries.reduce((sum, e) => sum + e.amount, 0) + access.total) < 1e-8 &&
      entries.filter((e) => e.category === 'district_licence').length === 1,
  );
  const toast = useGame.getState().toast;
  useGame.setState({ game: g, planning: true, drillTarget: null, toast: () => {} });
  useGame.getState().launchDistrict(district.id, 'access');
  check('starter launches cannot interrupt an uncommitted blueprint', useGame.getState().game === g);
  useGame.setState({ planning: false });
  useGame.getState().launchDistrict(district.id, 'access');
  check(
    'completed launch opens its district and pauses for inspection',
    useGame.getState().screen === 'map' &&
      useGame.getState().selection?.id === district.id &&
      useGame.getState().game!.speed === 0 &&
      useGame.getState().game!.nodes.length === g.nodes.length + 1,
  );
  useGame.setState({ toast });
}

group('company identity and actionable operator journey');
{
  const g = newGame(9601);
  const original = JSON.stringify(g);
  const renamed = updateCompanyIdentity(g, '  Şehir Işığı  ', '🚀')!;
  check(
    'identity changes preserve finances, assets and earned standing',
    renamed.companyName === 'Şehir Işığı' &&
      renamed.logo === '🚀' &&
      renamed.money === g.money &&
      renamed.nodes === g.nodes &&
      renamed.rank === g.rank &&
      renamed.ledger === g.ledger &&
      JSON.stringify(g) === original,
  );
  check(
    'empty, multiline and oversized identities are rejected',
    ['', '   ', 'Bad\nName', 'a'.repeat(241)].every((name) => updateCompanyIdentity(g, name, g.logo) === null),
  );
  check('identity changes reject an unknown new emblem', updateCompanyIdentity(g, 'Valid', 'unknown-logo') === null);
  const imported = { ...g, logo: 'Custom' };
  check(
    'an existing imported emblem can be retained when renaming',
    updateCompanyIdentity(imported, 'New name', 'Custom')?.logo === 'Custom',
  );
  check(
    'every offered emblem survives strict game-save validation',
    COMPANY_EMBLEMS.every(
      (e) => !!migrate(JSON.parse(JSON.stringify(updateCompanyIdentity(g, 'Identity Test', e.symbol))), SAVE_VERSION),
    ),
  );
  const centreRequirement = RANKS[3].requirements.find((r) => r.label.includes('data centre'))!;
  check(
    'data-centre guidance opens prerequisite research before construction',
    centreRequirement.action({ ...g, researchDone: [] }).screen === 'research' &&
      centreRequirement.action({ ...g, researchDone: ['edge_compute'] }).tool === 'datacenter',
  );
  const actions = RANKS.flatMap((r) => r.requirements.map((req) => req.action(g)));
  check(
    'all rank requirements offer an explicit supported destination',
    actions.every((a) => ['map', 'company', 'research'].includes(a.screen) && a.label.length > 0),
  );
  useGame.setState({ game: g });
  check(
    'the identity store action rejects invalid input without changing the game',
    !useGame.getState().updateIdentity('', '🚀') && useGame.getState().game === g,
  );
  check(
    'the identity store action applies the validated brand',
    useGame.getState().updateIdentity('New Horizon', '🚀') && useGame.getState().game!.companyName === 'New Horizon',
  );
}

group('smart pause catches events between accelerated steps');
{
  const g = newGame(9701);
  const site = g.nodes[0];
  const incident: Incident = {
    id: 'smart-fault',
    kind: 'router_failure',
    title: 'Router failure',
    description: '',
    targetId: site.id,
    targetType: 'node',
    districtId: site.districtId,
    startedAt: g.minutes + 5,
    repairMinutesLeft: null,
    repairTotalMinutes: 100,
    repairBaseMinutes: 100,
    assignedTechId: null,
    affected: 200,
    resolved: false,
    degrade: false,
  };
  const offer: ContractOffer = {
    id: 'smart-offer',
    clientName: 'Smart Client',
    districtId: site.districtId,
    buildingId: g.buildings.find((b) => b.segment === 'business')!.id,
    bandwidthGbps: 1,
    monthlyRevenue: 1000,
    slaPercent: 99,
    termMonths: 12,
    segment: 'business',
    requiresRedundancy: false,
    expiresAt: g.minutes + 1000,
    signingBonus: 500,
  };
  const after = {
    ...g,
    incidents: [...g.incidents, incident],
    offers: [...g.offers, offer],
    researchDone: [...g.researchDone, 'ftth'],
    rank: g.rank + 1,
  };
  const enabled = { ...DEFAULT_SMART_PAUSE, incidents: true, offers: true, research: true, promotion: true };
  check(
    'every simultaneous enabled event is retained in the pause notice',
    smartPauseEvents(g, after, enabled)
      .map((e) => e.kind)
      .join(',') === 'incidents,offers,research,promotion',
  );
  check(
    'disabled preferences preserve uninterrupted play',
    smartPauseEvents(g, after, DEFAULT_SMART_PAUSE).length === 0,
  );
  check('unchanged active events never retrigger a pause', smartPauseEvents(after, after, enabled).length === 0);
  check(
    'resolved faults and expired offers do not pause the game',
    smartPauseEvents(
      g,
      { ...g, incidents: [{ ...incident, resolved: true }], offers: [{ ...offer, expiresAt: g.minutes }] },
      enabled,
    ).length === 0,
  );
  check(
    'game over takes precedence over smart pause',
    smartPauseEvents(g, { ...after, gameOver: { reason: 'Test closure', at: g.minutes } }, enabled).length === 0,
  );
  check(
    'invalid stored preferences are ignored without enabling a category',
    !parseSmartPausePreferences({ research: 'true', incidents: 1 }).research &&
      !parseSmartPausePreferences([]).incidents,
  );
  localStorage.setItem(SMART_PAUSE_KEY, 'broken json');
  check(
    'corrupt preference storage falls back to disabled defaults',
    JSON.stringify(loadSmartPausePreferences()) === JSON.stringify(DEFAULT_SMART_PAUSE),
  );
  const previousPrefs = useGame.getState().smartPause;
  const fast: GameState = { ...g, speed: 4, researchDone: [], researchActive: { id: 'ftth', daysLeft: 0.0001 } };
  useGame.setState({
    game: fast,
    planning: false,
    drillTarget: null,
    smartPauseNotice: null,
    smartPause: { ...DEFAULT_SMART_PAUSE, research: true },
  });
  useGame.getState().tick();
  const paused = useGame.getState();
  check(
    '4x stops immediately after the first five-minute event step',
    paused.game!.minutes === fast.minutes + 5 && paused.game!.speed === 0 && paused.smartPauseNotice?.resumeSpeed === 4,
  );
  check(
    'the triggering research completion is committed before stopping',
    paused.game!.researchDone.includes('ftth') && paused.smartPauseNotice?.events[0].kind === 'research',
  );
  useGame.getState().setSpeed(4);
  useGame.getState().tick();
  check(
    'resume clears the notice and advances without repeating the same event',
    useGame.getState().smartPauseNotice === null &&
      useGame.getState().game!.minutes === fast.minutes + 25 &&
      useGame.getState().game!.speed === 4,
  );
  useGame.setState({ game: fast, smartPause: { ...DEFAULT_SMART_PAUSE } });
  useGame.getState().tick();
  check(
    'disabled smart pause completes all four simulation steps',
    useGame.getState().game!.minutes === fast.minutes + 20 && useGame.getState().game!.speed === 4,
  );
  useGame.setState({ game: paused.game, smartPauseNotice: paused.smartPauseNotice });
  useGame.getState().dismissSmartPause();
  check(
    'dismissing the notice never resumes time',
    useGame.getState().game!.speed === 0 && useGame.getState().smartPauseNotice === null,
  );
  useGame.getState().setSmartPause('promotion', true);
  check('preferences persist independently of save slots', loadSmartPausePreferences().promotion);
  useGame.setState({ smartPause: previousPrefs, smartPauseNotice: null });
  localStorage.removeItem(SMART_PAUSE_KEY);
}

group('competitive city procurement and verified delivery');
{
  const g = { ...newGame(9801), money: 1000000, reputation: 100 };
  const tender = g.procurement.tenders[0];
  const price = Math.ceil(tender.budget * 0.65);
  const original = JSON.stringify(g);
  check(
    'a new city starts with a published school infrastructure tender',
    tender.kind === 'schools' && tender.status === 'open' && tender.rivals.length > 0,
  );
  check(
    'price and reputation both affect the published award score',
    bidScore(tender.budget, price, 100) > bidScore(tender.budget, tender.budget, 100) &&
      bidScore(tender.budget, price, 100) > bidScore(tender.budget, price, 20),
  );
  const submitted = submitTenderBid(g, tender.id, price)!;
  check(
    'a sealed bid holds a real refundable performance bond atomically',
    submitted.money === g.money - bidBond(price) &&
      submitted.procurement.tenders[0].bond === bidBond(price) &&
      JSON.stringify(g) === original,
  );
  const revised = submitTenderBid(submitted, tender.id, tender.budget)!;
  check('revising a bid charges only the bond difference', revised.money === g.money - bidBond(tender.budget));
  const withdrawn = withdrawTenderBid(revised, tender.id)!;
  check(
    'withdrawing before closing refunds the full bond once',
    withdrawn.money === g.money &&
      withdrawn.procurement.tenders[0].playerBid === null &&
      withdrawTenderBid(withdrawn, tender.id) === null,
  );
  check(
    'unfunded, out-of-range and non-finite bids are rejected',
    submitTenderBid({ ...g, money: 0 }, tender.id, price) === null &&
      submitTenderBid(g, tender.id, price - 1) === null &&
      submitTenderBid(g, tender.id, NaN) === null,
  );
  check(
    'the closing time rejects late bid edits and withdrawal',
    submitTenderBid({ ...submitted, minutes: tender.closesAt }, tender.id, price) === null &&
      withdrawTenderBid({ ...submitted, minutes: tender.closesAt }, tender.id) === null,
  );
  const award = structuredClone(submitted);
  award.minutes = tender.closesAt;
  tickProcurement(award, 0);
  check(
    'a winning sealed bid enters delivery without paying the reward early',
    award.procurement.tenders[0].status === 'delivery' &&
      award.money === submitted.money &&
      award.procurement.tenders[0].qualifyingMinutes === 0,
  );
  check(
    'an awarded project retains its performance bond across save validation',
    !!migrate(JSON.parse(JSON.stringify(award)), SAVE_VERSION),
  );
  const poorBid = submitTenderBid({ ...g, reputation: 0 }, tender.id, tender.budget)!;
  poorBid.minutes = tender.closesAt;
  tickProcurement(poorBid, 0);
  check(
    'rivals can win and unsuccessful bidders recover their bond',
    poorBid.procurement.tenders[0].status === 'lost' &&
      poorBid.money === g.money &&
      poorBid.procurement.tenders[0].winnerId !== 'player',
  );
  const district = award.districts.find((d) => d.id === tender.districtId)!;
  const core = award.nodes.find((n) => n.kind === 'core')!;
  const cell = district.cells.find((c) => !award.nodes.some((n) => n.gx === c.gx && n.gy === c.gy))!;
  const built = projectBlueprint(award, [
    { type: 'node', id: 'tender-access', kind: 'access', gx: cell.gx, gy: cell.gy },
    { type: 'link', id: 'tender-span', aId: core.id, bId: 'tender-access' },
  ]).state;
  check(
    'real connected infrastructure satisfies the school project specification',
    tenderProgress(built, built.procurement.tenders[0]).ready,
  );
  built.minutes += 5;
  tickProcurement(built, 5);
  check(
    'meeting the specification starts a continuous acceptance timer',
    built.procurement.tenders[0].qualifyingMinutes === 5 && built.procurement.tenders[0].status === 'delivery',
  );
  built.links = built.links.map((l) => (l.id === 'tender-span' ? { ...l, down: true } : l));
  built.minutes += 5;
  tickProcurement(built, 5);
  check('a real service interruption resets the acceptance test', built.procurement.tenders[0].qualifyingMinutes === 0);
  built.links = built.links.map((l) => ({ ...l, down: false }));
  const beforePayment = built.money;
  for (let i = 0; i < 72; i++) {
    built.minutes += 5;
    tickProcurement(built, 5);
  }
  check(
    'six uninterrupted hours settle payment and return the held bond',
    built.procurement.tenders[0].status === 'completed' && built.money === beforePayment + price + bidBond(price),
  );
  const paid = built.money;
  built.minutes += 5;
  tickProcurement(built, 5);
  check(
    'accepted projects cannot pay twice',
    built.money === paid && built.ledger.filter((e) => e.category === 'tender_payment').length === 1,
  );
  check('completed projects remain valid saved games', !!migrate(JSON.parse(JSON.stringify(built)), SAVE_VERSION));
  const failed = structuredClone(award);
  failed.minutes = failed.procurement.tenders[0].dueAt!;
  const cash = failed.money;
  tickProcurement(failed, 5);
  check(
    'missed delivery forfeits the held bond without a second cash charge',
    failed.procurement.tenders[0].status === 'failed' &&
      failed.money === cash &&
      failed.procurement.tenders[0].bond === 0 &&
      failed.reputation === award.reputation - 5,
  );
  check(
    'failed and rival-awarded projects survive strict validation',
    !!migrate(JSON.parse(JSON.stringify(failed)), SAVE_VERSION) &&
      !!migrate(JSON.parse(JSON.stringify(poorBid)), SAVE_VERSION),
  );
  const legacy = JSON.parse(JSON.stringify(g));
  delete legacy.procurement;
  legacy.version = 19;
  const upgraded = migrate(legacy, 19);
  check(
    'version 19 saves gain a fresh procurement schedule without charges',
    !!upgraded &&
      upgraded.money === g.money * 20 &&
      upgraded.procurement.tenders.length === 0 &&
      upgraded.version === SAVE_VERSION,
  );
  for (const bad of [
    { ...g.procurement, tenders: [{ ...tender, bond: 1 }] },
    { ...g.procurement, tenders: [{ ...tender, kind: 'unknown' }] },
    { ...g.procurement, tenders: [{ ...tender, districtId: 'missing' }] },
    { ...g.procurement, tenders: [tender, { ...tender, id: 'another-active' }] },
  ])
    check(
      'malformed procurement state is rejected',
      migrate({ ...JSON.parse(JSON.stringify(g)), procurement: bad }, SAVE_VERSION) === null,
    );
  const later = { ...g, procurement: { ...initialProcurement(g.minutes), sequence: 1 } };
  tickProcurement(later, 0);
  check(
    'later calls introduce independent-path delivery requirements',
    later.procurement.tenders[0].kind === 'emergency' &&
      tenderProgress(later, later.procurement.tenders[0]).requirements.find((r) => r.id === 'protection')!.target === 2,
  );
}

group('district market operations and rival offensives');
{
  const g = newGame(9901);
  g.money = 1000000;
  g.reputation = 60;
  const d = g.districts.find((d) => d.unlocked)!;
  d.coverage = 0.55;
  d.satisfaction = 78;
  g.stats.health = 100;
  const initialOperator = newGame(9902);
  check(
    'a new operator can start a programme at its initial 5% reach',
    !!startMarketOperation(initialOperator, initialOperator.districts.find((d) => d.unlocked)!.id, 'loyalty'),
  );
  const unfunded = structuredClone(g);
  unfunded.competitors[0].cash = 0;
  unfunded.minutes = unfunded.competition.nextMoveAt;
  tickCompetition(unfunded, 5);
  check(
    'an unfunded rival cannot block eligible rivals from making moves',
    unfunded.competition.moves.length === 1 && unfunded.competition.moves[0].rivalId !== unfunded.competitors[0].id,
  );
  const cost = operationCost(g, d.id, 'switchers');
  const launched = startMarketOperation(g, d.id, 'switchers')!;
  check(
    'commercial launch charges once without granting instant subscribers',
    launched.money === g.money - cost &&
      launched.buildings === g.buildings &&
      g.competition.operations.length === 0 &&
      launched.ledger[0].category === 'market_operation',
  );
  check(
    'switching assistance changes real local pull and the growth forecast',
    districtPull(launched, d).player > districtPull(g, d).player &&
      customerGrowthSnapshot(launched, d).projectedDailyDelta > customerGrowthSnapshot(g, d).projectedDailyDelta,
  );
  check(
    'operations reject duplicate, unlicensed and unaffordable launches',
    !startMarketOperation(launched, d.id, 'loyalty') &&
      !startMarketOperation(g, g.districts.find((d) => !d.unlocked)!.id, 'loyalty') &&
      !startMarketOperation({ ...g, money: 0 }, d.id, 'switchers'),
  );
  const cancelled = cancelMarketOperation(launched, launched.competition.operations[0].id)!;
  check(
    'ending a campaign releases capacity without a refund or lingering boost',
    cancelled.money === launched.money &&
      cancelled.competition.operations.length === 0 &&
      marketEffects(cancelled, d.id).appeal === 1 &&
      cancelled.competition.history[0].cancelled &&
      !cancelMarketOperation(cancelled, launched.competition.operations[0].id),
  );
  const loyal = startMarketOperation(g, d.id, 'loyalty')!;
  check(
    'loyalty reduces loss rather than creating customers',
    marketEffects(loyal, d.id).retention === 0.55 && loyal.buildings === g.buildings,
  );
  const promise = startMarketOperation(g, d.id, 'service')!;
  check(
    'service appeal is conditional on actual district service',
    servicePromiseReady(promise, d.id) &&
      marketEffects(promise, d.id).appeal === 1.2 &&
      marketEffects(
        { ...promise, stats: { ...promise.stats, outages: { ...promise.stats.outages, [d.id]: true } } },
        d.id,
      ).appeal === 1,
  );
  const working = structuredClone(promise);
  working.competition.nextMoveAt = 1e9;
  const oldOp = working.competition.operations[0];
  working.minutes += 5;
  tickCompetition(working, 5);
  check(
    'quality time accrues through simulation without mutating prior state',
    working.competition.operations[0].qualifiedMinutes === 5 && oldOp.qualifiedMinutes === 0,
  );
  working.stats.health = 70;
  working.minutes += 5;
  tickCompetition(working, 5);
  check('poor service earns no qualified time', working.competition.operations[0].qualifiedMinutes === 5);
  working.stats.health = 100;
  while (working.minutes < working.competition.operations[0]?.endsAt) {
    working.minutes += 5;
    tickCompetition(working, 5);
  }
  check(
    'kept service promise awards reputation exactly once',
    working.reputation === 63 &&
      working.competition.history[0].reputationDelta === 3 &&
      working.competition.operations.length === 0,
  );
  tickCompetition(working, 5);
  check('settled operation cannot award twice', working.reputation === 63 && working.competition.history.length === 1);
  const broken = structuredClone(promise);
  broken.minutes = broken.competition.operations[0].endsAt;
  broken.stats.health = 50;
  tickCompetition(broken, 5);
  check(
    'missed promise costs reputation without a second cash charge',
    broken.reputation === 57 && broken.money === promise.money && broken.competition.history[0].reputationDelta === -3,
  );
  const early = cancelMarketOperation(promise, promise.competition.operations[0].id)!;
  check(
    'early cancellation cannot escape a service commitment',
    early.reputation === 57 && early.competition.history[0].cancelled,
  );
  const capped = structuredClone(g);
  capped.districts = capped.districts.map((d) => ({ ...d, unlocked: true, coverage: 0.5 }));
  let three = capped;
  for (const district of capped.districts.slice(0, 3)) three = startMarketOperation(three, district.id, 'loyalty')!;
  check(
    'commercial capacity is capped at three concurrent districts',
    three.competition.operations.length === 3 && !startMarketOperation(three, three.districts[3].id, 'switchers'),
  );
  const attacked = structuredClone(g);
  attacked.minutes = attacked.competition.nextMoveAt;
  const cash = attacked.competitors[0].cash;
  const beforePull = districtPull(
    attacked,
    attacked.districts.find((x) => x.id === d.id)!,
  );
  tickCompetition(attacked, 5, true);
  const move = attacked.competition.moves[0];
  check(
    'rival offensive spends real rival cash and targets an established district',
    !!move && move.districtId === d.id && attacked.competitors[0].cash === cash - RIVAL_MOVES.discount.cost,
  );
  check(
    'local discount increases rival pressure in the shared market model',
    rivalMarketEffects(attacked, move.rivalId, d.id).price === 0.85 &&
      districtPull(attacked, d).rivals[0].pull > beforePull.rivals[0].pull,
  );
  const elsewhere = attacked.districts.find((x) => x.id !== d.id)!;
  check(
    'rival discount never leaks into other districts',
    rivalMarketEffects(attacked, move.rivalId, elsewhere.id).price === 1,
  );
  attacked.competition.nextMoveAt = 1e9;
  attacked.minutes = move.endsAt;
  tickCompetition(attacked, 5);
  check(
    'expired rival discounts release their market effect',
    attacked.competition.moves.length === 0 && rivalMarketEffects(attacked, move.rivalId, d.id).price === 1,
  );
  const rollout = structuredClone(g);
  rollout.competition.sequence = 2;
  rollout.minutes = rollout.competition.nextMoveAt;
  const coverage = rollout.competitors[2].coverage[d.id] ?? 0;
  tickCompetition(rollout, 5);
  check(
    'rival fibre offensive builds permanent coverage',
    rollout.competition.moves[0]?.kind === 'rollout' &&
      Math.abs(rollout.competitors[2].coverage[d.id] - Math.min(0.95, coverage + 0.08)) < 1e-9,
  );
  const acquired = {
    ...rollout,
    competitors: rollout.competitors.filter((c) => c.id !== rollout.competition.moves[0].rivalId),
  };
  tickCompetition(acquired, 5);
  check('an acquired rival cannot keep an active offensive', acquired.competition.moves.length === 0);
  const observed = structuredClone(g);
  for (let day = 1; day <= 35; day++) {
    observed.minutes = day * MINUTES_PER_DAY;
    tickCompetition(observed, 5, true);
    tickCompetition(observed, 0, true);
  }
  check(
    'daily market observations are unique and bounded to 30 days',
    observed.competition.snapshots.length === 30 &&
      new Set(observed.competition.snapshots.map((p) => p.at)).size === 30,
  );
  check(
    'active, completed and cancelled market states survive save validation',
    [launched, working, broken, early, observed].every(
      (state) => !!migrate(JSON.parse(JSON.stringify(state)), SAVE_VERSION),
    ),
  );
  const oldSave = JSON.parse(JSON.stringify(g));
  delete oldSave.competition;
  oldSave.version = 20;
  const migrated = migrate(oldSave, 20);
  check(
    'version 20 networks migrate without buying any operation',
    !!migrated &&
      migrated.competition.operations.length === 0 &&
      migrated.money === g.money * 20 &&
      migrated.competition.nextMoveAt === g.minutes + 2 * MINUTES_PER_DAY,
  );
  const bad = JSON.parse(JSON.stringify(launched));
  bad.competition.operations[0].districtId = 'missing';
  check('invalid market district references are rejected', !migrate(bad, SAVE_VERSION));
  const duplicate = JSON.parse(JSON.stringify(launched));
  duplicate.competition.operations.push({ ...duplicate.competition.operations[0], id: 'another' });
  check('duplicate district operations are rejected on load', !migrate(duplicate, SAVE_VERSION));
  const pref = { ...DEFAULT_SMART_PAUSE, market: true };
  const eventState = structuredClone(g);
  eventState.minutes = eventState.competition.nextMoveAt;
  tickCompetition(eventState, 5);
  check(
    'smart pause reports new rival moves and completed player operations',
    smartPauseEvents(g, eventState, pref).some((e) => e.kind === 'market') &&
      smartPauseEvents(promise, working, pref).some((e) => e.kind === 'market'),
  );
}
group('energy tariffs, carbon levy and on-site generation');
{
  const g = newGame(7311);
  check('a new operator starts on the spot tariff', g.energy.plan === 'spot' && g.energy.spotIndex === 1);
  check('nothing generates its own power yet', g.energy.solarNodeIds.length === 0 && g.energy.leviesPaid === 0);

  // The wholesale index wanders but is bounded, so power can never price to zero or run away.
  let walk = { ...g };
  let low = Infinity;
  let high = -Infinity;
  for (let month = 0; month < 240; month++) {
    walk = { ...walk, minutes: walk.minutes + MINUTES_PER_MONTH };
    tickEnergyMonth(walk, makeRng(month + 1), 100);
    low = Math.min(low, walk.energy.spotIndex);
    high = Math.max(high, walk.energy.spotIndex);
  }
  check(
    'the wholesale index stays inside its band',
    low >= ENERGY.spotFloor && high <= ENERGY.spotCeiling,
    `${low.toFixed(2)}..${high.toFixed(2)}`,
  );
  check('the index history is capped at two years', walk.energy.history.length === 24);

  const fixed = setEnergyPlan({ ...g, energy: { ...g.energy, spotIndex: 0.9 } }, 'fixed')!;
  check(
    'a fixed contract locks the signing index',
    fixed.energy.fixedIndex === 0.9 && fixed.energy.fixedUntil !== null,
  );
  const spiked = { ...fixed, energy: { ...fixed.energy, spotIndex: 1.8 } };
  check(
    'a locked contract ignores a later spike',
    Math.abs(energyPriceIndex(spiked) - 0.9 * ENERGY.fixedPremium) < 1e-9,
    `${energyPriceIndex(spiked)}`,
  );
  check('leaving a locked contract early is charged', fixedExitFee(spiked) > 0);
  const escaped = setEnergyPlan(spiked, 'spot')!;
  check('the exit fee leaves the treasury', escaped.money < spiked.money && escaped.energy.fixedUntil === null);

  const green = setEnergyPlan(g, 'green')!;
  check('green supply costs more per kW', energyPriceIndex(green) > energyPriceIndex(g));
  const greenLevy = { ...green, minutes: green.energy.nextLevyAt };
  const greenCash = greenLevy.money;
  tickEnergyMonth(greenLevy, makeRng(4), 500);
  check(
    'a green operator is never charged the levy',
    greenLevy.money === greenCash && greenLevy.energy.leviesPaid === 0,
  );

  const dirty = { ...g, minutes: g.energy.nextLevyAt };
  const dirtyCash = dirty.money;
  tickEnergyMonth(dirty, makeRng(4), 500);
  check('everyone else pays the carbon levy', dirty.money < dirtyCash && dirty.energy.leviesPaid > 0);
  check('the levy is rescheduled, not repeated', dirty.energy.nextLevyAt > g.energy.nextLevyAt);

  const site = g.nodes.find((n) => n.kind === 'core')!;
  check('generation needs its research first', buildSolar(g, site.id, false) === null);
  const fitted = buildSolar({ ...g, money: 100000000 }, site.id, true)!;
  check('generation is paid for and recorded', fitted.money < 100000000 && hasSolar(fitted, site.id));
  check(
    'a fitted site draws less from the grid',
    siteDrawKw(fitted, site) < siteDrawKw(g, site),
    `${siteDrawKw(fitted, site)} < ${siteDrawKw(g, site)}`,
  );
  check('the same site cannot be fitted twice', buildSolar(fitted, site.id, true) === null);
  check(
    'a cheaper bill follows the lower draw',
    monthlyBreakdown(fitted, researchModifiers(fitted.researchDone)).costPower <
      monthlyBreakdown(g, researchModifiers(g.researchDone)).costPower,
  );

  const legacy = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
  delete legacy.energy;
  legacy.version = 22;
  const migrated = migrate(legacy, 22);
  check(
    'version 22 networks migrate onto the spot tariff without a charge',
    !!migrated &&
      migrated.energy.plan === 'spot' &&
      migrated.money === g.money &&
      migrated.energy.solarNodeIds.length === 0,
  );
  check('energy state survives a save round trip', !!migrate(JSON.parse(JSON.stringify(fitted)), SAVE_VERSION));
  const broken = JSON.parse(JSON.stringify(g));
  broken.energy.plan = 'nuclear';
  check('an unknown tariff is rejected on load', migrate(broken, SAVE_VERSION) === null);
}

group('energy investment previews match commissioned costs');
{
  const base = newGame(7312);
  const dc = { ...base.nodes[0], id: 'quote-dc', kind: 'datacenter' as const, tier: 2 };
  const g: GameState = { ...base, money: 100000000, nodes: [...base.nodes, dc], dataCenterModes: { [dc.id]: 'cloud' } };
  const snapshot = JSON.stringify(g);
  const bill = monthlyBreakdown(g, researchModifiers(g.researchDone)).costPower;
  check('preview includes the active data centre workload', Math.abs(operatingPowerBill(g) - bill) < 1e-6);
  const quote = solarQuote(g, dc.id)!;
  const built = buildSolar(g, dc.id, true)!;
  const actualSaving = bill - monthlyBreakdown(built, researchModifiers(built.researchDone)).costPower;
  check('solar saving matches the actual bill reduction', Math.abs(quote.monthlySaving - actualSaving) < 1e-6);
  check('solar cash preview matches the purchase', quote.cashAfter === built.money);
  check(
    'solar payback recovers the capital through electricity alone',
    Math.abs(quote.paybackMonths! * actualSaving - quote.cost) < 1e-6,
  );
  check(
    'fitted sites report savings without another capital deduction',
    solarQuote(built, dc.id)!.cashAfter === built.money &&
      Math.abs(solarQuote(built, dc.id)!.monthlySaving - actualSaving) < 1e-6,
  );
  check('missing sites cannot be quoted', solarQuote(g, 'missing') === null);
  const fixed = setEnergyPlan(g, 'fixed')!;
  const spiked = { ...fixed, energy: { ...fixed.energy, spotIndex: 1.8 } };
  const keep = tariffQuote(spiked, 'fixed');
  check(
    'current fixed quote keeps its signed rate without an exit fee',
    keep.monthly === operatingPowerBill(spiked) && keep.exitFee === 0 && keep.cashAfter === spiked.money,
  );
  const greenQuote = tariffQuote(spiked, 'green');
  const green = setEnergyPlan(spiked, 'green')!;
  check(
    'tariff quote matches the actual exit debit and monthly bill',
    greenQuote.cashAfter === green.money &&
      Math.abs(greenQuote.monthly - monthlyBreakdown(green, researchModifiers(green.researchDone)).costPower) < 1e-6,
  );
  check(
    'renewable quote and levy outlook agree on exemption',
    greenQuote.levy === 0 && levyOutlook(green).amount === 0,
  );
  const levy = levyOutlook(g);
  check(
    'levy is scheduled at the first month close on or after its due date',
    levy.at % MINUTES_PER_MONTH === 0 &&
      levy.at >= g.energy.nextLevyAt &&
      levy.at - MINUTES_PER_MONTH < g.energy.nextLevyAt,
  );
  const settled = { ...g, minutes: levy.at };
  const kw = g.nodes.reduce(
    (sum, node) =>
      sum + siteDrawKw(g, node, node.kind === 'datacenter' ? DATA_CENTER_MODE_CONFIG.cloud.powerMultiplier : 1),
    0,
  );
  tickEnergyMonth(settled, makeRng(5), kw);
  check('estimated carbon levy equals the actual settlement', g.money - settled.money === levy.amount);
  check('generation reduces the next levy estimate', levyOutlook(built).amount < levy.amount);
  const poor = { ...spiked, money: 0 };
  check(
    'unaffordable quotes remain available without authorizing a purchase',
    tariffQuote(poor, 'green').cashAfter < 0 && setEnergyPlan(poor, 'green') === null,
  );
  check('investment previews leave the original game untouched', JSON.stringify(g) === snapshot);
}

group('optional signal routing exercises');
{
  const g = newGame(811);
  let allSolvable = true;
  let allScrambled = true;
  for (const size of [4, 5] as const) {
    for (let seed = 0; seed < 100; seed++) {
      const started = beginSignalTraining({ ...g, rngSeed: seed }, size)!;
      const puzzle = started.signalTraining.active!;
      allScrambled &&= !signalConnection(puzzle).connected;
      allSolvable &&= signalConnection({ ...puzzle, rotations: puzzle.rotations.map(() => 0) }).connected;
      allSolvable &&= signalBoard(puzzle.seed, size).every((mask) => [3, 5, 6, 9, 10, 12].includes(mask));
    }
  }
  check('200 seeded boards contain a valid two-port route', allSolvable);
  check('new exercises always require a player action', allScrambled);
  const started = beginSignalTraining(g, 4)!;
  check(
    'starting is free and pauses company time',
    started.money === g.money && started.speed === 0 && step(started) === started,
  );
  check('an unfinished route cannot claim a reward', finishSignalTraining(started) === null);
  check('an active route cannot be replaced by another start', beginSignalTraining(started, 5) === null);
  check(
    'invalid rotation targets cannot change progress',
    turnSignalTile(started, -1) === null &&
      turnSignalTile(started, 16) === null &&
      turnSignalTile(started, 0.5) === null,
  );
  let solved = started;
  const original = JSON.stringify(started);
  for (let cell = 0; cell < 16; cell++) {
    while (solved.signalTraining.active!.rotations[cell] !== 0) solved = turnSignalTile(solved, cell)!;
  }
  check(
    'rotating real pieces completes the route without changing the original',
    signalConnection(solved.signalTraining.active!).connected && JSON.stringify(started) === original,
  );
  const rewarded = finishSignalTraining(solved)!;
  check(
    'completion credits the advertised grant once',
    rewarded.money === g.money + TRAINING_REWARD &&
      rewarded.researchPoints === g.researchPoints + TRAINING_RESEARCH &&
      finishSignalTraining(rewarded) === null,
  );
  check(
    'grants are separate from operating income',
    rewarded.ledger[0]?.category === 'milestone_reward' &&
      rewarded.monthAccumulator.revenue === g.monthAccumulator.revenue,
  );
  check('completed tiles cannot be rotated', turnSignalTile(rewarded, 0) === null);
  const close = { ...rewarded, signalTraining: { ...rewarded.signalTraining, active: null } };
  const practice = beginSignalTraining(close, 5)!;
  const practiceSolved = {
    ...practice,
    signalTraining: {
      ...practice.signalTraining,
      active: { ...practice.signalTraining.active!, rotations: Array(25).fill(0) },
    },
  };
  const practiced = finishSignalTraining(practiceSolved)!;
  check(
    'replaying on another difficulty cannot farm grants or research',
    practiced.money === rewarded.money &&
      practiced.researchPoints === rewarded.researchPoints &&
      practiced.signalTraining.active!.reward === 0 &&
      practiced.signalTraining.completed === 2,
  );
  const nextWeek = { ...practiceSolved, minutes: rewarded.minutes + TRAINING_COOLDOWN };
  check(
    'another grant becomes available after seven game days',
    finishSignalTraining(nextWeek)!.money === rewarded.money + TRAINING_REWARD,
  );
  const resumed = migrate(JSON.parse(JSON.stringify(solved)), SAVE_VERSION);
  check(
    'saved partial progress preserves every rotation and move',
    !!resumed && JSON.stringify(resumed.signalTraining) === JSON.stringify(solved.signalTraining),
  );
  const claimedSave = migrate(JSON.parse(JSON.stringify(rewarded)), SAVE_VERSION)!;
  check('loading a completed exercise cannot claim twice', !!claimedSave && finishSignalTraining(claimedSave) === null);
  const legacy = JSON.parse(JSON.stringify(g));
  delete legacy.signalTraining;
  legacy.version = 23;
  const migrated = migrate(legacy, 23);
  check(
    'version 23 saves gain optional training without changing their money',
    !!migrated &&
      migrated.money === g.money &&
      migrated.signalTraining.completed === 0 &&
      migrated.signalTraining.active === null,
  );
  const broken = JSON.parse(JSON.stringify(started));
  broken.signalTraining.active.rotations[0] = 4;
  check('malformed cable orientations are rejected on import', migrate(broken, SAVE_VERSION) === null);
  check(
    'malformed dimensions and false completions are rejected',
    !validSignalTraining({ ...started.signalTraining, active: { ...started.signalTraining.active!, size: 10000 } }) &&
      !validSignalTraining({
        ...started.signalTraining,
        completed: 1,
        active: { ...started.signalTraining.active!, completed: true },
      }),
  );
  check(
    'closed companies cannot start an exercise',
    beginSignalTraining({ ...g, gameOver: { at: g.minutes, reason: 'closed' } }, 4) === null,
  );
}

group('Short fault finding exercises');
{
  const g = newGame(811);
  let valid = true;
  for (const size of [4, 5] as const) {
    for (let seed = 0; seed < 100; seed++) {
      const started = beginSignalTraining({ ...g, rngSeed: seed }, size, 'fault')!;
      const puzzle = started.signalTraining.active!;
      const fault = puzzle.rotations.findIndex((r) => r !== 0);
      valid &&= puzzle.rotations.filter(Boolean).length === 1 && fault > 0 && fault < size * size - 1;
      valid &&= !signalConnection(puzzle).connected && signalConnection(puzzle).lit.has(0);
      let solved = started;
      for (let turn = 0; turn < 3; turn++) solved = turnSignalTile(solved, fault)!;
      valid &&= signalConnection(solved.signalTraining.active!).connected;
      const rewarded = finishSignalTraining(solved)!;
      const resumed = migrate(JSON.parse(JSON.stringify(rewarded)), SAVE_VERSION);
      valid &&= resumed?.signalTraining.active?.mode === 'fault' && finishSignalTraining(resumed) === null;
      const practice = beginSignalTraining(
        { ...rewarded, signalTraining: { ...rewarded.signalTraining, active: null } },
        4,
      )!;
      practice.signalTraining.active!.rotations.fill(0);
      valid &&= finishSignalTraining(practice)!.money === rewarded.money;
    }
  }
  check('200 fault exercises retain a lit source, have one repair and share the routing reward cooldown', valid);
  const training = beginSignalTraining(g, 4, 'fault')!.signalTraining;
  check(
    'unknown exercise modes cannot be imported',
    !validSignalTraining({ ...training, active: { ...training.active, mode: 'unknown' } }),
  );
}

group('Research roadmap');
{
  const g = newGame(12345);
  const plan = researchPlan(g)!;
  check(
    'mobile roadmap includes its unpaid prerequisites in order',
    plan.steps.map((r) => r.id).join(',') === 'ftth,fiber10g,mobile_4g',
  );
  const active = researchPlan({ ...g, researchActive: { id: 'ftth', daysLeft: 5 } })!;
  check(
    'paid active research is excluded from the remaining bill',
    active.remainingCost === plan.remainingCost - 800000 && active.next?.id === 'fiber10g' && !active.ready,
  );
  const negative = researchPlan({ ...g, money: -100000, researchPoints: 0 })!;
  check(
    'negative balances and missing points are both accounted for',
    negative.cashMissing === 900000 && negative.pointsMissing === 12 && !negative.ready,
  );
  const mobile = researchPlan({ ...g, researchDone: ['ftth', 'fiber10g', 'mobile_4g'] })!;
  check(
    'after mobile, guidance follows the data centre prerequisite',
    mobile.target.id === 'edge_compute' && mobile.next?.id === 'backbone100g',
  );
  check(
    'a finished technology tree has no stale suggestion',
    researchPlan({ ...g, researchDone: RESEARCH.map((r) => r.id) }) === null,
  );
}

group('Service standard launch window');
{
  const g = { ...newGame(4242), scenarioId: 'service_standard' as const, minutes: MINUTES_PER_DAY * 400 };
  check(
    'Karadeniz gives a growing operator time beyond its old deadline',
    !scenarioStatus(g).expired && scenarioStatus(g).daysLeft === 50,
  );
  check(
    'the extension still requires all four service objectives',
    !scenarioStatus(g).complete && scenarioStatus(g).objectives.length === 4,
  );
  check(
    'an unfinished operator still loses after the extended window',
    scenarioStatus({ ...g, minutes: MINUTES_PER_DAY * 451 }).expired,
  );
}

group('Data centre financial outlook');
{
  const g = newGame(811);
  const node = { ...g.nodes[0], id: 'outlook-dc', kind: 'datacenter' as const, tier: 0, capacityGbps: 10 };
  const s = {
    ...g,
    money: 5000000,
    researchDone: ['ftth', 'fiber10g', 'backbone100g', 'edge_compute'],
    nodes: [...g.nodes, node],
    links: [...g.links, { ...g.links[0], id: 'outlook-link', aId: g.nodes[0].id, bId: node.id, down: false }],
  };
  const before = JSON.stringify(s);
  const quote = dataCenterOutlook(s, node.id)!;
  const expanded = { ...s, nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, tier: 1, capacityGbps: 40 } : n)) };
  const originalMoney = monthlyBreakdown(s, researchModifiers(s.researchDone));
  const nextMoney = monthlyBreakdown(expanded, researchModifiers(s.researchDone));
  check(
    'quoted expansion income matches the actual economy change',
    Math.abs(quote.expansion!.addedNet - (nextMoney.profit - originalMoney.profit)) < 0.001,
  );
  check(
    'payback uses incremental net income and the expansion price',
    quote.expansion!.paybackMonths === 3200000 / quote.expansion!.addedNet && quote.expansion!.cashAfter === 1800000,
  );
  const isolated = dataCenterOutlook({ ...s, links: g.links }, node.id)!;
  check(
    'an isolated centre has costs but no income or promised payback',
    !isolated.connected &&
      isolated.current.revenue === 0 &&
      isolated.current.net < 0 &&
      isolated.expansion!.paybackMonths === null,
  );
  const loss = dataCenterOutlook({ ...s, stats: { ...s.stats, packetLoss: 0.5 } }, node.id)!;
  check(
    'packet loss reduces the quoted hosting revenue',
    Math.abs(loss.current.revenue - quote.current.revenue * 0.875) < 0.001,
  );
  const solar = dataCenterOutlook({ ...s, energy: { ...s.energy, solarNodeIds: [node.id] } }, node.id)!;
  check(
    'solar changes power costs and improves incremental net income',
    solar.current.power < quote.current.power && solar.expansion!.addedNet > quote.expansion!.addedNet,
  );
  const expensive = dataCenterOutlook({ ...s, energy: { ...s.energy, spotIndex: 100 } }, node.id)!;
  check(
    'a loss-making expansion has no payback estimate',
    expensive.expansion!.addedNet < 0 && expensive.expansion!.paybackMonths === null,
  );
  check(
    'unaffordable expansion reports the actual shortfall',
    dataCenterOutlook({ ...s, money: 1000000 }, node.id)?.expansion?.cashMissing === 2200000,
  );
  check(
    'edge research remains necessary for the quoted expansion',
    dataCenterOutlook({ ...s, researchDone: [] }, node.id)?.expansion?.blockedBy === 'research',
  );
  check(
    'maximum-tier centres show current finances without a fictional next stage',
    dataCenterOutlook({ ...s, nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, tier: 3 } : n)) }, node.id)
      ?.expansion === null,
  );
  check('financial quotes do not mutate the game', JSON.stringify(s) === before);
}

group('Per-site hosting revenue');
{
  const g = newGame(811);
  const node = { ...g.nodes[0], kind: 'datacenter' as const, tier: 0 };
  const small = potentialHostingRevenue(g, node);
  check(
    'site revenue retains the small centre quarter share',
    Math.abs(small * 4 - potentialHostingRevenue(g, { ...node, tier: 1 })) < 0.001,
  );
  check(
    'site revenue follows the selected workload',
    Math.abs(potentialHostingRevenue({ ...g, dataCenterModes: { [node.id]: 'cloud' } }, node) - small * 1.45) < 0.001,
  );
  check('other equipment cannot quote hosting income', potentialHostingRevenue(g, g.nodes[0]) === 0);
}

group('Investment energy estimates');
{
  const g = newGame(811);
  for (const solar of [false, true]) {
    const s = { ...g, energy: { ...g.energy, spotIndex: 2.4, solarNodeIds: solar ? [g.nodes[0].id] : [] } };
    const n = s.nodes[0];
    const next = { ...s, nodes: s.nodes.map((x) => (x.id === n.id ? { ...x, tier: x.tier + 1 } : x)) };
    const actual =
      monthlyBreakdown(next, researchModifiers(s.researchDone)).totalCost -
      monthlyBreakdown(s, researchModifiers(s.researchDone)).totalCost;
    check(
      `upgrade energy estimate matches current tariff with solar ${solar}`,
      Math.abs(investmentEstimate(s, n.kind, n.id).monthlyCost - actual) < 0.001,
    );
  }
  const snapshot = JSON.stringify(g);
  investmentEstimate(g, 'datacenter');
  check('investment estimates do not change the game', JSON.stringify(g) === snapshot);
}

group('Staged data centre economics and saves');
{
  const g = newGame(811);
  const d = g.districts.find((d) => d.unlocked)!;
  const cell = d.cells.find((c) => !g.nodes.some((n) => n.gx === c.gx && n.gy === c.gy))!;
  const pilot = {
    ...g.nodes[0],
    id: 'pilot-dc',
    kind: 'datacenter' as const,
    tier: 0,
    capacityGbps: 10,
    districtId: d.id,
    ...cell,
  };
  const small = {
    ...g,
    nodes: [...g.nodes, pilot],
    links: [
      ...g.links,
      {
        id: 'pilot-fibre',
        aId: g.nodes[0].id,
        bId: pilot.id,
        tier: 1,
        capacityGbps: 40,
        trafficGbps: 0,
        down: false,
        length: 1,
        builtAt: g.minutes,
      },
    ],
  };
  const full = {
    ...small,
    nodes: small.nodes.map((n) => (n.id === pilot.id ? { ...n, tier: 1, capacityGbps: 40 } : n)),
  };
  check(
    'a small centre plus its first expansion retains the full site price',
    DATACENTER_PILOT_COST + nodeUpgradeCost('datacenter', 0) === 4400000,
  );
  check(
    'small and full centres provide 10 and 40 Gbps',
    nodeCapacity('datacenter', 0) === 10 && nodeCapacity('datacenter', 1) === 40,
  );
  check(
    'a small centre earns one quarter of full hosting revenue',
    hostingRevenue(small) > 0 && Math.abs(hostingRevenue(small) * 4 - hostingRevenue(full)) < 0.001,
  );
  check('small hosting requires a live connection', hostingRevenue({ ...small, links: g.links }) === 0);
  check(
    'small centres use one quarter of full site electricity',
    siteDrawKw(small, pilot) * 4 === siteDrawKw(full, { ...pilot, tier: 1 }),
  );
  check('small centres retain a nonzero resale and collateral basis', nodeCapitalCost('datacenter', 0) === 1200000);
  const roundTrip = migrate(JSON.parse(JSON.stringify(small)), SAVE_VERSION);
  check('tier-zero data centres survive save loading', roundTrip?.nodes.find((n) => n.id === pilot.id)?.tier === 0);
  const legacy = { ...full, version: 24 };
  const restored = migrate(JSON.parse(JSON.stringify(legacy)), 24);
  check(
    'version 24 full centres retain their capacity and income',
    restored?.nodes.find((n) => n.id === pilot.id)?.tier === 1 && hostingRevenue(restored!) === hostingRevenue(full),
  );
  const invalid = { ...g, nodes: g.nodes.map((n, i) => (i === 0 ? { ...n, tier: 0 } : n)) };
  check(
    'tier zero remains invalid for other equipment',
    migrate(JSON.parse(JSON.stringify(invalid)), SAVE_VERSION) === null,
  );
}

group('Staged data centre construction');
{
  const g = newGame(811);
  g.money = 1200000;
  g.researchDone = ['ftth', 'fiber10g', 'backbone100g'];
  const d = g.districts.find((d) => d.unlocked)!;
  const cell = d.cells.find((c) => !g.nodes.some((n) => n.gx === c.gx && n.gy === c.gy))!;
  const built = projectBlueprint(g, [{ type: 'node', id: 'staged-build', kind: 'datacenter', ...cell }]);
  const objective = scenarioStatus({ ...built.state, scenarioId: 'market_leader' }).objectives.find((o) =>
    o.label.includes('data centre'),
  )!;
  check('a small centre advances but does not complete the campaign objective', objective.progress === 0.25);
  check(
    'the first stage can be built with 100G research for 1.2 million',
    !built.error &&
      built.cost === 1200000 &&
      built.state.nodes.at(-1)?.tier === 0 &&
      built.state.nodes.at(-1)?.capacityGbps === 10,
  );
  check(
    'the capacity lab cannot bypass the expansion research gate',
    !!capacityOptions(built.state).find((n) => n.id === 'staged-build')?.issue,
  );
  const prior = useGame.getState();
  useGame.setState({ game: built.state, toast: () => {} });
  useGame.getState().upgradeNode('staged-build');
  check('store upgrades require edge research', useGame.getState().game === built.state);
  useGame.setState({ game: { ...built.state, money: 3199999, researchDone: [...g.researchDone, 'edge_compute'] } });
  useGame.getState().upgradeNode('staged-build');
  check(
    'an unaffordable expansion leaves money and capacity untouched',
    useGame.getState().game?.money === 3199999 && useGame.getState().game?.nodes.at(-1)?.tier === 0,
  );
  useGame.setState({ game: { ...useGame.getState().game!, money: 3200000 } });
  useGame.getState().upgradeNode('staged-build');
  const expanded = useGame.getState().game!;
  check(
    'expanding completes the data centre objective',
    scenarioStatus({ ...expanded, scenarioId: 'market_leader' }).objectives.find((o) => o.label.includes('data centre'))
      ?.progress === 1,
  );
  check(
    'expansion charges 3.2 million and produces the original full centre',
    expanded.money === 0 && expanded.nodes.at(-1)?.tier === 1 && expanded.nodes.at(-1)?.capacityGbps === 40,
  );
  check(
    'the expansion survives a JSON save round trip',
    migrate(JSON.parse(JSON.stringify(expanded)), SAVE_VERSION)?.nodes.at(-1)?.tier === 1,
  );
  useGame.setState({ game: g, autoConnect: false, planning: false, drillTarget: null });
  useGame.getState().placeNode('datacenter', cell.gx, cell.gy);
  const direct = useGame.getState().game!;
  const directCentre = direct.nodes.find((n) => n.kind === 'datacenter');
  check(
    'manual placement uses the same first stage and price as blueprints',
    direct.money === 0 && directCentre?.tier === 0 && directCentre?.capacityGbps === 10,
  );
  if (directCentre) useGame.getState().sellNode(directCentre.id);
  check(
    'selling a small centre refunds only its actual first-stage investment',
    useGame.getState().game?.money === 420000,
  );
  useGame.setState(prior);
}

group('Weekly research exercise bonus');
{
  const g = { ...newGame(811), researchActive: { id: 'ftth', daysLeft: 0.5 } };
  const exercise = beginSignalTraining(g, 4, 'fault')!;
  exercise.signalTraining.active!.rotations.fill(0);
  const rewarded = finishSignalTraining(exercise)!;
  check(
    'bonus is capped at remaining research and never makes time negative',
    rewarded.researchActive?.daysLeft === 0 && rewarded.signalTraining.active?.researchDaysSaved === 0.5,
  );
  const saved = migrate(JSON.parse(JSON.stringify(rewarded)), SAVE_VERSION)!;
  check(
    'a saved bonus cannot be claimed twice',
    !!saved && finishSignalTraining(saved) === null && saved.researchActive?.daysLeft === 0,
  );
  const resumed = step({ ...saved, signalTraining: { ...saved.signalTraining, active: null } });
  check(
    'normal simulation completes an accelerated research unlock',
    resumed.researchDone.includes('ftth') && resumed.researchActive === null,
  );
  const newResearch = { ...resumed, researchActive: { id: 'fiber10g', daysLeft: 18 } };
  const practice = beginSignalTraining(newResearch, 5)!;
  practice.signalTraining.active!.rotations.fill(0);
  const practiced = finishSignalTraining(practice)!;
  check(
    'switching exercises during cooldown cannot accelerate a second research',
    practiced.researchActive?.daysLeft === 18 && practiced.signalTraining.active?.researchDaysSaved === 0,
  );
  const longExercise = beginSignalTraining({ ...g, researchActive: { id: 'ftth', daysLeft: 12 } }, 4)!;
  longExercise.signalTraining.active!.rotations.fill(0);
  check(
    'a weekly bonus saves at most one day of research work',
    finishSignalTraining(longExercise)!.researchActive?.daysLeft === 11,
  );
  check(
    'import rejects an exaggerated research bonus',
    !validSignalTraining({
      ...rewarded.signalTraining,
      active: { ...rewarded.signalTraining.active!, researchDaysSaved: 2 },
    }),
  );
}

group('Goal timing estimates');
{
  const g = newGame(7311);
  g.packages = g.packages.map((p) => ({ ...p, subscribers: 1000 }));
  g.researchPoints = 0;
  g.employees = [
    { id: 'timing-engineer', name: 'Engineer', role: 'network_engineer', salary: 10000, skill: 2, experience: 0 },
  ];
  const base = goalTiming(g, g.money + 100000, 6);
  check('missing cash has a finite estimate for a profitable company', base.monthlyCash > 0 && base.cashDays! > 0);
  check('research point timing uses actual staff production', base.pointsPerDay === 2 && base.pointsDays === 3);
  const blocked = goalTiming({ ...g, packages: [], employees: [] }, g.money + 1, 1);
  check(
    'losses and absent point production do not promise a completion date',
    blocked.cashDays === null && blocked.pointsDays === null && blocked.readyInDays === null,
  );
  const funded = goalTiming({ ...g, packages: [], employees: [], researchPoints: 6 }, g.money, 6);
  check('already funded goals need no waiting even with a monthly loss', funded.readyInDays === 0);
  const debt = goalTiming(
    {
      ...g,
      loans: [
        {
          id: 'timing-loan',
          principal: 1000000,
          remaining: 1000000,
          rateAnnual: 0.09,
          monthlyPayment: 100000,
          termMonths: 12,
          takenAt: g.minutes,
        },
      ],
    },
    g.money + 100000,
    6,
  );
  check(
    'scheduled debt repayments reduce the saving rate',
    Math.abs(base.monthlyCash - debt.monthlyCash - 100000) < 0.001,
  );
  const loss = goalTiming({ ...g, stats: { ...g.stats, packetLoss: 0.5 } }, g.money + 100000);
  check('packet loss reduces the forecast revenue', loss.monthlyCash < base.monthlyCash);
  const busy = { ...g, researchActive: { id: 'ftth', daysLeft: 12 }, researchPoints: 20 };
  check(
    'research must wait for its lab but construction need not',
    goalTiming(busy, g.money, 0).readyInDays === 12 && goalTiming(busy, g.money, 0, false).readyInDays === 0,
  );
}

group('Reputation explanations');
{
  const g = newGame(7311);
  g.stats.health = 100;
  g.stats.outages = {};
  g.districts = g.districts.map((d) => ({ ...d, satisfaction: 100 }));
  check('excellent service explains the actual reputation target', reputationOutlook(g).target === 85);
  g.stats.outages = { [g.districts[0].id]: true };
  check('each district outage reduces the explained target by eight', reputationOutlook(g).target === 77);
  g.stats.health = 70;
  check('maintenance has a measurable effect on the recovery target', reputationOutlook(g).target === 56);
  g.districts = g.districts.map((d) => ({ ...d, unlocked: false }));
  check('an empty service footprint still has a finite outlook', Number.isFinite(reputationOutlook(g).target));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
