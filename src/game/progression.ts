import { playerShareTarget } from './competitors';
import { clamp, plural } from './util';
import type { GameState } from './types';

// The company ladder.

export interface RankRequirement {
  label: string;
  labelTr: string;
  action: (s: GameState) => {
    screen: 'map' | 'company' | 'research';
    label: string;
    labelTr: string;
    tool?: 'datacenter';
  };
  // 0..1 so the UI can draw a bar without knowing what the rule is.
  progress: (s: GameState) => number;
  detail: (s: GameState, tr?: boolean) => string;
}

export interface Rank {
  id: string;
  name: string;
  nameTr: string;
  blurb: string;
  blurbTr: string;
  requirements: RankRequirement[];
  // Bigger operators borrow on better terms.
  creditMultiplier: number;
}

// Counted locally rather than imported.
export function customerCount(s: GameState) {
  const fixed = s.buildings.reduce(
    (sum, b) => (b.segment === 'residential' ? sum + b.households * b.connected : sum),
    0,
  );
  const mobile = s.districts.reduce((sum, d) => sum + d.mobileSubs, 0);
  return fixed + mobile + s.contracts.length;
}

// Your share of the whole city, weighted by how many people live in each district.
export function cityShare(s: GameState) {
  const weight = s.districts.reduce((sum, d) => sum + d.potential, 0);
  if (weight <= 0) return 0;
  return s.districts.reduce((sum, d) => sum + playerShareTarget(s, d) * d.potential, 0) / weight;
}

const customers = (target: number): RankRequirement => ({
  action: () => ({ screen: 'company', label: 'Review customer growth', labelTr: 'Müşteri büyümesini incele' }),
  label: `${target.toLocaleString()} ${plural(target, 'customer')}`,
  labelTr: `${target.toLocaleString('tr-TR')} müşteri`,
  progress: (s) => clamp(customerCount(s) / target, 0, 1),
  detail: (s, tr) => {
    const locale = tr ? 'tr-TR' : 'en-US';
    return `${Math.round(customerCount(s)).toLocaleString(locale)} / ${target.toLocaleString(locale)}`;
  },
});

const districts = (target: number): RankRequirement => ({
  action: () => ({ screen: 'map', label: 'Explore districts', labelTr: 'İlçeleri keşfet' }),
  label: `${target} ${plural(target, 'district')} licensed`,
  labelTr: `${target} lisanslı ilçe`,
  progress: (s) => clamp(s.districts.filter((d) => d.unlocked).length / target, 0, 1),
  detail: (s) => `${s.districts.filter((d) => d.unlocked).length} / ${target}`,
});

const share = (target: number): RankRequirement => ({
  action: () => ({ screen: 'company', label: 'Review market position', labelTr: 'Pazar konumunu incele' }),
  label: `${Math.round(target * 100)}% of the city`,
  labelTr: `Şehir payı %${Math.round(target * 100)}`,
  progress: (s) => clamp(cityShare(s) / target, 0, 1),
  detail: (s, tr) =>
    tr
      ? `%${Math.round(cityShare(s) * 100)} / %${Math.round(target * 100)}`
      : `${Math.round(cityShare(s) * 100)}% / ${Math.round(target * 100)}%`,
});

const research = (id: string, label: string, labelTr: string): RankRequirement => ({
  action: () => ({ screen: 'research', label: 'Open research', labelTr: 'Araştırmayı aç' }),
  label,
  labelTr,
  progress: (s) => (s.researchDone.includes(id) ? 1 : 0),
  detail: (s, tr) =>
    s.researchDone.includes(id) ? (tr ? 'tamamlandı' : 'done') : tr ? 'araştırılmadı' : 'not researched',
});

