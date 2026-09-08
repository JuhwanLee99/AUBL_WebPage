// Test-only delivery barriers. Values and permission decisions come from the real SDK/emulator.
import * as sdk from 'firebase/firestore';
export * from 'firebase/firestore';

const paths = new WeakMap();
const requests = [], listeners = [], barriers = [];
const pathOf = ref => ref.path ?? paths.get(ref) ?? '';
const record = (kind, ref) => {
  const row = { kind, path: pathOf(ref), phase: 'started' };
  requests.push(row);
  return row;
};
async function deliver(row, promise) {
  const barrier = barriers.find(item => item.kind === row.kind && item.path === row.path && !item.claimed);
  if (barrier) barrier.claimed = true;
  try {
    const value = await promise;
    row.phase = 'received';
    if (barrier) { barrier.received = true; await barrier.wait; }
    row.phase = 'delivered';
    return value;
  } catch (error) { row.phase = 'rejected'; row.error = error.code ?? String(error); throw error; }
}
export function query(ref, ...constraints) {
  const result = sdk.query(ref, ...constraints);
  paths.set(result, pathOf(ref));
  return result;
}
export function getDoc(ref, ...args) { return deliver(record('getDoc', ref), sdk.getDoc(ref, ...args)); }
export function getDocs(ref, ...args) { return deliver(record('getDocs', ref), sdk.getDocs(ref, ...args)); }
export function setDoc(ref, ...args) { return deliver(record('setDoc', ref), sdk.setDoc(ref, ...args)); }
export function onSnapshot(ref, ...args) {
  const row = { path: pathOf(ref), active: true };
  listeners.push(row);
  const stop = sdk.onSnapshot(ref, ...args);
  return () => { row.active = false; stop(); };
}
export function writeBatch(db) {
  const batch = sdk.writeBatch(db);
  const targets = [];
  const wrapped = {
    set(ref, ...args) { targets.push(ref); batch.set(ref, ...args); return wrapped; },
    update(ref, ...args) { targets.push(ref); batch.update(ref, ...args); return wrapped; },
    delete(ref) { targets.push(ref); batch.delete(ref); return wrapped; },
    commit() {
      targets.forEach(ref => record('batchWrite', ref));
      return batch.commit();
    },
  };
  return wrapped;
}
window.storeIO = {
  requests, listeners,
  hold(kind, path) {
    const item = { kind, path, claimed: false, received: false };
    item.wait = new Promise(resolve => { item.release = resolve; });
    barriers.push(item);
    return barriers.length - 1;
  },
  received(index) { return barriers[index]?.received === true; },
  release(index) { barriers[index].release(); },
  releaseAll() { barriers.forEach(item => item.release()); },
};
