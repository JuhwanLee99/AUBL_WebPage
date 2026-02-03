import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

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

export const auth = getAuth(app);
export const firestore = getFirestore(app);

const useFsEmulator = import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true';
if (useFsEmulator) {
  const host = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST ?? '127.0.0.1';
  const port = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? 8080);
  // connectFirestoreEmulator must be called before any Firestore use.
  connectFirestoreEmulator(firestore, host, port);
  // Optional: log once for debugging; safe in browser console.
  console.info(`[firestore] using emulator at ${host}:${port}`);
}
