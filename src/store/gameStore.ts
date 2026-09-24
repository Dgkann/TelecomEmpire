import { create } from 'zustand';
import { loadSmartPausePreferences } from '../game/smartPause';
import { setGameLanguage } from '../game/lang';
import { companyActions } from './companyActions';
import { interfaceActions } from './interfaceActions';
import { networkActions } from './networkActions';
import { sessionActions } from './sessionActions';
import { initialLocale, initialUi } from './shared';
import type { Store } from './types';

export type { BuildTool, Selection, Toast } from './types';

// The simulation writes its own lines, so it follows the stored preference from the first render on.
setGameLanguage(initialLocale());

// The actions live in slices by area; the store spreads them back into one object.
export const useGame = create<Store>((set, get) => ({
  ...initialUi,
  smartPause: loadSmartPausePreferences(),
  game: null,
  started: false,
  ...sessionActions(set, get),
  ...interfaceActions(set, get),
  ...networkActions(set, get),
  ...companyActions(set, get),
}));

export type GameStore = typeof useGame;

if (typeof window !== 'undefined' && import.meta.env.VITE_E2E === 'true') {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
}
