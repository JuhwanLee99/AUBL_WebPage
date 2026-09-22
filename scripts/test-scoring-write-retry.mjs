import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

// Load the real effects/scheduler, replacing only external Firebase IO and timers.
const compiled = await build({ stdin: { contents: `export * from './src/shared/state/demoStore.effects';
  export * from './src/shared/lib/scoringWriteRetry';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'cjs', platform: 'node', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'no-production-io', setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)firebase\/client$/ }, () => ({ path: 'client', namespace: 'fixture' }));
    builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'firestore', namespace: 'fixture' }));
    builder.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'client'
      ? 'export const auth = globalThis.__auth; export const firestore = {};'
      : args.path === 'auth'
      ? 'export async function getIdTokenResult() { throw new Error("Unexpected token lookup in write-only fixture"); }'
      : `const api = globalThis.__firestore;
         export const { collection, deleteField, deleteDoc, doc, getDoc, getDocs, limit,
           onSnapshot, orderBy, query, setDoc, writeBatch, where } = api;` }));
    builder.onResolve({ filter: /^firebase(?:\/|$)/ }, args => ({ errors: [{ text: `Unexpected Firebase dependency: ${args.path}` }] }));
  } }],
});

const fault = code => Object.assign(new Error(code), { code });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };

function fixture() {
  let now = 0, sequence = 0;
  const timers = new Map(), writes = [], logs = [];
  const auth = { currentUser: { uid: 'LOCAL_UID' } };
  const hooks = { setDoc: async () => {}, batch: async () => {}, score: async () => {} };
  const ref = { current: '' }, coreKey = { current: '' }, feedLength = { current: 0 }, eventLength = { current: 0 }, timer = { current: null };
  const stateRef = { current: { activeMatchId: 'LOCAL_MATCH', scorerUid: 'LOCAL_UID', scorerPaused: false,
    matches: [{ id: 'LOCAL_MATCH', status: 'inProgress', homeTeamName: 'HOME', awayTeamName: 'AWAY', startTime: '2026-09-22', venue: 'LOCAL_ONLY' }],
    score: { home: 0, away: 0 }, lineups: { home: [{ name: 'H' }], away: [{ name: 'A' }] },
    feed: [], events: [], history: [], gameStarted: true, gameOver: false } };
  let access = { matchId: 'LOCAL_MATCH', allowed: true };
  const pathOf = (...args) => ({ path: [args[0]?.path, ...args.slice(1)].filter(Boolean).join('/') });
  const firestore = {
    doc: (...args) => pathOf(...args), collection: (...args) => pathOf(...args),
    deleteField: () => '__DELETE_FIELD__', deleteDoc: async () => {},
    getDoc: async () => ({ exists: () => false }), getDocs: async () => ({ empty: true, docs: [] }),
    limit: value => value, onSnapshot: () => () => {}, orderBy: value => value, query: value => value, where: value => value,
    setDoc: async (target, value) => { const row = { kind: 'core', path: target.path, value: structuredClone(value) }; writes.push(row); return hooks.setDoc(row); },
    writeBatch: () => {
      const rows = [];
      return { set: (target, value) => rows.push({ path: target.path, value: structuredClone(value) }),
        delete: target => rows.push({ path: target.path, delete: true }),
        commit: async () => { const entry = { kind: 'batch', rows }; writes.push(entry); return hooks.batch(entry); } };
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, structuredClone,
    __auth: auth, __firestore: firestore,
    console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args), log: () => {} },
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(compiled.outputFiles[0].text, context);
  const api = module.exports;
  return { api, auth, hooks, ref, timer, coreKey, feedLength, eventLength, stateRef, writes, logs, timers,
    setAccess: value => { access = value; },
    score(overrides = {}) {
      api.syncLiveScorePatch({ canRecordGame: true, activeMatchId: stateRef.current.activeMatchId,
        matches: stateRef.current.matches, homeScore: stateRef.current.score.home, awayScore: stateRef.current.score.away,
        lastLiveScoreSyncKeyRef: ref, stateRef, getLiveRecordAccess: () => access,
        pushMatchUpdate: async (matchId, value) => { const row = { kind: 'score', matchId, value }; writes.push(row); return hooks.score(row); }, ...overrides });
    },
    schedule(overrides = {}) {
      api.syncScheduleMatchesWrite({ matches: stateRef.current.matches, isAdmin: true, matchesReadyRef: { current: true },
        skipMatchesWriteRef: { current: false }, lastMatchesKeyRef: ref, stateRef, ...overrides });
    },
    core(overrides = {}) {
      api.syncGameStateWrite({ state: stateRef.current, scorerMode: true, canRecordGame: true, stateRef,
        skipFirestoreWriteRef: { current: false }, lastStateKeyRef: coreKey, lastFeedLengthRef: feedLength,
        lastEventsLengthRef: eventLength, writeTimerRef: timer, getLiveRecordAccess: () => access, ...overrides });
    },
    async tick(ms) {
      const target = now + ms;
      for (let count = 0; ; count++) {
        const next = [...timers.entries()].filter(([, item]) => item.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        if (count > 100) throw new Error('Unbounded retry loop');
        now = next[1].at; timers.delete(next[0]); next[1].fn(); await settle();
      }
      now = target; await settle();
    },
  };
}

test('score key remains unsaved until its own ACK', async () => {
  const f = fixture(), ack = deferred(); f.hooks.score = () => ack.promise;
  f.score(); assert.equal(f.ref.current, ''); assert.equal(f.writes.length, 1);
  ack.resolve(); await settle(); assert.equal(f.ref.current, 'LOCAL_MATCH:0:0');
});
test('score retries transient failure without requiring a new state update', async () => {
  const f = fixture(); let calls = 0;
  f.hooks.score = async () => { if (++calls === 1) throw fault('unavailable'); };
  f.score(); await settle(); assert.equal(f.ref.current, '');
  await f.tick(999); assert.equal(calls, 1); await f.tick(1);
  assert.equal(calls, 2); assert.equal(f.ref.current, 'LOCAL_MATCH:0:0');
});
test('new score is serialized after pending ACK and not marked saved early', async () => {
  const f = fixture(), first = deferred(), second = deferred();
  f.hooks.score = row => row.value.homeScore === 0 ? first.promise : second.promise;
  f.score(); f.stateRef.current.score = { home: 1, away: 0 }; f.score();
  assert.equal(f.writes.length, 1); first.resolve(); await settle();
  assert.equal(f.writes.length, 2); assert.equal(f.ref.current, 'LOCAL_MATCH:0:0');
  second.resolve(); await settle(); assert.equal(f.ref.current, 'LOCAL_MATCH:1:0');
});
test('same pending payload is not sent twice', async () => {
  const f = fixture(), ack = deferred(); f.hooks.score = () => ack.promise;
  f.score(); f.score(); f.score(); ack.resolve(); await settle(); f.score(); await settle();
  assert.equal(f.writes.length, 1);
});
test('stopped writer ignores late ACK', async () => {
  const f = fixture(), ack = deferred(); f.hooks.score = () => ack.promise;
  f.score(); f.score({ canRecordGame: false }); ack.resolve(); await settle();
  assert.equal(f.ref.current, ''); assert.equal(f.api.getScoringWriteStatus(f.ref).phase, 'blocked');
});
test('logout cancels a scheduled score retry', async () => {
  const f = fixture(); f.hooks.score = async () => { throw fault('unavailable'); };
  f.score(); await settle(); f.auth.currentUser = null; await f.tick(50000);
  assert.equal(f.writes.length, 1); assert.equal(f.ref.current, ''); assert.equal(f.timers.size, 0);
});
test('official conversion cancels a scheduled score retry', async () => {
  const f = fixture(); f.hooks.score = async () => { throw fault('unavailable'); };
  f.score(); await settle(); f.stateRef.current.matches[0].recordAuthority = 'UNIQUE_PLAY'; await f.tick(50000);
  assert.equal(f.writes.length, 1); assert.equal(f.ref.current, '');
});
for (const code of ['permission-denied', 'unauthenticated', 'invalid-argument', 'unknown']) {
  test(`${code} does not start an automatic retry loop`, async () => {
    const f = fixture(); f.hooks.score = async () => { throw fault(code); };
    f.score(); await settle(); await f.tick(60000); f.score(); await settle();
    assert.equal(f.writes.length, 1); assert.equal(f.ref.current, ''); assert.equal(f.timers.size, 0);
    assert.equal(f.api.getScoringWriteStatus(f.ref).errorCode, code);
  });
}
test('transient retries stop after six total attempts', async () => {
  const f = fixture(); f.hooks.score = async () => { throw fault('unavailable'); };
  f.score(); await settle(); await f.tick(120000);
  assert.equal(f.writes.length, 6); assert.equal(f.timers.size, 0);
  assert.equal(f.api.getScoringWriteStatus(f.ref).phase, 'failed'); assert.equal(f.ref.current, '');
});
test('newer score replaces a failed older score waiting for retry', async () => {
  const f = fixture(); f.hooks.score = async row => { if (!row.value.homeScore) throw fault('unavailable'); };
  f.score(); await settle(); f.stateRef.current.score = { home: 2, away: 0 }; f.score(); await settle(); await f.tick(60000);
  assert.equal(f.writes.length, 2); assert.equal(f.ref.current, 'LOCAL_MATCH:2:0');
});
test('scope change serializes new request and discards old ACK', async () => {
  const f = fixture(), ack = deferred(); f.hooks.score = () => ack.promise;
  f.score(); f.api.stopLiveScorePatch(f.ref);
  f.auth.currentUser = { uid: 'OTHER' }; f.stateRef.current.scorerUid = 'OTHER'; f.hooks.score = async () => {};
  f.score(); assert.equal(f.writes.length, 1); ack.resolve(); await settle();
  assert.equal(f.writes.length, 2); assert.equal(f.ref.current, 'LOCAL_MATCH:0:0');
});
test('schedule key is acknowledged only after batch success', async () => {
  const f = fixture(), ack = deferred(); f.hooks.batch = () => ack.promise;
  f.schedule(); assert.equal(f.ref.current, ''); ack.resolve(); await settle();
  assert.ok(f.ref.current.includes('LOCAL_MATCH'));
});
test('schedule retries the frozen snapshot after a transient failure', async () => {
  const f = fixture(); let calls = 0;
  f.hooks.batch = async () => { if (++calls === 1) throw fault('firestore/unavailable'); };
  f.schedule(); await settle(); f.stateRef.current.matches[0].venue = 'CHANGED_AFTER_REQUEST'; await f.tick(1000);
  assert.equal(f.writes.length, 2); assert.equal(f.writes[1].rows[0].value.venue, 'LOCAL_ONLY');
  assert.ok(f.ref.current.includes('LOCAL_ONLY'));
});
test('schedule updates are serialized and newest ACK wins', async () => {
  const f = fixture(), ack = deferred(); let calls = 0;
  f.hooks.batch = () => ++calls === 1 ? ack.promise : Promise.resolve();
  f.schedule(); f.stateRef.current.matches = [{ ...f.stateRef.current.matches[0], venue: 'LATEST' }]; f.schedule();
  assert.equal(f.writes.length, 1); ack.resolve(); await settle();
  assert.equal(f.writes.length, 2); assert.ok(f.ref.current.includes('LATEST'));
});
for (const response of ['success', 'failure']) {
  test(`obsolete schedule ${response} preserves a newer authorized request`, async () => {
    const f = fixture(), first = deferred(), second = deferred(); let calls = 0;
    f.hooks.batch = () => ++calls === 1 ? first.promise : second.promise;
    f.schedule();
    f.stateRef.current.matches = [
      { ...f.stateRef.current.matches[0], recordAuthority: 'UNIQUE_PLAY' },
      { ...f.stateRef.current.matches[0], id: 'NEXT_LOCAL_MATCH', venue: 'NEXT_VENUE' },
    ];
    f.schedule(); assert.equal(f.writes.length, 1);
    if (response === 'success') first.resolve(); else first.reject(fault('unavailable'));
    await settle();
    assert.equal(f.ref.current, ''); assert.equal(f.writes.length, 2);
    assert.equal(f.writes[1].rows.length, 1);
    assert.equal(f.writes[1].rows[0].path, 'matches/NEXT_LOCAL_MATCH');
    assert.equal(f.api.getScoringWriteStatus(f.ref).phase, 'saving');
    second.resolve(); await settle(); await f.tick(60000);
    assert.ok(f.ref.current.includes('NEXT_VENUE')); assert.equal(f.writes.length, 2);
    assert.equal(f.api.getScoringWriteStatus(f.ref).phase, 'saved');
    assert.equal(f.timers.size, 0);
  });
  test(`obsolete schedule ${response} cannot retain an unauthorized next request`, async () => {
    const f = fixture(), ack = deferred(); f.hooks.batch = () => ack.promise;
    f.schedule();
    f.stateRef.current.matches = [{ ...f.stateRef.current.matches[0], venue: 'LATEST' }];
    f.schedule(); f.auth.currentUser = null;
    if (response === 'success') ack.resolve(); else ack.reject(fault('unavailable'));
    await settle(); await f.tick(60000);
    assert.equal(f.writes.length, 1); assert.equal(f.ref.current, '');
    assert.equal(f.api.getScoringWriteStatus(f.ref).phase, 'blocked');
    assert.equal(f.timers.size, 0);
  });
}
test('admin permission loss cancels pending schedule retries', async () => {
  const f = fixture(); f.hooks.batch = async () => { throw fault('unavailable'); };
  f.schedule(); await settle(); f.schedule({ isAdmin: false }); await f.tick(60000);
  assert.equal(f.writes.length, 1); assert.equal(f.ref.current, '');
});
test('incoming schedule hydration cancels an obsolete local retry', async () => {
  const f = fixture(); f.hooks.batch = async () => { throw fault('unavailable'); };
  f.schedule(); await settle(); const skip = { current: true }; f.schedule({ skipMatchesWriteRef: skip }); await f.tick(60000);
  assert.equal(f.writes.length, 1); assert.equal(skip.current, false);
});
test('official authority change prevents schedule retry', async () => {
  const f = fixture(); f.hooks.batch = async () => { throw fault('unavailable'); };
  f.schedule(); await settle(); f.stateRef.current.matches[0].recordAuthority = 'UNIQUE_PLAY'; await f.tick(60000);
  assert.equal(f.writes.length, 1); assert.equal(f.ref.current, '');
});
test('legacy core permission errors stop instead of polling forever', async () => {
  const f = fixture(); f.hooks.setDoc = async () => { throw fault('permission-denied'); };
  f.core(); await f.tick(60000); f.core(); await f.tick(60000);
  assert.equal(f.writes.length, 1); assert.equal(f.coreKey.current, ''); assert.equal(f.timers.size, 0);
});
test('legacy core transient retry uses exponential delay', async () => {
  const f = fixture(); f.hooks.setDoc = async () => { throw fault('unavailable'); };
  f.core(); await f.tick(1000); assert.equal(f.writes.length, 1);
  await f.tick(1000); assert.equal(f.writes.length, 2);
  await f.tick(1000); assert.equal(f.writes.length, 2);
  await f.tick(1000); assert.equal(f.writes.length, 3);
  await f.tick(60000); assert.equal(f.writes.length, 6); assert.equal(f.timers.size, 0);
});
test('legacy core paused before timer does not write', async () => {
  const f = fixture(); f.core(); f.stateRef.current.scorerPaused = true; await f.tick(1000);
  assert.equal(f.writes.length, 0);
});
test('legacy core late ACK after logout cannot acknowledge or write feed', async () => {
  const f = fixture(), ack = deferred(); f.hooks.setDoc = () => ack.promise;
  f.stateRef.current.feed = [{ inning: 1, half: 'top', order: 1, batter: 'B', pitch: 1, result: 'LOCAL', createdAt: 1 }];
  f.core(); await f.tick(1000); f.auth.currentUser = null; ack.resolve(); await settle();
  assert.equal(f.writes.length, 1); assert.equal(f.coreKey.current, ''); assert.equal(f.feedLength.current, 0);
});
test('legacy core access session A-B-A rejects old timer', async () => {
  const f = fixture(); f.core(); f.setAccess({ matchId: 'LOCAL_MATCH', allowed: true }); await f.tick(1000);
  assert.equal(f.writes.length, 0);
});
test('unmount cancellation invalidates late core ACK', async () => {
  const f = fixture(), ack = deferred(); f.hooks.setDoc = () => ack.promise;
  f.core(); await f.tick(1000); f.api.stopGameStateWrite(f.timer); ack.resolve(); await settle();
  assert.equal(f.coreKey.current, ''); assert.equal(f.timers.size, 0);
});
test('retry policy accepts only bounded known transient errors', () => {
  const f = fixture();
  for (const code of ['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted']) {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => f.api.scoringWriteRetryDelay(fault(code), n)), [1000, 2000, 4000, 8000, 16000, null]);
  }
});
