import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';

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

const useFsEmulator = import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true';

// 에뮬레이터 모드: 메모리 캐시 사용 (IndexedDB 프로덕션 캐시와의 충돌 방지)
// initializeFirestore는 앱당 한 번만 호출 가능하므로 HMR 재실행 시 getFirestore로 폴백
export const firestore = useFsEmulator
  ? (() => {
      try {
        return initializeFirestore(app, { localCache: memoryLocalCache() });
      } catch {
        return getFirestore(app);
      }
    })()
  : getFirestore(app);

if (useFsEmulator) {
  const host = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST ?? '127.0.0.1';
  const port = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? 8080);
  try {
    connectFirestoreEmulator(firestore, host, port);
    console.info(`[firestore] using emulator at ${host}:${port}`);
  } catch {
    // 이미 연결된 경우 (HMR 재실행) 무시
  }
}
