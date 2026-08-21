import { create } from 'zustand';
import {
  FIBER_COST_PER_UNIT,
  FIBER_UPGRADE_COST_PER_UNIT,
  MINUTES_PER_DAY,
  NODE_SPECS,
  linkCapacity,
  nodeUpgradeCost,
} from '../game/constants';
import { effectiveNodeCapacity } from '../game/capacity';
import { resolveNegotiation, type NegotiationMode } from '../game/contracts';
import { computeRoutes, districtRedundancy } from '../game/network';
import { repairCost, type RepairMode } from '../game/incidents';
import { createLoan, creditLimit } from '../game/finance';
import { recordLedger } from '../game/financeLedger';
import {
  fibreConnectionCost,
  fibreConnectionIssue,
  nodePlacementCost,
  nodePlacementIssue,
} from '../game/placement';
import { clearSave, loadGame, saveGame, SAVE_SLOT_COUNT } from '../game/save';
import { RESEARCH, researchById, researchModifiers } from '../game/research';
import {
  createNewGame,
  dispatch as dispatchTechnician,
  pushLog,
  redistributeMobilePackages,
  redistributePackages,
  step,
  type NewGameOptions,
} from '../game/simulation';
import { uid } from '../game/rng';
import { personName } from '../game/names';
import { makeRng } from '../game/rng';
import {
  CAMPAIGN_CONFIG,
  DATA_CENTER_MODE_CONFIG,
  INTERCONNECT_CONFIG,
  MAINTENANCE_CONFIG,
  maintenanceCost,
  maintenanceStart,
} from '../game/strategy';
import type {
  CampaignKind,
  DataCenterMode,
  GameState,
  InterconnectPlan,
  MaintenanceMode,
  NodeKind,
  OverlayMode,
  Screen,
  Speed,
  StaffRole,
  TrafficPolicy,
} from '../game/types';

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
  showSaveManager: boolean;
  activeSaveSlot: number;
  persistenceError: string | null;
}

interface Store extends UiState {
  game: GameState | null;
  started: boolean;

  newGame: (opts: NewGameOptions, slot?: number) => boolean;
  continueGame: (slot?: number) => boolean;
  resetSave: () => void;
  save: () => boolean;
  quitToMenu: () => boolean;

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
  setShowSaveManager: (v: boolean) => void;
  saveToSlot: (slot: number) => boolean;

  placeNode: (kind: NodeKind, gx: number, gy: number) => void;
  clickNodeForLink: (nodeId: string) => void;
  cancelBuild: () => void;
  upgradeNode: (id: string) => void;
  repairNode: (id: string) => void;
  scheduleMaintenance: (id: string, mode: MaintenanceMode) => void;
  cancelMaintenance: (orderId: string) => void;
  sellNode: (id: string) => void;
  upgradeLink: (id: string) => void;
  sellLink: (id: string) => void;

  unlockDistrict: (id: string) => void;
  updatePackage: (id: string, patch: { price?: number; speedMbps?: number; active?: boolean; name?: string }) => void;
  startResearch: (id: string) => void;
  acceptOffer: (id: string, mode?: NegotiationMode) => void;
  declineOffer: (id: string) => void;
  dispatchTech: (incidentId: string, mode: RepairMode) => void;
  hireTechnician: () => void;
  hireEmployee: (role: StaffRole) => void;
  fireStaff: (id: string) => void;
  placeBid: (amount: number) => void;
  dismissAuction: () => void;
  setMarketing: (value: number) => void;
  setRetention: (value: number) => void;
  startCampaign: (districtId: string, kind: CampaignKind) => void;
  setTrafficPolicy: (policy: TrafficPolicy) => void;
  setInterconnectPlan: (plan: InterconnectPlan) => void;
  toggleWholesaleFixed: () => void;
  toggleMvno: () => void;
  setDataCenterMode: (nodeId: string, mode: DataCenterMode) => void;
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
  showSaveManager: false,
  activeSaveSlot: 0,
  persistenceError: null,
};

function withGame(set: (fn: (s: Store) => Partial<Store>) => void, mutate: (g: GameState) => void) {
  set((s) => {
    if (!s.game) return {};
    const g: GameState = { ...s.game };
    mutate(g);
    return { game: g };
  });
}

