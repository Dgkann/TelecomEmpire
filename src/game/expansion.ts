import { projectBlueprint, type BuildStep } from './blueprint';
import { FIBER_COST_PER_UNIT } from './constants';
import { averagePrice } from './economy';
import { recordLedger } from './financeLedger';
import { computeRoutes, isRedundant } from './network';
import { nodePlacementCost } from './placement';
import { networkReachGain } from './reach';
import type { GameState } from './types';

export type ExpansionKind = 'access' | 'pop';

export function expansionProgress(state: GameState, districtId: string, routes = computeRoutes(state)) {
  const sites = state.nodes.filter((n) => n.districtId === districtId && (n.kind === 'pop' || n.kind === 'access'));
  const customers = Math.floor(
    state.buildings
      .filter((b) => b.districtId === districtId && b.segment === 'residential')
      .reduce((sum, b) => sum + b.households * b.connected, 0),
  );
  return {
    sites,
    customers,
    connected: sites.some((n) => !!routes[n.id]),
    protected: sites.some((n) => !!routes[n.id] && isRedundant(state, n.id, routes)),
  };
}

// A starter network is available only before the district has a fixed access site.
// Choose the cheapest free tile-to-live-site span; all serving sites reach their district equally.
export function expansionQuote(
  state: GameState,
  districtId: string,
  kind: ExpansionKind,
  routes = computeRoutes(state),
  locale: 'en' | 'tr' = 'en',
) {
  const tr = locale === 'tr';
  const district = state.districts.find((d) => d.id === districtId);
  if (!district || (kind !== 'access' && kind !== 'pop')) return null;
  const existing = state.nodes.some((n) => n.districtId === districtId && (n.kind === 'pop' || n.kind === 'access'));
  const live = state.nodes.filter((n) => !n.down && routes[n.id]);
  const occupied = new Set(state.nodes.map((n) => `${n.gx},${n.gy}`));
  let placement: { gx: number; gy: number; peerId: string; distance: number } | null = null;
  for (const cell of district.cells) {
    if (occupied.has(`${cell.gx},${cell.gy}`)) continue;
    for (const peer of live) {
      const distance = Math.hypot(cell.gx - peer.gx, cell.gy - peer.gy);
      if (!placement || distance < placement.distance) placement = { ...cell, peerId: peer.id, distance };
    }
  }
  const licenceCost = district.unlocked ? 0 : district.entryCost;
  const siteCost = nodePlacementCost(state, kind);
  const fibreCost = placement ? Math.round(placement.distance * FIBER_COST_PER_UNIT) : 0;
  const total = licenceCost + siteCost + fibreCost;
  let issue = state.gameOver
    ? tr
      ? 'Bu şirket kapandı.'
      : 'This company has closed.'
    : existing
      ? tr
        ? 'Burada zaten sabit şebeke var. Haritadan genişlet veya onar.'
        : 'A fixed network already exists here. Expand or repair it from the map.'
      : !live.length
        ? tr
          ? 'Genişlemeden önce canlı bir çekirdeğe bağlan.'
          : 'Connect a live core before expanding.'
        : !placement
          ? tr
            ? 'Bu ilçede boş kare yok.'
            : 'No free tile is available in this district.'
          : null;
  const steps: BuildStep[] = [];
  let monthlyCost = 0,
    homes = 0;
  if (!issue && placement) {
    let id = `launch_${district.id}_${kind}`;
    while (
      state.nodes.some((n) => n.id === id || n.id === `${id}_link`) ||
      state.links.some((l) => l.id === id || l.id === `${id}_link`)
    )
      id += '_';
    steps.push(
      { type: 'node', id, kind, gx: placement.gx, gy: placement.gy },
      { type: 'link', id: `${id}_link`, aId: placement.peerId, bId: id },
    );
    const projection = projectBlueprint(
      {
        ...state,
        money: total - licenceCost,
        districts: state.districts.map((d) => (d.id === districtId ? { ...d, unlocked: true } : d)),
      },
      steps,
      locale,
    );
    if (projection.error || projection.disconnected)
      issue =
        projection.error ??
        (tr ? 'Başlangıç noktası canlı bir çekirdeğe ulaşamıyor.' : 'The starter site cannot reach a live core.');
    else {
      monthlyCost = projection.addedMonthlyCost;
      homes = networkReachGain(state, projection.state);
    }
  }
  const arpu = averagePrice(state.packages);
  const fundingGap = Math.max(0, total - state.money);
  if (!issue && fundingGap > 0)
    issue = tr ? 'Açılışın tamamı için nakit yetersiz.' : 'Insufficient cash for the complete launch.';
  return {
    district,
    kind,
    placement,
    steps,
    licenceCost,
    siteCost,
    fibreCost,
    total,
    monthlyCost,
    homes,
    fundingGap,
    issue,
    breakEvenCustomers: arpu > 0 ? Math.ceil(monthlyCost / arpu) : null,
  };
}

export function launchDistrict(state: GameState, districtId: string, kind: ExpansionKind): GameState | null {
  const quote = expansionQuote(state, districtId, kind);
  if (!quote || quote.issue) return null;
  const result = projectBlueprint(
    {
      ...state,
      money: state.money - quote.licenceCost,
      districts: state.districts.map((d) => (d.id === districtId ? { ...d, unlocked: true } : d)),
    },
    quote.steps,
  );
  if (result.error || result.disconnected) return null;
  if (quote.licenceCost > 0)
    recordLedger(result.state, 'district_licence', `${quote.district.name} licence`, -quote.licenceCost);
  return result.state;
}
