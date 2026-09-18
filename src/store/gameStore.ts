import { startMarketOperation, cancelMarketOperation } from '../game/competition';
import { initialNodeTier, nodeCapitalCost } from '../game/constants';
import { commissionCapacityPlan, type CapacityUpgrade } from '../game/capacityLab';
import type { MarketTactic, PackageSegment } from '../game/types';
import { submitTenderBid, withdrawTenderBid } from '../game/procurement';
import {
  SMART_PAUSE_KEY,
  SMART_PAUSE_OPTIONS,
  loadSmartPausePreferences,
  smartPauseEvents,
  type SmartPausePreferences,
  type SmartPauseKind,
  type SmartPauseNotice,
} from '../game/smartPause';
import { updateCompanyIdentity } from '../game/identity';
import { STAFF_ROLE_INFO } from '../game/staff';
import { buildSolar, setEnergyPlan as applyEnergyPlan } from '../game/energy';
import { launchDistrict as buildDistrictLaunch, type ExpansionKind } from '../game/expansion';
import type { FailureTarget } from '../game/failureDrill';
import { buildBackupRoute } from '../game/redundancyBuild';
import { grantStarterSpectrum } from '../game/spectrum';
import { buildConnectedSite } from '../game/connectedBuild';
import { resolveDecision, claimChallenge } from '../game/board';
import { acquireCompany } from '../game/acquisitions';
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
import { dispatchCandidates, repairCost, type RepairMode } from '../game/incidents';
import { createLoan, creditLimit } from '../game/finance';
import { recordLedger } from '../game/financeLedger';
import { fibreConnectionCost, fibreConnectionIssue, nodePlacementCost, nodePlacementIssue } from '../game/placement';
import { clearSave, loadGame, saveGame, SAVE_SLOT_COUNT } from '../game/saveStorage';
import { RESEARCH, researchById, researchModifiers } from '../game/research';
import { CAMPAIGN_STAGES } from '../game/scenarios';
import { claimMilestone as grantMilestone, MILESTONES } from '../game/milestones';
import { fmtMoneyExact } from '../game/economy';
import { plural } from '../game/util';
import { beginSignalTraining, turnSignalTile, finishSignalTraining } from '../game/signalTraining';
import { projectBlueprint, type BuildStep } from '../game/blueprint';
import {
  createNewGame,
  dispatch as dispatchTechnician,
  pushLog,
  redistributeMobilePackages,
  redistributePackages,
  residentialSubs,
  step,
  type NewGameOptions,
} from '../game/simulation';
import { uid } from '../game/rng';
import { personName } from '../game/names';
import { makeRng } from '../game/rng';
import {
  CAMPAIGN_CONFIG,
  DATA_CENTER_MODE_CONFIG,
  DATA_CENTER_MODE_COOLDOWN,
  INTERCONNECT_CONFIG,
  MAINTENANCE_CONFIG,
  TRAFFIC_POLICY_CONFIG,
  maintenanceCost,
  maintenanceStart,
  dataCenterModeChangeCost,
} from '../game/strategy';
import type {
  CampaignKind,
  EnergyPlan,
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
import type { Locale } from '../ui/i18n';
import { researchCopy } from '../game/researchCopy';
import { line, setGameLanguage } from '../game/lang';

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
  inspectedOfferId: string | null;
  smartPauseNotice: SmartPauseNotice | null;
  drillTarget: FailureTarget | null;
  autoConnect: boolean;
  planning: boolean;
  blueprint: BuildStep[];
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
  locale: Locale;
}

interface Store extends UiState {
  commissionUpgrades: (items: CapacityUpgrade[]) => boolean;
  launchMarketOperation: (districtId: string, kind: MarketTactic) => boolean;
  endMarketOperation: (id: string) => boolean;
  bidOnTender: (id: string, price: number) => boolean;
  withdrawTender: (id: string) => boolean;
  inspectOffer: (id: string | null) => void;
  smartPause: SmartPausePreferences;
  setSmartPause: (kind: SmartPauseKind, enabled: boolean) => boolean;
  dismissSmartPause: () => void;
  beginFailureDrill: (target: FailureTarget) => void;
  endFailureDrill: () => void;
  setAutoConnect: (value: boolean) => void;
  addBackupRoute: (nodeId: string) => void;
  beginBlueprint: () => void;
  discardBlueprint: () => void;
  undoBlueprint: () => void;
  commitBlueprint: () => void;
  game: GameState | null;
  started: boolean;

  newGame: (opts: NewGameOptions, slot?: number) => boolean;
  continueGame: (slot?: number) => boolean;
  resetSave: () => void;
  save: () => boolean;
  updateIdentity: (name: string, logo: string) => boolean;
  quitToMenu: () => boolean;
  advanceCampaign: () => boolean;

  tick: () => void;
  startSignalTraining: (size: 4 | 5, mode?: 'routing' | 'fault' | 'restoration') => void;
  rotateSignalTile: (index: number) => void;
  submitSignalTraining: () => boolean;
  closeSignalTraining: () => void;
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
  setLocale: (locale: Locale) => void;
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
  launchDistrict: (id: string, kind: ExpansionKind) => void;
  updatePackage: (id: string, patch: { price?: number; speedMbps?: number; active?: boolean; name?: string }) => void;
  startResearch: (id: string) => void;
  acceptOffer: (id: string, mode?: NegotiationMode) => void;
  declineOffer: (id: string) => void;
  dispatchTech: (incidentId: string, mode: RepairMode, techId?: string) => void;
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
  setEnergyPlan: (plan: EnergyPlan) => boolean;
  installSolar: (nodeId: string) => boolean;
  toggleAutoDispatch: () => void;
  advanceTutorial: (stepIndex: number) => void;
  skipTutorial: () => void;
  claimMilestone: (id: string) => void;
  resolveBoardDecision: (id: string, option: string) => void;
  acquireRival: (id: string) => void;
  claimCharter: () => void;
}

