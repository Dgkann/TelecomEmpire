import { create } from 'zustand';
import {
  FIBER_COST_PER_UNIT,
  FIBER_UPGRADE_COST_PER_UNIT,
  MINUTES_PER_DAY,
  NODE_SPECS,
  linkCapacity,
  nodeCapacity,
  nodeUpgradeCost,
  towerCapacity,
} from '../game/constants';
import { createLoan, creditLimit } from '../game/finance';
import { clearSave, loadGame, saveGame } from '../game/save';
import { RESEARCH, researchById, researchModifiers } from '../game/research';
import {
  createNewGame,
  dispatch as dispatchTechnician,
  pushLog,
  redistributePackages,
  step,
  type NewGameOptions,
} from '../game/simulation';
import { uid } from '../game/rng';
import { personName } from '../game/names';
import { makeRng } from '../game/rng';
import type { GameState, NodeKind, OverlayMode, Screen, Speed, StaffRole } from '../game/types';

export type BuildTool = NodeKind | 'fiber' | null;

export interface Selection {
  type: 'node' | 'link' | 'district' | 'building';
  id: string;
}

export interface Toast {
  id: string;
  text: string;
  tone: 'good' | 'bad' | 'info';
  // Grid position for floating map toasts; omitted for corner toasts.
  gx?: number;
  gy?: number;
}

interface UiState {
  screen: Screen;
  overlay: OverlayMode;
  tool: BuildTool;
  // First endpoint chosen while drawing fibre.
  linkFrom: string | null;
  selection: Selection | null;
  focusOn: { gx: number; gy: number; at: number } | null;
  openIncidentId: string | null;
  toasts: Toast[];
  soundOn: boolean;
  showHelp: boolean;
}

interface Store extends UiState {
  game: GameState | null;
  started: boolean;

  newGame: (opts: NewGameOptions) => void;
  continueGame: () => boolean;
  resetSave: () => void;
  save: () => void;
  quitToMenu: () => void;

  tick: () => void;
  setSpeed: (speed: Speed) => void;

  setScreen: (screen: Screen) => void;
  setOverlay: (overlay: OverlayMode) => void;
  setTool: (tool: BuildTool) => void;
  select: (selection: Selection | null) => void;
  focus: (gx: number, gy: number) => void;
  openIncident: (id: string | null) => void;
  toast: (text: string, tone?: Toast['tone'], gx?: number, gy?: number) => void;
  dismissToast: (id: string) => void;
  toggleSound: () => void;
  setShowHelp: (v: boolean) => void;

  placeNode: (kind: NodeKind, gx: number, gy: number) => void;
  clickNodeForLink: (nodeId: string) => void;
  cancelBuild: () => void;
  upgradeNode: (id: string) => void;
  repairNode: (id: string) => void;
  sellNode: (id: string) => void;
  upgradeLink: (id: string) => void;
  sellLink: (id: string) => void;

  unlockDistrict: (id: string) => void;
  updatePackage: (id: string, patch: { price?: number; speedMbps?: number; active?: boolean; name?: string }) => void;
  startResearch: (id: string) => void;
  acceptOffer: (id: string) => void;
  declineOffer: (id: string) => void;
  dispatchTech: (incidentId: string, mode: 'emergency' | 'normal') => void;
  hireTechnician: () => void;
  hireEmployee: (role: StaffRole) => void;
  fireStaff: (id: string) => void;
  placeBid: (amount: number) => void;
  dismissAuction: () => void;
  setMarketing: (value: number) => void;
  setRetention: (value: number) => void;
  takeLoan: (principal: number, termMonths: number) => void;
  repayLoan: (id: string) => void;
  setTransitTier: (tier: number) => void;
  toggleBackupTransit: () => void;
  toggleAutoDispatch: () => void;
  advanceTutorial: (stepIndex: number) => void;
  skipTutorial: () => void;
}

const initialUi: UiState = {
  screen: 'map',
  overlay: 'normal',
  tool: null,
  linkFrom: null,
  selection: null,
  focusOn: null,
  openIncidentId: null,
  toasts: [],
  soundOn: true,
  showHelp: false,
};

