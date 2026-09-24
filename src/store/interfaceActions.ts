import { uid } from '../game/rng';
import { say, withGame } from './shared';
import type { GetState, SetState } from './shared';
import type { Store } from './types';

// Screens, selection, tools, notices, dialogs, drills and the tutorial.
export const interfaceActions = (set: SetState, get: GetState) =>
  ({
    inspectOffer: (id) => {
      if (id === null) {
        set({ inspectedOfferId: null });
        return;
      }
      const s = get();
      if (s.planning || s.drillTarget || !s.game?.offers.some((offer) => offer.id === id)) return;
      set({ inspectedOfferId: id, screen: 'map', tool: null, selection: null, linkFrom: null });
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

    setAutoConnect: (autoConnect) => set({ autoConnect }),

    cancelBuild: () => set({ tool: null, linkFrom: null }),

    advanceTutorial: (stepIndex) =>
      withGame(set, (draft) => {
        if (draft.tutorialStep === stepIndex) draft.tutorialStep = stepIndex + 1;
      }),

    skipTutorial: () => withGame(set, (draft) => void (draft.tutorialDone = true)),
  }) satisfies Partial<Store>;
