import { NODE_SPECS, linkCapacity, initialNodeTier } from './constants';
import { effectiveNodeCapacity } from './capacity';
import { nodePlacementCost, nodePlacementIssue, fibreConnectionCost, fibreConnectionIssue } from './placement';
import { computeRoutes } from './network';
import { researchModifiers } from './research';
import { monthlyBreakdown } from './economy';
import { recordLedger } from './financeLedger';
import type { GameState, NodeKind } from './types';
import { line } from './lang';

export type BuildStep =
  | { type: 'node'; id: string; kind: NodeKind; gx: number; gy: number }
  | { type: 'link'; id: string; aId: string; bId: string };
export const MAX_PLAN_STEPS = 30;

// The exact same transaction validates the preview and commits the finished plan.
// Every collection is replaced: a failed plan cannot partly charge or build.
export function projectBlueprint(original: GameState, steps: BuildStep[], locale: 'en' | 'tr' = 'en') {
  const tr = locale === 'tr';
  let state = { ...original };
  let error: string | null =
    steps.length > MAX_PLAN_STEPS
      ? tr
        ? `Plan sınırı: ${MAX_PLAN_STEPS} öğe.`
        : `Plan limit: ${MAX_PLAN_STEPS} items.`
      : original.gameOver
        ? tr
          ? 'Bu şirket kapandı.'
          : 'This company has closed.'
        : null;
  const mods = researchModifiers(state.researchDone);
  for (const step of steps) {
    if (error) break;
    if (state.nodes.some((n) => n.id === step.id) || state.links.some((l) => l.id === step.id)) {
      error = tr ? 'Planda aynı öğe iki kez var.' : 'Duplicate plan item.';
      break;
    }
    if (step.type === 'node') {
      if (!Number.isInteger(step.gx) || !Number.isInteger(step.gy)) {
        error = tr ? 'Şehirde bir tam kare seç.' : 'Choose a whole city tile.';
        break;
      }
      error = nodePlacementIssue(state, step.kind, step.gx, step.gy, locale);
      if (error) break;
      const district = state.districts.find((d) => d.cells.some((c) => c.gx === step.gx && c.gy === step.gy))!;
      const spec = NODE_SPECS[step.kind];
      const cost = nodePlacementCost(state, step.kind);
      state.money -= cost;
      state.nodes = [
        ...state.nodes,
        {
          id: step.id,
          kind: step.kind,
          name: `${district.name} ${spec.label} ${state.nodes.filter((n) => n.kind === step.kind).length + 1}`,
          gx: step.gx,
          gy: step.gy,
          districtId: district.id,
          tier: initialNodeTier(step.kind),
          capacityGbps: effectiveNodeCapacity(
            step.kind,
            initialNodeTier(step.kind),
            state.spectrum,
            state.researchDone,
          ),
          trafficGbps: 0,
          health: 100,
          down: false,
          builtAt: state.minutes,
          servicedAt: state.minutes,
        },
      ];
      if (step.kind === 'datacenter') {
        state.dataCenterModes = { ...state.dataCenterModes, [step.id]: 'colocation' };
        state.dataCenterModeChangedAt = { ...state.dataCenterModeChangedAt, [step.id]: 0 };
      }
      recordLedger(
        state,
        'network_build',
        line(`${spec.label}: ${district.name}`, `${spec.labelTr}: ${district.name}`),
        -cost,
      );
    } else {
      error = fibreConnectionIssue(state, step.aId, step.bId, locale);
      if (error) break;
      const a = state.nodes.find((n) => n.id === step.aId)!;
      const b = state.nodes.find((n) => n.id === step.bId)!;
      const cost = fibreConnectionCost(state, a.id, b.id);
      state.money -= cost;
      state.links = [
        ...state.links,
        {
          id: step.id,
          aId: a.id,
          bId: b.id,
          tier: 1,
          capacityGbps: linkCapacity(1) * mods.linkCapacityMul,
          trafficGbps: 0,
          down: false,
          length: Math.hypot(a.gx - b.gx, a.gy - b.gy),
          builtAt: state.minutes,
        },
      ];
      recordLedger(
        state,
        'network_build',
        line(`Fibre: ${a.name} to ${b.name}`, `Fiber: ${a.name} → ${b.name}`),
        -cost,
      );
    }
  }
  if (error) state = original;
  const routes = computeRoutes(state);
  const disconnected = steps.filter((step) => step.type === 'node' && step.kind !== 'core' && !routes[step.id]).length;
  const addedMonthlyCost = monthlyBreakdown(state, mods).totalCost - monthlyBreakdown(original, mods).totalCost;
  return { state, error, cost: original.money - state.money, addedMonthlyCost, disconnected };
}
