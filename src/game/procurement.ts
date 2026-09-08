import { MINUTES_PER_DAY, MINUTES_PER_STEP } from './constants';
import { recordLedger } from './financeLedger';
import { computeRoutes, isRedundant } from './network';
import { fixedCoverageTarget } from './reach';
import { uid } from './rng';
import type { GameState, CityTender, ProcurementState } from './types';

export const TENDER_PROGRAMMES = {
  schools: {
    title: 'School fibre programme',
    brief: 'Bring dependable fixed access to the district learning network.',
    budget: 65000,
    reach: 0.4,
    sites: 2,
    protectedSites: 0,
    days: 7,
    reward: 10,
  },
  emergency: {
    title: 'Emergency services ring',
    brief: 'Build independent fibre paths so local services can withstand a cut.',
    budget: 110000,
    reach: 0.55,
    sites: 2,
    protectedSites: 2,
    days: 10,
    reward: 20,
  },
  gigabit: {
    title: 'District fibre rollout',
    brief: 'Deliver broad fixed access with protected service hubs across the district.',
    budget: 165000,
    reach: 0.7,
    sites: 3,
    protectedSites: 2,
    days: 14,
    reward: 30,
  },
} as const;
export const ACCEPTANCE_MINUTES = 360;
export function initialProcurement(minutes: number): ProcurementState {
  return { nextTenderAt: minutes, sequence: 0, tenders: [] };
}
const note = (s: GameState, text: string, tone: 'good' | 'bad' | 'info') => {
  s.log = [{ id: uid('log'), at: s.minutes, text, tone }, ...s.log].slice(0, 60);
};
export const bidBond = (price: number) => Math.ceil(price * 0.1);
export const bidScore = (budget: number, price: number, quality: number) =>
  70 * Math.max(0, Math.min(1, (budget - price) / (budget * 0.35))) + quality * 0.3;

export function tenderProgress(state: GameState, tender: CityTender) {
  const spec = TENDER_PROGRAMMES[tender.kind];
  const routes = computeRoutes(state);
  const district = state.districts.find((d) => d.id === tender.districtId)!;
  const sites = state.nodes.filter(
    (n) => n.districtId === tender.districtId && (n.kind === 'pop' || n.kind === 'access') && !!routes[n.id] && !n.down,
  );
  const protectedSites = sites.filter((n) => isRedundant(state, n.id, routes)).length;
  const coverage = fixedCoverageTarget(state, tender.districtId, routes);
  const health = sites.length ? Math.min(...sites.map((n) => n.health)) : 0;
  const requirements = [
    { id: 'licence', label: 'District licensed', current: district?.unlocked ? 1 : 0, target: 1 },
    { id: 'reach', label: 'Fixed network reach', current: coverage, target: spec.reach },
    { id: 'sites', label: 'Connected access sites', current: sites.length, target: spec.sites },
    { id: 'protection', label: 'Independently protected sites', current: protectedSites, target: spec.protectedSites },
    { id: 'health', label: 'Minimum live-site condition', current: health, target: 80 },
  ];
  return {
    requirements,
    ready: requirements.every((r) => r.current + 1e-9 >= r.target),
    coverage,
    sites: sites.length,
    protectedSites,
    health,
  };
}

export function tenderBidIssue(
  state: GameState,
  tender: CityTender | undefined,
  price: number,
  locale: 'en' | 'tr' = 'en',
) {
  const tr = locale === 'tr';
  if (state.gameOver) return tr ? 'Bu şirket kapandı.' : 'This company has closed.';
  if (!tender || tender.status !== 'open' || state.minutes >= tender.closesAt)
    return tr ? 'Teklif verme süresi kapandı.' : 'Bidding has closed.';
  if (!Number.isInteger(price) || price < Math.ceil(tender.budget * 0.65) || price > tender.budget)
    return tr
      ? 'İlan edilen bütçenin %65 ile %100 arasında teklif ver.'
      : 'Bid between 65% and 100% of the published budget.';
  if (state.money + tender.bond < bidBond(price))
    return tr
      ? 'İade edilebilir %10 teminat için nakit yetersiz.'
      : 'Not enough cash for the refundable 10% performance bond.';
  return null;
}
export function submitTenderBid(original: GameState, id: string, price: number): GameState | null {
  const tender = original.procurement.tenders.find((t) => t.id === id);
  if (tenderBidIssue(original, tender, price) || !tender) return null;
  const bond = bidBond(price),
    delta = bond - tender.bond;
  const state = {
    ...original,
    money: original.money - delta,
    procurement: {
      ...original.procurement,
      tenders: original.procurement.tenders.map((t) =>
        t.id === id ? { ...t, playerBid: { price, quality: original.reputation }, bond } : t,
      ),
    },
  };
  recordLedger(state, 'tender_bond', 'Performance bond: ' + TENDER_PROGRAMMES[tender.kind].title, -delta);
  return state;
}
export function withdrawTenderBid(original: GameState, id: string): GameState | null {
  const tender = original.procurement.tenders.find((t) => t.id === id);
  if (
    original.gameOver ||
    !tender ||
    tender.status !== 'open' ||
    original.minutes >= tender.closesAt ||
    !tender.playerBid
  )
    return null;
  const state = {
    ...original,
    money: original.money + tender.bond,
    procurement: {
      ...original.procurement,
      tenders: original.procurement.tenders.map((t) => (t.id === id ? { ...t, playerBid: null, bond: 0 } : t)),
    },
  };
  recordLedger(state, 'tender_bond', 'Withdrawn bid: bond returned', tender.bond);
  return state;
}

