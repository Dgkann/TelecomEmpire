import {
  beginSignalTraining,
  turnSignalTile,
  finishSignalTraining,
  signalConnection,
  signalBoard,
  signalHint,
  signalRewardPreview,
  validSignalTraining,
  TRAINING_REWARD,
  TRAINING_RESEARCH,
  TRAINING_COOLDOWN,
} from '../../src/game/signalTraining';
import { MINUTES_PER_DAY, SAVE_VERSION } from '../../src/game/constants';
import { migrate } from '../../src/game/save';
import { step } from '../../src/game/simulation';
import { check, group, newGame } from './harness';

// Signal routing, restoration and fault finding exercises.
// Runs when imported; tools/checks.ts imports the topics in order.

group('optional signal routing exercises');
{
  const g = newGame(811);
  let allSolvable = true;
  let allScrambled = true;
  for (const size of [4, 5] as const) {
    for (let seed = 0; seed < 100; seed++) {
      const started = beginSignalTraining({ ...g, rngSeed: seed }, size)!;
      const puzzle = started.signalTraining.active!;
      allScrambled &&= !signalConnection(puzzle).connected;
      allSolvable &&= signalConnection({ ...puzzle, rotations: puzzle.rotations.map(() => 0) }).connected;
      allSolvable &&= signalBoard(puzzle.seed, size).every((mask) => [3, 5, 6, 9, 10, 12].includes(mask));
    }
  }
  check('200 seeded boards contain a valid two-port route', allSolvable);
  check('new exercises always require a player action', allScrambled);
  const started = beginSignalTraining(g, 4)!;
  check(
    'starting is free and pauses company time',
    started.money === g.money && started.speed === 0 && step(started) === started,
  );
  check('an unfinished route cannot claim a reward', finishSignalTraining(started) === null);
  check('an active route cannot be replaced by another start', beginSignalTraining(started, 5) === null);
  check(
    'invalid rotation targets cannot change progress',
    turnSignalTile(started, -1) === null &&
      turnSignalTile(started, 16) === null &&
      turnSignalTile(started, 0.5) === null,
  );
  let solved = started;
  const original = JSON.stringify(started);
  for (let cell = 0; cell < 16; cell++) {
    while (solved.signalTraining.active!.rotations[cell] !== 0) solved = turnSignalTile(solved, cell)!;
  }
  check(
    'rotating real pieces completes the route without changing the original',
    signalConnection(solved.signalTraining.active!).connected && JSON.stringify(started) === original,
  );
  const rewarded = finishSignalTraining(solved)!;
  check(
    'completion credits the advertised grant once',
    rewarded.money === g.money + TRAINING_REWARD &&
      rewarded.researchPoints === g.researchPoints + TRAINING_RESEARCH &&
      finishSignalTraining(rewarded) === null,
  );
  check(
    'grants are separate from operating income',
    rewarded.ledger[0]?.category === 'milestone_reward' &&
      rewarded.monthAccumulator.revenue === g.monthAccumulator.revenue,
  );
  check('completed tiles cannot be rotated', turnSignalTile(rewarded, 0) === null);
  const close = { ...rewarded, signalTraining: { ...rewarded.signalTraining, active: null } };
  const practice = beginSignalTraining(close, 5)!;
  const practiceSolved = {
    ...practice,
    signalTraining: {
      ...practice.signalTraining,
      active: { ...practice.signalTraining.active!, rotations: Array(25).fill(0) },
    },
  };
  const practiced = finishSignalTraining(practiceSolved)!;
  check(
    'replaying on another difficulty cannot farm grants or research',
    practiced.money === rewarded.money &&
      practiced.researchPoints === rewarded.researchPoints &&
      practiced.signalTraining.active!.reward === 0 &&
      practiced.signalTraining.completed === 2,
  );
  const nextWeek = { ...practiceSolved, minutes: rewarded.minutes + TRAINING_COOLDOWN };
  check(
    'another grant becomes available after seven game days',
    finishSignalTraining(nextWeek)!.money === rewarded.money + TRAINING_REWARD,
  );
  const resumed = migrate(JSON.parse(JSON.stringify(solved)), SAVE_VERSION);
  check(
    'saved partial progress preserves every rotation and move',
    !!resumed && JSON.stringify(resumed.signalTraining) === JSON.stringify(solved.signalTraining),
  );
  const claimedSave = migrate(JSON.parse(JSON.stringify(rewarded)), SAVE_VERSION)!;
  check('loading a completed exercise cannot claim twice', !!claimedSave && finishSignalTraining(claimedSave) === null);
  const withGrant = (reward: number) => ({
    ...rewarded.signalTraining,
    active: { ...rewarded.signalTraining.active!, reward },
  });
  check(
    'a completed exercise saved with a larger or smaller grant still loads',
    validSignalTraining(withGrant(TRAINING_REWARD * 4)) && validSignalTraining(withGrant(TRAINING_REWARD / 2)),
  );
  check(
    'negative, fractional or unfinished grants are rejected',
    !validSignalTraining(withGrant(-1)) &&
      !validSignalTraining(withGrant(1.5)) &&
      !validSignalTraining({
        ...started.signalTraining,
        active: { ...started.signalTraining.active!, reward: TRAINING_REWARD },
      }),
  );
  const legacy = JSON.parse(JSON.stringify(g));
  delete legacy.signalTraining;
  legacy.version = 23;
  const migrated = migrate(legacy, 23);
  check(
    'version 23 saves gain optional training without changing their money',
    !!migrated &&
      migrated.money === g.money &&
      migrated.signalTraining.completed === 0 &&
      migrated.signalTraining.active === null,
  );
  const broken = JSON.parse(JSON.stringify(started));
  broken.signalTraining.active.rotations[0] = 4;
  check('malformed cable orientations are rejected on import', migrate(broken, SAVE_VERSION) === null);
  check(
    'malformed dimensions and false completions are rejected',
    !validSignalTraining({ ...started.signalTraining, active: { ...started.signalTraining.active!, size: 10000 } }) &&
      !validSignalTraining({
        ...started.signalTraining,
        completed: 1,
        active: { ...started.signalTraining.active!, completed: true },
      }),
  );
  check(
    'closed companies cannot start an exercise',
    beginSignalTraining({ ...g, gameOver: { at: g.minutes, reason: 'closed' } }, 4) === null,
  );
}

