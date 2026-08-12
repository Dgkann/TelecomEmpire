import { GRID } from './constants';
import { makeRng, randInt, type Rng } from './rng';
import type { Building, BuildingKind, District } from './types';

const DISTRICT_BLUEPRINTS = [
  { name: 'Kadıköy', color: '#4d8dff', income: 'medium' as const, biz: 0.35, comp: 0.18 },
  { name: 'Ataşehir', color: '#a78bfa', income: 'high' as const, biz: 0.6, comp: 0.35 },
  { name: 'Üsküdar', color: '#3ee6d6', income: 'medium' as const, biz: 0.22, comp: 0.24 },
  { name: 'Beşiktaş', color: '#ffc857', income: 'high' as const, biz: 0.7, comp: 0.42 },
  { name: 'Bakırköy', color: '#7ee787', income: 'low' as const, biz: 0.28, comp: 0.3 },
];

// Roads run along every 5th line of the grid, forming visible city blocks.
export const isRoad = (gx: number, gy: number) => gx % 5 === 0 || gy % 5 === 0;

const KIND_WEIGHTS: Record<District['incomeLevel'], Array<[BuildingKind, number]>> = {
  low: [
    ['house', 40],
    ['apartment', 26],
    ['shop', 12],
    ['industrial', 14],
    ['park', 5],
    ['hospital', 2],
    ['office', 1],
  ],
  medium: [
    ['house', 30],
    ['apartment', 30],
    ['shop', 15],
    ['office', 12],
    ['industrial', 5],
    ['park', 5],
    ['university', 2],
    ['hospital', 1],
  ],
  high: [
    ['apartment', 30],
    ['office', 26],
    ['shop', 16],
    ['house', 12],
    ['park', 7],
    ['university', 5],
    ['hospital', 4],
  ],
};

function weightedKind(rng: Rng, income: District['incomeLevel']): BuildingKind {
  const table = KIND_WEIGHTS[income];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [kind, w] of table) {
    roll -= w;
    if (roll <= 0) return kind;
  }
  return table[0][0];
}

const FLOORS: Record<BuildingKind, [number, number]> = {
  house: [1, 2],
  apartment: [3, 7],
  office: [4, 9],
  shop: [1, 3],
  industrial: [1, 2],
  hospital: [3, 5],
  university: [2, 4],
  park: [0, 0],
};

const HOUSEHOLDS: Record<BuildingKind, [number, number]> = {
  house: [4, 9],
  apartment: [45, 110],
  office: [12, 40],
  shop: [6, 16],
  industrial: [8, 22],
  hospital: [14, 30],
  university: [30, 70],
  park: [0, 0],
};

export function segmentOf(kind: BuildingKind): Building['segment'] {
  if (kind === 'house' || kind === 'apartment') return 'residential';
  if (kind === 'hospital' || kind === 'university') return 'enterprise';
  if (kind === 'office' || kind === 'industrial') return 'business';
  return 'business';
}

export interface GeneratedCity {
  districts: District[];
  buildings: Building[];
}

// Five districts as Voronoi regions, filled with buildings that skip the road lines.
export function generateCity(seed: number): GeneratedCity {
  const rng = makeRng(seed);
  const half = GRID / 2;

  // Seed points placed roughly in a ring plus one centre, then jittered.
  const anchors = [
    { gx: half - 7, gy: half - 6 },
    { gx: half + 6, gy: half - 7 },
    { gx: half - 6, gy: half + 7 },
    { gx: half + 7, gy: half + 5 },
    { gx: half, gy: half },
  ].map((a) => ({ gx: a.gx + randInt(rng, -1, 1), gy: a.gy + randInt(rng, -1, 1) }));

  const districts: District[] = DISTRICT_BLUEPRINTS.map((bp, i) => ({
    id: `d${i}`,
    name: bp.name,
    color: bp.color,
    cells: [],
    population: 0,
    potential: 0,
    incomeLevel: bp.income,
    businessDensity: bp.biz,
    demandFactor: 0.55 + rng() * 0.35,
    competition: bp.comp,
    coverage: 0,
    mobileCoverage: 0,
    mobileSubs: 0,
    satisfaction: 70,
    unlocked: i === 0,
    entryCost: i === 0 ? 0 : 0, // filled in below once population is known
    center: anchors[i],
  }));

  // Assign every cell to its nearest anchor.
  for (let gx = 0; gx < GRID; gx++) {
    for (let gy = 0; gy < GRID; gy++) {
      let best = 0;
      let bestD = Infinity;
      anchors.forEach((a, i) => {
        const d = (a.gx - gx) ** 2 + (a.gy - gy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      districts[best].cells.push({ gx, gy });
    }
  }

  const buildings: Building[] = [];
  for (const d of districts) {
    for (const cell of d.cells) {
      if (isRoad(cell.gx, cell.gy)) continue;
      // Leave gaps so the city reads as blocks rather than a solid mass.
      if (rng() < 0.16) continue;
      const kind = weightedKind(rng, d.incomeLevel);
      const [fmin, fmax] = FLOORS[kind];
      const [hmin, hmax] = HOUSEHOLDS[kind];
      const households = kind === 'park' ? 0 : randInt(rng, hmin, hmax);
      buildings.push({
        id: `b_${cell.gx}_${cell.gy}`,
        gx: cell.gx,
        gy: cell.gy,
        districtId: d.id,
        kind,
        floors: randInt(rng, fmin, fmax),
        households,
        segment: segmentOf(kind),
        connected: 0,
        lastConnectedAt: -99999,
        seed: Math.floor(rng() * 1e6),
      });
    }
  }

  for (const d of districts) {
    const own = buildings.filter((b) => b.districtId === d.id);
    d.population = own.reduce((s, b) => s + b.households * 2.4, 0) | 0;
    d.potential = own.filter((b) => b.segment === 'residential').reduce((s, b) => s + b.households, 0);
    d.entryCost = d.unlocked ? 0 : Math.round((18000 + d.potential * 12) / 1000) * 1000;
  }

  return { districts, buildings };
}

export function districtAt(districts: District[], gx: number, gy: number): District | undefined {
  return districts.find((d) => d.cells.some((c) => c.gx === gx && c.gy === gy));
}
