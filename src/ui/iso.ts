
export const TILE_W = 44;
export const TILE_H = 22;
// Pixels of vertical lift per building floor.
export const FLOOR_H = 7;

export const isoX = (gx: number, gy: number) => (gx - gy) * (TILE_W / 2);
export const isoY = (gx: number, gy: number) => (gx + gy) * (TILE_H / 2);

export interface Point {
  x: number;
  y: number;
}

export const iso = (gx: number, gy: number): Point => ({ x: isoX(gx, gy), y: isoY(gx, gy) });

// Screen point (relative to the world origin) back to fractional grid coords.
export function unIso(x: number, y: number) {
  const gx = (x / (TILE_W / 2) + y / (TILE_H / 2)) / 2;
  const gy = (y / (TILE_H / 2) - x / (TILE_W / 2)) / 2;
  return { gx, gy };
}

// The four corners of a tile's diamond, inset slightly so tiles read separately.
export function tileDiamond(gx: number, gy: number, inset = 0.06) {
  const s = 1 - inset;
  const cx = isoX(gx, gy);
  const cy = isoY(gx, gy);
  const hw = (TILE_W / 2) * s;
  const hh = (TILE_H / 2) * s;
  return `${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`;
}

export const depth = (gx: number, gy: number) => gx + gy;

// Accepts both #hex and the rgb() strings these helpers return, so results can
// be fed back in. Passing an rgb() string to a hex-only parser silently yields
// NaN, which the browser paints as black.
function parseColor(color: string): [number, number, number] {
  if (color.startsWith('rgb')) {
    const parts = color.match(/\d+/g);
    if (parts && parts.length >= 3) return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
    return [0, 0, 0];
  }
  const h = color.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(color: string, amount: number) {
  const [cr, cg, cb] = parseColor(color);
  const r = Math.max(0, Math.min(255, cr + amount));
  const g = Math.max(0, Math.min(255, cg + amount));
  const b = Math.max(0, Math.min(255, cb + amount));
  return `rgb(${r},${g},${b})`;
}

export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = parseColor(a);
  const [r2, g2, b2] = parseColor(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}