const dataCentres = (target: number): RankRequirement => ({
  action: (s) =>
    s.nodes.some((n) => n.kind === 'datacenter' && n.tier === 0)
      ? { screen: 'research', label: 'Expand the small data centre', labelTr: 'Küçük veri merkezini genişlet' }
      : s.researchDone.includes('edge_compute')
        ? { screen: 'map', tool: 'datacenter', label: 'Build a data centre', labelTr: 'Veri merkezi kur' }
        : { screen: 'research', label: 'Research edge compute', labelTr: 'Uç bilişimi araştır' },
  label: `${target} full data centre${target > 1 ? 's' : ''}`,
  labelTr: `${target} tam veri merkezi`,
  progress: (s) => clamp(s.nodes.filter((n) => n.kind === 'datacenter' && n.tier >= 1).length / target, 0, 1),
  detail: (s) => `${s.nodes.filter((n) => n.kind === 'datacenter' && n.tier >= 1).length} / ${target}`,
});

export const RANKS: Rank[] = [
  {
    id: 'local',
    name: 'Local ISP',
    nameTr: 'Yerel Servis Sağlayıcı',
    blurb: 'One district, a few hundred customers, and a lot to prove.',
    blurbTr: 'Tek ilçe, birkaç yüz müşteri ve kanıtlanacak çok şey.',
    requirements: [],
    creditMultiplier: 1,
  },
  {
    id: 'city',
    name: 'City Operator',
    nameTr: 'Şehir Operatörü',
    blurb: 'You are no longer a hobby. Two districts and a real subscriber base.',
    blurbTr: 'Artık bir hobi değilsin. İki ilçe ve gerçek bir abone tabanı.',
    requirements: [customers(1500), districts(2)],
    creditMultiplier: 1.2,
  },
  {
    id: 'regional',
    name: 'Regional Operator',
    nameTr: 'Bölgesel Operatör',
    blurb: 'Fixed and mobile, across most of the city.',
    blurbTr: 'Şehrin büyük bölümünde sabit ve mobil hizmet.',
    requirements: [customers(4000), districts(4), research('mobile_4g', 'Mobile launched', 'Mobil hizmet başladı')],
    creditMultiplier: 1.5,
  },
  {
    id: 'national',
    name: 'National Operator',
    nameTr: 'Ulusal Operatör',
    blurb: 'The whole city, a third of the market, and your own data centre.',
    blurbTr: 'Şehrin tamamı, pazarın üçte biri ve kendi veri merkezin.',
    requirements: [customers(9000), districts(5), share(0.35), dataCentres(1)],
    creditMultiplier: 2,
  },
  {
    id: 'global',
    name: 'Global Telecom',
    nameTr: 'Küresel Telekom',
    blurb: 'You are the network everyone else is measured against.',
    blurbTr: 'Diğer herkes senin şebekene göre ölçülüyor.',
    requirements: [
      customers(15000),
      share(0.5),
      research('mobile_5g', '5G Standalone', 'Bağımsız 5G'),
      research('backbone100g', '100G Backbone', '100G omurga'),
    ],
    creditMultiplier: 2.6,
  },
];

export const rankOf = (s: GameState) => RANKS[Math.min(s.rank, RANKS.length - 1)];
export const nextRank = (s: GameState): Rank | null => RANKS[s.rank + 1] ?? null;

// A rung is earned only when every requirement on it is fully met.
export function meetsRank(s: GameState, rank: Rank) {
  return rank.requirements.every((r) => r.progress(s) >= 1);
}

export function rankProgress(s: GameState) {
  const next = nextRank(s);
  if (!next) return 1;
  if (!next.requirements.length) return 1;
  return next.requirements.reduce((sum, r) => sum + r.progress(s), 0) / next.requirements.length;
}

// Called once a day. Returns the rank just earned, if any.
export function checkPromotion(s: GameState): Rank | null {
  const next = nextRank(s);
  if (!next || !meetsRank(s, next)) return null;
  s.rank += 1;
  return next;
}

export const isTopRank = (s: GameState) => s.rank >= RANKS.length - 1;
