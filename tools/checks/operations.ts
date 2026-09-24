import { levyOutlook, operatingPowerBill, solarQuote, tariffQuote } from '../../src/game/energyPlanning';
import {
  startMarketOperation,
  cancelMarketOperation,
  operationCost,
  marketEffects,
  rivalMarketEffects,
  servicePromiseReady,
  tickCompetition,
  RIVAL_MOVES,
} from '../../src/game/competition';
import {
  initialProcurement,
  tickProcurement,
  submitTenderBid,
  withdrawTenderBid,
  tenderProgress,
  bidBond,
  bidScore,
} from '../../src/game/procurement';
import { DEFAULT_SMART_PAUSE, smartPauseEvents } from '../../src/game/smartPause';
import { projectBlueprint } from '../../src/game/blueprint';
import { MINUTES_PER_DAY, ENERGY, MINUTES_PER_MONTH, SAVE_VERSION } from '../../src/game/constants';
import { monthlyBreakdown } from '../../src/game/economy';
import { districtPull } from '../../src/game/competitors';
import { researchModifiers } from '../../src/game/research';
import { migrate } from '../../src/game/save';
import { customerGrowthSnapshot } from '../../src/game/simulation';
import { makeRng } from '../../src/game/rng';
import { DATA_CENTER_MODE_CONFIG } from '../../src/game/strategy';
import {
  buildSolar,
  energyPriceIndex,
  fixedExitFee,
  hasSolar,
  setEnergyPlan,
  siteDrawKw,
  tickEnergyMonth,
} from '../../src/game/energy';
import type { GameState } from '../../src/game/types';
import { check, group, newGame } from './harness';

// City tenders, district market operations and energy.
// Runs when imported; tools/checks.ts imports the topics in order.

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
