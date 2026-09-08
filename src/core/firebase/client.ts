import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseOptions } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import { resolveScoringEnvironment } from './scoringEnvironment';

export const scoringEnvironment = resolveScoringEnvironment(import.meta.env);

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
if (scoringEnvironment.mode === 'local-emulator' && app.options.projectId !== scoringEnvironment.projectId) {
  throw new Error('firebase-app-project-mismatch');
}

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim();

let appCheckInstance: AppCheck | null = null;

// Initialize only when an All-Star callable is actually used. This avoids an
// attestation request for visitors who only browse unrelated AUBL pages.
export function ensureFirebaseAppCheck(): AppCheck | null {
  if (scoringEnvironment.mode !== 'production') return null;
  if (!appCheckSiteKey) return null;
  if (appCheckInstance) return appCheckInstance;
  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}

type Services = { auth: ReturnType<typeof getAuth>; firestore: ReturnType<typeof getFirestore>; functions: ReturnType<typeof getFunctions> };
type Connections = WeakMap<object, { signature: string; services: Services }>;
const runtime = globalThis as typeof globalThis & { __aublLocalFirebaseConnections?: Connections };

function initializeServices(): Services {
  if (scoringEnvironment.mode === 'production') {
    return { auth: getAuth(app), firestore: getFirestore(app), functions: getFunctions(app, 'asia-northeast3') };
  }
  const connections = runtime.__aublLocalFirebaseConnections ??= new WeakMap();
  const signature = JSON.stringify(scoringEnvironment);
  const previous = connections.get(app);
  if (previous) {
    if (previous.signature !== signature) throw new Error('emulator-config-changed-reload-required');
    return previous.services;
  }
  const localAuth = getAuth(app);
  const localFirestore = initializeFirestore(app, { localCache: memoryLocalCache() });
  const localFunctions = getFunctions(app, 'asia-northeast3');
  const config = scoringEnvironment;
  // Connect before exporting usable services. Unexpected initialization errors are fatal.
  connectAuthEmulator(localAuth, `http://${config.auth.host}:${config.auth.port}`);
  connectFirestoreEmulator(localFirestore, config.firestore.host, config.firestore.port);
  connectFunctionsEmulator(localFunctions, config.functions.host, config.functions.port);
  connectFunctionsEmulator(getFunctions(app), config.functions.host, config.functions.port);
  const services = { auth: localAuth, firestore: localFirestore, functions: localFunctions };
  connections.set(app, { signature, services });
  return services;
}

const services = initializeServices();
export const auth = services.auth;
export const firestore = services.firestore;
export const functions = services.functions;
