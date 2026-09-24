import {
  MINUTES_PER_DAY,
  MOBILE_MARKET_SHARE,
  NODE_SPECS,
  SLA_PENALTY_CAP,
  TRANSIT_TIERS,
  linkCapacity,
  nodeCapacity,
} from '../../src/game/constants';
import { monthlyBreakdown, priceIndex, hostingRevenue } from '../../src/game/economy';
import { districtPull, leaderOf, playerShareTarget } from '../../src/game/competitors';
import {
  computeRoutes,
  daysUntilFull,
  districtIsRedundant,
  districtRedundancy,
  forecastDemand,
  loadNetwork,
  servingCapacity,
} from '../../src/game/network';
import { GRACE_DAYS, chargeLoans, createLoan, creditLimit, totalDebt } from '../../src/game/finance';
import { researchModifiers } from '../../src/game/research';
import { pendingRegulations, regulationProgress } from '../../src/game/regulator';
import { RANKS, checkPromotion, cityShare, customerCount, meetsRank, rankOf } from '../../src/game/progression';
import { cacheRatio, customerGrowthSnapshot, mobileSubs, step } from '../../src/game/simulation';
import { operationsInsights } from '../../src/game/operations';
import { repairCost } from '../../src/game/incidents';
import type { GameState, Incident, NetLink, NetNode } from '../../src/game/types';
import { check, finite, group, newGame, runDays, repairAll } from './harness';

// Rivals, pricing, churn, borrowing, ageing, the regulator, data centres, ranks and transit.
// Runs when imported; tools/checks.ts imports the topics in order.

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
    servicedAt: 0,
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