const isSaveSlot = (slot: number) => Number.isInteger(slot) && slot >= 0 && slot < SAVE_SLOT_COUNT;

export const useGame = create<Store>((set, get) => ({
  ...initialUi,
  game: null,
  started: false,

  newGame: (opts, slot = 0) => {
    if (!isSaveSlot(slot)) {
      set({ persistenceError: 'Choose a valid save slot.' });
      return false;
    }
    const game = createNewGame(opts);
    if (!saveGame(game, slot)) {
      set({ persistenceError: 'The new game could not be saved. Check browser storage and try again.' });
      return false;
    }
    set({ ...initialUi, activeSaveSlot: slot, game, started: true });
    return true;
  },

  continueGame: (slot = 0) => {
    if (!isSaveSlot(slot)) return false;
    const game = loadGame(slot);
    if (!game) return false;
    set({ ...initialUi, activeSaveSlot: slot, game: { ...game, speed: 0 }, started: true });
    return true;
  },

  resetSave: () => {
    if (!clearSave(get().activeSaveSlot)) {
      const message = 'The active save could not be deleted.';
      set({ persistenceError: message });
      get().toast(message, 'bad');
      return;
    }
    set({ game: null, started: false, persistenceError: null });
  },

  save: () => {
    const g = get().game;
    if (!g) return false;
    if (!saveGame(g, get().activeSaveSlot)) {
      const message = 'Saving failed. Progress is still in memory; do not close this tab.';
      set({ persistenceError: message });
      get().toast(message, 'bad');
      return false;
    }
    set({ persistenceError: null });
    get().toast('Game saved.', 'good');
    return true;
  },

  quitToMenu: () => {
    const g = get().game;
    if (g && !saveGame(g, get().activeSaveSlot)) {
      const message = 'Exit cancelled because the game could not be saved.';
      set({ persistenceError: message });
      get().toast(message, 'bad');
      return false;
    }
    set({ started: false, persistenceError: null });
    return true;
  },

  tick: () => {
    const s = get();
    if (!s.game || s.game.speed === 0) return;
    let g = s.game;
    for (let i = 0; i < s.game.speed; i++) g = step(g);

    // Autosave once a game day.
    if (g.minutes - g.autosaveAt > MINUTES_PER_DAY) {
      g = { ...g, autosaveAt: g.minutes };
      const saved = saveGame(g, s.activeSaveSlot);
      set({ persistenceError: saved ? null : 'Autosave failed. Progress is only being kept in this tab.' });
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
  setShowSaveManager: (v) => set({ showSaveManager: v }),
  saveToSlot: (slot) => {
    const g = get().game;
    if (!g) return false;
    if (!isSaveSlot(slot)) {
      const message = 'Choose a valid save slot.';
      set({ persistenceError: message });
      get().toast(message, 'bad');
      return false;
    }
    if (saveGame(g, slot)) {
      set({ activeSaveSlot: slot, persistenceError: null });
      get().toast(`Saved to slot ${slot + 1}.`, 'good');
      return true;
    }
    const message = `Slot ${slot + 1} could not be saved.`;
    set({ persistenceError: message });
    get().toast(message, 'bad');
    return false;
  },

  placeNode: (kind, gx, gy) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const spec = NODE_SPECS[kind];
    const issue = nodePlacementIssue(g, kind, gx, gy);
    if (issue) {
      s.toast(issue, 'bad', gx, gy);
      return;
    }
    const district = g.districts.find((d) => d.cells.some((c) => c.gx === gx && c.gy === gy));
    if (!district) return;
    const cost = nodePlacementCost(g, kind);

    const capacity = effectiveNodeCapacity(kind, 1, g.spectrum, g.researchDone);
    const count = g.nodes.filter((n) => n.kind === kind).length + 1;
    const nodeId = uid('n');
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(draft, 'network_build', `${spec.label}: ${district.name}`, -cost);
      draft.nodes = [
        ...draft.nodes,
        {
          id: nodeId,
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
          servicedAt: draft.minutes,
        },
      ];
      if (kind === 'datacenter') draft.dataCenterModes = { ...draft.dataCenterModes, [nodeId]: 'colocation' };
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
    const issue = fibreConnectionIssue(g, a.id, b.id);
    if (issue) {
      s.toast(issue, 'bad');
      set({ linkFrom: null });
      return;
    }
    const length = Math.hypot(a.gx - b.gx, a.gy - b.gy);
    const cost = fibreConnectionCost(g, a.id, b.id);
    const mods = researchModifiers(g.researchDone);
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(draft, 'network_build', `Fibre: ${a.name} to ${b.name}`, -cost);
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
    if (g.incidents.some((incident) => !incident.resolved && incident.targetType === 'node' && incident.targetId === id)) {
      s.toast('Resolve the site fault before upgrading it.', 'bad');
      return;
    }
    if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
      s.toast('Finish or clear the planned work before upgrading this site.', 'bad');
      return;
    }
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
      recordLedger(draft, 'network_upgrade', `${node.name}: tier ${node.tier + 1}`, -cost);
      draft.nodes = draft.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              tier: n.tier + 1,
              capacityGbps: effectiveNodeCapacity(n.kind, n.tier + 1, draft.spectrum, draft.researchDone),
              health: Math.max(n.health, 92),
              servicedAt: draft.minutes,
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
      recordLedger(draft, 'network_service', `Service: ${node.name}`, -cost);
      draft.nodes = draft.nodes.map((n) => (n.id === id ? { ...n, health: 100, servicedAt: draft.minutes } : n));
    });
    s.toast('Maintenance done', 'good', node.gx, node.gy);
  },

  scheduleMaintenance: (id, mode) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const node = g.nodes.find((entry) => entry.id === id);
    if (!node) return;
    if (mode === 'defer') {
      s.toast(`${node.name} stays in service, and its failure odds keep climbing.`, 'info');
      return;
    }
    if (node.down || g.incidents.some((incident) => !incident.resolved && incident.targetId === id)) {
      s.toast('Resolve the active fault before planning service.', 'bad');
      return;
    }
    if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
      s.toast('This site already has planned work queued.', 'bad');
      return;
    }
    const cost = maintenanceCost(node, mode);
    if (g.money < cost) {
      s.toast('Not enough cash for this maintenance window.', 'bad');
      return;
    }
    const config = MAINTENANCE_CONFIG[mode];
    const scheduledAt = maintenanceStart(g.minutes, mode);
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(draft, 'network_service', `${config.label}: ${node.name}`, -cost);
      draft.maintenanceOrders = [
        ...draft.maintenanceOrders,
        {
          id: uid('maint'),
          nodeId: id,
          mode,
          status: 'scheduled',
          scheduledAt,
          startedAt: null,
          minutesLeft: config.durationMinutes,
          technicianId: null,
          cost,
        },
      ];
      pushLog(draft, `${config.label} booked for ${node.name}.`, 'info');
    });
    s.toast(mode === 'urgent' ? 'Crew queued for dispatch' : '02:00 maintenance booked', 'good', node.gx, node.gy);
  },
  // Work that has not started yet can be called off and the fee returned.
  cancelMaintenance: (orderId) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const order = g.maintenanceOrders.find((entry) => entry.id === orderId);
    if (!order) return;
    if (order.status !== 'scheduled') {
      s.toast('The crew is already on site, so this cannot be called off.', 'bad');
      return;
    }
    const node = g.nodes.find((entry) => entry.id === order.nodeId);
    withGame(set, (draft) => {
      draft.money += order.cost;
      recordLedger(draft, 'network_service', `Cancelled: ${node?.name ?? 'site'}`, order.cost);
      draft.maintenanceOrders = draft.maintenanceOrders.filter((entry) => entry.id !== orderId);
      pushLog(draft, `Planned work at ${node?.name ?? 'a site'} was called off.`, 'info');
    });
    s.toast('Maintenance cancelled and refunded.', 'good');
  },
  sellNode: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const attachedLinkIds = new Set(
      g.links.filter((link) => link.aId === id || link.bId === id).map((link) => link.id),
    );
    const blockingIncident = g.incidents.find(
      (incident) =>
        !incident.resolved &&
        ((incident.targetType === 'node' && incident.targetId === id) ||
          (incident.targetType === 'link' && attachedLinkIds.has(incident.targetId))),
    );
    if (blockingIncident) {
      s.toast('Resolve faults on this site and its fibre before decommissioning it.', 'bad');
      return;
    }
    if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
      s.toast('Complete the planned work before decommissioning this site.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      const node = draft.nodes.find((n) => n.id === id);
      if (!node) return;
      const refund = Math.round(NODE_SPECS[node.kind].baseCost * 0.35 * node.tier);
      draft.money += refund;
      recordLedger(draft, 'asset_sale', `Decommissioned: ${node.name}`, refund);
      draft.nodes = draft.nodes.filter((n) => n.id !== id);
      draft.links = draft.links.filter((l) => l.aId !== id && l.bId !== id);
      const { [id]: _removedMode, ...remainingModes } = draft.dataCenterModes;
      draft.dataCenterModes = remainingModes;
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
      recordLedger(draft, 'network_upgrade', 'Fibre capacity upgrade', -cost);
      draft.links = draft.links.map((l) =>
        l.id === id ? { ...l, tier: l.tier + 1, capacityGbps: linkCapacity(l.tier + 1) * mods.linkCapacityMul } : l,
      );
    });
    s.toast('Fibre upgraded', 'good');
  },

  sellLink: (id) => {
    const s = get();
    if (s.game?.incidents.some((incident) => !incident.resolved && incident.targetType === 'link' && incident.targetId === id)) {
      s.toast('Resolve the fault before removing this fibre span.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      const link = draft.links.find((l) => l.id === id);
      if (!link) return;
      const refund = Math.round(link.length * FIBER_COST_PER_UNIT * 0.2);
      draft.money += refund;
      recordLedger(draft, 'asset_sale', 'Fibre recovery', refund);
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
      recordLedger(draft, 'district_licence', `${district.name} licence`, -district.entryCost);
      draft.districts = draft.districts.map((d) => (d.id === id ? { ...d, unlocked: true } : d));
      pushLog(draft, `Licensed to build in ${district.name}.`, 'good');
    });
    s.toast(`${district.name} licensed`, 'good', district.center.gx, district.center.gy);
  },

  updatePackage: (id, patch) => {
    const s = get();
    const current = s.game?.packages.find((pack) => pack.id === id);
    if (!current) return;
    if (
      patch.active === false &&
      current.active &&
      !s.game?.packages.some((pack) => pack.id !== id && pack.segment === current.segment && pack.active)
    ) {
      s.toast(`Keep at least one ${current.segment} package active.`, 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.packages = draft.packages.map((pack) => (pack.id === id ? { ...pack, ...patch } : pack));
      if (current.segment === 'mobile') redistributeMobilePackages(draft);
      else redistributePackages(draft);
    });
  },

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
    if (g.researchPoints < node.points) {
      s.toast(`Need ${node.points} research points.`, 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= node.cost;
      draft.researchPoints -= node.points;
      draft.researchActive = { id, daysLeft: node.days };
      recordLedger(draft, 'research', `Research: ${node.name}`, -node.cost);
      pushLog(draft, `Research started: ${node.name}.`, 'info');
    });
    s.toast(`Researching ${node.name}`, 'good');
  },

  acceptOffer: (id, mode = 'standard') => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const offer = g.offers.find((o) => o.id === id);
    if (!offer) return;
    if (g.contracts.some((contract) => contract.buildingId === offer.buildingId)) {
      s.toast('That building already has an active contract.', 'bad');
      return;
    }
    const cover = offer.requiresRedundancy ? districtRedundancy(g, offer.districtId) : null;
    if (cover && !cover.complete) {
      const name = g.districts.find((d) => d.id === offer.districtId)?.name ?? 'that district';
      s.toast(`${name}: ${cover.done} of ${cover.total} sites have a second path.`, 'bad');
      return;
    }

    const negotiation = resolveNegotiation(g, offer, mode);
    const building = g.buildings.find((entry) => entry.id === offer.buildingId);
    if (!negotiation.accepted) {
      withGame(set, (draft) => {
        draft.offers = draft.offers.filter((entry) => entry.id !== id);
        pushLog(draft, `${offer.clientName} rejected the premium counter and walked away.`, 'bad');
      });
      s.toast('Premium counter rejected', 'bad', building?.gx, building?.gy);
      return;
    }

    const agreed = negotiation.terms;
    withGame(set, (draft) => {
      draft.offers = draft.offers.filter((o) => o.id !== id && o.buildingId !== offer.buildingId);
      draft.money += agreed.signingBonus;
      recordLedger(draft, 'contract_bonus', `${agreed.clientName} signing bonus`, agreed.signingBonus);
      draft.contracts = [
        ...draft.contracts,
        {
          id: uid('c'),
          clientName: agreed.clientName,
          districtId: agreed.districtId,
          buildingId: agreed.buildingId,
          bandwidthGbps: agreed.bandwidthGbps,
          monthlyRevenue: agreed.monthlyRevenue,
          slaPercent: agreed.slaPercent,
          downtimeMinutes: 0,
          penaltyPaid: 0,
          startedAt: draft.minutes,
          termMonths: agreed.termMonths,
          requiresRedundancy: agreed.requiresRedundancy,
          segment: agreed.segment,
        },
      ];
      draft.buildings = draft.buildings.map((b) =>
        b.id === agreed.buildingId ? { ...b, connected: 1, lastConnectedAt: draft.minutes } : b,
      );
      const term = mode === 'flexible' ? ' on a flexible SLA' : mode === 'premium' ? ' after a premium counter' : '';
      pushLog(draft, `Signed ${agreed.clientName}${term} at $${agreed.monthlyRevenue.toLocaleString()}/mo.`, 'good');
    });
    s.toast(
      mode === 'premium' ? 'Premium counter accepted' : `${agreed.clientName} signed`,
      'good',
      building?.gx,
      building?.gy,
    );
  },

  declineOffer: (id) => withGame(set, (draft) => void (draft.offers = draft.offers.filter((o) => o.id !== id))),

  dispatchTech: (incidentId, mode) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const inc = g.incidents.find((i) => i.id === incidentId);
    if (!inc || inc.resolved) return;
    if (inc.assignedTechId) {
      s.toast('A crew is already assigned to that incident.', 'bad');
      return;
    }
    const tech = g.technicians.find((t) => t.state === 'idle' && t.maintenanceId === null);
    if (!tech) {
      s.toast('Every crew is already out.', 'bad');
      return;
    }
    // Emergency work needs cash up front.
    if (mode === 'emergency') {
      const cost = repairCost(inc, 'emergency');
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
      recordLedger(draft, 'staff', 'Field crew recruitment', -cost);
      draft.technicians = [
        ...draft.technicians,
        {
          id: uid('t'),
          name: personName(rng),
          skill: 1 + Math.floor(rng() * 3),
          salary: 2200 + Math.floor(rng() * 700),
          experience: 0,
          incidentId: null,
          maintenanceId: null,
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
      recordLedger(draft, 'staff', `${role.replace(/_/g, ' ')} recruitment`, -cost);
      draft.employees = [
        ...draft.employees,
        { id: uid('e'), name: personName(rng), role, salary, skill: 1 + Math.floor(rng() * 4), experience: 0 },
      ];
    });
    s.toast('Hired', 'good');
  },

  fireStaff: (id) => {
    const s = get();
    const technician = s.game?.technicians.find((t) => t.id === id);
    if (
      technician &&
      (technician.state !== 'idle' || technician.incidentId !== null || technician.maintenanceId !== null)
    ) {
      s.toast('That crew must finish and return before they can be released.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.employees = draft.employees.filter((e) => e.id !== id);
      draft.technicians = draft.technicians.filter((t) => t.id !== id);
    });
  },

  placeBid: (amount) => {
    const s = get();
    const g = s.game;
    if (!g?.auction || g.auction.result) return;
    if (amount < g.auction.reserve) {
      s.toast('That is below the reserve price.', 'bad');
      return;
    }
    if (amount > g.money) {
      s.toast('You cannot bid more than you hold.', 'bad');
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

  startCampaign: (districtId, kind) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const district = g.districts.find((entry) => entry.id === districtId);
    const config = CAMPAIGN_CONFIG[kind];
    if (!district?.unlocked) {
      s.toast('Unlock the district before campaigning there.', 'bad');
      return;
    }
    if (g.campaigns.some((campaign) => campaign.districtId === districtId && campaign.endsAt > g.minutes)) {
      s.toast('A district can run only one focused campaign at a time.', 'bad');
      return;
    }
    if (kind === 'mobile' && (!g.researchDone.includes('mobile_4g') || !g.spectrum.length)) {
      s.toast('Launch 4G and secure spectrum before promoting mobile service.', 'bad');
      return;
    }
    if (g.money < config.cost) {
      s.toast('Not enough cash for this campaign.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= config.cost;
      recordLedger(draft, 'campaign', `${config.label}: ${district.name}`, -config.cost);
      draft.campaigns = [
        ...draft.campaigns,
        {
          id: uid('campaign'),
          districtId,
          kind,
          startedAt: draft.minutes,
          endsAt: draft.minutes + config.durationDays * MINUTES_PER_DAY,
          cost: config.cost,
        },
      ];
      pushLog(draft, `${config.label} started in ${district.name}.`, 'good');
    });
    s.toast(`${config.label} is live`, 'good');
  },

  setTrafficPolicy: (policy) => {
    const s = get();
    const g = s.game;
    if (!g || policy === g.trafficPolicy) return;
    if (policy !== 'balanced' && !g.researchDone.includes('noc')) {
      s.toast('A Network Operations Centre is required for traffic policy control.', 'bad');
      return;
    }
    if (policy === 'mobile' && !g.researchDone.includes('mobile_5g')) {
      s.toast('5G Standalone research unlocks the mobile network slice.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.trafficPolicy = policy;
      pushLog(draft, `Traffic policy changed to ${policy.replace(/_/g, ' ')}.`, 'info');
    });
    s.toast('Traffic policy applied', 'good');
  },

  setInterconnectPlan: (plan) => {
    const s = get();
    const g = s.game;
    if (!g || plan === g.interconnectPlan) return;
    const config = INTERCONNECT_CONFIG[plan];
    const routes = config.requiresDataCenter ? computeRoutes(g) : {};
    if (
      config.requiresDataCenter &&
      !g.nodes.some((node) => node.kind === 'datacenter' && !node.down && routes[node.id])
    ) {
      s.toast('The CDN partner needs an online data centre.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.interconnectPlan = plan;
      pushLog(draft, `${config.label} interconnection activated.`, 'info');
    });
    s.toast(`${config.label} selected`, 'good');
  },

  toggleWholesaleFixed: () =>
    withGame(set, (draft) => {
      draft.wholesaleFixed = !draft.wholesaleFixed;
      pushLog(draft, `Fixed wholesale ${draft.wholesaleFixed ? 'opened' : 'closed'} to partners.`, 'info');
    }),

  toggleMvno: () => {
    const s = get();
    const g = s.game;
    if (!g) return;
    if (!g.mvnoEnabled && (!g.researchDone.includes('mobile_4g') || !g.spectrum.length)) {
      s.toast('MVNO access needs a live mobile platform and spectrum.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.mvnoEnabled = !draft.mvnoEnabled;
      pushLog(draft, `MVNO access ${draft.mvnoEnabled ? 'opened' : 'closed'} to partners.`, 'info');
    });
  },

  setDataCenterMode: (nodeId, mode) => {
    const s = get();
    const g = s.game;
    const node = g?.nodes.find((entry) => entry.id === nodeId && entry.kind === 'datacenter');
    if (!g || !node || g.dataCenterModes[nodeId] === mode) return;
    const config = DATA_CENTER_MODE_CONFIG[mode];
    withGame(set, (draft) => {
      draft.dataCenterModes = { ...draft.dataCenterModes, [nodeId]: mode };
      pushLog(draft, `${node.name} switched to ${config.label}.`, 'info');
    });
    s.toast(`${config.label} workload applied`, 'good');
  },

  takeLoan: (principal, termMonths) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isInteger(termMonths) || termMonths <= 0) {
      s.toast('Choose a valid loan amount and term.', 'bad');
      return;
    }
    const headroom = creditLimit(g);
    if (principal > headroom) {
      s.toast('More than the banks will lend you.', 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.loans = [...draft.loans, createLoan(draft, principal, termMonths)];
      draft.money += principal;
      recordLedger(draft, 'loan_draw', 'Loan drawdown', principal);
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
      recordLedger(draft, 'loan_payment', 'Loan repaid in full', -loan.remaining);
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