function initialLocale(): Locale {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('telecom-empire-locale') === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

// The simulation writes its own lines, so it follows the stored preference from the first render on.
setGameLanguage(initialLocale());

// Toasts and banners disappear with the session, so they are phrased in the current language on the spot.
const say = (locale: Locale, en: string, tr: string) => (locale === 'tr' ? tr : en);

const SEGMENT_TR: Record<PackageSegment, string> = {
  residential: 'konut',
  business: 'kurumsal',
  enterprise: 'büyük kurumsal',
  mobile: 'mobil',
};

const initialUi: UiState = {
  inspectedOfferId: null,
  smartPauseNotice: null,
  drillTarget: null,
  autoConnect: false,
  planning: false,
  blueprint: [],
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
  locale: initialLocale(),
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
  smartPause: loadSmartPausePreferences(),
  game: null,
  started: false,

  newGame: (opts, slot = 0) => {
    if (!isSaveSlot(slot)) {
      set({ persistenceError: get().locale === 'tr' ? 'Geçerli bir kayıt yuvası seç.' : 'Choose a valid save slot.' });
      return false;
    }
    const game = createNewGame(opts);
    if (!saveGame(game, slot)) {
      set({
        persistenceError:
          get().locale === 'tr'
            ? 'Yeni oyun kaydedilemedi. Tarayıcı depolamasını kontrol edip tekrar dene.'
            : 'The new game could not be saved. Check browser storage and try again.',
      });
      return false;
    }
    set({ ...initialUi, locale: get().locale, activeSaveSlot: slot, game, started: true });
    return true;
  },

  continueGame: (slot = 0) => {
    if (!isSaveSlot(slot)) return false;
    const game = loadGame(slot);
    if (!game) return false;
    set({
      ...initialUi,
      locale: get().locale,
      autoConnect: get().autoConnect,
      activeSaveSlot: slot,
      game: { ...game, speed: 0 },
      started: true,
    });
    return true;
  },

  resetSave: () => {
    if (!clearSave(get().activeSaveSlot)) {
      const message = say(get().locale, 'The active save could not be deleted.', 'Etkin kayıt silinemedi.');
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
      const message = say(
        get().locale,
        'Saving failed. Progress is still in memory; do not close this tab.',
        'Kayıt başarısız. İlerleme hâlâ bellekte; bu sekmeyi kapatma.',
      );
      set({ persistenceError: message });
      get().toast(message, 'bad');
      return false;
    }
    set({ persistenceError: null });
    get().toast(say(get().locale, 'Game saved.', 'Oyun kaydedildi.'), 'good');
    return true;
  },

  quitToMenu: () => {
    if (get().planning) {
      get().toast(
        say(
          get().locale,
          'Build or discard your network plan before exiting.',
          'Çıkmadan önce ağ taslağını kur veya sil.',
        ),
        'info',
      );
      return false;
    }
    const g = get().game;
    if (g && !saveGame(g, get().activeSaveSlot)) {
      const message = say(
        get().locale,
        'Exit cancelled because the game could not be saved.',
        'Oyun kaydedilemediği için çıkış iptal edildi.',
      );
      set({ persistenceError: message });
      get().toast(message, 'bad');
      return false;
    }
    set({ started: false, persistenceError: null });
    return true;
  },

  advanceCampaign: () => {
    const s = get();
    const current = s.game;
    if (!current || current.mode !== 'campaign' || current.victoryAt === null) return false;
    const nextStage = current.campaignStage + 1;
    if (!CAMPAIGN_STAGES[nextStage]) return false;
    const next = createNewGame({
      companyName: current.companyName,
      logo: current.logo,
      difficulty: current.difficulty,
      cityName: CAMPAIGN_STAGES[nextStage].cityName,
      mode: 'campaign',
      campaignStage: nextStage,
    });
    next.money += Math.max(0, Math.min(5000000, Math.round(current.money * 0.2)));
    next.reputation = Math.max(50, Math.round(current.reputation * 0.8));
    // Technology belongs to the company, not the city being left behind.
    next.researchDone = [...current.researchDone];
    next.researchPoints = current.researchPoints;
    next.researchActive = current.researchActive ? { ...current.researchActive } : null;
    if (next.researchDone.includes('mobile_4g')) grantStarterSpectrum(next);
    if (!saveGame(next, s.activeSaveSlot)) {
      set({
        persistenceError:
          s.locale === 'tr' ? 'Sonraki kampanya şehri kaydedilemedi.' : 'The next campaign city could not be saved.',
      });
      return false;
    }
    set({
      ...initialUi,
      locale: s.locale,
      autoConnect: s.autoConnect,
      activeSaveSlot: s.activeSaveSlot,
      game: next,
      started: true,
    });
    return true;
  },

  setSmartPause: (kind, enabled) => {
    if (!SMART_PAUSE_OPTIONS.some((option) => option.id === kind) || typeof enabled !== 'boolean') return false;
    const preferences = { ...get().smartPause, [kind]: enabled };
    set({ smartPause: preferences });
    try {
      localStorage.setItem(SMART_PAUSE_KEY, JSON.stringify(preferences));
      return true;
    } catch {
      return false;
    }
  },
  dismissSmartPause: () => set({ smartPauseNotice: null }),
  inspectOffer: (id) => {
    if (id === null) {
      set({ inspectedOfferId: null });
      return;
    }
    const s = get();
    if (s.planning || s.drillTarget || !s.game?.offers.some((offer) => offer.id === id)) return;
    set({ inspectedOfferId: id, screen: 'map', tool: null, selection: null, linkFrom: null });
  },

  launchMarketOperation: (districtId, kind) => {
    const s = get();
    if (!s.game || s.planning || s.drillTarget) return false;
    const game = startMarketOperation(s.game, districtId, kind);
    if (!game) return false;
    set({ game });
    return true;
  },
  endMarketOperation: (id) => {
    const s = get();
    if (!s.game || s.planning || s.drillTarget) return false;
    const game = cancelMarketOperation(s.game, id);
    if (!game) return false;
    set({ game });
    return true;
  },
  bidOnTender: (id, price) => {
    const s = get();
    if (!s.game || s.planning || s.drillTarget) return false;
    const next = submitTenderBid(s.game, id, price);
    if (!next) return false;
    set({ game: next });
    return true;
  },
  withdrawTender: (id) => {
    const s = get();
    if (!s.game || s.planning || s.drillTarget) return false;
    const next = withdrawTenderBid(s.game, id);
    if (!next) return false;
    set({ game: next });
    return true;
  },

  tick: () => {
    const s = get();
    if (s.planning || s.drillTarget || s.game?.signalTraining.active) return;
    if (!s.game || s.game.speed === 0) return;
    let g = s.game;
    let notice = s.smartPauseNotice;
    for (let i = 0; i < s.game.speed; i++) {
      const next = step(g);
      const events = smartPauseEvents(g, next, s.smartPause);
      g = next;
      if (events.length) {
        notice = { at: g.minutes, resumeSpeed: s.game.speed, events };
        g = { ...g, speed: 0 };
        break;
      }
    }

    // Autosave once a game day.
    if (g.minutes - g.autosaveAt > MINUTES_PER_DAY) {
      g = { ...g, autosaveAt: g.minutes };
      const saved = saveGame(g, s.activeSaveSlot);
      set({
        persistenceError: saved
          ? null
          : s.locale === 'tr'
            ? 'Otomatik kayıt başarısız. İlerleme yalnızca bu sekmede tutuluyor.'
            : 'Autosave failed. Progress is only being kept in this tab.',
      });
    }
    set({ game: g, smartPauseNotice: notice });
  },

  beginFailureDrill: (target) => {
    const s = get();
    if (!s.game || s.game.gameOver || s.planning) return;
    const item = (target.type === 'node' ? s.game.nodes : s.game.links).find((n) => n.id === target.id);
    if (!item || item.down) return;
    set({
      game: { ...s.game, speed: 0 },
      drillTarget: target,
      selection: target,
      tool: null,
      linkFrom: null,
      screen: 'map',
    });
  },
  endFailureDrill: () => set({ drillTarget: null }),
  setSpeed: (speed) => {
    if (!get().planning && !get().drillTarget && !get().game?.signalTraining.active) {
      withGame(set, (g) => void (g.speed = speed));
      if (speed > 0) set({ smartPauseNotice: null });
    }
  },

  beginBlueprint: () => {
    if (!get().game || get().game!.gameOver || get().drillTarget) return;
    withGame(set, (g) => {
      g.speed = 0;
    });
    set({ planning: true, blueprint: [], screen: 'map', tool: 'pop', selection: null, linkFrom: null });
  },
  discardBlueprint: () => set({ planning: false, blueprint: [], tool: null, linkFrom: null, selection: null }),
  undoBlueprint: () => set((s) => ({ blueprint: s.blueprint.slice(0, -1), linkFrom: null, selection: null })),
  commitBlueprint: () => {
    const s = get();
    if (!s.game || !s.planning || !s.blueprint.length) return;
    const result = projectBlueprint(s.game, s.blueprint, s.locale);
    if (result.error) {
      s.toast(result.error, 'bad');
      return;
    }
    if (result.disconnected) {
      s.toast(
        say(s.locale, 'Connect every planned site to a core first.', 'Önce plandaki tüm noktaları çekirdeğe bağla.'),
        'bad',
      );
      return;
    }
    pushLog(
      result.state,
      line(
        `Network plan commissioned: ${s.blueprint.length} ${plural(s.blueprint.length, 'item')}.`,
        `Ağ planı kuruldu: ${s.blueprint.length} kalem.`,
      ),
      'good',
    );
    set({
      game: { ...result.state, speed: 0 },
      planning: false,
      blueprint: [],
      tool: null,
      linkFrom: null,
      selection: null,
    });
    s.toast(say(s.locale, 'Network plan commissioned.', 'Ağ planı kuruldu.'), 'good');
  },

  resolveBoardDecision: (id, option) => {
    const s = get();
    if (!s.game || s.planning || s.drillTarget) return;
    const next = resolveDecision(s.game, id, option);
    if (next) set({ game: next });
  },
  acquireRival: (id) => {
    const s = get();
    if (!s.game || s.planning) return;
    const next = acquireCompany(s.game, id);
    if (next) set({ game: next });
  },
  claimCharter: () => {
    const s = get();
    if (!s.game || s.planning) return;
    const next = claimChallenge(s.game);
    if (next) set({ game: next });
  },
  claimMilestone: (id) => {
    const s = get();
    if (!s.game) return;
    const next = grantMilestone(s.game, id);
    if (!next) return;
    const goal = MILESTONES.find((m) => m.id === id)!;
    set({ game: next });
    s.toast(
      `${goal.title[s.locale === 'tr' ? 1 : 0]} · +${fmtMoneyExact(goal.reward)} · +${goal.research} ${s.locale === 'tr' ? 'araştırma puanı' : 'research points'}`,
      'good',
    );
  },

  startSignalTraining: (size, mode) => {
    const s = get();
    if (!s.game || s.planning || s.drillTarget || s.openIncidentId || s.showSaveManager || s.showHelp || s.game.auction)
      return;
    const next = beginSignalTraining(s.game, size, mode);
    if (next) set({ game: next });
  },
  rotateSignalTile: (index) => {
    const s = get();
    const next = s.game && turnSignalTile(s.game, index);
    if (next) set({ game: next });
  },
  submitSignalTraining: () => {
    const s = get();
    const next = s.game && finishSignalTraining(s.game);
    if (!next) return false;
    set({ game: next });
    return true;
  },
  closeSignalTraining: () => {
    const s = get();
    if (s.game) set({ game: { ...s.game, speed: 0, signalTraining: { ...s.game.signalTraining, active: null } } });
  },

  setScreen: (screen) => {
    if (get().planning && screen !== 'map') {
      get().toast(
        say(get().locale, 'Build or discard your network plan first.', 'Önce ağ taslağını kur veya sil.'),
        'info',
      );
      return;
    }
    set({ screen, tool: null, linkFrom: null, drillTarget: null, inspectedOfferId: null });
  },
  setOverlay: (overlay) => set({ overlay }),
  setTool: (tool) =>
    set((s) => (s.drillTarget ? {} : { tool: s.tool === tool ? null : tool, linkFrom: null, selection: null })),
  select: (selection) => set({ selection }),
  focus: (gx, gy) => set({ focusOn: { gx, gy, at: Date.now() }, screen: 'map' }),
  openIncident: (id) => set({ openIncidentId: id }),
  toast: (text, tone = 'info', gx, gy) => {
    const id = uid('toast');
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, tone, gx, gy }] }));
    setTimeout(() => get().dismissToast(id), 2600);
  },
  dismissToast: (id) =>
    set((s) => (s.toasts.some((t) => t.id === id) ? { toasts: s.toasts.filter((t) => t.id !== id) } : s)),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
  setShowHelp: (v) => set({ showHelp: v }),
  setShowSaveManager: (v) => set({ showSaveManager: v }),
  setLocale: (locale) => {
    try {
      localStorage.setItem('telecom-empire-locale', locale);
    } catch {
      // The preference still applies for this tab when storage is unavailable.
    }
    setGameLanguage(locale);
    set({ locale });
  },
  saveToSlot: (slot) => {
    const g = get().game;
    if (!g) return false;
    if (!isSaveSlot(slot)) {
      const message = say(get().locale, 'Choose a valid save slot.', 'Geçerli bir kayıt yuvası seç.');
      set({ persistenceError: message });
      get().toast(message, 'bad');
      return false;
    }
    if (saveGame(g, slot)) {
      set({ activeSaveSlot: slot, persistenceError: null });
      get().toast(say(get().locale, `Saved to slot ${slot + 1}.`, `${slot + 1}. yuvaya kaydedildi.`), 'good');
      return true;
    }
    const message = say(get().locale, `Slot ${slot + 1} could not be saved.`, `${slot + 1}. yuva kaydedilemedi.`);
    set({ persistenceError: message });
    get().toast(message, 'bad');
    return false;
  },

  commissionUpgrades: (items) => {
    const s = get();
    if (!s.game || s.planning || s.drillTarget) return false;
    const next = commissionCapacityPlan(s.game, items);
    if (!next) {
      s.toast(
        say(
          s.locale,
          'Order could not be commissioned. Refresh the lab and check cash, faults and research.',
          'Sipariş verilemedi. Laboratuvarı yenile; nakit, arıza ve araştırma durumunu gözden geçir.',
        ),
        'bad',
      );
      return false;
    }
    set({ game: next });
    s.toast(
      say(
        s.locale,
        `${items.length} ${plural(items.length, 'capacity upgrade')} commissioned`,
        `${items.length} kapasite yükseltmesi sipariş edildi`,
      ),
      'good',
    );
    return true;
  },

  addBackupRoute: (nodeId) => {
    const s = get();
    if (!s.game || s.planning) return;
    const game = buildBackupRoute(s.game, nodeId);
    if (!game) {
      s.toast(
        say(s.locale, 'No affordable independent route is available.', 'Bütçeye uygun bağımsız bir rota yok.'),
        'bad',
      );
      return;
    }
    set({ game });
    s.toast(
      say(s.locale, 'Backup fibre live · single-cut protection', 'Yedek fiber devrede · tek kesintiye karşı koruma'),
      'good',
    );
  },
  setAutoConnect: (autoConnect) => set({ autoConnect }),
  placeNode: (kind, gx, gy) => {
    const s = get();
    const g = s.game;
    if (!g || s.drillTarget) return;
    if (s.planning) {
      const steps: BuildStep[] = [...s.blueprint, { type: 'node', id: uid('plan'), kind, gx, gy }];
      const preview = projectBlueprint(g, steps, s.locale);
      if (preview.error) s.toast(preview.error, 'bad', gx, gy);
      else set({ blueprint: steps });
      return;
    }
    if (s.autoConnect) {
      const result = buildConnectedSite(g, kind, gx, gy, s.locale);
      if (result.error) {
        s.toast(result.error, 'bad', gx, gy);
        return;
      }
      set({ game: result.state });
      s.toast(say(s.locale, 'Site connected · ready for service', 'Nokta bağlandı · hizmete hazır'), 'good', gx, gy);
      return;
    }
    const spec = NODE_SPECS[kind];
    const issue = nodePlacementIssue(g, kind, gx, gy, s.locale);
    if (issue) {
      s.toast(issue, 'bad', gx, gy);
      return;
    }
    const district = g.districts.find((d) => d.cells.some((c) => c.gx === gx && c.gy === gy));
    if (!district) return;
    const cost = nodePlacementCost(g, kind);

    const capacity = effectiveNodeCapacity(kind, initialNodeTier(kind), g.spectrum, g.researchDone);
    const count = g.nodes.filter((n) => n.kind === kind).length + 1;
    const nodeId = uid('n');
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(
        draft,
        'network_build',
        line(`${spec.label}: ${district.name}`, `${spec.labelTr}: ${district.name}`),
        -cost,
      );
      draft.nodes = [
        ...draft.nodes,
        {
          id: nodeId,
          kind,
          name: `${district.name} ${spec.label}${count > 1 ? ` ${count}` : ''}`,
          gx,
          gy,
          districtId: district.id,
          tier: initialNodeTier(kind),
          capacityGbps: capacity,
          trafficGbps: 0,
          health: 100,
          down: false,
          builtAt: draft.minutes,
          servicedAt: draft.minutes,
        },
      ];
      if (kind === 'datacenter') {
        draft.dataCenterModes = { ...draft.dataCenterModes, [nodeId]: 'colocation' };
        // Zero marks a newly built site whose initial workload can be changed immediately.
        draft.dataCenterModeChangedAt = { ...draft.dataCenterModeChangedAt, [nodeId]: 0 };
      }
      pushLog(
        draft,
        line(`${spec.label} built in ${district.name}.`, `${district.name} ilçesine ${spec.labelTr} kuruldu.`),
        'good',
      );
    });
    s.toast(say(s.locale, `${spec.label} built`, `${spec.labelTr} kuruldu`), 'good', gx, gy);
  },

  clickNodeForLink: (nodeId) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    if (s.planning && s.linkFrom && s.linkFrom !== nodeId) {
      const steps: BuildStep[] = [...s.blueprint, { type: 'link', id: uid('planlink'), aId: s.linkFrom, bId: nodeId }];
      const preview = projectBlueprint(g, steps, s.locale);
      if (preview.error) s.toast(preview.error, 'bad');
      else set({ blueprint: steps, linkFrom: null });
      return;
    }
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
    const issue = fibreConnectionIssue(g, a.id, b.id, s.locale);
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
      recordLedger(
        draft,
        'network_build',
        line(`Fibre: ${a.name} to ${b.name}`, `Fiber: ${a.name} → ${b.name}`),
        -cost,
      );
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
      pushLog(
        draft,
        line(`Fibre span lit: ${a.name} ↔ ${b.name}.`, `Fiber hattı devrede: ${a.name} ↔ ${b.name}.`),
        'good',
      );
    });
    set({ linkFrom: null });
    s.toast(say(s.locale, 'Fibre lit', 'Fiber devrede'), 'good', (a.gx + b.gx) / 2, (a.gy + b.gy) / 2);
  },

  cancelBuild: () => set({ tool: null, linkFrom: null }),

  upgradeNode: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const node = g.nodes.find((n) => n.id === id);
    if (!node) return;
    if (
      g.incidents.some((incident) => !incident.resolved && incident.targetType === 'node' && incident.targetId === id)
    ) {
      s.toast(
        say(s.locale, 'Resolve the site fault before upgrading it.', 'Yükseltmeden önce noktadaki arızayı gider.'),
        'bad',
      );
      return;
    }
    if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
      s.toast(
        say(
          s.locale,
          'Finish or clear the planned work before upgrading this site.',
          'Bu noktayı yükseltmeden önce planlı işi bitir veya iptal et.',
        ),
        'bad',
      );
      return;
    }
    const mods = researchModifiers(g.researchDone);
    const spec = NODE_SPECS[node.kind];
    const maxTier = node.kind === 'core' ? mods.maxCoreTier : node.kind === 'tower' ? mods.maxTowerTier : spec.maxTier;
    if (node.tier >= maxTier) {
      s.toast(
        say(s.locale, 'Needs new research to go further.', 'Daha ileri gitmek için yeni araştırma gerekiyor.'),
        'bad',
      );
      return;
    }
    const cost = nodeUpgradeCost(node.kind, node.tier);
    if (node.kind === 'datacenter' && node.tier === 0 && !g.researchDone.includes('edge_compute')) {
      s.toast(
        say(
          s.locale,
          'Research edge compute to expand to a full data centre.',
          'Tam merkeze genişletmek için Edge araştırması gerekiyor.',
        ),
        'bad',
      );
      return;
    }
    if (g.money < cost) {
      s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(
        draft,
        'network_upgrade',
        line(`${node.name}: tier ${node.tier + 1}`, `${node.name}: ${node.tier + 1}. seviye`),
        -cost,
      );
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
    s.toast(say(s.locale, `${node.name} upgraded`, `${node.name} yükseltildi`), 'good', node.gx, node.gy);
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
      s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(draft, 'network_service', line(`Service: ${node.name}`, `Bakım: ${node.name}`), -cost);
      draft.nodes = draft.nodes.map((n) => (n.id === id ? { ...n, health: 100, servicedAt: draft.minutes } : n));
    });
    s.toast(say(s.locale, 'Maintenance done', 'Bakım tamamlandı'), 'good', node.gx, node.gy);
  },

  scheduleMaintenance: (id, mode) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const node = g.nodes.find((entry) => entry.id === id);
    if (!node) return;
    if (mode === 'defer') {
      s.toast(
        say(
          s.locale,
          `${node.name} stays in service, and its failure odds keep climbing.`,
          `${node.name} hizmette kalıyor, arıza ihtimali artmayı sürdürüyor.`,
        ),
        'info',
      );
      return;
    }
    if (node.down || g.incidents.some((incident) => !incident.resolved && incident.targetId === id)) {
      s.toast(
        say(
          s.locale,
          'Resolve the active fault before planning service.',
          'Bakım planlamadan önce açık arızayı gider.',
        ),
        'bad',
      );
      return;
    }
    if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
      s.toast(say(s.locale, 'This site already has planned work queued.', 'Bu nokta için zaten planlı iş var.'), 'bad');
      return;
    }
    const cost = maintenanceCost(node, mode);
    if (g.money < cost) {
      s.toast(
        say(s.locale, 'Not enough cash for this maintenance window.', 'Bu bakım penceresi için nakit yetmiyor.'),
        'bad',
      );
      return;
    }
    const config = MAINTENANCE_CONFIG[mode];
    const scheduledAt = maintenanceStart(g.minutes, mode);
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(
        draft,
        'network_service',
        line(`${config.label}: ${node.name}`, `${config.labelTr}: ${node.name}`),
        -cost,
      );
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
      pushLog(
        draft,
        line(
          `${config.label} booked for ${node.name}.`,
          `${node.name} için ${config.labelTr.toLocaleLowerCase('tr-TR')} planlandı.`,
        ),
        'info',
      );
    });
    s.toast(
      mode === 'urgent'
        ? say(s.locale, 'Crew queued for dispatch', 'Ekip sevk sırasına alındı')
        : say(s.locale, '02:00 maintenance booked', 'Bakım 02:00 için planlandı'),
      'good',
      node.gx,
      node.gy,
    );
  },
  // Work that has not started yet can be called off and the fee returned.
  cancelMaintenance: (orderId) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const order = g.maintenanceOrders.find((entry) => entry.id === orderId);
    if (!order) return;
    if (order.status !== 'scheduled') {
      s.toast(
        say(
          s.locale,
          'The crew is already on site, so this cannot be called off.',
          'Ekip sahaya çıktığı için bu iş iptal edilemez.',
        ),
        'bad',
      );
      return;
    }
    const node = g.nodes.find((entry) => entry.id === order.nodeId);
    withGame(set, (draft) => {
      draft.money += order.cost;
      recordLedger(
        draft,
        'network_service',
        line(`Cancelled: ${node?.name ?? 'site'}`, `İptal: ${node?.name ?? 'nokta'}`),
        order.cost,
      );
      draft.maintenanceOrders = draft.maintenanceOrders.filter((entry) => entry.id !== orderId);
      pushLog(
        draft,
        line(
          `Planned work at ${node?.name ?? 'a site'} was called off.`,
          `${node?.name ?? 'Bir nokta'} için planlı iş iptal edildi.`,
        ),
        'info',
      );
    });
    s.toast(say(s.locale, 'Maintenance cancelled and refunded.', 'Bakım iptal edildi, ücret iade edildi.'), 'good');
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
      s.toast(
        say(
          s.locale,
          'Resolve faults on this site and its fibre before decommissioning it.',
          'Noktayı kaldırmadan önce kendisindeki ve fiberindeki arızaları gider.',
        ),
        'bad',
      );
      return;
    }
    if (g.maintenanceOrders.some((order) => order.nodeId === id && order.status !== 'completed')) {
      s.toast(
        say(
          s.locale,
          'Complete the planned work before decommissioning this site.',
          'Bu noktayı kaldırmadan önce planlı işi tamamla.',
        ),
        'bad',
      );
      return;
    }
    withGame(set, (draft) => {
      const node = draft.nodes.find((n) => n.id === id);
      if (!node) return;
      const refund = Math.round(nodeCapitalCost(node.kind, node.tier) * 0.35);
      draft.money += refund;
      recordLedger(draft, 'asset_sale', line(`Decommissioned: ${node.name}`, `Kaldırıldı: ${node.name}`), refund);
      draft.nodes = draft.nodes.filter((n) => n.id !== id);
      draft.links = draft.links.filter((l) => l.aId !== id && l.bId !== id);
      draft.dataCenterModes = Object.fromEntries(
        Object.entries(draft.dataCenterModes).filter(([nodeId]) => nodeId !== id),
      );
      draft.dataCenterModeChangedAt = Object.fromEntries(
        Object.entries(draft.dataCenterModeChangedAt).filter(([nodeId]) => nodeId !== id),
      );
      pushLog(
        draft,
        line(
          `${node.name} decommissioned (+${fmtMoneyExact(refund)}).`,
          `${node.name} kaldırıldı (+${fmtMoneyExact(refund)}).`,
        ),
        'info',
      );
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
      s.toast(
        say(s.locale, 'Higher grade optics need research.', 'Daha üst sınıf optik için araştırma gerekiyor.'),
        'bad',
      );
      return;
    }
    const cost = Math.round(link.length * FIBER_UPGRADE_COST_PER_UNIT * link.tier);
    if (g.money < cost) {
      s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(draft, 'network_upgrade', line('Fibre capacity upgrade', 'Fiber kapasite yükseltmesi'), -cost);
      draft.links = draft.links.map((l) =>
        l.id === id ? { ...l, tier: l.tier + 1, capacityGbps: linkCapacity(l.tier + 1) * mods.linkCapacityMul } : l,
      );
    });
    s.toast(say(s.locale, 'Fibre upgraded', 'Fiber yükseltildi'), 'good');
  },

  sellLink: (id) => {
    const s = get();
    if (
      s.game?.incidents.some(
        (incident) => !incident.resolved && incident.targetType === 'link' && incident.targetId === id,
      )
    ) {
      s.toast(
        say(
          s.locale,
          'Resolve the fault before removing this fibre span.',
          'Bu fiber hattını kaldırmadan önce arızayı gider.',
        ),
        'bad',
      );
      return;
    }
    withGame(set, (draft) => {
      const link = draft.links.find((l) => l.id === id);
      if (!link) return;
      const refund = Math.round(link.length * FIBER_COST_PER_UNIT * 0.2);
      draft.money += refund;
      recordLedger(draft, 'asset_sale', line('Fibre recovery', 'Fiber geri kazanımı'), refund);
      draft.links = draft.links.filter((l) => l.id !== id);
    });
    set({ selection: null });
  },

  launchDistrict: (id, kind) => {
    const s = get();
    if (!s.game || s.planning || s.drillTarget) return;
    const next = buildDistrictLaunch(s.game, id, kind);
    if (!next) {
      s.toast(
        say(
          s.locale,
          'Launch unavailable. Review the current cash and network requirements.',
          'Açılış yapılamıyor. Nakit ve şebeke gereksinimlerini gözden geçir.',
        ),
        'bad',
      );
      return;
    }
    const site = next.nodes[next.nodes.length - 1];
    const launchedIn = next.districts.find((d) => d.id === id)!.name;
    pushLog(
      next,
      line(`Starter network commissioned in ${launchedIn}.`, `${launchedIn} ilçesinde başlangıç şebekesi kuruldu.`),
      'good',
    );
    set({
      game: { ...next, speed: 0 },
      screen: 'map',
      tool: null,
      linkFrom: null,
      selection: { type: 'district', id },
    });
    s.focus(site.gx, site.gy);
    s.toast(
      say(
        s.locale,
        'District connected. Win your first 100 customers, then protect the route.',
        'İlçe bağlandı. İlk 100 müşterini kazan, sonra rotayı koru.',
      ),
      'good',
    );
  },

  updateIdentity: (name, logo) => {
    const g = get().game;
    if (!g) return false;
    const next = updateCompanyIdentity(g, name, logo);
    if (!next) return false;
    set({ game: next });
    return true;
  },

  unlockDistrict: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const district = g.districts.find((d) => d.id === id);
    if (!district || district.unlocked) return;
    if (g.money < district.entryCost) {
      s.toast(say(s.locale, 'Not enough money for the licence.', 'Lisans için yeterli para yok.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= district.entryCost;
      recordLedger(
        draft,
        'district_licence',
        line(`${district.name} licence`, `${district.name} lisansı`),
        -district.entryCost,
      );
      draft.districts = draft.districts.map((d) => (d.id === id ? { ...d, unlocked: true } : d));
      pushLog(
        draft,
        line(`Licensed to build in ${district.name}.`, `${district.name} ilçesinde kurulum lisansı alındı.`),
        'good',
      );
    });
    s.toast(
      say(s.locale, `${district.name} licensed`, `${district.name} lisanslandı`),
      'good',
      district.center.gx,
      district.center.gy,
    );
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
      s.toast(
        say(
          s.locale,
          `Keep at least one ${current.segment} package active.`,
          `En az bir ${SEGMENT_TR[current.segment]} paketi etkin kalmalı.`,
        ),
        'bad',
      );
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
      s.toast(say(s.locale, 'Prerequisites missing.', 'Ön koşullar eksik.'), 'bad');
      return;
    }
    if (g.money < node.cost) {
      s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
      return;
    }
    if (g.researchPoints < node.points) {
      s.toast(
        say(s.locale, `Need ${node.points} research points.`, `${node.points} araştırma puanı gerekiyor.`),
        'bad',
      );
      return;
    }
    withGame(set, (draft) => {
      draft.money -= node.cost;
      draft.researchPoints -= node.points;
      draft.researchActive = { id, daysLeft: node.days };
      recordLedger(
        draft,
        'research',
        line(`Research: ${node.name}`, `Araştırma: ${researchCopy(node, 'tr').name}`),
        -node.cost,
      );
      pushLog(
        draft,
        line(`Research started: ${node.name}.`, `Araştırma başladı: ${researchCopy(node, 'tr').name}.`),
        'info',
      );
    });
    s.toast(say(s.locale, `Researching ${node.name}`, `${researchCopy(node, 'tr').name} araştırılıyor`), 'good');
  },

  acceptOffer: (id, mode = 'standard') => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const offer = g.offers.find((o) => o.id === id);
    if (!offer) return;
    if (g.contracts.some((contract) => contract.buildingId === offer.buildingId)) {
      s.toast(
        say(s.locale, 'That building already has an active contract.', 'Bu binada zaten etkin bir sözleşme var.'),
        'bad',
      );
      return;
    }
    const cover = offer.requiresRedundancy ? districtRedundancy(g, offer.districtId) : null;
    if (cover && !cover.complete) {
      const name = g.districts.find((d) => d.id === offer.districtId)?.name ?? say(s.locale, 'that district', 'o ilçe');
      s.toast(
        say(
          s.locale,
          `${name}: ${cover.done} of ${cover.total} ${plural(cover.total, 'site')} ${cover.total === 1 ? 'has' : 'have'} a second path.`,
          `${name}: ${cover.total} noktadan ${cover.done} tanesinin ikinci yolu var.`,
        ),
        'bad',
      );
      return;
    }

    const negotiation = resolveNegotiation(g, offer, mode);
    const building = g.buildings.find((entry) => entry.id === offer.buildingId);
    if (!negotiation.accepted) {
      withGame(set, (draft) => {
        draft.offers = draft.offers.filter((entry) => entry.id !== id);
        pushLog(
          draft,
          line(
            `${offer.clientName} rejected the premium counter and walked away.`,
            `${offer.clientName} primli karşı teklifi reddetti ve masadan kalktı.`,
          ),
          'bad',
        );
      });
      s.toast(
        say(s.locale, 'Premium counter rejected', 'Primli karşı teklif reddedildi'),
        'bad',
        building?.gx,
        building?.gy,
      );
      return;
    }

    const agreed = negotiation.terms;
    withGame(set, (draft) => {
      draft.offers = draft.offers.filter((o) => o.id !== id && o.buildingId !== offer.buildingId);
      draft.money += agreed.signingBonus;
      recordLedger(
        draft,
        'contract_bonus',
        line(`${agreed.clientName} signing bonus`, `${agreed.clientName} imza primi`),
        agreed.signingBonus,
      );
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
      const termTr = mode === 'flexible' ? ' esnek SLA ile' : mode === 'premium' ? ' primli karşı teklifle' : '';
      pushLog(
        draft,
        line(
          `Signed ${agreed.clientName}${term} at ${fmtMoneyExact(agreed.monthlyRevenue)}/mo.`,
          `${agreed.clientName}${termTr} ayda ${fmtMoneyExact(agreed.monthlyRevenue)} karşılığında imzaladı.`,
        ),
        'good',
      );
    });
    s.toast(
      mode === 'premium'
        ? say(s.locale, 'Premium counter accepted', 'Primli karşı teklif kabul edildi')
        : say(s.locale, `${agreed.clientName} signed`, `${agreed.clientName} imzaladı`),
      'good',
      building?.gx,
      building?.gy,
    );
  },

  declineOffer: (id) => withGame(set, (draft) => void (draft.offers = draft.offers.filter((o) => o.id !== id))),

  dispatchTech: (incidentId, mode, techId) => {
    const s = get();
    const g = s.game;
    if (!g || g.gameOver || s.planning || s.drillTarget) return;
    const inc = g.incidents.find((i) => i.id === incidentId);
    if (!inc || inc.resolved) return;
    if (inc.assignedTechId) {
      s.toast(
        say(s.locale, 'A crew is already assigned to that incident.', 'Bu arızaya zaten bir ekip atandı.'),
        'bad',
      );
      return;
    }
    const candidates = dispatchCandidates(g, inc, mode);
    const tech = (techId ? candidates.find((c) => c.technician.id === techId) : candidates[0])?.technician;
    if (!tech) {
      s.toast(
        techId
          ? say(
              s.locale,
              'That crew is no longer available. Choose another crew.',
              'Bu ekip artık müsait değil. Başka bir ekip seç.',
            )
          : say(s.locale, 'Every crew is already out.', 'Bütün ekipler sahada.'),
        'bad',
      );
      return;
    }
    // Emergency work needs cash up front.
    if (mode === 'emergency') {
      const cost = repairCost(inc, 'emergency');
      if (g.money < cost) {
        s.toast(say(s.locale, 'Not enough cash for an emergency call-out.', 'Acil çağrı için nakit yetmiyor.'), 'bad');
        return;
      }
    }
    withGame(set, (draft) => dispatchTechnician(draft, incidentId, tech.id, mode));
    set({ openIncidentId: null });
    s.toast(say(s.locale, `${tech.name} is on the way`, `${tech.name} yola çıktı`), 'info');
  },

  hireTechnician: () => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const cost = 80000;
    if (g.money < cost) {
      s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      const rng = makeRng(Math.floor(Math.random() * 1e9));
      const base = draft.nodes.find((n) => n.kind === 'pop') ?? draft.nodes[0];
      draft.money -= cost;
      recordLedger(draft, 'staff', line('Field crew recruitment', 'Saha ekibi alımı'), -cost);
      draft.technicians = [
        ...draft.technicians,
        {
          id: uid('t'),
          name: personName(rng),
          skill: 1 + Math.floor(rng() * 3),
          salary: 44000 + Math.floor(rng() * 14000),
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
    s.toast(say(s.locale, 'New field crew hired', 'Yeni saha ekibi işe alındı'), 'good');
  },

  hireEmployee: (role) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const cost = 120000;
    if (g.money < cost) {
      s.toast(say(s.locale, 'Not enough money.', 'Yeterli para yok.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      const rng = makeRng(Math.floor(Math.random() * 1e9));
      const salary = {
        network_engineer: 92000,
        noc_engineer: 84000,
        field_tech: 52000,
        support: 50000,
        sales: 76000,
        security: 104000,
      }[role];
      draft.money -= cost;
      recordLedger(
        draft,
        'staff',
        line(`${role.replace(/_/g, ' ')} recruitment`, `${STAFF_ROLE_INFO[role].labelTr} alımı`),
        -cost,
      );
      draft.employees = [
        ...draft.employees,
        { id: uid('e'), name: personName(rng), role, salary, skill: 1 + Math.floor(rng() * 4), experience: 0 },
      ];
    });
    s.toast(say(s.locale, 'Hired', 'İşe alındı'), 'good');
  },

  fireStaff: (id) => {
    const s = get();
    const technician = s.game?.technicians.find((t) => t.id === id);
    if (
      technician &&
      (technician.state !== 'idle' || technician.incidentId !== null || technician.maintenanceId !== null)
    ) {
      s.toast(
        say(
          s.locale,
          'That crew must finish and return before they can be released.',
          'Bu ekip işini bitirip dönmeden çıkarılamaz.',
        ),
        'bad',
      );
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
      s.toast(say(s.locale, 'That is below the reserve price.', 'Bu tutar taban fiyatın altında.'), 'bad');
      return;
    }
    if (amount > g.money) {
      s.toast(
        say(s.locale, 'You cannot bid more than you hold.', 'Elindeki nakitten fazlasını teklif edemezsin.'),
        'bad',
      );
      return;
    }
    // Bids are sealed. Nothing is charged unless you win.
    withGame(set, (draft) => {
      if (draft.auction) draft.auction = { ...draft.auction, playerBid: amount };
    });
    s.toast(
      say(s.locale, 'Bid sealed. Results when the lot closes.', 'Teklif mühürlendi. Sonuçlar lot kapanınca açıklanır.'),
      'info',
    );
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
      s.toast(
        say(s.locale, 'Unlock the district before campaigning there.', 'Kampanya için önce ilçenin kilidini aç.'),
        'bad',
      );
      return;
    }
    if (g.campaigns.some((campaign) => campaign.districtId === districtId && campaign.endsAt > g.minutes)) {
      s.toast(
        say(
          s.locale,
          'A district can run only one focused campaign at a time.',
          'Bir ilçede aynı anda yalnızca tek bir odaklı kampanya yürütülebilir.',
        ),
        'bad',
      );
      return;
    }
    if (kind === 'mobile' && (!g.researchDone.includes('mobile_4g') || !g.spectrum.length)) {
      s.toast(
        say(
          s.locale,
          'Launch 4G and secure spectrum before promoting mobile service.',
          'Mobil hizmeti tanıtmadan önce 4G’yi başlat ve spektrum al.',
        ),
        'bad',
      );
      return;
    }
    if (g.money < config.cost) {
      s.toast(say(s.locale, 'Not enough cash for this campaign.', 'Bu kampanya için nakit yetmiyor.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= config.cost;
      recordLedger(
        draft,
        'campaign',
        line(`${config.label}: ${district.name}`, `${config.labelTr}: ${district.name}`),
        -config.cost,
      );
      draft.campaigns = [
        ...draft.campaigns,
        {
          id: uid('campaign'),
          districtId,
          kind,
          startedAt: draft.minutes,
          endsAt: draft.minutes + config.durationDays * MINUTES_PER_DAY,
          cost: config.cost,
          baselineCustomers: residentialSubs(draft, districtId) + district.mobileSubs,
          baselineSatisfaction: district.satisfaction,
          baselineContracts: draft.contracts.filter((contract) => contract.districtId === districtId).length,
        },
      ];
      pushLog(
        draft,
        line(
          `${config.label} started in ${district.name}.`,
          `${district.name} ilçesinde ${config.labelTr.toLocaleLowerCase('tr-TR')} başladı.`,
        ),
        'good',
      );
    });
    s.toast(say(s.locale, `${config.label} is live`, `${config.labelTr} yayında`), 'good');
  },

  setTrafficPolicy: (policy) => {
    const s = get();
    const g = s.game;
    if (!g || policy === g.trafficPolicy) return;
    if (policy !== 'balanced' && !g.researchDone.includes('noc')) {
      s.toast(
        say(
          s.locale,
          'A Network Operations Centre is required for traffic policy control.',
          'Trafik politikası kontrolü için Şebeke Operasyon Merkezi gerekiyor.',
        ),
        'bad',
      );
      return;
    }
    if (policy === 'mobile' && !g.researchDone.includes('mobile_5g')) {
      s.toast(
        say(
          s.locale,
          '5G Standalone research unlocks the mobile network slice.',
          '5G Standalone araştırması mobil ağ dilimini açar.',
        ),
        'bad',
      );
      return;
    }
    withGame(set, (draft) => {
      draft.trafficPolicy = policy;
      pushLog(
        draft,
        line(
          `Traffic policy changed to ${policy.replace(/_/g, ' ')}.`,
          `Trafik politikası ${TRAFFIC_POLICY_CONFIG[policy].labelTr} olarak değiştirildi.`,
        ),
        'info',
      );
    });
    s.toast(say(s.locale, 'Traffic policy applied', 'Trafik politikası uygulandı'), 'good');
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
      s.toast(
        say(
          s.locale,
          'The CDN partner needs an online data centre.',
          'CDN ortağı için çalışan bir veri merkezi gerekiyor.',
        ),
        'bad',
      );
      return;
    }
    withGame(set, (draft) => {
      draft.interconnectPlan = plan;
      pushLog(
        draft,
        line(`${config.label} interconnection activated.`, `${config.labelTr} bağlantısı etkinleştirildi.`),
        'info',
      );
    });
    s.toast(say(s.locale, `${config.label} selected`, `${config.labelTr} seçildi`), 'good');
  },

  toggleWholesaleFixed: () =>
    withGame(set, (draft) => {
      draft.wholesaleFixed = !draft.wholesaleFixed;
      pushLog(
        draft,
        line(
          `Fixed wholesale ${draft.wholesaleFixed ? 'opened' : 'closed'} to partners.`,
          `Sabit toptan satış iş ortaklarına ${draft.wholesaleFixed ? 'açıldı' : 'kapatıldı'}.`,
        ),
        'info',
      );
    }),

  toggleMvno: () => {
    const s = get();
    const g = s.game;
    if (!g) return;
    if (!g.mvnoEnabled && (!g.researchDone.includes('mobile_4g') || !g.spectrum.length)) {
      s.toast(
        say(
          s.locale,
          'MVNO access needs a live mobile platform and spectrum.',
          'MVNO erişimi için çalışan bir mobil platform ve spektrum gerekiyor.',
        ),
        'bad',
      );
      return;
    }
    withGame(set, (draft) => {
      draft.mvnoEnabled = !draft.mvnoEnabled;
      pushLog(
        draft,
        line(
          `MVNO access ${draft.mvnoEnabled ? 'opened' : 'closed'} to partners.`,
          `MVNO erişimi iş ortaklarına ${draft.mvnoEnabled ? 'açıldı' : 'kapatıldı'}.`,
        ),
        'info',
      );
    });
  },

  setDataCenterMode: (nodeId, mode) => {
    const s = get();
    const g = s.game;
    const node = g?.nodes.find((entry) => entry.id === nodeId && entry.kind === 'datacenter');
    if (!g || !node || g.dataCenterModes[nodeId] === mode) return;
    const changedAt = g.dataCenterModeChangedAt[nodeId] ?? 0;
    const availableAt = changedAt > 0 ? changedAt + DATA_CENTER_MODE_COOLDOWN : -Infinity;
    if (g.minutes < availableAt) {
      const wait = Math.ceil((availableAt - g.minutes) / MINUTES_PER_DAY);
      s.toast(
        say(
          s.locale,
          `Workload change available in ${wait} ${plural(wait, 'day')}.`,
          `İş yükü değişimi ${wait} gün sonra yapılabilir.`,
        ),
        'bad',
      );
      return;
    }
    const config = DATA_CENTER_MODE_CONFIG[mode];
    const cost = dataCenterModeChangeCost(node);
    if (g.money < cost) {
      s.toast(
        say(
          s.locale,
          'Not enough cash to reconfigure this data centre.',
          'Bu veri merkezini yeniden yapılandırmak için nakit yetmiyor.',
        ),
        'bad',
      );
      return;
    }
    withGame(set, (draft) => {
      draft.money -= cost;
      recordLedger(
        draft,
        'network_service',
        line(`${node.name}: ${config.label} reconfiguration`, `${node.name}: ${config.labelTr} yapılandırması`),
        -cost,
      );
      draft.dataCenterModes = { ...draft.dataCenterModes, [nodeId]: mode };
      draft.dataCenterModeChangedAt = { ...draft.dataCenterModeChangedAt, [nodeId]: draft.minutes };
      pushLog(
        draft,
        line(
          `${node.name} switched to ${config.label}.`,
          `${node.name} ${config.labelTr.toLocaleLowerCase('tr-TR')} moduna geçti.`,
        ),
        'info',
      );
    });
    s.toast(
      say(
        s.locale,
        `${config.label} workload applied · ${fmtMoneyExact(cost)}`,
        `${config.labelTr} iş yükü uygulandı · ${fmtMoneyExact(cost)}`,
      ),
      'good',
    );
  },

  takeLoan: (principal, termMonths) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isInteger(termMonths) || termMonths <= 0) {
      s.toast(say(s.locale, 'Choose a valid loan amount and term.', 'Geçerli bir kredi tutarı ve vade seç.'), 'bad');
      return;
    }
    const headroom = creditLimit(g);
    if (principal > headroom) {
      s.toast(say(s.locale, 'More than the banks will lend you.', 'Bankaların vereceğinden fazla.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.loans = [...draft.loans, createLoan(draft, principal, termMonths)];
      draft.money += principal;
      recordLedger(draft, 'loan_draw', line('Loan drawdown', 'Kredi kullanımı'), principal);
      pushLog(
        draft,
        line(
          `Borrowed ${fmtMoneyExact(principal)} over ${termMonths} ${plural(termMonths, 'month')}.`,
          `${termMonths} ay vadeyle ${fmtMoneyExact(principal)} kredi kullanıldı.`,
        ),
        'info',
      );
    });
    s.toast(say(s.locale, 'Loan drawn down', 'Kredi kullanıldı'), 'good');
  },

  repayLoan: (id) => {
    const s = get();
    const g = s.game;
    if (!g) return;
    const loan = g.loans.find((l) => l.id === id);
    if (!loan) return;
    if (g.money < loan.remaining) {
      s.toast(say(s.locale, 'Not enough cash to clear it.', 'Kapatmak için nakit yetmiyor.'), 'bad');
      return;
    }
    withGame(set, (draft) => {
      draft.money -= loan.remaining;
      draft.loans = draft.loans.filter((l) => l.id !== id);
      recordLedger(draft, 'loan_payment', line('Loan repaid in full', 'Kredi tamamen kapatıldı'), -loan.remaining);
      pushLog(draft, line('Loan repaid in full.', 'Kredi tamamen kapatıldı.'), 'good');
    });
    s.toast(say(s.locale, 'Loan cleared', 'Kredi kapatıldı'), 'good');
  },

  setTransitTier: (tier) => {
    const s = get();
    const g = s.game;
    if (!g || tier === g.transitTier) return;
    withGame(set, (draft) => {
      draft.transitTier = tier;
      pushLog(draft, line('Upstream transit changed.', 'Üst bağlantı transiti değiştirildi.'), 'info');
    });
    s.toast(say(s.locale, 'Transit updated', 'Transit güncellendi'), 'good');
  },

  setEnergyPlan: (plan) => {
    const s = get();
    if (!s.game || s.planning) return false;
    const next = applyEnergyPlan(s.game, plan);
    if (!next) return false;
    set({ game: next });
    s.toast(say(s.locale, 'Energy tariff updated', 'Enerji tarifesi güncellendi'), 'good');
    return true;
  },

  installSolar: (nodeId) => {
    const s = get();
    if (!s.game || s.planning) return false;
    const next = buildSolar(s.game, nodeId, researchModifiers(s.game.researchDone).hasOnsiteSolar);
    if (!next) return false;
    set({ game: next });
    s.toast(say(s.locale, 'On-site generation commissioned', 'Saha üretimi devreye alındı'), 'good');
    return true;
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

if (typeof window !== 'undefined' && import.meta.env.VITE_E2E === 'true') {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}
