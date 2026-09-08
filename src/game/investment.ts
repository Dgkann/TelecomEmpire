import { FIBER_COST_PER_UNIT, NODE_SPECS, POWER_COST_PER_KW_MONTH, nodeUpgradeCost } from './constants';
import { monthlyBreakdown } from './economy';
import { researchModifiers } from './research';
import { staffModifiers } from './staff';
import { DATA_CENTER_MODE_CONFIG, dataCenterMode } from './strategy';
import { nodePlacementCost } from './placement';
import { computeRoutes } from './network';
import type { GameState, NodeKind } from './types';

export function investmentEstimate(state: GameState, kind: NodeKind, nodeId?: string) {
  const node = nodeId ? state.nodes.find((n) => n.id === nodeId) : undefined;
  const mods = researchModifiers(state.researchDone);
  const staff = staffModifiers(state);
  const spec = NODE_SPECS[kind];
  const powerMultiplier =
    kind === 'datacenter'
      ? DATA_CENTER_MODE_CONFIG[node ? dataCenterMode(state, node.id) : 'colocation'].powerMultiplier
      : 1;
  const monthlyCost =
    spec.powerKw * POWER_COST_PER_KW_MONTH * (node ? 0.55 : 1) * powerMultiplier +
    spec.maintenance * (node ? 0.5 : 1) * mods.maintenanceCostMul * staff.maintenanceCostMul;
  const cost = node ? nodeUpgradeCost(kind, node.tier) : nodePlacementCost(state, kind);
  const remaining = state.money - cost;
  const monthly = monthlyBreakdown(state, mods);
  const debtService = state.loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0);
  const projectedProfit = monthly.profit - monthlyCost - debtService;
  const runwayMonths = projectedProfit < 0 ? Math.max(0, remaining) / -projectedProfit : null;
  const active = state.packages.filter((p) => p.active && p.segment === 'residential');
  const subscribers = active.reduce((sum, p) => sum + p.subscribers, 0);
  const arpu =
    subscribers > 0
      ? monthly.revenueResidential / subscribers
      : active.reduce((sum, p) => sum + p.price, 0) / Math.max(1, active.length);
  return {
    cost,
    monthlyCost,
    remaining,
    runwayMonths,
    breakEvenCustomers: arpu > 0 ? Math.ceil(monthlyCost / arpu) : null,
  };
}

export function suggestedBackhaul(state: GameState, gx: number, gy: number, routes = computeRoutes(state)) {
  const candidates = state.nodes.filter((n) => !n.down && routes[n.id] && (n.gx !== gx || n.gy !== gy));
  candidates.sort((a, b) => Math.hypot(a.gx - gx, a.gy - gy) - Math.hypot(b.gx - gx, b.gy - gy));
  const node = candidates[0];
  return node ? { node, cost: Math.round(Math.hypot(node.gx - gx, node.gy - gy) * FIBER_COST_PER_UNIT) } : null;
}