function withGame(set: (fn: (s: Store) => Partial<Store>) => void, mutate: (g: GameState) => void) {
  set((s) => {
    if (!s.game) return {};
    const g: GameState = { ...s.game };
    mutate(g);
    return { game: g };
  });
}

export const useGame = create<Store>((set, get) => ({
  ...initialUi,
  game: null,
  started: false,

  newGame: (opts) => {
    const game = createNewGame(opts);
    saveGame(game);
    set({ ...initialUi, game, started: true });
  },

  continueGame: () => {
    const game = loadGame();
    if (!game) return false;
    set({ ...initialUi, game: { ...game, speed: 0 }, started: true });
    return true;
  },

  resetSave: () => {
    clearSave();
    set({ game: null, started: false });
  },

  save: () => {
    const g = get().game;
    if (g) {
      saveGame(g);
      get().toast('Game saved.', 'good');
    }
  },

  quitToMenu: () => {
    const g = get().game;
    if (g) saveGame(g);
    set({ started: false });
  },

  tick: () => {
    const s = get();
    if (!s.game || s.game.speed === 0) return;
    let g = s.game;
    for (let i = 0; i < s.game.speed; i++) g = step(g);

    // Autosave once a game day.
    if (g.minutes - g.autosaveAt > MINUTES_PER_DAY) {
      g = { ...g, autosaveAt: g.minutes };
      saveGame(g);
    }
    set({ game: g });
  },

  setSpeed: (speed) => withGame(set, (g) => void (g.speed = speed)),

  setScreen: (screen) => set({ screen, tool: null, linkFrom: null }),
  setOverlay: (overlay) => set({ overlay }),
  setTool: (tool) => set((s) => ({ tool: s.tool === tool ? null : tool, linkFrom: null, selection: null })),
  select: (selection) => set({ selection }),
  focus: (gx, gy) => set({ focusOn: { gx, gy, at: Date.now() }, screen: 'map' }),
  openIncident: (id) => set({ openIncidentId: id }),
  toast: (text, tone = 'info', gx, gy) => {
    const id = uid('toast');
    set((s) => ({ toasts: [...s.toasts, { id, text, tone, gx, gy }] }));
    setTimeout(() => get().dismissToast(id), 2600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
  setShowHelp: (v) => set({ showHelp: v }),

  placeNode: (kind, gx, gy) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const mods = researchModifiers(g.researchDone);
    const spec = NODE_SPECS[kind];
    if (spec.requires && !g.researchDone.includes(spec.requires)) {
      s.toast(`${spec.label} needs research first.`, 'bad');
      return;
    }
    const district = g.districts.find((d) => d.cells.some((c) => c.gx === gx && c.gy === gy));
    if (!district) {
      s.toast('Pick a tile inside the city.', 'bad');
      return;
    }
    if (!district.unlocked) {
      s.toast(`${district.name} is not licensed yet.`, 'bad');
      return;
    }
    if (g.nodes.some((n) => n.gx === gx && n.gy === gy)) {
      s.toast('Something is already here.', 'bad');
      return;
    }
    const cost = Math.round(spec.baseCost * (kind === 'access' ? mods.accessCostMul : 1));
    if (g.money < cost) {
      s.toast('Not enough money.', 'bad');
      return;
    }

    const capacity =
      kind === 'tower'
        ? towerCapacity(g.spectrum, 1)
        : nodeCapacity(kind, 1) * (kind === 'access' ? mods.accessCapacityMul : 1);
    const count = g.nodes.filter((n) => n.kind === kind).length + 1;
    withGame(set, (draft) => {
      draft.money -= cost;
      draft.nodes = [
        ...draft.nodes,
        {
          id: uid('n'),
          kind,
          name: `${district.name} ${spec.label}${count > 1 ? ` ${count}` : ''}`,
          gx,
          gy,
          districtId: district.id,
          tier: 1,
          capacityGbps: capacity,
          trafficGbps: 0,
          health: 100,
          down: false,
          builtAt: draft.minutes,
        },
      ];
      pushLog(draft, `${spec.label} built in ${district.name}.`, 'good');
    });
    s.toast(`${spec.label} built`, 'good', gx, gy);
  },

  clickNodeForLink: (nodeId) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    if (!s.linkFrom) {
      set({ linkFrom: nodeId });
      return;
    }
    if (s.linkFrom === nodeId) {
      set({ linkFrom: null });
      return;
    }
    const a = g.nodes.find((n) => n.id === s.linkFrom);
    const b = g.nodes.find((n) => n.id === nodeId);
    if (!a || !b) {
      set({ linkFrom: null });
      return;
    }
    if (g.links.some((l) => (l.aId === a.id && l.bId === b.id) || (l.aId === b.id && l.bId === a.id))) {
      s.toast('These are already connected.', 'bad');
      set({ linkFrom: null });
      return;
    }
    const length = Math.hypot(a.gx - b.gx, a.gy - b.gy);
    const cost = Math.round(length * FIBER_COST_PER_UNIT);
    if (g.money < cost) {
      s.toast('Not enough money for that span.', 'bad');
      set({ linkFrom: null });
      return;
    }
    const mods = researchModifiers(g.researchDone);
    withGame(set, (draft) => {
      draft.money -= cost;
      draft.links = [
        ...draft.links,
        {
          id: uid('l'),
          aId: a.id,
          bId: b.id,
          capacityGbps: linkCapacity(1) * mods.linkCapacityMul,
          trafficGbps: 0,
          down: false,
          tier: 1,
          length,
          builtAt: draft.minutes,
        },
      ];
      pushLog(draft, `Fibre span lit: ${a.name} ↔ ${b.name}.`, 'good');
    });
    set({ linkFrom: null });
    s.toast('Fibre lit', 'good', (a.gx + b.gx) / 2, (a.gy + b.gy) / 2);
  },

  cancelBuild: () => set({ tool: null, linkFrom: null }),

  upgradeNode: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const node = g.nodes.find((n) => n.id === id);
    if (!node) return;
    const mods = researchModifiers(g.researchDone);
    const spec = NODE_SPECS[node.kind];
    const maxTier =
      node.kind === 'core' ? mods.maxCoreTier : node.kind === 'tower' ? mods.maxTowerTier : spec.maxTier;
    if (node.tier >= maxTier) {
      s.toast('Needs new research to go further.', 'bad');
      return;
    }
    const cost = nodeUpgradeCost(node.kind, node.tier);
    if (g.money < cost) {
      s.toast('Not enough money.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= cost;
      draft.nodes = draft.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              tier: n.tier + 1,
              capacityGbps:
                n.kind === 'tower' ? towerCapacity(draft.spectrum, n.tier + 1) : nodeCapacity(n.kind, n.tier + 1),
              health: Math.max(n.health, 92),
            }
          : n,
      );
    });
    s.toast(`${node.name} upgraded`, 'good', node.gx, node.gy);
  },

  repairNode: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const node = g.nodes.find((n) => n.id === id);
    if (!node) return;
    const cost = Math.round((100 - node.health) * 260);
    if (cost <= 0) return;
    if (g.money < cost) {
      s.toast('Not enough money.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= cost;
      draft.nodes = draft.nodes.map((n) => (n.id === id ? { ...n, health: 100 } : n));
    });
    s.toast('Maintenance done', 'good', node.gx, node.gy);
  },

  sellNode: (id) => {
    withGame(set, (draft) => {
      const node = draft.nodes.find((n) => n.id === id);
      if (!node) return;
      const refund = Math.round(NODE_SPECS[node.kind].baseCost * 0.35 * node.tier);
      draft.money += refund;
      draft.nodes = draft.nodes.filter((n) => n.id !== id);
      draft.links = draft.links.filter((l) => l.aId !== id && l.bId !== id);
      pushLog(draft, `${node.name} decommissioned (+$${refund.toLocaleString()}).`, 'info');
    });
    set({ selection: null });
  },

  upgradeLink: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const link = g.links.find((l) => l.id === id);
    if (!link) return;
    const mods = researchModifiers(g.researchDone);
    if (link.tier >= mods.maxLinkTier) {
      s.toast('Higher grade optics need research.', 'bad');
      return;
    }
    const cost = Math.round(link.length * FIBER_UPGRADE_COST_PER_UNIT * link.tier);
    if (g.money < cost) {
      s.toast('Not enough money.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= cost;
      draft.links = draft.links.map((l) =>
        l.id === id ? { ...l, tier: l.tier + 1, capacityGbps: linkCapacity(l.tier + 1) * mods.linkCapacityMul } : l,
      );
    });
    s.toast('Fibre upgraded', 'good');
  },

  sellLink: (id) => {
    withGame(set, (draft) => {
      const link = draft.links.find((l) => l.id === id);
      if (!link) return;
      draft.money += Math.round(link.length * FIBER_COST_PER_UNIT * 0.2);
      draft.links = draft.links.filter((l) => l.id !== id);
    });
    set({ selection: null });
  },

  unlockDistrict: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const district = g.districts.find((d) => d.id === id);
    if (!district || district.unlocked) return;
    if (g.money < district.entryCost) {
      s.toast('Not enough money for the licence.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= district.entryCost;
      draft.districts = draft.districts.map((d) => (d.id === id ? { ...d, unlocked: true } : d));
      pushLog(draft, `Licensed to build in ${district.name}.`, 'good');
    });
    s.toast(`${district.name} licensed`, 'good', district.center.gx, district.center.gy);
  },

  updatePackage: (id, patch) =>
    withGame(set, (draft) => {
      draft.packages = draft.packages.map((p) => (p.id === id ? { ...p, ...patch } : p));
      redistributePackages(draft);
    }),

  startResearch: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const node = researchById(id);
    if (!node || g.researchActive || g.researchDone.includes(id)) return;
    if (!node.requires.every((r) => g.researchDone.includes(r))) {
      s.toast('Prerequisites missing.', 'bad');
      return;
    }
    if (g.money < node.cost) {
      s.toast('Not enough money.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= node.cost;
      draft.researchActive = { id, daysLeft: node.days };
      pushLog(draft, `Research started: ${node.name}.`, 'info');
    });
    s.toast(`Researching ${node.name}`, 'good');
  },

  acceptOffer: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const offer = g.offers.find((o) => o.id === id);
    if (!offer) return;
    withGame(set, (draft) => {
      draft.offers = draft.offers.filter((o) => o.id !== id);
      draft.money += offer.signingBonus;
      draft.contracts = [
        ...draft.contracts,
        {
          id: uid('c'),
          clientName: offer.clientName,
          districtId: offer.districtId,
          buildingId: offer.buildingId,
          bandwidthGbps: offer.bandwidthGbps,
          monthlyRevenue: offer.monthlyRevenue,
          slaPercent: offer.slaPercent,
          downtimeMinutes: 0,
          penaltyPaid: 0,
          startedAt: draft.minutes,
          termMonths: offer.termMonths,
          segment: offer.segment,
        },
      ];
      draft.buildings = draft.buildings.map((b) =>
        b.id === offer.buildingId ? { ...b, connected: 1, lastConnectedAt: draft.minutes } : b,
      );
      pushLog(draft, `Signed ${offer.clientName} at $${offer.monthlyRevenue.toLocaleString()}/mo.`, 'good');
    });
    const b = g.buildings.find((x) => x.id === offer.buildingId);
    s.toast(`${offer.clientName} signed`, 'good', b?.gx, b?.gy);
  },

  declineOffer: (id) => withGame(set, (draft) => void (draft.offers = draft.offers.filter((o) => o.id !== id))),

  dispatchTech: (incidentId, mode) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const inc = g.incidents.find((i) => i.id === incidentId);
    if (!inc || inc.resolved) return;
    const tech = g.technicians.find((t) => t.state === 'idle');
    if (!tech) {
      s.toast('Every crew is already out.', 'bad');
      return;
    }
    // Emergency work needs cash up front. A scheduled repair is your own crew's
    // time, so it always goes ahead, otherwise a broke player is stuck with a
    // dead network and no way back.
    if (mode === 'emergency') {
      const cost = Math.round((1200 + inc.repairTotalMinutes * 22) / 100) * 100;
      if (g.money < cost) {
        s.toast('Not enough cash for an emergency call-out.', 'bad');
        return;
      }
    }
    withGame(set, (draft) => dispatchTechnician(draft, incidentId, tech.id, mode));
    set({ openIncidentId: null });
    s.toast(`${tech.name} is on the way`, 'info');
  },

  hireTechnician: () => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const cost = 4000;
    if (g.money < cost) {
      s.toast('Not enough money.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      const rng = makeRng(Math.floor(Math.random() * 1e9));
      const base = draft.nodes.find((n) => n.kind === 'pop') ?? draft.nodes[0];
      draft.money -= cost;
      draft.technicians = [
        ...draft.technicians,
        {
          id: uid('t'),
          name: personName(rng),
          skill: 1 + Math.floor(rng() * 3),
          salary: 2200 + Math.floor(rng() * 700),
          experience: 0,
          incidentId: null,
          gx: base?.gx ?? 0,
          gy: base?.gy ?? 0,
          homeGx: base?.gx ?? 0,
          homeGy: base?.gy ?? 0,
          state: 'idle',
        },
      ];
    });
    s.toast('New field crew hired', 'good');
  },

  hireEmployee: (role) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const cost = 6000;
    if (g.money < cost) {
      s.toast('Not enough money.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      const rng = makeRng(Math.floor(Math.random() * 1e9));
      const salary = { network_engineer: 4600, noc_engineer: 4200, field_tech: 2600, support: 2500, sales: 3800, security: 5200 }[
        role
      ];
      draft.money -= cost;
      draft.employees = [
        ...draft.employees,
        { id: uid('e'), name: personName(rng), role, salary, skill: 1 + Math.floor(rng() * 4), experience: 0 },
      ];
    });
    s.toast('Hired', 'good');
  },

  fireStaff: (id) =>
    withGame(set, (draft) => {
      draft.employees = draft.employees.filter((e) => e.id !== id);
      draft.technicians = draft.technicians.filter((t) => t.id !== id);
    }),

  placeBid: (amount) => {
    const s = get();
    const g = s.game;
    if (!g?.auction || g.auction.result) return;
    if (amount < g.auction.reserve) {
      s.toast('That is below the reserve price.', 'bad');
      return;
    }
    // Bids are sealed. Nothing is charged unless you win.
    withGame(set, (draft) => {
      if (draft.auction) draft.auction = { ...draft.auction, playerBid: amount };
    });
    s.toast('Bid sealed. Results when the lot closes.', 'info');
  },

  dismissAuction: () => withGame(set, (draft) => void (draft.auction = null)),

  setMarketing: (value) => withGame(set, (draft) => void (draft.marketingBudget = Math.max(0, value))),

  setRetention: (value) => withGame(set, (draft) => void (draft.retentionBudget = Math.max(0, value))),

  takeLoan: (principal, termMonths) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const headroom = creditLimit(g);
    if (principal > headroom) {
      s.toast('More than the banks will lend you.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.loans = [...draft.loans, createLoan(draft, principal, termMonths)];
      draft.money += principal;
      pushLog(draft, `Borrowed $${principal.toLocaleString()} over ${termMonths} months.`, 'info');
    });
    s.toast('Loan drawn down', 'good');
  },

  repayLoan: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const loan = g.loans.find((l) => l.id === id);
    if (!loan) return;
    if (g.money < loan.remaining) {
      s.toast('Not enough cash to clear it.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= loan.remaining;
      draft.loans = draft.loans.filter((l) => l.id !== id);
      pushLog(draft, 'Loan repaid in full.', 'good');
    });
    s.toast('Loan cleared', 'good');
  },

  setTransitTier: (tier) => {
    const s = get();
    const g = s.game;
    if (!g || tier === g.transitTier) return;
    withGame(set, (draft) => {
      draft.transitTier = tier;
      pushLog(draft, `Upstream transit changed.`, 'info');
    });
    s.toast('Transit updated', 'good');
  },

  toggleBackupTransit: () => withGame(set, (draft) => void (draft.backupTransit = !draft.backupTransit)),
  toggleAutoDispatch: () => withGame(set, (draft) => void (draft.autoDispatch = !draft.autoDispatch)),

  advanceTutorial: (stepIndex) =>
    withGame(set, (draft) => {
      if (draft.tutorialStep === stepIndex) draft.tutorialStep = stepIndex + 1;
    }),

  skipTutorial: () => withGame(set, (draft) => void (draft.tutorialDone = true)),
}));

export const researchList = RESEARCH;

if (import.meta.env.DEV) {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}
