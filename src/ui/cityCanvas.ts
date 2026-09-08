import type { Building } from '../game/types';
import { FLOOR_H, TILE_H, TILE_W, isoX, isoY, mix, shade, tileDiamond } from './iso';
import { visualConnection } from './mapVisuals';

const COMPANY = '#2dd4bf';
const FACADES: Record<Building['kind'], string> = {
  house: '#b69c85',
  apartment: '#b1bab8',
  office: '#749da9',
  shop: '#c0a17e',
  industrial: '#889899',
  hospital: '#c6d2cc',
  university: '#ad9f93',
  park: '#547958',
};
interface Paint {
  path: Path2D;
  fill: string;
  stroke: string | null;
  width: number;
  fillAlpha: number;
  strokeAlpha: number;
}
// Geometry survives lighting and customer updates. Both caches are bounded across cities.
const paths = new Map<string, Path2D>();
const paints = new Map<string, Paint[]>();
function pathFor(key: string, create: () => Path2D) {
  const cached = paths.get(key);
  if (cached) return cached;
  const path = create();
  if (paths.size >= 12000) paths.delete(paths.keys().next().value!);
  paths.set(key, path);
  return path;
}
export function buildingPaint(b: Building, night: number, dim: boolean, developed: boolean) {
  const connected = visualConnection(b.connected);
  const key = JSON.stringify([b.gx, b.gy, b.floors, b.kind, b.seed, connected, night, dim, developed]);
  const cached = paints.get(key);
  if (cached) return cached;
  const ops: Paint[] = [];
  const add = (path: Path2D, fill: string, alpha = 1, stroke: string | null = null, width = 1, strokeAlpha = alpha) =>
    ops.push({ path, fill, fillAlpha: alpha, stroke, width, strokeAlpha });
  const path = (d: string, fill: string, alpha = 1, stroke: string | null = null, width = 1, strokeAlpha = alpha) =>
    add(
      pathFor(d, () => new Path2D(d)),
      fill,
      alpha,
      stroke,
      width,
      strokeAlpha,
    );
  const ellipse = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    fill: string,
    alpha = 1,
    stroke: string | null = null,
    width = 1,
  ) => {
    add(
      pathFor(`ellipse:${x},${y},${rx},${ry}`, () => {
        const p = new Path2D();
        p.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        return p;
      }),
      fill,
      alpha,
      stroke,
      width,
    );
  };
  const cx = isoX(b.gx, b.gy),
    cy = isoY(b.gx, b.gy);
  const hw = TILE_W / 2 - 3,
    hh = TILE_H / 2 - 1.5;
  if (b.kind === 'park') {
    path(`M${tileDiamond(b.gx, b.gy, 0.08)}Z`, mix('#1c3a2c', '#0a1712', night * 0.55));
    path(`M${cx - 12} ${cy + 2}l24 -4`, 'none', 0.65, '#a59f80', 2);
    [-7, 6].forEach((offset, i) => {
      ellipse(cx + offset + 3, cy + 3, 5, 2, '#091b19', 0.35);
      path(`M${cx + offset} ${cy + 1}v-9`, 'none', 1, '#695a43', 2);
      ellipse(cx + offset, cy - 9 - i * 3, 5 + i, 7 + i, mix(i ? '#719769' : '#527e5d', '#132d2a', night * 0.7));
      ellipse(cx + offset - 1, cy - 12 - i * 3, 3, 4, '#b4c481', 0.25 * (1 - night));
    });
  } else {
    const h = Math.max(4, b.floors * FLOOR_H);
    const base = shade(FACADES[b.kind], ((b.seed >>> 11) % 5) * 6 - 12);
    const tinted = connected > 0.02 ? mix(base, COMPANY, Math.min(0.26, connected * 0.3)) : base;
    const body = dim ? mix(tinted, '#0d1119', 0.6) : tinted;
    const top = shade(mix(body, '#263e52', night * 0.66), 16);
    const left = shade(mix(body, '#1a2b41', night * 0.7), -12);
    const right = shade(mix(body, '#1a2b41', night * 0.7), -35);
    path(
      `M${cx - hw},${cy} ${cx},${cy + hh} ${cx + hw + h * 0.4},${cy - h * 0.15} ${cx + h * 0.4},${cy - hh - h * 0.15}Z`,
      '#071921',
      0.24,
    );
    path(`M${cx + hw},${cy - h} ${cx},${cy + hh - h} ${cx},${cy + hh} ${cx + hw},${cy}Z`, right);
    path(`M${cx - hw},${cy - h} ${cx},${cy + hh - h} ${cx},${cy + hh} ${cx - hw},${cy}Z`, left);
    path(
      `M${cx},${cy - hh - h} ${cx + hw},${cy - h} ${cx},${cy + hh - h} ${cx - hw},${cy - h}Z`,
      top,
      1,
      connected > 0.5 ? COMPANY : 'rgba(255,255,255,0.06)',
      0.6,
      connected > 0.5 ? 0.4 : 1,
    );
    for (let r = 0; r < Math.min(6, b.floors); r++) {
      const wy = cy - 3 - r * FLOOR_H;
      const lit = (b.seed >>> r) % 3 !== 0 && !dim;
      const warm = lit ? mix('#354f5b', '#ffd694', night) : '#304856';
      path(
        `M${cx - hw + 4} ${wy}l${hw - 8} ${((hw - 8) * hh) / hw}v3l-${hw - 8} -${((hw - 8) * hh) / hw}z`,
        warm,
        0.85,
      );
      path(
        `M${cx + 4} ${wy + hh - (4 * hh) / hw}l${hw - 8} -${((hw - 8) * hh) / hw}v3l-${hw - 8} ${((hw - 8) * hh) / hw}z`,
        warm,
        0.6,
      );
    }
    if (b.kind === 'house')
      path(
        `M${cx - hw} ${cy - h}L${cx - 4} ${cy - h - hh - 7}L${cx + hw} ${cy - h}L${cx} ${cy - h + hh}Z`,
        mix('#a77762', '#304559', night * 0.75),
      );
    if (b.kind === 'hospital') path(`M${cx - 4} ${cy - h}h8m-4 -4v8`, 'none', 1, '#e8efe9', 2.5);
    if (b.kind === 'office' || b.kind === 'industrial')
      path(`M${cx - 6} ${cy - h - 2}l6 -3 7 3 -6 3z`, shade(top, -25), 1, shade(top, 15), 0.5);
    if (connected > 0.02)
      ellipse(cx, cy - h - hh - 2, 0.9 + connected * 0.7, 0.9 + connected * 0.7, COMPANY, 0.3 + connected * 0.28);
    if (developed) ellipse(cx, cy - b.floors * FLOOR_H - 10, 4, 4, '#ffc857', 1, '#182432', 1.5);
  }
  if (paints.size >= 1500) paints.delete(paints.keys().next().value!);
  paints.set(key, ops);
  return ops;
}
