import {
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  TRANSIT_TIERS,
  linkCapacity,
  nodeCapacity,
} from '../../src/game/constants';
import { effectiveNodeCapacity } from '../../src/game/capacity';
import { monthlyBreakdown, priceIndex, hostingRevenue } from '../../src/game/economy';
import { rivalPosture, tickCompetitors } from '../../src/game/competitors';
import { computeRoutes, servingCoverAfterLoss, loadNetwork, loadServices } from '../../src/game/network';
import { createLoan, creditLimit } from '../../src/game/finance';
import {
  POINT_CREDIT,
  POINT_CREDIT_SHARE,
  RESEARCH,
  researchById,
  researchModifiers,
  researchPrice,
} from '../../src/game/research';
import { makeRegulation, networkResilience } from '../../src/game/regulator';
import {
  cacheRatio,
  mobileServingTowers,
  tickMaintenance,
  boundedIncidentMultipliers,
  dispatch,
  INCIDENT_LOAD_FLOOR,
  step,
} from '../../src/game/simulation';
import { currentMonthCashFlow } from '../../src/game/financeLedger';
import { migrate } from '../../src/game/save';
import { clearSave, loadGame, saveGame } from '../../src/game/saveStorage';
import { makeRng } from '../../src/game/rng';
import {
  AVERAGE_ENGINEER_POINTS,
  STAFF_SALARY,
  engineerOutlook,
  staffModifiers,
  trainEmployee,
} from '../../src/game/staff';
import { contractProfile, negotiatedTerms, premiumCounterChance, resolveNegotiation } from '../../src/game/contracts';
import {
  fibreConnectionCost,
  fibreConnectionIssue,
  nodePlacementCost,
  nodePlacementIssue,
} from '../../src/game/placement';
import {
  MAINTENANCE_CONFIG,
  DATA_CENTER_MODE_CONFIG,
  INTERCONNECT_CONFIG,
  interconnectOperational,
  maintenanceCost,
  wholesaleRevenue,
} from '../../src/game/strategy';
import { useGame } from '../../src/store/gameStore';
import type { ContractOffer, GameState, Incident, NetLink, NetNode } from '../../src/game/types';
import { check, group, newGame, runDays, repairAll } from './harness';

// Economic, network, lifecycle and persistence invariants, negotiation and maintenance.
// Runs when imported; tools/checks.ts imports the topics in order.

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
  check('research still consumes its cash cost', researching.money === 2000000 - researchById('ftth')!.cost);
  check(
    'research spending appears in the finance ledger',
    researching.ledger.some((entry) => entry.category === 'research' && entry.amount === -researchById('ftth')!.cost),
  );

  useGame.setState({ game: { ...researchState, researchPoints: 11, researchActive: null } });
  useGame.getState().startResearch('ftth');
  check('research cannot start without enough research points', useGame.getState().game?.researchActive === null);

  const ftth = researchById('ftth')!;
  useGame.setState({ game: { ...researchState, researchPoints: ftth.points + 18, researchActive: null } });
  useGame.getState().startResearch('ftth');
  const credited = useGame.getState().game!;
  check(
    'spare research points pay part of the research bill',
    credited.money === 2000000 - (ftth.cost - 18 * POINT_CREDIT) &&
      credited.researchPoints === 0 &&
      credited.ledger.some(
        (entry) => entry.category === 'research' && entry.amount === -(ftth.cost - 18 * POINT_CREDIT),
      ),
  );
  const edgeNode = researchById('edge_compute')!;
  const exact = researchPrice(edgeNode.points, edgeNode);
  const flush = researchPrice(100000, edgeNode);
  check(
    'research without spare points costs the list price',
    exact.cash === edgeNode.cost && exact.credit === 0 && exact.points === edgeNode.points,
  );
  check(
    'the point credit never covers more than its share of the price',
    flush.credit <= edgeNode.cost * POINT_CREDIT_SHARE &&
      flush.cash === edgeNode.cost - flush.credit &&
      flush.points === edgeNode.points + flush.credit / POINT_CREDIT,
  );
  check(
    'fractional or missing points never earn credit',
    researchPrice(edgeNode.points + 0.9, edgeNode).credit === 0 && researchPrice(0, edgeNode).credit === 0,
  );
  const fresh = { ...g, researchDone: [], researchActive: null, researchPoints: 0 };
  check(
    'an engineer is worth hiring while research is left to fund',
    engineerOutlook(fresh).advice === 'worth' &&
      engineerOutlook(fresh).creditPerMonth === AVERAGE_ENGINEER_POINTS * 30 * POINT_CREDIT &&
      engineerOutlook(fresh).salary === STAFF_SALARY.network_engineer,
  );
  check(
    'banked points that already fill the next credit make another engineer premature',
    engineerOutlook({ ...fresh, researchPoints: 100000 }).advice === 'stocked',
  );
  check(
    'a finished technology tree leaves engineers nothing to fund',
    engineerOutlook({ ...fresh, researchDone: RESEARCH.map((r) => r.id) }).advice === 'finished',
  );

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
