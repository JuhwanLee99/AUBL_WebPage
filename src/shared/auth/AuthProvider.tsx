import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getIdToken,
  onIdTokenChanged,
  setPersistence,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { auth } from '../firebase/client';
import { doc, setDoc } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { sendLogoutToFlutter, sendTokenRefreshToFlutter } from '../bridge/flutterBridge';

// -----------------------------------------------------------
// [로컬 테스트용 설정]
// ✅ Vite 환경변수를 사용하여, 실제 배포 빌드(Production)에서는 무조건 false가 됨
const IS_TEST_MODE = import.meta.env.DEV && false;

const MOCK_USER = {
  uid: 'test-local-user',
  email: 'admin@aubl.com',
  displayName: '테스트 관리자',
  emailVerified: true,
  getIdTokenResult: async () => ({
    claims: { admin: true },
    token: 'mock-token',
    authTime: Date.now(),
    issuedAtTime: Date.now(),
    expirationTime: Date.now() + 3600,
    signInProvider: 'google',
    signInSecondFactor: null,
  }),
} as unknown as User;
// -----------------------------------------------------------

type AuthContextValue = {
  user: User | null;
  idToken: string | null;
  initializing: boolean;
  error: string | null;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_TEST_MODE) return;
    if (typeof window === 'undefined') return;
    setPersistence(auth, browserLocalPersistence).catch(() => {});
  }, []);

  // Flutter 앱에서 로그인 상태를 주입받기 위한 글로벌 핸들러
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__flutterAuthInject = async (customToken: string) => {
      try {
        await signInWithCustomToken(auth, customToken);
      } catch (e) {
        console.error('[FlutterBridge] Auth inject failed:', e);
      }
    };
    return () => {
      delete (window as any).__flutterAuthInject;
    };
  }, []);

  useEffect(() => {
    if (IS_TEST_MODE) return; // 테스트 모드일 때는 실행 안 함

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIdToken(null);
        sendLogoutToFlutter();
        setInitializing(false);
        return;
      }

      try {
        const token = await getIdToken(nextUser, true);
        setIdToken(token);
        await sendTokenRefreshToFlutter(nextUser, token);
      } catch (err) {
        setError(err instanceof Error ? err.message : '토큰을 불러오지 못했습니다.');
      } finally {
        setInitializing(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (IS_TEST_MODE) return;
    if (!user) return;
    const email = user.email ?? null;
    const payload = {
      uid: user.uid,
      email,
      emailLower: email ? email.toLowerCase() : null,
      displayName: user.displayName ?? null,
      createdAt: user.metadata?.creationTime ?? null,
      lastSignInAt: user.metadata?.lastSignInTime ?? null,
      updatedAt: Date.now(),
    };
    setDoc(doc(firestore, 'users', user.uid), payload, { merge: true }).catch(() => {});
  }, [user]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      if (IS_TEST_MODE) {
        console.log('[TEST] 이메일 로그인 시도:', email);
        return;
      }
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    },
    [],
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string) => {
      if (IS_TEST_MODE) {
        console.log('[TEST] 회원가입 시도:', email);
        return;
      }
      setError(null);
      await createUserWithEmailAndPassword(auth, email, password);
    },
    [],
  );

  const loginWithGoogle = useCallback(async () => {
    if (IS_TEST_MODE) {
      console.log('[TEST] 구글 로그인 시도');
      return;
    }
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }, []);

  const logout = useCallback(async () => {
    if (IS_TEST_MODE) {
      console.log('[TEST] 로그아웃 시도');
      return;
    }
    setError(null);
    await signOut(auth);
    sendLogoutToFlutter();
  }, []);

  const refreshIdToken = useCallback(async () => {
    if (IS_TEST_MODE) return 'mock-test-token';
    if (!auth.currentUser) return null;
    const token = await getIdToken(auth.currentUser, true);
    setIdToken(token);
    await sendTokenRefreshToFlutter(auth.currentUser, token);
    return token;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => {
      // 테스트 모드일 경우 강제로 Mock 데이터 반환
      if (IS_TEST_MODE) {
        return {
          user: MOCK_USER,
          idToken: 'mock-test-token',
          initializing: false,
          error: null,
          loginWithEmail,
          registerWithEmail,
          loginWithGoogle,
          logout,
          refreshIdToken,
        };
      }

      return {
        user,
        idToken,
        initializing,
        error,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        refreshIdToken,
      };
    },
    [user, idToken, initializing, error, loginWithEmail, registerWithEmail, loginWithGoogle, logout, refreshIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
