import type { Auction, GameState, SignalPuzzle, SignalTraining } from '../src/game/types';
import type { Store } from '../src/store/types';

type RunningGame = GameState & {
  auction: Auction;
  researchActive: { id: string; daysLeft: number };
  signalTraining: SignalTraining & { active: SignalPuzzle };
};

type RunningStore = Omit<Store, 'game'> & { game: RunningGame };

interface GameBridge {
  getState(): RunningStore;
  // E2E fixtures deliberately install partial and synthetic states.
  setState(next: unknown): void;
}

declare global {
  interface Window {
    __game: GameBridge;
  }
}

export {};
