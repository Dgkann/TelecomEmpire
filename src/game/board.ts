import { MINUTES_PER_DAY } from './constants';
import { computeRoutes, isRedundant } from './network';
import { recordLedger } from './financeLedger';
import { isRoad } from './cityGen';
import { uid } from './rng';
import { clamp } from './util';
import type { GameState, StrategyState } from './types';
import { line } from './lang';

export function initialStrategy(minutes: number): StrategyState {
  return {
    decision: null,
    nextDecisionAt: minutes + 5 * MINUTES_PER_DAY,
    history: [],
    acquisitions: [],
    developments: [],
    challenge: null,
    challengesCompleted: 0,
    nextChallengeAt: minutes + 30 * MINUTES_PER_DAY,
  };
}

export function boardHistory(state: GameState, text: string, textTr: string) {
  state.strategy = {
    ...state.strategy,
    history: [{ id: uid('board'), at: state.minutes, text, textTr }, ...state.strategy.history].slice(0, 24),
  };
}

export const DECISIONS = {
  renewal: {
    title: ['Connected neighbourhood fund', 'Bağlı mahalle fonu'],
    description: [
      'The council will release new housing if you fund local development. More homes also mean more network demand.',
      'Belediye, yerel gelişimi desteklersen yeni konut alanları açacak. Daha fazla hane, daha fazla şebeke talebi demek.',
    ],
    options: [
      {
        id: 'invest',
        title: ['Fund the district', 'İlçeye yatırım yap'],
        detail: [
          'Develop up to 8 buildings, add homes and earn 4 reputation. Requires 40% coverage and 65 satisfaction.',
          'En fazla 8 binayı geliştir, yeni haneler ekle ve 4 itibar kazan. %40 kapsama ve 65 memnuniyet gerekir.',
        ],
        cost: 360000,
      },
      {
        id: 'survey',
        title: ['Fund a feasibility study', 'Fizibilite çalışması yaptır'],
        detail: [
          'Gain 12 research points; housing stays unchanged.',
          '12 araştırma puanı kazan; konut sayısı değişmez.',
        ],
        cost: 70000,
      },
      {
        id: 'decline',
        title: ['Keep the reserve', 'Nakit rezervini koru'],
        detail: ['Pass without a penalty.', 'Ceza almadan teklifi geç.'],
        cost: 0,
      },
    ],
  },
  festival: {
    title: ['The city is going live', 'Şehir canlı yayına geçiyor'],
    description: [
      'A three-day festival needs an operator. Sponsorship will put your capacity to the test.',
      'Üç günlük festival bir operatör arıyor. Sponsorluk, şebeke kapasiteni sınayacak.',
    ],
    options: [
      {
        id: 'sponsor',
        title: ['Become the sponsor', 'Sponsor ol'],
        detail: [
          '+6 reputation and +8 research points. City traffic increases 60% for 3 days.',
          '+6 itibar ve +8 araştırma puanı. Şehir trafiği 3 gün boyunca %60 artar.',
        ],
        cost: 240000,
      },
      {
        id: 'community',
        title: ['Support the community', 'Yerel topluluğu destekle'],
        detail: ['+2 reputation, no additional traffic.', '+2 itibar, ek trafik yok.'],
        cost: 80000,
      },
      {
        id: 'decline',
        title: ['Stay focused on service', 'Hizmete odaklan'],
        detail: ['Pass without a penalty.', 'Ceza almadan teklifi geç.'],
        cost: 0,
      },
    ],
  },
  training: {
    title: ['Engineering fellowship', 'Mühendislik gelişim programı'],
    description: [
      'Choose how to strengthen the operator: practical expertise or new research.',
      'Operatörünü nasıl güçlendireceğini seç: saha becerisi mi, yeni araştırma mı?',
    ],
    options: [
      {
        id: 'crews',
        title: ['Train the field crews', 'Saha ekiplerini eğit'],
        detail: [
          'Every current field crew gains one skill level, up to level 5.',
          'Mevcut tüm saha ekipleri bir beceri seviyesi kazanır; üst sınır 5.',
        ],
        cost: 180000,
      },
      {
        id: 'lab',
        title: ['Sponsor the lab', 'Laboratuvarı destekle'],
        detail: ['Gain 30 research points.', '30 araştırma puanı kazan.'],
        cost: 140000,
      },
      {
        id: 'decline',
        title: ['Defer investment', 'Yatırımı ertele'],
        detail: ['Pass without a penalty.', 'Ceza almadan teklifi geç.'],
        cost: 0,
      },
    ],
  },
};

