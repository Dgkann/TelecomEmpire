// Invariant checks, run headless. Exits non-zero on failure so CI can gate on it.
// Run with: npm run check
import { MINUTES_PER_DAY, MOBILE_MARKET_SHARE, NODE_SPECS, SAVE_VERSION, TRANSIT_TIERS, nodeCapacity, towerCapacity, towerRadius } from '../src/game/constants';
import { monthlyBreakdown, priceIndex } from '../src/game/economy';
import { districtPull, leaderOf, playerShareTarget } from '../src/game/competitors';
import { computeRoutes, daysUntilFull, forecastDemand, isRedundant, servingCapacity } from '../src/game/network';
import { GRACE_DAYS, chargeLoans, createLoan, creditLimit, totalDebt } from '../src/game/finance';
import { researchModifiers } from '../src/game/research';
import { pendingRegulations, regulationProgress } from '../src/game/regulator';
import { RANKS, checkPromotion, cityShare, customerCount, meetsRank, rankOf } from '../src/game/progression';
import { cacheRatio } from '../src/game/simulation';
import { contractRisk, operationsInsights } from '../src/game/operations';
import { repairCost } from '../src/game/incidents';
import { hostingRevenue } from '../src/game/economy';
import { clearSave, exportSave, importSave, listSaveMeta, loadGame, migrate, saveGame } from '../src/game/save';
import { createNewGame, mobileSubs, residentialSubs, step, totalCustomers } from '../src/game/simulation';
import type { GameState, Incident, NetLink, NetNode } from '../src/game/types';

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

group('save archive and NOC telemetry');
{
  clearSave(0);
  clearSave(1);
  let first = newGame(1010);
  first = { ...first, companyName: 'Slot One' };
  const second = { ...newGame(2020), companyName: 'Slot Two' };
  saveGame(first, 0);
  saveGame(second, 1);
  check('multiple slots stay independent', loadGame(0)?.companyName === 'Slot One' && loadGame(1)?.companyName === 'Slot Two');
  check('slot metadata lists both companies', listSaveMeta()[1]?.company === 'Slot Two');
  const raw = exportSave(0);
  clearSave(2);
  const imported = raw ? importSave(raw, 2) : null;
  check('a save exports and imports into another slot', imported?.companyName === 'Slot One' && loadGame(2)?.companyName === 'Slot One');

  let sampled = newGame(3031);
  for (let i = 0; i < 13; i++) sampled = step(sampled);
  check('the NOC records hourly telemetry', sampled.telemetry.length >= 1);
  check('telemetry values remain finite', sampled.telemetry.every((p) => Number.isFinite(p.demandGbps) && Number.isFinite(p.cash)));

  const stressed = { ...sampled, links: sampled.links.map((l, i) => i === 0 ? { ...l, trafficGbps: l.capacityGbps } : l) };
  check('operations detects a capacity priority', operationsInsights(stressed).some((i) => i.id.startsWith('capacity-')));
  const synthetic = { id: 'c-test', clientName: 'Test Bank', districtId: stressed.districts[0].id, buildingId: stressed.buildings[0].id, bandwidthGbps: 1, monthlyRevenue: 1000, slaPercent: 99.9, downtimeMinutes: 50, penaltyPaid: 0, startedAt: 0, termMonths: 12, segment: 'enterprise' as const };
  check('contract risk reports consumed SLA allowance', contractRisk(stressed, synthetic).usage > 0);
  clearSave(0); clearSave(1); clearSave(2);
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

group('churn is attributed');
{
  // A network that cannot keep up should shed customers to somebody.
  let g = newGame(1212);
  g = { ...g, packages: g.packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price * 2.4 } : p)) };
  g = runDays(g, 200, repairAll);

  check('losses are recorded', g.churn.length > 0, `${g.churn.length} events`);
  check('every loss names a district', g.churn.every((c) => g.districts.some((d) => d.id === c.districtId)));
  check('every loss has a reason', g.churn.every((c) => ['price', 'outage', 'congestion', 'support'].includes(c.reason)));
  check('loss counts are positive and finite', g.churn.every((c) => Number.isFinite(c.count) && c.count > 0));
  check('the log stays bounded', g.churn.length <= 30, `${g.churn.length}`);
  check('at least some losses go to a named rival', g.churn.some((c) => c.toId !== null));

  // Retention spend should visibly slow the bleeding.
  const base = { ...newGame(1313), packages: newGame(1313).packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price * 2.4 } : p)) };
  const without = runDays({ ...base, retentionBudget: 0 }, 120, repairAll);
  const withSpend = runDays({ ...base, retentionBudget: 30000 }, 120, repairAll);
  const lostWithout = without.churn.reduce((a, c) => a + c.count, 0);
  const lostWith = withSpend.churn.reduce((a, c) => a + c.count, 0);
  check('retention spend reduces churn', lostWith < lostWithout, `${Math.round(lostWithout)} -> ${Math.round(lostWith)}`);
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
  check('ageing has a floor', g.nodes.every((n) => n.health >= 20));

  // Servicing should visibly restore it.
  const serviced = { ...g, nodes: g.nodes.map((n) => ({ ...n, health: 100, servicedAt: g.minutes })) };
  const later = runDays(serviced, 5, repairAll);
  check('a serviced node stays healthy for a while', later.nodes.every((n) => n.health > 95));

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
  check('an unmet obligation costs money', after.money < moneyBefore - 40000, `${Math.round(moneyBefore - after.money)}`);

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
  check('recorded peaks are finite', g.demandHistory.every((v) => Number.isFinite(v) && v >= 0));
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
  const withDc: GameState = { ...g, nodes: [...g.nodes, dc] };

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
  const many: GameState = { ...g, nodes: [...g.nodes, dc, { ...dc, id: 'dc2' }, { ...dc, id: 'dc3' }, { ...dc, id: 'dc4' }, { ...dc, id: 'dc5' }] };
  check('caching is capped', cacheRatio(many) <= 0.3, `${cacheRatio(many)}`);

  // And the offload should show up as less traffic on the network.
  const plain = runDays(g, 20, repairAll);
  const cached = runDays(withDc, 20, repairAll);
  check('caching lowers carried traffic', cached.stats.demandGbps < plain.stats.demandGbps * 1.01);
}