group('Exercise reward previews');
{
  const g = newGame(811);
  const ready = signalRewardPreview(g);
  check(
    'idle laboratories get money and points without banking research days',
    ready.cash === TRAINING_REWARD && ready.points === TRAINING_RESEARCH && ready.researchDays === 0,
  );
  for (const daysLeft of [0, 0.25, 8]) {
    const started = beginSignalTraining({ ...g, researchActive: { id: 'ftth', daysLeft } }, 4, 'restoration')!;
    started.signalTraining.active!.rotations.fill(0);
    const expected = signalRewardPreview(started);
    const actual = finishSignalTraining(started)!;
    check(
      `preview matches the paid bonus with ${daysLeft} research days left`,
      actual.money - started.money === expected.cash &&
        actual.researchPoints - started.researchPoints === expected.points &&
        daysLeft - actual.researchActive!.daysLeft === expected.researchDays,
    );
  }
  const practice = {
    ...g,
    researchActive: { id: 'ftth', daysLeft: 5 },
    signalTraining: { ...g.signalTraining, nextRewardAt: g.minutes + MINUTES_PER_DAY + 1 },
  };
  const original = JSON.stringify(practice);
  const preview = signalRewardPreview(practice);
  check(
    'practice previews show the cooldown without promising money or research progress',
    preview.cash === 0 && preview.points === 0 && preview.researchDays === 0 && preview.daysUntilReward === 2,
  );
  check('reward previews leave the company untouched', JSON.stringify(practice) === original);
}

group('Optional cable hints');
{
  const g = newGame(811);
  let helpful = true;
  for (const mode of ['routing', 'fault', 'restoration'] as const) {
    for (const size of [4, 5] as const) {
      for (let seed = 0; seed < 50; seed++) {
        let state = beginSignalTraining({ ...g, rngSeed: seed }, size, mode)!;
        for (
          let moves = 0;
          moves < size * size * 3 && !signalConnection(state.signalTraining.active!).connected;
          moves++
        ) {
          const hint = signalHint(state.signalTraining.active!);
          if (hint === null) {
            helpful = false;
            break;
          }
          state = turnSignalTile(state, hint)!;
        }
        helpful &&=
          signalConnection(state.signalTraining.active!).connected && signalHint(state.signalTraining.active!) === null;
      }
    }
  }
  check('hints guide all three modes to a solution across 300 boards', helpful);
  const state = beginSignalTraining(g, 4, 'restoration')!;
  const before = JSON.stringify(state);
  signalHint(state.signalTraining.active!);
  check('requesting a hint changes no moves, rotations, cash or reward eligibility', JSON.stringify(state) === before);
  const solved = { ...state.signalTraining.active!, rotations: Array(16).fill(0) };
  solved.rotations[0] = signalBoard(solved.seed, solved.size)[0] === 10 ? 2 : 0;
  check('equivalent cable orientations need no hint', signalHint(solved) === null);
  check(
    'completed exercises never receive another hint',
    signalHint({ ...state.signalTraining.active!, completed: true }) === null,
  );
}