export function developDistrict(state: GameState, districtId: string, intensity: number) {
  const district = state.districts.find((d) => d.id === districtId && d.unlocked);
  if (!district) return 0;
  const candidates = state.buildings
    .filter((b) => b.districtId === districtId && b.kind !== 'park' && b.floors < 12)
    .sort((a, b) => b.connected - a.connected || a.seed - b.seed)
    .slice(0, Math.max(0, intensity - 2));
  const selected = new Set(candidates.map((b) => b.id));
  let households = 0;
  state.buildings = state.buildings.map((b) => {
    if (!selected.has(b.id)) return b;
    const extra = 4 + Math.abs(b.seed % 7);
    households += extra;
    // New homes start unconnected; development cannot conjure subscribers.
    return {
      ...b,
      floors: b.floors + 1,
      households: b.households + extra,
      connected: (b.connected * b.households) / (b.households + extra),
    };
  });
  const empty = district.cells
    .filter(
      (c) =>
        !isRoad(c.gx, c.gy) &&
        !state.buildings.some((b) => b.gx === c.gx && b.gy === c.gy) &&
        !state.nodes.some((n) => n.gx === c.gx && n.gy === c.gy),
    )
    .slice(0, Math.max(0, intensity - selected.size));
  for (const c of empty) {
    const id = uid('growth');
    selected.add(id);
    households += 20;
    state.buildings = [
      ...state.buildings,
      {
        id,
        gx: c.gx,
        gy: c.gy,
        districtId,
        kind: 'apartment',
        floors: 3,
        households: 20,
        segment: 'residential',
        connected: 0,
        lastConnectedAt: -1000,
        seed: (c.gx * 7919 + c.gy * 53) >>> 0,
      },
    ];
  }
  if (!households) return 0;
  state.districts = state.districts.map((d) =>
    d.id === districtId ? { ...d, potential: d.potential + households, population: d.population + households * 2 } : d,
  );
  state.strategy = {
    ...state.strategy,
    developments: [
      { districtId, at: state.minutes, buildingIds: [...selected], households },
      ...state.strategy.developments,
    ].slice(0, 20),
  };
  boardHistory(
    state,
    `${district.name}: ${households} new homes; ${selected.size} buildings developed.`,
    `${district.name}: ${households} yeni hane; ${selected.size} bina geliştirildi.`,
  );
  return households;
}

export function decisionIssue(state: GameState, decisionId: string, optionId: string): string | null {
  const decision = state.strategy.decision;
  if (state.gameOver || !decision || decision.id !== decisionId || state.minutes >= decision.dueAt) return 'expired';
  const option = DECISIONS[decision.kind].options.find((o) => o.id === optionId);
  if (!option) return 'invalid';
  if (state.money < option.cost) return 'cash';
  if (optionId === 'invest') {
    const district = state.districts.find((d) => d.id === decision.districtId);
    if (!district?.unlocked || district.coverage < 0.4 || district.satisfaction < 65) return 'service';
    if (!state.buildings.some((b) => b.districtId === district.id && b.kind !== 'park' && b.floors < 12))
      return 'developed';
  }
  if (optionId === 'sponsor' && state.activeEvent) return 'event';
  if (optionId === 'crews' && !state.technicians.some((t) => t.skill < 5)) return 'crews';
  return null;
}

export function resolveDecision(state: GameState, decisionId: string, optionId: string): GameState | null {
  if (decisionIssue(state, decisionId, optionId)) return null;
  const decision = state.strategy.decision!;
  const definition = DECISIONS[decision.kind];
  const option = definition.options.find((o) => o.id === optionId)!;
  const next: GameState = { ...state, strategy: { ...state.strategy, decision: null } };
  next.money -= option.cost;
  recordLedger(
    next,
    'strategic_investment',
    line(`${definition.title[0]}: ${option.title[0]}`, `${definition.title[1]}: ${option.title[1]}`),
    -option.cost,
  );
  if (optionId === 'invest') {
    developDistrict(next, decision.districtId, 8);
    next.reputation = clamp(next.reputation + 4, 0, 100);
  }
  if (optionId === 'survey') next.researchPoints += 12;
  if (optionId === 'lab') next.researchPoints += 30;
  if (optionId === 'crews') next.technicians = next.technicians.map((t) => ({ ...t, skill: Math.min(5, t.skill + 1) }));
  if (optionId === 'community') next.reputation = clamp(next.reputation + 2, 0, 100);
  if (optionId === 'sponsor') {
    next.reputation = clamp(next.reputation + 6, 0, 100);
    next.researchPoints += 8;
    next.activeEvent = {
      name: 'Connected city festival',
      blurb: 'Your sponsorship brings three days of heavy streaming.',
      mul: 1.6,
      endsAt: next.minutes + 3 * MINUTES_PER_DAY,
    };
    next.nextEventAt = Math.max(next.nextEventAt, next.activeEvent.endsAt + MINUTES_PER_DAY);
  }
  boardHistory(next, `${definition.title[0]}: ${option.title[0]}.`, `${definition.title[1]}: ${option.title[1]}.`);
  return next;
}

