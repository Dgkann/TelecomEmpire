export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Eases current toward target; rate is the fraction of the gap closed per call.
export const approach = (current: number, target: number, rate: number) =>
  current + (target - current) * clamp(rate, 0, 1);

// English noun for a count: plural(1, 'day') is 'day', plural(3, 'day') is 'days'.
export const plural = (count: number, singular: string, many = `${singular}s`) =>
  Math.abs(count) === 1 ? singular : many;