export function tickProcurement(state: GameState, dt: number) {
  if (state.gameOver) return;
  const current = state.procurement;
  if (
    !current.tenders.some((t) => t.status === 'open' || t.status === 'delivery') &&
    state.minutes < current.nextTenderAt
  )
    return;
  const tenders = current.tenders.map((t) => ({ ...t }));
  state.procurement = { ...current, tenders };
  for (const tender of tenders) {
    if (tender.status === 'open' && state.minutes >= tender.closesAt) {
      tender.rivals = tender.rivals.filter((r) => state.competitors.some((c) => c.id === r.id));
      const bids = tender.rivals.map((r) => ({ ...r, score: bidScore(tender.budget, r.price, r.quality) }));
      if (tender.playerBid)
        bids.push({
          id: 'player',
          name: state.companyName,
          ...tender.playerBid,
          score: bidScore(tender.budget, tender.playerBid.price, tender.playerBid.quality),
        });
      bids.sort((a, b) => b.score - a.score || a.price - b.price || a.id.localeCompare(b.id));
      const winner = bids[0];
      tender.winnerId = winner?.id ?? null;
      tender.awardedAt = state.minutes;
      if (winner?.id === 'player') {
        tender.status = 'delivery';
        tender.dueAt = state.minutes + TENDER_PROGRAMMES[tender.kind].days * MINUTES_PER_DAY;
        note(
          state,
          'Tender won: ' +
            TENDER_PROGRAMMES[tender.kind].title +
            '. Build and hold service for six hours before the deadline.',
          'good',
        );
      } else {
        tender.status = 'lost';
        state.money += tender.bond;
        recordLedger(state, 'tender_bond', 'Unsuccessful tender: bond returned', tender.bond);
        tender.bond = 0;
        note(
          state,
          TENDER_PROGRAMMES[tender.kind].title +
            ': ' +
            (winner ? winner.name + ' won the tender.' : 'No eligible bids.'),
          'info',
        );
        state.procurement.nextTenderAt = state.minutes + 5 * MINUTES_PER_DAY;
      }
      continue;
    }
    if (tender.status !== 'delivery') continue;
    const spec = TENDER_PROGRAMMES[tender.kind];
    tender.qualifyingMinutes = tenderProgress(state, tender).ready
      ? Math.min(ACCEPTANCE_MINUTES, tender.qualifyingMinutes + Math.max(0, Math.min(MINUTES_PER_STEP, dt)))
      : 0;
    if (tender.qualifyingMinutes >= ACCEPTANCE_MINUTES && state.minutes <= tender.dueAt!) {
      tender.status = 'completed';
      tender.finishedAt = state.minutes;
      const payment = tender.playerBid!.price;
      state.money += payment + tender.bond;
      recordLedger(state, 'tender_payment', 'Infrastructure accepted: ' + spec.title, payment);
      recordLedger(state, 'tender_bond', 'Accepted project: bond returned', tender.bond);
      tender.bond = 0;
      state.reputation = Math.min(100, state.reputation + 5);
      state.researchPoints += spec.reward;
      note(state, spec.title + ' accepted. Payment and performance bond released.', 'good');
      state.procurement.nextTenderAt = state.minutes + 5 * MINUTES_PER_DAY;
    } else if (state.minutes >= tender.dueAt!) {
      tender.status = 'failed';
      tender.finishedAt = state.minutes;
      tender.bond = 0;
      state.reputation = Math.max(0, state.reputation - 5);
      note(
        state,
        spec.title + ' missed its deadline. The performance bond was forfeited; reputation fell by 5.',
        'bad',
      );
      state.procurement.nextTenderAt = state.minutes + 5 * MINUTES_PER_DAY;
    }
  }
  if (
    tenders.some((t) => t.status === 'open' || t.status === 'delivery') ||
    state.minutes < state.procurement.nextTenderAt
  )
    return;
  const sequence = current.sequence;
  const kinds = ['schools', 'emergency', 'gigabit'] as const;
  const kind = kinds[sequence % kinds.length],
    spec = TENDER_PROGRAMMES[kind];
  const routes = computeRoutes(state);
  const candidates = [...state.districts].sort(
    (a, b) => fixedCoverageTarget(state, a.id, routes) - fixedCoverageTarget(state, b.id, routes),
  );
  const district = sequence === 0 ? (state.districts.find((d) => d.unlocked) ?? candidates[0]) : candidates[0];
  if (!district) return;
  const rivals = state.competitors
    .filter((c) => c.cash >= spec.budget * 0.1)
    .map((c, i) => {
      const fraction = 0.73 + ((sequence * 37 + i * 17 + Math.abs(state.rngSeed % 23)) % 23) / 100;
      return {
        id: c.id,
        name: c.name,
        price: Math.round((spec.budget * fraction) / 100) * 100,
        quality: Math.min(95, Math.max(30, 35 + c.tech * 35 + (c.coverage[district.id] ?? 0) * 30)),
      };
    });
  const tender: CityTender = {
    id: 'tender_' + sequence,
    kind,
    districtId: district.id,
    budget: spec.budget,
    openedAt: state.minutes,
    closesAt: state.minutes + 3 * MINUTES_PER_DAY,
    playerBid: null,
    bond: 0,
    rivals,
    status: 'open',
    winnerId: null,
    awardedAt: null,
    dueAt: null,
    qualifyingMinutes: 0,
    finishedAt: null,
  };
  state.procurement = {
    nextTenderAt: state.minutes + 14 * MINUTES_PER_DAY,
    sequence: sequence + 1,
    tenders: [tender, ...tenders].slice(0, 12),
  };
  note(state, 'City tender opened: ' + spec.title + ' in ' + district.name + '.', 'info');
}
