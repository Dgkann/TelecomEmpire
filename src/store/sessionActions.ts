import { SMART_PAUSE_KEY, SMART_PAUSE_OPTIONS, smartPauseEvents } from '../game/smartPause';
import { grantStarterSpectrum } from '../game/spectrum';
import { MINUTES_PER_DAY } from '../game/constants';
import { clearSave, loadGame, saveGame } from '../game/saveStorage';
import { CAMPAIGN_STAGES } from '../game/scenarios';
import { createNewGame, step } from '../game/simulation';
import { setGameLanguage } from '../game/lang';
import { say, withGame, isSaveSlot, initialUi } from './shared';
import type { GetState, SetState } from './shared';
import type { Store } from './types';

// Starting, saving, loading and advancing the game, and the settings that follow the player.
export const sessionActions = (set: SetState, get: GetState) =>
  ({
    newGame: (opts, slot = 0) => {
      if (!isSaveSlot(slot)) {
        set({
          persistenceError: get().locale === 'tr' ? 'Geçerli bir kayıt yuvası seç.' : 'Choose a valid save slot.',
        });
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

    setSpeed: (speed) => {
      if (!get().planning && !get().drillTarget && !get().game?.signalTraining.active) {
        withGame(set, (g) => void (g.speed = speed));
        if (speed > 0) set({ smartPauseNotice: null });
      }
    },

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
  }) satisfies Partial<Store>;
