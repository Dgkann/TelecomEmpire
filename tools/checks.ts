// Invariant checks, run headless. Exits non-zero on failure so CI can gate on it.
// Run with: npm run check
import { MINUTES_PER_DAY, SAVE_VERSION, nodeCapacity, towerCapacity, towerRadius } from '../src/game/constants';
import { monthlyBreakdown, priceIndex } from '../src/game/economy';
import { districtPull, leaderOf, playerShareTarget } from '../src/game/competitors';
import { computeRoutes, isRedundant } from '../src/game/network';
import { researchModifiers } from '../src/game/research';
import { clearSave, loadGame, migrate, saveGame } from '../src/game/save';
import { createNewGame, mobileSubs, residentialSubs, step, totalCustomers } from '../src/game/simulation';
import type { GameState, NetLink, NetNode } from '../src/game/types';

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
        x.id === inc.id ? { ...x, repairMinutesLeft: Math.round(x.repairTotalMinutes * 0.28), assignedTechId: tech.id } : x,
      ),
      technicians: s.technicians.map((t) => (t.id === tech.id ? { ...t, incidentId: inc.id, state: 'driving' as const } : t)),
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
    check('districts gain radio fields', migrated.districts.every((d) => d.mobileCoverage === 0 && d.mobileSubs === 0));
    check('a migrated save can be stepped', Number.isFinite(step(migrated).money));
  }

  check('a save from a newer build is refused', migrate({}, SAVE_VERSION + 1) === null);
  check('a structurally broken save is refused', migrate({ buildings: 'nope' }, SAVE_VERSION) === null);
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
  check('rivals start with coverage behind their share', startCoverage.every((v) => v > 0));
  check('rivals start with cash', g.competitors.every((c) => c.cash > 0));

  g = runDays(g, 180, repairAll);

  const grew = g.competitors.some(
    (c, i) => Object.values(c.coverage).reduce((a, b) => a + b, 0) > startCoverage[i] + 0.01,
  );
  check('rivals expand their own coverage over time', grew);

  const badShare = g.competitors.find((c) =>
    Object.values(c.share).some((v) => !Number.isFinite(v) || v < 0 || v > 1),
  );
  check('rival share stays a valid fraction', !badShare, badShare?.name);
  check('rival cash stays finite', g.competitors.every((c) => Number.isFinite(c.cash)));
  check('rival prices stay in a sane band', g.competitors.every((c) => c.priceIndex >= 0.5 && c.priceIndex <= 1.5));

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
  // Rivals used to cut whenever you looked expensive, which moved the market
  // average, which made you look more expensive again. Everyone hit the floor.
  let g = newGame(606);
  g = { ...g, packages: g.packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price * 2 } : p)) };
  const before = priceIndex(g);
  g = runDays(g, 240, repairAll);

  check('your price index does not move when you do not change prices', Math.abs(priceIndex(g) - before) < 0.001);
  check('rivals do not all collapse to the price floor', g.competitors.some((c) => c.priceIndex > 0.8), g.competitors.map((c) => c.priceIndex.toFixed(2)).join('/'));
  check('rivals undercut an expensive player', g.competitors.every((c) => c.priceIndex < before));

  // Cheap and well run should out-pull three rivals; expensive and neglected should not.
  const strong = newGame(707);
  const good = { ...strong, reputation: 90, districts: strong.districts.map((d) => ({ ...d, coverage: 0.9, satisfaction: 90 })) };
  const weak = { ...strong, reputation: 30, districts: strong.districts.map((d) => ({ ...d, coverage: 0.2, satisfaction: 40 })) };
  check('a well run operator can lead its city', playerShareTarget(good, good.districts[0]) > 0.5, `${playerShareTarget(good, good.districts[0]).toFixed(2)}`);
  check('a neglected operator loses the city', playerShareTarget(weak, weak.districts[0]) < 0.3, `${playerShareTarget(weak, weak.districts[0]).toFixed(2)}`);
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
  check('an unconnected tower gives no coverage', g.districts[0].mobileCoverage === 0, `${g.districts[0].mobileCoverage}`);
  check('an unconnected tower sells nothing', mobileSubs(g) === 0, `${mobileSubs(g)}`);
}

// ---------------------------------------------------------------------------

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
