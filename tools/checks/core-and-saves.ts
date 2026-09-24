import { MINUTES_PER_DAY, SAVE_VERSION } from '../../src/game/constants';
import { monthlyBreakdown } from '../../src/game/economy';
import { researchModifiers } from '../../src/game/research';
import { contractRisk, operationsInsights } from '../../src/game/operations';
import { migrate } from '../../src/game/save';
import { clearSave, exportSave, importSave, listSaveMeta, loadGame, saveGame } from '../../src/game/saveStorage';
import { residentialSubs, step } from '../../src/game/simulation';
import { check, finite, group, newGame, runDays, repairAll } from './harness';

// A year of play, an untouched network, saving, migration and save validation.
// Runs when imported; tools/checks.ts imports the topics in order.

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
    requiresRedundancy: false,
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
