import {
  DEFAULT_SMART_PAUSE,
  SMART_PAUSE_KEY,
  parseSmartPausePreferences,
  loadSmartPausePreferences,
  smartPauseEvents,
} from '../../src/game/smartPause';
import { updateCompanyIdentity, COMPANY_EMBLEMS } from '../../src/game/identity';
import { expansionQuote, expansionProgress, launchDistrict } from '../../src/game/expansion';
import { fixedCoverageTarget, reachGain, networkReachGain } from '../../src/game/reach';
import { failureDrill } from '../../src/game/failureDrill';
import { connectedSiteEstimate, buildConnectedSite } from '../../src/game/connectedBuild';
import { backupRouteEstimate, buildBackupRoute } from '../../src/game/redundancyBuild';
import { projectBlueprint, MAX_PLAN_STEPS, type BuildStep } from '../../src/game/blueprint';
import { initialStrategy, tickBoard, resolveDecision, developDistrict, claimChallenge } from '../../src/game/board';
import { acquireCompany, acquisitionQuote } from '../../src/game/acquisitions';
import { residentialPeakEstimate } from '../../src/game/planCapacity';
import { MINUTES_PER_DAY, SAVE_VERSION } from '../../src/game/constants';
import { monthlyBreakdown } from '../../src/game/economy';
import { computeRoutes, isRedundant } from '../../src/game/network';
import { createLoan } from '../../src/game/finance';
import { researchModifiers } from '../../src/game/research';
import { RANKS } from '../../src/game/progression';
import { operationsInsights, transitHeadroom } from '../../src/game/operations';
import { repairOptions, dispatchCandidates, pendingIncidents } from '../../src/game/incidents';
import { currentMonthCashFlow } from '../../src/game/financeLedger';
import { migrate } from '../../src/game/save';
import { createNewGame, dispatch, residentialSubs, step } from '../../src/game/simulation';
import { nodePlacementCost } from '../../src/game/placement';
import { useGame } from '../../src/store/gameStore';
import { generateCity } from '../../src/game/cityGen';
import { CAMPAIGN_STAGES, scenarioStatus } from '../../src/game/scenarios';
import { claimMilestone, milestoneProgress } from '../../src/game/milestones';
import { investmentEstimate, suggestedBackhaul } from '../../src/game/investment';
import type { ContractOffer, GameState, Incident } from '../../src/game/types';
import { check, group, newGame } from './harness';

// Scenarios, grants, network planning, reach, dispatch, starter networks, identity and smart pause.
// Runs when imported; tools/checks.ts imports the topics in order.

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

  const paced = {
    ...rapid,
    minutes: MINUTES_PER_DAY * 100,
    competitors: [],
    incidents: [],
    campaigns: [],
    contracts: [],
    maintenanceOrders: [],
    nodes: rapid.nodes.map((node) => ({ ...node, trafficGbps: 0 })),
    links: rapid.links.map((link) => ({ ...link, trafficGbps: 0 })),
    districts: rapid.districts.map((district, index) => ({ ...district, unlocked: index === 0, mobileSubs: 0 })),
  };
  const paceWarning = operationsInsights(paced).find((insight) => insight.id === 'mission-customers');
  check(
    'campaign pace points to the least complete objective',
    paceWarning?.target.type === 'screen' && paceWarning.target.id === 'company',
    paceWarning?.id,
  );

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
  const midgame = milestoneProgress({
    ...g,
    researchDone: ['ftth', 'noc', 'gpon', 'fiber10g'],
    nodes: [...g.nodes, { ...g.nodes.find((n) => n.kind === 'pop')!, id: 'hosting-site', kind: 'datacenter', tier: 0 }],
  });
  const goal = (id: string) => midgame.find((m) => m.id === id)!;
  check(
    'mid-game goals sit between the second district and the mobile launch',
    midgame.map((m) => m.id).join(',') ===
      'connected,customers,resilient,expansion,contract,research,growth,districts,laboratory,accounts,protected,mobile,hosting',
  );
  check(
    'mid-game goals measure research, hosting and customers',
    goal('laboratory').progress === 1 &&
      goal('hosting').progress === 1 &&
      goal('growth').current === goal('customers').current &&
      goal('districts').current === goal('expansion').current,
  );
  // A real starter data centre on its own tile, with the workload every centre is given.
  const hostCell = g.districts
    .find((d) => d.unlocked)!
    .cells.find((c) => !g.nodes.some((n) => n.gx === c.gx && n.gy === c.gy))!;
  const hosted: GameState = {
    ...g,
    nodes: [
      ...g.nodes,
      {
        ...g.nodes.find((n) => n.kind === 'pop')!,
        id: 'hosting-site',
        kind: 'datacenter',
        tier: 0,
        gx: hostCell.gx,
        gy: hostCell.gy,
      },
    ],
    dataCenterModes: { ...g.dataCenterModes, 'hosting-site': 'colocation' },
    dataCenterModeChangedAt: { ...g.dataCenterModeChangedAt, 'hosting-site': 0 },
  };
  const hosting = claimMilestone(hosted, 'hosting');
  check(
    'a mid-game goal pays once and survives a save',
    !!hosting &&
      hosting.money === originalCash + 300000 &&
      migrate(JSON.parse(JSON.stringify(hosting)), SAVE_VERSION)?.claimedMilestones.includes('hosting') === true &&
      claimMilestone(hosting, 'hosting') === null,
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
  const capacity = transitHeadroom(g).capacity;
  const saturated = { ...g, stats: { ...g.stats, transitGbps: capacity * 1.2 } };
  const nearlyFull = { ...g, stats: { ...g.stats, transitGbps: capacity * 0.9 } };
  const transitPrefs = { ...DEFAULT_SMART_PAUSE, transit: true };
  check(
    'filling upstream transit pauses once, when it first runs out',
    smartPauseEvents(nearlyFull, saturated, transitPrefs)
      .map((e) => e.kind)
      .join(',') === 'transit' &&
      smartPauseEvents(saturated, saturated, transitPrefs).length === 0 &&
      smartPauseEvents(nearlyFull, saturated, DEFAULT_SMART_PAUSE).length === 0,
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
