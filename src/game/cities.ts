import type { District } from './types';

export interface DistrictBlueprint {
  name: string;
  color: string;
  income: District['incomeLevel'];
  biz: number;
  comp: number;
}

export interface CityDefinition {
  name: string;
  blurb: string;
  blurbTr: string;
  density: number;
  licenceCostMul: number;
  competitionMul: number;
  districts: DistrictBlueprint[];
}

export const CITIES: CityDefinition[] = [
  {
    name: 'Marmara',
    blurb: 'Dense, wealthy, and already contested. The intended starting city.',
    blurbTr: 'Yoğun, varlıklı ve rekabetçi. Önerilen başlangıç şehri.',
    density: 1,
    licenceCostMul: 1,
    competitionMul: 1,
    districts: [
      { name: 'Kadıköy', color: '#4d8dff', income: 'medium', biz: 0.35, comp: 0.18 },
      { name: 'Ataşehir', color: '#a78bfa', income: 'high', biz: 0.6, comp: 0.35 },
      { name: 'Üsküdar', color: '#3ee6d6', income: 'medium', biz: 0.22, comp: 0.24 },
      { name: 'Beşiktaş', color: '#ffc857', income: 'high', biz: 0.7, comp: 0.42 },
      { name: 'Bakırköy', color: '#7ee787', income: 'low', biz: 0.28, comp: 0.3 },
    ],
  },
  {
    name: 'Karadeniz',
    blurb: 'Smaller districts, lower licence fees, and longer paths between customers.',
    blurbTr: 'Daha küçük ilçeler, düşük lisans ücretleri ve müşteriler arasında uzun rotalar.',
    density: 0.82,
    licenceCostMul: 0.82,
    competitionMul: 0.85,
    districts: [
      { name: 'Sahil', color: '#4d8dff', income: 'medium', biz: 0.28, comp: 0.16 },
      { name: 'Liman', color: '#a78bfa', income: 'medium', biz: 0.58, comp: 0.3 },
      { name: 'Yayla', color: '#3ee6d6', income: 'low', biz: 0.18, comp: 0.18 },
      { name: 'Merkez', color: '#ffc857', income: 'high', biz: 0.62, comp: 0.34 },
      { name: 'Sanayi', color: '#7ee787', income: 'low', biz: 0.48, comp: 0.25 },
    ],
  },
  {
    name: 'Ege',
    blurb: 'Fast growth, seasonal demand, and aggressive rivals around the commercial core.',
    blurbTr: 'Hızlı büyüme, dönemsel talep ve ticari merkezde agresif rakipler.',
    density: 0.92,
    licenceCostMul: 0.94,
    competitionMul: 1.18,
    districts: [
      { name: 'Kordon', color: '#4d8dff', income: 'high', biz: 0.52, comp: 0.3 },
      { name: 'Bornova', color: '#a78bfa', income: 'medium', biz: 0.42, comp: 0.36 },
      { name: 'Karşıyaka', color: '#3ee6d6', income: 'high', biz: 0.38, comp: 0.34 },
      { name: 'Konak', color: '#ffc857', income: 'high', biz: 0.74, comp: 0.5 },
      { name: 'Gaziemir', color: '#7ee787', income: 'low', biz: 0.46, comp: 0.3 },
    ],
  },
];

export function cityByName(name: string) {
  return CITIES.find((city) => city.name === name) ?? CITIES[0];
}
