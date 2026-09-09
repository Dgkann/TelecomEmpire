import type { NetNode } from '../../game/types';

export const COMPANY = '#2dd4bf';

export const MAP = {
  ground: '#536c70',
  groundAlt: '#455f68',
  road: '#233a46',
  roadMark: '#7f9295',
  locked: '#243c48',
};

export const COVERAGE_RADIUS: Record<NetNode['kind'], number> = {
  core: 3,
  pop: 6.5,
  access: 3.4,
  tower: 8.5,
  datacenter: 2,
};