group('Restoration save compatibility');
{
  const g = newGame(811);
  for (const mode of ['routing', 'fault', 'restoration'] as const) {
    const started = beginSignalTraining(g, 4, mode)!;
    const playing = turnSignalTile(started, 2)!;
    const restored = migrate(JSON.parse(JSON.stringify(playing)), SAVE_VERSION);
    check(
      `${mode} progress survives save and load`,
      JSON.stringify(restored?.signalTraining) === JSON.stringify(playing.signalTraining),
    );
  }
  const legacy = beginSignalTraining(g, 4)!;
  legacy.version = 25;
  delete legacy.signalTraining.active!.mode;
  legacy.signalTraining.nextRewardAt = legacy.minutes + TRAINING_COOLDOWN;
  const restored = migrate(JSON.parse(JSON.stringify(legacy)), 25)!;
  check(
    'version 25 boards retain their rotations and reward timer',
    restored.version === SAVE_VERSION &&
      JSON.stringify(restored.signalTraining) === JSON.stringify(legacy.signalTraining),
  );
  const solved = beginSignalTraining(g, 4, 'restoration')!;
  solved.signalTraining.active!.rotations.fill(0);
  const rewarded = finishSignalTraining(solved)!;
  const reloaded = migrate(JSON.parse(JSON.stringify(rewarded)), SAVE_VERSION)!;
  check(
    'a restored completion cannot award twice',
    reloaded.money === rewarded.money && finishSignalTraining(reloaded) === null,
  );
}

group('Network restoration exercises');
{
  const g = newGame(811);
  let generated = true;
  let repaired = true;
  for (const size of [4, 5] as const) {
    for (let seed = 0; seed < 200; seed++) {
      const start = beginSignalTraining({ ...g, rngSeed: seed }, size, 'restoration')!;
      const puzzle = start.signalTraining.active!;
      const board = signalBoard(puzzle.seed, size);
      generated &&= puzzle.rotations.filter(Boolean).length === 3;
      generated &&= signalConnection(puzzle).ports.filter((mask, i) => mask !== board[i]).length === 3;
      generated &&= !signalConnection(puzzle).connected && signalConnection(puzzle).lit.has(0);
      let solved = start;
      for (let i = 0; i < puzzle.rotations.length; i++) {
        for (let turn = 0; turn < (4 - puzzle.rotations[i]) % 4; turn++) solved = turnSignalTile(solved, i)!;
      }
      repaired &&= signalConnection(solved.signalTraining.active!).connected;
      const reward = finishSignalTraining(solved)!;
      repaired &&= reward.money === g.money + TRAINING_REWARD && finishSignalTraining(reward) === null;
      const practice = beginSignalTraining(
        { ...reward, signalTraining: { ...reward.signalTraining, active: null } },
        size,
        'restoration',
      )!;
      practice.signalTraining.active!.rotations.fill(0);
      repaired &&= finishSignalTraining(practice)!.money === reward.money;
    }
  }
  check('400 restoration boards begin with three damaged interior cables and a broken connection', generated);
  check('all restoration boards can be repaired and share the weekly reward limit', repaired);
  const original = JSON.stringify(g);
  const first = beginSignalTraining(g, 4, 'restoration')!;
  check(
    'restoration generation is deterministic without changing the company',
    JSON.stringify(first) === JSON.stringify(beginSignalTraining(g, 4, 'restoration')) &&
      JSON.stringify(g) === original,
  );
}

group('Short fault finding exercises');
{
  const g = newGame(811);
  let valid = true;
  for (const size of [4, 5] as const) {
    for (let seed = 0; seed < 100; seed++) {
      const started = beginSignalTraining({ ...g, rngSeed: seed }, size, 'fault')!;
      const puzzle = started.signalTraining.active!;
      const fault = puzzle.rotations.findIndex((r) => r !== 0);
      valid &&= puzzle.rotations.filter(Boolean).length === 1 && fault > 0 && fault < size * size - 1;
      valid &&= !signalConnection(puzzle).connected && signalConnection(puzzle).lit.has(0);
      let solved = started;
      for (let turn = 0; turn < 3; turn++) solved = turnSignalTile(solved, fault)!;
      valid &&= signalConnection(solved.signalTraining.active!).connected;
      const rewarded = finishSignalTraining(solved)!;
      const resumed = migrate(JSON.parse(JSON.stringify(rewarded)), SAVE_VERSION);
      valid &&= resumed?.signalTraining.active?.mode === 'fault' && finishSignalTraining(resumed) === null;
      const practice = beginSignalTraining(
        { ...rewarded, signalTraining: { ...rewarded.signalTraining, active: null } },
        4,
      )!;
      practice.signalTraining.active!.rotations.fill(0);
      valid &&= finishSignalTraining(practice)!.money === rewarded.money;
    }
  }
  check('200 fault exercises retain a lit source, have one repair and share the routing reward cooldown', valid);
  const training = beginSignalTraining(g, 4, 'fault')!.signalTraining;
  check(
    'unknown exercise modes cannot be imported',
    !validSignalTraining({ ...training, active: { ...training.active, mode: 'unknown' } }),
  );
}
