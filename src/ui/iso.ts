
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

export function shade(hex: string, amount: number) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

export function mix(a: string, b: string, t: number) {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}
