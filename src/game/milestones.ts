import { computeRoutes, isRedundant } from './network';
import { recordLedger } from './financeLedger';
import type { GameState } from './types';
import { line } from './lang';

export const MILESTONE_IDS = [
  'connected',
  'customers',
  'resilient',
  'expansion',
  'contract',
  'research',
  'mobile',
] as const;
export type MilestoneId = (typeof MILESTONE_IDS)[number];

export const MILESTONES: Array<{
  id: MilestoneId;
  title: [string, string];
  hint: [string, string];
  reward: number;
  research: number;
  target: number;
}> = [
  {
    id: 'connected',
    title: ['A neighbourhood online', 'Bir mahalle çevrimiçi'],
    hint: [
      'Connect two POPs to a live core. Fibre is what turns a site into a service.',
      'İki POP noktasını çalışan çekirdeğe bağla. Bir noktayı hizmete dönüştüren şey fiberdir.',
    ],
    reward: 90000,
    research: 5,
    target: 2,
  },
  {
    id: 'customers',
    title: ['Your first 400 customers', 'İlk 400 müşterin'],
    hint: [
      'Reach 400 fixed subscribers. Expand coverage and keep prices attractive.',
      '400 sabit internet abonesine ulaş. Kapsamayı genişlet, fiyatlarını cazip tut.',
    ],
    reward: 70000,
    research: 5,
    target: 400,
  },
  {
    id: 'resilient',
    title: ['Built to stay online', 'Kesintiye dayanıklı ağ'],
    hint: [
      'Give a POP or access site two independent fibre paths to a core.',
      'Bir POP veya erişim noktasına çekirdeğe ulaşan iki bağımsız fiber yolu sağla.',
    ],
    reward: 100000,
    research: 10,
    target: 1,
  },
  {
    id: 'expansion',
    title: ['Beyond the first district', 'İlk ilçenin ötesinde'],
    hint: [
      'Operate a connected POP or access site in two licensed districts.',
      'İki lisanslı ilçede çekirdeğe bağlı POP veya erişim noktası işlet.',
    ],
    reward: 160000,
    research: 10,
    target: 2,
  },
  {
    id: 'contract',
    title: ['Open for business', 'İş dünyasına merhaba'],
    hint: [
      'Sign your first business or enterprise contract. Check the SLA before signing.',
      'İlk ticari veya kurumsal sözleşmeni imzala. İmzalamadan önce hizmet taahhüdünü kontrol et.',
    ],
    reward: 70000,
    research: 5,
    target: 1,
  },
  {
    id: 'research',
    title: ['A smarter network', 'Daha akıllı bir şebeke'],
    hint: [
      'Complete two research projects to improve the way your network operates.',
      'Şebekeni geliştirmek için iki araştırma projesini tamamla.',
    ],
    reward: 100000,
    research: 10,
    target: 2,
  },
  {
    id: 'mobile',
    title: ['The city goes mobile', 'Şehir mobile geçiyor'],
    hint: [
      'Serve 100 mobile subscribers with licensed spectrum and connected towers.',
      'Lisanslı frekans ve bağlı kulelerle 100 mobil aboneye hizmet ver.',
    ],
    reward: 200000,
    research: 15,
    target: 100,
  },
];

export function milestoneProgress(state: GameState) {
  const routes = computeRoutes(state);
  const sites = state.nodes.filter((n) => (n.kind === 'pop' || n.kind === 'access') && !n.down && routes[n.id]);
  const values: Record<MilestoneId, number> = {
    connected: sites.filter((n) => n.kind === 'pop').length,
    customers: state.packages.filter((p) => p.segment === 'residential').reduce((sum, p) => sum + p.subscribers, 0),
    resilient: state.claimedMilestones.includes('resilient')
      ? 1
      : Number(sites.some((n) => isRedundant(state, n.id, routes))),
    expansion: new Set(
      sites.filter((n) => state.districts.some((d) => d.id === n.districtId && d.unlocked)).map((n) => n.districtId),
    ).size,
    contract: state.contracts.length,
    research: state.researchDone.length,
    mobile: state.districts.reduce((sum, d) => sum + d.mobileSubs, 0),
  };
  return MILESTONES.map((m) => ({
    ...m,
    current: Math.floor(values[m.id]),
    progress: Math.min(1, values[m.id] / m.target),
    claimed: state.claimedMilestones.includes(m.id),
  }));
}

// Claiming is atomic and checked again against the current simulation state.
export function claimMilestone(state: GameState, id: string): GameState | null {
  if (state.gameOver) return null;
  const goal = milestoneProgress(state).find((m) => m.id === id);
  if (!goal || goal.claimed || goal.progress < 1) return null;
  const next = {
    ...state,
    claimedMilestones: [...state.claimedMilestones, goal.id],
    money: state.money + goal.reward,
    researchPoints: state.researchPoints + goal.research,
  };
  recordLedger(next, 'milestone_reward', line(goal.title[0], goal.title[1]), goal.reward);
  return next;
}
