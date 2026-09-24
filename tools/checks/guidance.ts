import { researchPlan } from '../../src/game/researchPlanning';
import { mainReputationDrag, reputationDrivers, reputationOutlook } from '../../src/game/reputation';
import { operationsCopy } from '../../src/ui/operationsCopy';
import { goalTiming } from '../../src/game/goalTiming';
import { dataCenterOutlook } from '../../src/game/dataCenterOutlook';
import {
  DATACENTER_PILOT_COST,
  nodeUpgradeCost,
  nodeCapitalCost,
  MINUTES_PER_DAY,
  SAVE_VERSION,
  TRANSIT_TIERS,
  nodeCapacity,
} from '../../src/game/constants';
import { beginSignalTraining, finishSignalTraining, validSignalTraining } from '../../src/game/signalTraining';
import { capacityOptions } from '../../src/game/capacityLab';
import { projectBlueprint } from '../../src/game/blueprint';
import { monthlyBreakdown, priceIndex, hostingRevenue, potentialHostingRevenue } from '../../src/game/economy';
import { RESEARCH, researchById, researchModifiers } from '../../src/game/research';
import { operationsInsights, transitHeadroom } from '../../src/game/operations';
import { migrate } from '../../src/game/save';
import { step } from '../../src/game/simulation';
import { useGame } from '../../src/store/gameStore';
import { scenarioStatus } from '../../src/game/scenarios';
import { investmentEstimate } from '../../src/game/investment';
import { siteDrawKw } from '../../src/game/energy';
import type { GameState } from '../../src/game/types';
import { check, group, newGame } from './harness';

// Guidance and outlooks: transit, research, data centres, goals, reputation and translated copy.
// Runs when imported; tools/checks.ts imports the topics in order.

group('Upstream transit headroom');
{
  const g = newGame(2024);
  const stepped = step({ ...g, minutes: 19 * 60 });
  const headroom = transitHeadroom(stepped);
  check(
    'the warning reads the same capacity the simulation throttled against',
    headroom.capacity === TRANSIT_TIERS[stepped.transitTier].capacity &&
      Math.abs(headroom.use - stepped.stats.transitGbps / headroom.capacity) < 1e-9,
  );
  check(
    'the top transit tier offers no further upgrade',
    transitHeadroom({ ...stepped, transitTier: TRANSIT_TIERS.length - 1 }).next === null,
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
    active.remainingCost === plan.remainingCost - researchById('ftth')!.cost &&
      active.next?.id === 'fiber10g' &&
      !active.ready,
  );
  const negative = researchPlan({ ...g, money: -100000, researchPoints: 0 })!;
  check(
    'negative balances and missing points are both accounted for',
    negative.cashMissing === researchById('ftth')!.cost + 100000 && negative.pointsMissing === 12 && !negative.ready,
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
    !scenarioStatus(g).expired && scenarioStatus(g).daysLeft === 140,
  );
  check(
    'the extension still requires all four service objectives',
    !scenarioStatus(g).complete && scenarioStatus(g).objectives.length === 4,
  );
  check(
    'an unfinished operator still loses after the extended window',
    scenarioStatus({ ...g, minutes: MINUTES_PER_DAY * 541 }).expired,
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

group('Translated insight copy');
{
  const g = newGame(4242);
  const pricey = operationsInsights({
    ...g,
    packages: g.packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price * 1.4 } : p)),
  }).find((i) => i.id === 'pricing-high');
  const english = pricey?.title.match(/(\d+)%/)?.[1];
  check(
    'Turkish insight titles put the percent sign before the figure',
    !!english && operationsCopy(pricey!, g, true).title === `Piyasanın %${english} üzerindesin`,
    pricey && operationsCopy(pricey, g, true).title,
  );
}

group('Where reputation settles');
{
  const g = newGame(4242);
  g.stats.health = 95;
  g.stats.outages = {};
  g.districts = g.districts.map((d) => ({ ...d, loadPenalty: 0 }));
  const opening = reputationDrivers(g);
  check('the opening prices sit above the market and cost reputation', opening.premium > 0.15 && opening.price < -3);
  const market = {
    ...g,
    packages: g.packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price / priceIndex(g) } : p)),
  };
  const atMarket = reputationDrivers(market);
  check(
    'pricing at the market removes the price drag and lifts where reputation settles by as much',
    Math.abs(atMarket.price) < 0.05 && Math.abs(atMarket.settle - opening.settle + opening.price) < 0.05,
    `${opening.settle.toFixed(2)} -> ${atMarket.settle.toFixed(2)}`,
  );
  const loaded = reputationDrivers({ ...g, districts: g.districts.map((d) => ({ ...d, loadPenalty: 20 })) });
  check(
    'a day-averaged load penalty lowers where reputation settles through satisfaction',
    Math.abs(loaded.load + 20 * opening.perHealthPoint * 0.5) < 0.05 &&
      Math.abs(opening.settle + loaded.load - loaded.settle) < 0.05,
    `${loaded.load.toFixed(2)}`,
  );
  const worn90 = { ...g, stats: { ...g.stats, health: 90 } };
  check(
    'the default prices hold a 90-health network under the 75 Karadeniz asks for, and market prices clear it',
    reputationDrivers(worn90).settle < 75 && reputationDrivers({ ...worn90, packages: market.packages }).settle > 75,
  );

  // A Karadeniz operator that has everything but reputation, 90 days before the deadline.
  const karadeniz = {
    ...g,
    scenarioId: 'service_standard' as const,
    minutes: MINUTES_PER_DAY * 450,
    reputation: 60,
    stats: { ...g.stats, health: 93 },
    packages: g.packages.map((p) => (p.segment === 'residential' ? { ...p, price: p.price * 1.1 } : p)),
    researchDone: [...g.researchDone, 'mobile_4g'],
    districts: g.districts.map((d, i) => ({ ...d, unlocked: i < 4, mobileSubs: 2000, loadPenalty: 0 })),
  };
  const mission = (state: GameState) => operationsInsights(state).find((i) => i.id === 'mission-reputation');
  const priced = mission(karadeniz);
  check(
    'a price-bound reputation sends the briefing to pricing',
    priced?.target.type === 'screen' &&
      priced.target.anchor === 'pricing' &&
      priced.reason?.cause === 'price' &&
      operationsCopy(priced, karadeniz, true).action === 'Fiyatları incele',
    priced?.detail,
  );
  const busy = mission({
    ...karadeniz,
    packages: market.packages,
    districts: karadeniz.districts.map((d) => ({ ...d, loadPenalty: 25 })),
  });
  check(
    'a load-bound reputation shows the busiest site',
    busy?.target.type === 'node' && busy.reason?.cause === 'load',
  );
  const recovering = mission({ ...karadeniz, packages: market.packages });
  check(
    'a reputation that will reach the objective in time is reported as on course',
    recovering?.reason?.days === 13 &&
      recovering.severity === 'opportunity' &&
      recovering.target.type === 'screen' &&
      recovering.target.anchor === 'reputation',
    recovering?.detail,
  );
  const worn = mission({ ...karadeniz, packages: market.packages, stats: { ...karadeniz.stats, health: 78 } });
  check(
    'a worn network sends the briefing to maintenance',
    worn?.target.type === 'screen' && worn.target.anchor === 'maintenance' && worn.reason?.cause === 'health',
  );
  check(
    'small drags name no single cause',
    mainReputationDrag({ ...opening, price: -0.2, load: -0.1, outages: 0, health: 95 }) === null,
  );
}
