import { MINUTES_PER_DAY, MINUTES_PER_STEP } from './constants';
import { recordLedger } from './financeLedger';
import { uid } from './rng';
import { clamp } from './util';
import type { GameState, MarketOperation, CompetitionState, MarketTactic } from './types';

export const MARKET_TACTICS = {
  switchers: {
    title: 'Switcher programme',
    cost: 7000,
    detail: '28% more local market appeal. Pays for switching assistance, not instant subscribers.',
    tradeoff: 'More sign-ups also add traffic. Expand capacity before inviting demand.',
  },
  loyalty: {
    title: 'Loyalty desk',
    cost: 4500,
    detail: '45% less fixed-customer loss from dissatisfaction and competition; 6% more market appeal.',
    tradeoff: 'Protects your current base. It cannot restore an outage or expand your reach.',
  },
  service: {
    title: 'Service promise',
    cost: 6000,
    detail:
      '20% more local appeal while reach is at least 40%, satisfaction at least 70 and network health at least 90%.',
    tradeoff: 'Meet the standard for 80% of the fortnight: +3 reputation. Miss it or cancel early: −3 reputation.',
  },
} as const;
export const RIVAL_MOVES = {
  discount: { title: 'Local price offensive', detail: '15% lower effective local price for 10 days.', cost: 16000 },
  publicity: { title: 'Brand campaign', detail: '25% more local market appeal for 10 days.', cost: 12000 },
  rollout: { title: 'Fibre land grab', detail: 'Adds 8 percentage points of permanent fixed coverage.', cost: 24000 },
} as const;
export const OPERATION_MINUTES = 14 * MINUTES_PER_DAY;
export function initialCompetition(minutes: number): CompetitionState {
  return {
    operations: [],
    history: [],
    moves: [],
    snapshots: [],
    nextMoveAt: minutes + 2 * MINUTES_PER_DAY,
    sequence: 0,
  };
}
export function districtFixedCustomers(s: GameState, id: string) {
  return s.buildings.reduce(
    (sum, b) => sum + (b.districtId === id && b.segment === 'residential' ? b.households * b.connected : 0),
    0,
  );
}
export function servicePromiseReady(s: GameState, id: string) {
  const d = s.districts.find((d) => d.id === id);
  return !!d?.unlocked && d.coverage >= 0.4 && d.satisfaction >= 70 && s.stats.health >= 90 && !s.stats.outages[id];
}
export function marketEffects(s: GameState, id: string) {
  const operation = s.competition.operations.find((o) => o.districtId === id && o.endsAt > s.minutes);
  if (!operation) return { appeal: 1, retention: 1 };
  if (operation.kind === 'switchers') return { appeal: 1.28, retention: 1 };
  if (operation.kind === 'loyalty') return { appeal: 1.06, retention: 0.55 };
  return { appeal: servicePromiseReady(s, id) ? 1.2 : 1, retention: 1 };
}
export function rivalMarketEffects(s: GameState, rivalId: string, districtId: string) {
  const move = s.competition.moves.find(
    (m) => m.rivalId === rivalId && m.districtId === districtId && m.endsAt > s.minutes,
  );
  return { price: move?.kind === 'discount' ? 0.85 : 1, appeal: move?.kind === 'publicity' ? 1.25 : 1 };
}
export function operationCost(s: GameState, districtId: string, kind: MarketTactic) {
  const d = s.districts.find((d) => d.id === districtId);
  return Math.round(MARKET_TACTICS[kind].cost * clamp((d?.potential ?? 2000) / 2000, 0.75, 2));
}
export function operationIssue(s: GameState, districtId: string, kind: MarketTactic, locale: 'en' | 'tr' = 'en') {
  const tr = locale === 'tr';
  if (s.gameOver) return tr ? 'Bu şirket kapandı.' : 'This company has closed.';
  const d = s.districts.find((d) => d.id === districtId);
  if (!d?.unlocked || d.coverage < 0.05)
    return tr
      ? 'Önce bu ilçenin lisansını al ve en az %5 sabit kapsama kur.'
      : 'License this district and establish at least 5% fixed coverage first.';
  if (s.competition.operations.some((o) => o.districtId === districtId))
    return tr
      ? 'Önce bu ilçedeki mevcut operasyonu bitir veya sonlandır.'
      : 'Finish or end the current district operation first.';
  if (s.competition.operations.length >= 3)
    return tr
      ? 'Ticari ekibin aynı anda üç ilçe operasyonu yürütebilir.'
      : 'Your commercial team can run three district operations at a time.';
  if (s.money < operationCost(s, districtId, kind))
    return tr ? '14 günlük programın tamamı için nakit yetersiz.' : 'Not enough cash for the full 14-day programme.';
  return null;
}
const log = (s: GameState, text: string, tone: 'good' | 'bad' | 'info' = 'info') => {
  s.log = [{ id: uid('marketlog'), at: s.minutes, text, tone }, ...s.log].slice(0, 60);
};
export function startMarketOperation(original: GameState, districtId: string, kind: MarketTactic): GameState | null {
  if (!Object.prototype.hasOwnProperty.call(MARKET_TACTICS, kind) || operationIssue(original, districtId, kind))
    return null;
  const cost = operationCost(original, districtId, kind);
  const operation: MarketOperation = {
    id: uid('operation'),
    districtId,
    kind,
    startedAt: original.minutes,
    endsAt: original.minutes + OPERATION_MINUTES,
    cost,
    baselineCustomers: districtFixedCustomers(original, districtId),
    qualifiedMinutes: 0,
  };
  const s = {
    ...original,
    money: original.money - cost,
    competition: { ...original.competition, operations: [...original.competition.operations, operation] },
  };
  recordLedger(s, 'market_operation', MARKET_TACTICS[kind].title, cost * -1);
  log(s, MARKET_TACTICS[kind].title + ' launched in ' + s.districts.find((d) => d.id === districtId)!.name + '.');
  return s;
}
function finishOperation(s: GameState, o: MarketOperation, cancelled: boolean) {
  const met = o.qualifiedMinutes / OPERATION_MINUTES >= 0.8;
  const reputationDelta = o.kind === 'service' ? (!cancelled && met ? 3 : -3) : 0;
  s.reputation = clamp(s.reputation + reputationDelta, 0, 100);
  s.competition.history = [
    {
      ...o,
      finishedAt: s.minutes,
      cancelled,
      customerDelta: Math.round(districtFixedCustomers(s, o.districtId) - o.baselineCustomers),
      reputationDelta,
    },
    ...s.competition.history,
  ].slice(0, 24);
  log(
    s,
    MARKET_TACTICS[o.kind].title +
      (cancelled ? ' ended early.' : ' completed.') +
      (o.kind === 'service' ? (reputationDelta > 0 ? ' Service promise kept.' : ' Service promise missed.') : ''),
    reputationDelta < 0 ? 'bad' : 'info',
  );
}
export function cancelMarketOperation(original: GameState, id: string): GameState | null {
  const op = original.competition.operations.find((o) => o.id === id);
  if (!op || original.gameOver) return null;
  const s = {
    ...original,
    competition: { ...original.competition, operations: original.competition.operations.filter((o) => o.id !== id) },
  };
  finishOperation(s, op, true);
  return s;
}
export function tickCompetition(s: GameState, dt: number, daily = false) {
  if (s.gameOver) return;
  const old = s.competition;
  const operations = old.operations.map((o) => ({ ...o }));
  s.competition = {
    ...old,
    operations,
    moves: old.moves.filter((m) => m.endsAt > s.minutes && s.competitors.some((c) => c.id === m.rivalId)),
  };
  for (const o of operations) {
    const elapsed = Math.max(0, Math.min(MINUTES_PER_STEP, dt, s.minutes - o.startedAt, o.endsAt - (s.minutes - dt)));
    if (o.kind === 'service' && servicePromiseReady(s, o.districtId))
      o.qualifiedMinutes = Math.min(OPERATION_MINUTES, o.qualifiedMinutes + elapsed);
    if (s.minutes >= o.endsAt) finishOperation(s, o, false);
  }
  s.competition.operations = operations.filter((o) => o.endsAt > s.minutes);
  if (s.minutes >= old.nextMoveAt) {
    s.competition.nextMoveAt = s.minutes + 7 * MINUTES_PER_DAY;
    const kinds = ['discount', 'publicity', 'rollout'] as const;
    const kind = kinds[old.sequence % 3];
    const available = s.competitors.filter(
      (c) =>
        !s.competition.moves.some((m) => m.rivalId === c.id) &&
        c.cash >= RIVAL_MOVES[kind].cost * 2 &&
        s.districts.some((d) => d.unlocked && (c.coverage[d.id] ?? 0) > 0),
    );
    const c = available[old.sequence % Math.max(1, available.length)];
    const candidates = s.districts.filter((d) => d.unlocked && (c?.coverage[d.id] ?? 0) > 0);
    candidates.sort(
      (a, b) =>
        districtFixedCustomers(s, b.id) +
        (s.competition.operations.some((o) => o.districtId === b.id) ? 500 : 0) -
        (districtFixedCustomers(s, a.id) + (s.competition.operations.some((o) => o.districtId === a.id) ? 500 : 0)),
    );
    const d = candidates[0];
    if (c && d && c.cash >= RIVAL_MOVES[kind].cost * 2) {
      s.competition.moves = [
        {
          id: 'rival_move_' + old.sequence,
          rivalId: c.id,
          districtId: d.id,
          kind,
          startedAt: s.minutes,
          endsAt: s.minutes + 10 * MINUTES_PER_DAY,
          cost: RIVAL_MOVES[kind].cost,
        },
        ...s.competition.moves,
      ];
      s.competitors = s.competitors.map((r) =>
        r.id !== c.id
          ? r
          : {
              ...r,
              cash: r.cash - RIVAL_MOVES[kind].cost,
              coverage:
                kind === 'rollout'
                  ? { ...r.coverage, [d.id]: Math.min(0.95, (r.coverage[d.id] ?? 0) + 0.08) }
                  : r.coverage,
              lastMove: RIVAL_MOVES[kind].title + ' in ' + d.name,
            },
      );
      log(s, c.name + ': ' + RIVAL_MOVES[kind].title + ' in ' + d.name + '.');
      s.competition.sequence = old.sequence + 1;
    }
  }
  if (
    daily &&
    !s.competition.snapshots.some((p) => Math.floor(p.at / MINUTES_PER_DAY) === Math.floor(s.minutes / MINUTES_PER_DAY))
  ) {
    s.competition.snapshots = [
      ...old.snapshots,
      {
        at: s.minutes,
        districts: s.districts.map((d) => ({
          id: d.id,
          customers: Math.round(districtFixedCustomers(s, d.id)),
          coverage: d.coverage,
          satisfaction: d.satisfaction,
        })),
      },
    ].slice(-30);
  }
}
