import type { District } from '../game/types';

// Simulation values change every tick; city geometry does not.
export function sameDistrictMap(a: District[], b: District[]) {
  return (
    a === b ||
    (a.length === b.length &&
      a.every((d, i) => {
        const next = b[i];
        return d.id === next.id && d.cells === next.cells && d.color === next.color && d.unlocked === next.unlocked;
      }))
  );
}
export function sameIds(a: string[], b: string[]) {
  return a === b || (a.length === b.length && a.every((id, i) => id === b[i]));
}
// Preserve connection thresholds, but do not repaint roofs for invisible fractional sign-ups.
export function visualConnection(value: number) {
  if (value <= 0.02) return 0;
  return Math.min(1, Math.ceil(value * 20) / 20);
}
