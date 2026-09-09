import { projectBlueprint, type BuildStep } from './blueprint';
import { computeRoutes } from './network';
import { rivalArpu } from './competitors';
import { packageMix } from './economy';
import { effectiveNodeCapacity } from './capacity';
import { recordLedger } from './financeLedger';
import { boardHistory } from './board';
import type { GameState } from './types';

export function acquisitionQuote(state: GameState, rivalId: string) {
  const rival = state.competitors.find((c) => c.id === rivalId);
  const routes = computeRoutes(state);
  const live = state.nodes.filter((n) => routes[n.id]);
  let issue = !rival
    ? 'missing'
    : state.gameOver
      ? 'closed'
      : state.rank < 2
        ? 'rank'
        : state.competitors.length < 2
          ? 'competition'
          : state.auction
            ? 'auction'
            : !live.length
              ? 'core'
              : null;
  const price = rival
    ? Math.round(
        Math.max(
          3000000,
          state.districts.reduce((sum, d) => sum + (rival.share[d.id] ?? 0) * d.potential * rivalArpu(rival) * 6, 0) +
            Math.max(0, rival.cash) * 0.15,
        ),
      )
    : 0;
  const steps: BuildStep[] = [];
  const districtIds: string[] = [];
  if (!issue && rival) {
    for (const d of state.districts.filter((d) => d.unlocked && (rival.coverage[d.id] ?? 0) >= 0.15)) {
      const cell = [...d.cells]
        .sort(
          (a, b) =>
            Math.hypot(a.gx - d.center.gx, a.gy - d.center.gy) - Math.hypot(b.gx - d.center.gx, b.gy - d.center.gy),
        )
        .find((c) => !state.nodes.some((n) => n.gx === c.gx && n.gy === c.gy));
      if (!cell) {
        issue = 'space';
        break;
      }
      const nearest = [...live].sort(
        (a, b) => Math.hypot(a.gx - cell.gx, a.gy - cell.gy) - Math.hypot(b.gx - cell.gx, b.gy - cell.gy),
      )[0];
      const id = `acq_${rival.id}_${d.id}`;
      steps.push(
        { type: 'node', id, kind: 'pop', gx: cell.gx, gy: cell.gy },
        { type: 'link', id: `${id}_link`, aId: nearest.id, bId: id },
      );
      districtIds.push(d.id);
    }
    if (!districtIds.length) issue = 'licence';
  }
  const projection = projectBlueprint({ ...state, money: 1e12 }, steps);
  if (projection.error || projection.disconnected) issue = 'space';
  const integrationCost = projection.cost;
  const total = price + integrationCost;
  if (!issue && state.money < total) issue = 'cash';
  return { rival, issue, price, integrationCost, total, monthlyCost: projection.addedMonthlyCost, districtIds, steps };
}

export function acquireCompany(state: GameState, rivalId: string): GameState | null {
  const quote = acquisitionQuote(state, rivalId);
  if (quote.issue || !quote.rival) return null;
  const result = projectBlueprint({ ...state, money: state.money - quote.price }, quote.steps);
  if (result.error || result.disconnected) return null;
  const next = result.state;
  const rival = quote.rival;
  next.competitors = state.competitors.filter((c) => c.id !== rivalId);
  next.spectrum = state.spectrum.map((s) => ({ ...s }));
  for (const holding of rival.spectrum) {
    const existing = next.spectrum.find((s) => s.band === holding.band);
    if (existing) {
      existing.blocks += holding.blocks;
      existing.paid += holding.paid;
    } else next.spectrum.push({ ...holding });
  }
  next.nodes = next.nodes.map((n) =>
    n.kind === 'tower'
      ? { ...n, capacityGbps: effectiveNodeCapacity(n.kind, n.tier, next.spectrum, next.researchDone) }
      : n,
  );
  // Integrate only the residential customer share in licensed, newly served districts.
  next.buildings = state.buildings.map((b) =>
    b.segment === 'residential' && b.kind !== 'park' && quote.districtIds.includes(b.districtId)
      ? { ...b, connected: Math.min(1, b.connected + Math.min(1 - b.connected, rival.share[b.districtId] ?? 0)) }
      : b,
  );
  const total = next.buildings.reduce(
    (sum, b) => sum + (b.segment === 'residential' ? b.households * b.connected : 0),
    0,
  );
  const mix = packageMix(next.packages, 'residential');
  next.packages = next.packages.map((p) =>
    p.segment === 'residential'
      ? { ...p, subscribers: Math.round(total * (mix.find((m) => m.pkg.id === p.id)?.share ?? 0)) }
      : p,
  );
  next.strategy = {
    ...state.strategy,
    acquisitions: [...state.strategy.acquisitions, { rivalId, name: rival.name, at: state.minutes, cost: quote.total }],
  };
  recordLedger(next, 'company_acquisition', rival.name, -quote.price);
  boardHistory(
    next,
    `${rival.name} acquired. ${quote.districtIds.length} districts integrated.`,
    `${rival.name} satın alındı. ${quote.districtIds.length} ilçe entegre edildi.`,
  );
  return next;
}
