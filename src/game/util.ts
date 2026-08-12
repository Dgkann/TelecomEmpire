export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Eases current toward target; rate is the fraction of the gap closed per call.
export const approach = (current: number, target: number, rate: number) =>
  current + (target - current) * clamp(rate, 0, 1);
