import { RESEARCH, researchById, researchPrice } from './research';
import type { GameState, ResearchNode } from './types';

// Advice only: derive the next prerequisite without persisting a second research queue.
export function researchPlan(state: Pick<GameState, 'researchDone' | 'researchActive' | 'money' | 'researchPoints'>) {
  const target =
    ['mobile_4g', 'edge_compute', 'mobile_5g']
      .map(researchById)
      .find((node) => node && !state.researchDone.includes(node.id)) ??
    RESEARCH.find((node) => !state.researchDone.includes(node.id));
  if (!target) return null;
  const steps: ResearchNode[] = [];
  function visit(node: ResearchNode) {
    if (state.researchDone.includes(node.id) || steps.some((step) => step.id === node.id)) return;
    node.requires.forEach((id) => {
      const prerequisite = researchById(id);
      if (prerequisite) visit(prerequisite);
    });
    steps.push(node);
  }
  visit(target);
  const unpaid = steps.filter((node) => node.id !== state.researchActive?.id);
  const next = unpaid[0] ?? null;
  // Spare points only lower the next bill; later steps are quoted at their list price.
  const nextPrice = next ? researchPrice(state.researchPoints, next) : null;
  return {
    target,
    steps,
    next,
    nextPrice,
    remainingCost: unpaid.reduce((sum, node) => sum + node.cost, 0) - (nextPrice?.credit ?? 0),
    cashMissing: nextPrice ? Math.max(0, nextPrice.cash - state.money) : 0,
    pointsMissing: next ? Math.max(0, next.points - state.researchPoints) : 0,
    ready:
      !!next &&
      !!nextPrice &&
      !state.researchActive &&
      nextPrice.cash <= state.money &&
      next.points <= state.researchPoints,
  };
}