group('the company ladder');
{
  const g = newGame(6060);
  check('a new company starts at the bottom', g.rank === 0 && rankOf(g).id === 'local');
  check('the first rung has no requirements', RANKS[0].requirements.length === 0);
  check('every later rung has requirements', RANKS.slice(1).every((r) => r.requirements.length > 0));
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
  // A rank nobody can ever reach is worse than no rank at all. This pins the
  // top rung against the size of the market it is asking you to win.
  const g = newGame(12345);
  const residentialMarket = g.districts.reduce((a, d) => a + d.potential, 0);
  const mobileMarket = g.districts.reduce((a, d) => a + d.population, 0) * MOBILE_MARKET_SHARE;
  const market = residentialMarket + mobileMarket;

  const top = RANKS[RANKS.length - 1];
  const customerReq = top.requirements.find((r) => r.label.includes('customers'));
  const required = Number(customerReq?.label.replace(/[^0-9]/g, '') ?? 0);

  check('the city is big enough for the top rank', required < market * 0.75, `needs ${required}, market ${Math.round(market)}`);
  check('the top rank is still an achievement', required > market * 0.3, `needs ${required}, market ${Math.round(market)}`);

  // Every rung should ask for more than the one below it.
  const targets = RANKS.slice(1).map((r) => {
    const req = r.requirements.find((x) => x.label.includes('customers'));
    return Number(req?.label.replace(/[^0-9]/g, '') ?? 0);
  });
  check('rungs get harder in order', targets.every((v, i) => i === 0 || v > targets[i - 1]), targets.join(' < '));
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

group('growing the network is not self-defeating');
{
  // Repairs used to be billed off the clock, and the clock carried a
  // network-size penalty, so every new site quietly raised the price of every
  // future call-out. Parts must be priced off the fault alone.
  const g = newGame(4242);
  const fault: Incident = {
    id: 'i1', kind: 'fiber_cut', title: 'Fibre Cut', description: '',
    targetId: g.links[0].id, targetType: 'link', districtId: g.districts[0].id,
    startedAt: 0, repairMinutesLeft: null, repairTotalMinutes: 400, repairBaseMinutes: 400,
    assignedTechId: null, affected: 0, resolved: false, degrade: false,
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
  // The one bottleneck the map cannot draw. Before it was flagged, a player
  // watched every site read healthy while satisfaction fell city-wide.
  let g = newGame(777);
  g = runDays(g, 60, repairAll);
  const cap = TRANSIT_TIERS[g.transitTier].capacity;
  const saturated = { ...g, stats: { ...g.stats, demandGbps: cap * 1.4 }, demandHistory: [cap * 1.4] };
  const warned = operationsInsights(saturated).find((i) => i.id === 'transit-headroom');
  check('saturated transit reaches the priority list', Boolean(warned));
  check('it is raised as critical', warned?.severity === 'critical', warned?.severity ?? 'missing');

  const nearly = { ...g, stats: { ...g.stats, demandGbps: cap * 0.85 }, demandHistory: [cap * 0.85] };
  check(
    'the warning arrives before the wall, not on it',
    Boolean(operationsInsights(nearly).find((i) => i.id === 'transit-headroom')),
  );

  const roomy = { ...g, stats: { ...g.stats, demandGbps: cap * 0.4 }, demandHistory: [cap * 0.4] };
  check(
    'headroom is not nagged about',
    !operationsInsights(roomy).find((i) => i.id === 'transit-headroom'),
  );

  // The panel clamps an insight's detail to two lines. Layout cannot be
  // measured headlessly, so guard the input instead: both readings were checked
  // in the browser at this length and a longer one lost its last sentence.
  const detail = (d: number) => {
    const st = { ...g, transitTier: 0, stats: { ...g.stats, demandGbps: d }, demandHistory: [d] };
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


console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
