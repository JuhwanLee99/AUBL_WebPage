// Authentication transport is a fixture; production Provider claim/role handling runs unchanged.
export function onIdTokenChanged(auth, callback) {
  let active = true;
  queueMicrotask(() => { if (active) callback(auth.currentUser); });
  return () => { active = false; };
}
export async function getIdTokenResult() {
  return { claims: { admin: window.__storeFixture.role === 'administrator' } };
}
