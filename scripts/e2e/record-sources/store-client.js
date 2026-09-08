import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, disableNetwork, enableNetwork } from 'firebase/firestore';
const config = window.__storeFixture;
const uid = config.role === 'administrator' ? 'LOCAL_STORE_ADMIN' : 'LOCAL_STORE_SCORER';
const app = initializeApp({ projectId: config.projectId, apiKey: 'emulator-only', appId: 'emulator-only' });
export const firestore = getFirestore(app);
connectFirestoreEmulator(firestore, config.host, config.port, config.role === 'anonymous' ? undefined : {
  mockUserToken: { sub: uid, user_id: uid, admin: config.role === 'administrator' },
});
export const auth = { currentUser: config.role === 'anonymous' ? null : {
  uid, email: 'local-test@example.invalid', displayName: 'LOCAL TEST SCORER',
} };
window.storeNetwork = enabled => enabled ? enableNetwork(firestore) : disableNetwork(firestore);
