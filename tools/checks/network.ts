import { capacityOptions, capacityPlan, commissionCapacityPlan, testCapacity } from '../../src/game/capacityLab';
import { SAVE_VERSION, towerCapacity, towerRadius } from '../../src/game/constants';
import { monthlyBreakdown } from '../../src/game/economy';
import { computeRoutes, isRedundant, loadServices } from '../../src/game/network';
import { researchModifiers } from '../../src/game/research';
import { migrate } from '../../src/game/save';
import { mobileSubs, residentialSubs, totalCustomers } from '../../src/game/simulation';
import { makeRng } from '../../src/game/rng';
import { useGame } from '../../src/store/gameStore';
import type { GameState, NetLink, NetNode } from '../../src/game/types';
import { check, finite, group, newGame, runDays, repairAll } from './harness';

// Routing, resilience, shared backhaul, the capacity lab, redundancy, spectrum and mobile.
// Runs when imported; tools/checks.ts imports the topics in order.

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
    servicedAt: 0,
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
