import { computeRoutes, isRedundant } from './network';
import { recordLedger } from './financeLedger';
import type { GameState } from './types';
import { line } from './lang';

// Listed in the order players usually reach them; the panel always shows the next one.
export const MILESTONE_IDS = [
  'connected',
  'customers',
  'resilient',
  'expansion',
  'contract',
  'research',
  'growth',
  'districts',
  'laboratory',
  'accounts',
  'protected',
  'mobile',
  'hosting',
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
  // The middle of the game: goals between the second district and the mobile launch.
  {
    id: 'growth',
    title: ['A growing customer base', 'Büyüyen abone tabanı'],
    hint: [
      'Reach 2,000 fixed subscribers. New districts and fair prices both help.',
      '2.000 sabit internet abonesine ulaş. Yeni ilçeler de makul fiyatlar da yardımcı olur.',
    ],
    reward: 200000,
    research: 15,
    target: 2000,
  },
  {
    id: 'districts',
    title: ['Across the city', 'Şehrin dört bir yanında'],
    hint: [
      'Operate a connected POP or access site in three licensed districts.',
      'Üç lisanslı ilçede çekirdeğe bağlı POP veya erişim noktası işlet.',
    ],
    reward: 250000,
    research: 15,
    target: 3,
  },
  {
    id: 'laboratory',
    title: ['A research programme', 'Bir araştırma programı'],
    hint: [
      'Complete four research projects. Spare research points lower each bill.',
      'Dört araştırma projesini tamamla. Fazla araştırma puanları her bedeli düşürür.',
    ],
    reward: 250000,
    research: 20,
    target: 4,
  },
  {
    id: 'accounts',
    title: ['Trusted by business', 'İş dünyasının güvendiği operatör'],
    hint: [
      'Hold three business or enterprise contracts at the same time.',
      'Aynı anda üç ticari veya kurumsal sözleşme yürüt.',
    ],
    reward: 200000,
    research: 15,
    target: 3,
  },
  {
    id: 'protected',
    title: ['No single point of failure', 'Tek noktada çökmeyen ağ'],
    hint: [
      'Give four POP or access sites two independent fibre paths to a core.',
      'Dört POP veya erişim noktasına çekirdeğe ulaşan iki bağımsız fiber yolu sağla.',
    ],
    reward: 200000,
    research: 20,
    target: 4,
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
  {
    id: 'hosting',
    title: ['Hosting the city', 'Şehrin veri merkezi'],
    hint: [
      'Build your first data centre; the small starter facility counts.',
      'İlk veri merkezini kur; küçük başlangıç tesisi de sayılır.',
    ],
    reward: 300000,
    research: 25,
    target: 1,
  },
];

export function milestoneProgress(state: GameState) {
  const routes = computeRoutes(state);
  const sites = state.nodes.filter((n) => (n.kind === 'pop' || n.kind === 'access') && !n.down && routes[n.id]);
  const districts = new Set(
    sites.filter((n) => state.districts.some((d) => d.id === n.districtId && d.unlocked)).map((n) => n.districtId),
  ).size;
  const fixedCustomers = state.packages
    .filter((p) => p.segment === 'residential')
    .reduce((sum, p) => sum + p.subscribers, 0);
  const values: Record<MilestoneId, number> = {
    connected: sites.filter((n) => n.kind === 'pop').length,
    customers: fixedCustomers,
    resilient: state.claimedMilestones.includes('resilient')
      ? 1
      : Number(sites.some((n) => isRedundant(state, n.id, routes))),
    expansion: districts,
    contract: state.contracts.length,
    research: state.researchDone.length,
    growth: fixedCustomers,
    districts,
    laboratory: state.researchDone.length,
    accounts: state.contracts.length,
    protected: sites.filter((n) => isRedundant(state, n.id, routes)).length,
    mobile: state.districts.reduce((sum, d) => sum + d.mobileSubs, 0),
    hosting: state.nodes.filter((n) => n.kind === 'datacenter').length,
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
