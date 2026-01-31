import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getIdToken,
  onIdTokenChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { auth } from '../firebase/client';

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
    if (IS_TEST_MODE) return; // 테스트 모드일 때는 실행 안 함
    if (typeof window === 'undefined') return;
    setPersistence(auth, browserLocalPersistence).catch(() => {
      // Ignore persistence errors (e.g., incognito), fallback to default behavior.
    });
  }, []);

  useEffect(() => {
    if (IS_TEST_MODE) return; // 테스트 모드일 때는 실행 안 함

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIdToken(null);
        setInitializing(false);
        return;
      }

      try {
        const token = await getIdToken(nextUser, true);
        setIdToken(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : '토큰을 불러오지 못했습니다.');
      } finally {
        setInitializing(false);
      }
    });

    return () => unsubscribe();
  }, []);

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
  }, []);

  const refreshIdToken = useCallback(async () => {
    if (IS_TEST_MODE) return 'mock-test-token';
    if (!auth.currentUser) return null;
    const token = await getIdToken(auth.currentUser, true);
    setIdToken(token);
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