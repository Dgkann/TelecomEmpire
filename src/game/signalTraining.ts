import { MINUTES_PER_DAY } from './constants';
import { recordLedger } from './financeLedger';
import { makeRng } from './rng';
import type { GameState, SignalPuzzle, SignalTraining } from './types';

export const TRAINING_REWARD = 30000;
export const TRAINING_RESEARCH = 3;
export const TRAINING_COOLDOWN = 7 * MINUTES_PER_DAY;
export const initialSignalTraining = (): SignalTraining => ({
  sequence: 0,
  completed: 0,
  nextRewardAt: 0,
  active: null,
});

// Ports run clockwise: north, east, south, west. Every board contains a valid route.
export function signalBoard(seed: number, size: number) {
  const rng = makeRng(seed);
  const masks: number[] = Array.from({ length: size * size }, () => (rng() < 0.5 ? 5 : 3));
  let cell = 0;
  let incoming = 3;
  while (cell !== size * size - 1) {
    const row = Math.floor(cell / size),
      col = cell % size;
    const outgoing = col === size - 1 ? 2 : row === size - 1 ? 1 : rng() < 0.5 ? 1 : 2;
    masks[cell] = (1 << incoming) | (1 << outgoing);
    cell += outgoing === 1 ? 1 : size;
    incoming = (outgoing + 2) % 4;
  }
  masks[cell] = (1 << incoming) | 2;
  return masks;
}

export const rotatePorts = (mask: number, turns: number) => ((mask << turns) | (mask >> (4 - turns))) & 15;

export function signalConnection(puzzle: SignalPuzzle) {
  const ports = signalBoard(puzzle.seed, puzzle.size).map((mask, i) => rotatePorts(mask, puzzle.rotations[i]));
  const lit = new Set<number>();
  if (ports[0] & 8) lit.add(0);
  const queue = [...lit];
  for (const cell of queue) {
    for (let direction = 0; direction < 4; direction++) {
      if (!(ports[cell] & (1 << direction))) continue;
      const row = Math.floor(cell / puzzle.size) + [-1, 0, 1, 0][direction];
      const col = (cell % puzzle.size) + [0, 1, 0, -1][direction];
      if (row < 0 || col < 0 || row >= puzzle.size || col >= puzzle.size) continue;
      const next = row * puzzle.size + col;
      if (!lit.has(next) && ports[next] & (1 << ((direction + 2) % 4))) {
        lit.add(next);
        queue.push(next);
      }
    }
  }
  const last = ports.length - 1;
  return { ports, lit, connected: lit.has(last) && !!(ports[last] & 2) };
}

export function beginSignalTraining(s: GameState, size: 4 | 5): GameState | null {
  if (s.gameOver || s.signalTraining.active || (size !== 4 && size !== 5)) return null;
  const seed = (s.rngSeed + Math.imul(s.signalTraining.sequence + 1, 2654435761)) >>> 0;
  const rng = makeRng(seed ^ 1234567);
  const active: SignalPuzzle = {
    seed,
    size,
    rotations: Array.from({ length: size * size }, () => Math.floor(rng() * 4)),
    moves: 0,
    completed: false,
    reward: 0,
  };
  // A new exercise always needs at least one rotation at the source.
  const masks = signalBoard(seed, size);
  while (rotatePorts(masks[0], active.rotations[0]) & 8) active.rotations[0] = (active.rotations[0] + 1) % 4;
  return { ...s, speed: 0, signalTraining: { ...s.signalTraining, sequence: s.signalTraining.sequence + 1, active } };
}

export function turnSignalTile(s: GameState, index: number): GameState | null {
  const active = s.signalTraining.active;
  if (
    s.gameOver ||
    !active ||
    active.completed ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= active.rotations.length
  )
    return null;
  return {
    ...s,
    signalTraining: {
      ...s.signalTraining,
      active: {
        ...active,
        moves: active.moves + 1,
        rotations: active.rotations.map((rotation, i) => (i === index ? (rotation + 1) % 4 : rotation)),
      },
    },
  };
}

export function finishSignalTraining(s: GameState): GameState | null {
  const active = s.signalTraining.active;
  if (s.gameOver || !active || active.completed || !signalConnection(active).connected) return null;
  const reward = s.minutes >= s.signalTraining.nextRewardAt ? TRAINING_REWARD : 0;
  const next: GameState = {
    ...s,
    money: s.money + reward,
    researchPoints: s.researchPoints + (reward ? TRAINING_RESEARCH : 0),
    signalTraining: {
      ...s.signalTraining,
      completed: s.signalTraining.completed + 1,
      nextRewardAt: reward ? s.minutes + TRAINING_COOLDOWN : s.signalTraining.nextRewardAt,
      active: { ...active, completed: true, reward },
    },
  };
  if (reward) recordLedger(next, 'milestone_reward', 'Signal routing exercise', reward);
  return next;
}

// Validate this separately so malformed imported boards never reach the renderer.
export function validSignalTraining(value: unknown): value is SignalTraining {
  if (!value || typeof value !== 'object') return false;
  const state = value as SignalTraining;
  const integer = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (
    !integer(state.sequence) ||
    !integer(state.completed) ||
    state.completed > state.sequence ||
    !integer(state.nextRewardAt)
  )
    return false;
  const active = state.active;
  if (active === null) return true;
  if (
    !active ||
    typeof active !== 'object' ||
    state.sequence < 1 ||
    !integer(active.seed) ||
    active.seed > 0xffffffff ||
    ![4, 5].includes(active.size) ||
    !integer(active.moves) ||
    typeof active.completed !== 'boolean' ||
    ![0, TRAINING_REWARD].includes(active.reward)
  )
    return false;
  if (
    !Array.isArray(active.rotations) ||
    active.rotations.length !== active.size ** 2 ||
    !active.rotations.every((n) => integer(n) && n < 4)
  )
    return false;
  return active.completed ? state.completed > 0 && signalConnection(active).connected : active.reward === 0;
}
