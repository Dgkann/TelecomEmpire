import { nodeCapacity, towerCapacity } from './constants';
import { researchModifiers } from './research';
import type { NodeKind, SpectrumHolding } from './types';

// Centralize rated capacity so build, upgrade, research, and simulation calculations stay consistent.
export function effectiveNodeCapacity(
  kind: NodeKind,
  tier: number,
  spectrum: SpectrumHolding[],
  researchDone: string[],
) {
  if (kind === 'tower') return towerCapacity(spectrum, tier);
  const mods = researchModifiers(researchDone);
  return nodeCapacity(kind, tier) * (kind === 'access' ? mods.accessCapacityMul : 1);
}
