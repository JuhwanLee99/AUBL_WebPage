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
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase/client';

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
    if (typeof window === 'undefined') return;
    setPersistence(auth, browserLocalPersistence).catch(() => {
      // Ignore persistence errors (e.g., incognito), fallback to default behavior.
    });
  }, []);

  useEffect(() => {
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
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    },
    [],
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      await createUserWithEmailAndPassword(auth, email, password);
    },
    [],
  );

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    await signOut(auth);
  }, []);

  const refreshIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    const token = await getIdToken(auth.currentUser, true);
    setIdToken(token);
    return token;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      idToken,
      initializing,
      error,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      logout,
      refreshIdToken,
    }),
    [user, idToken, initializing, error, loginWithEmail, registerWithEmail, loginWithGoogle, logout, refreshIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