export function challengeProgress(state: GameState) {
  const challenge = state.strategy.challenge;
  if (!challenge) return null;
  let current = 0;
  if (challenge.kind === 'resilience') {
    const routes = computeRoutes(state);
    current = state.nodes.filter(
      (n) => (n.kind === 'pop' || n.kind === 'access') && isRedundant(state, n.id, routes),
    ).length;
  } else if (challenge.kind === 'enterprise') current = state.contracts.length;
  else current = Math.floor(state.districts.reduce((sum, d) => sum + d.mobileSubs, 0));
  return {
    ...challenge,
    current,
    healthReady: state.stats.health >= 85,
    complete: current >= challenge.target && state.stats.health >= 85,
    reward: 15000 + Math.min(5, state.strategy.challengesCompleted) * 5000,
  };
}

export function claimChallenge(state: GameState): GameState | null {
  const progress = challengeProgress(state);
  if (state.gameOver || !progress?.complete || state.minutes >= progress.dueAt) return null;
  const next = {
    ...state,
    money: state.money + progress.reward,
    researchPoints: state.researchPoints + 20,
    strategy: {
      ...state.strategy,
      challenge: null,
      challengesCompleted: state.strategy.challengesCompleted + 1,
      nextChallengeAt: state.minutes + 15 * MINUTES_PER_DAY,
    },
  };
  recordLedger(
    next,
    'milestone_reward',
    line('Operator charter completed', 'Operatör beratı tamamlandı'),
    progress.reward,
  );
  boardHistory(
    next,
    'Operator charter completed. The next charter will be harder.',
    'Operatör hedefi tamamlandı. Sıradaki hedef daha zor olacak.',
  );
  return next;
}

export function tickBoard(state: GameState) {
  state.strategy = { ...state.strategy };
  if (state.strategy.decision && state.minutes >= state.strategy.decision.dueAt) {
    boardHistory(
      state,
      'A city proposal expired without a penalty.',
      'Şehir teklifinin süresi doldu; ceza uygulanmadı.',
    );
    state.strategy.decision = null;
  }
  if (!state.strategy.decision && state.minutes >= state.strategy.nextDecisionAt) {
    const kinds = ['renewal', 'festival', 'training'] as const;
    const cycle = Math.floor(state.minutes / MINUTES_PER_DAY / 12);
    const districts = state.districts.filter((d) => d.unlocked);
    if (districts.length) {
      const kind = kinds[cycle % kinds.length];
      const district = districts[cycle % districts.length];
      state.strategy.decision = {
        id: uid('decision'),
        kind,
        districtId: district.id,
        dueAt: state.minutes + 7 * MINUTES_PER_DAY,
      };
      boardHistory(
        state,
        `${DECISIONS[kind].title[0]}: a decision is waiting.`,
        `${DECISIONS[kind].title[1]}: bir karar bekliyor.`,
      );
    }
    state.strategy.nextDecisionAt = state.minutes + 12 * MINUTES_PER_DAY;
  }
  if (state.strategy.challenge && state.minutes >= state.strategy.challenge.dueAt) {
    boardHistory(
      state,
      'Operator charter expired. Another opportunity will follow.',
      'Operatör hedefinin süresi doldu. Yeni bir fırsat gelecek.',
    );
    state.strategy.challenge = null;
    state.strategy.nextChallengeAt = state.minutes + 15 * MINUTES_PER_DAY;
  }
  if (state.rank >= 1 && !state.strategy.challenge && state.minutes >= state.strategy.nextChallengeAt) {
    const kinds = ['resilience', 'enterprise', 'mobile'] as const;
    const level = state.strategy.challengesCompleted;
    const kind = kinds[level % 3];
    const target =
      kind === 'resilience'
        ? Math.min(8, 2 + Math.floor(level / 3))
        : kind === 'enterprise'
          ? Math.min(10, 3 + Math.floor(level / 3))
          : 500 + Math.min(5, Math.floor(level / 3)) * 500;
    state.strategy.challenge = { kind, target, dueAt: state.minutes + 90 * MINUTES_PER_DAY };
    boardHistory(state, 'A 90-day operator charter is available.', '90 günlük yeni bir operatör hedefi açıldı.');
  }
}
