export const fieldingUnitContext = {
  activeMatchId: 'LOCAL_E2E_ONLY_FIELDING_UNIT', inning: 1, half: 'top',
  outs: 0, balls: 0, strikes: 0, pitchCount: 0, bases: [null, null, null],
  score: { home: 0, away: 0 }, lineScore: { home: [], away: [] },
  batterIndex: { home: 0, away: 0 }, runnerResponsiblePitcher: { 0: null, 1: null, 2: null },
  batterId: 'B', pitcherId: 'P', revision: 'local-fielding-fixture', rosterKey: 'local-fielding-roster-v1',
};
export function fieldingLineup(prefix = 'HOME') {
  return ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].map((pos, i) => ({
    name: `${prefix}_${pos}`, number: String(i + 1), pos, throws: 'R', bats: 'R',
  }));
}
export function fieldingInput(context, id, kind = 'ground') {
  const error = kind === 'error';
  const passedBall = kind === 'pb';
  const runnerBase = context.bases.findIndex(Boolean);
  if (passedBall && runnerBase < 0) throw new Error('A passed-ball fixture needs an actual runner advancement.');
  return {
    id, expected: structuredClone(context), plate: passedBall ? 'none' : error ? 'error' : 'out',
    pitch: passedBall ? 'ball' : 'in_play', misc: passedBall ? 'pb' : 'none',
    steps: passedBall ? [{
      id: `${id}-R`, runnerId: context.bases[runnerBase], from: runnerBase, to: runnerBase === 2 ? 'home' : runnerBase + 1,
      cause: 'pb', rbi: false, advantageousAppeal: false, assists: [],
    }] : [{
      id: `${id}-B`, runnerId: context.batterId, from: 'batter', to: error ? 0 : 'out',
      cause: error ? 'error' : 'out', rbi: false, advantageousAppeal: false, assists: error ? [] : ['6'],
      ...(error ? { errorId: `${id}-E` } : { outKind: 'batter_before_first', putout: '3' }),
    }],
    errors: error ? [{ id: `${id}-E`, fielder: '6', kind: 'fielding', note: 'Local test fielding error.' }] : [],
    ruling: { kind: 'none', status: 'confirmed', rule: '', note: error ? 'Local test: ordinary fielding would have retired the batter.' : '', choice: 'play' },
    responsibility: [], groundedIntoDoublePlay: false, reviewed: true, note: 'LOCAL E2E ONLY',
  };
}
