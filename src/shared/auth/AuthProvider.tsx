import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  getIdToken,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  setPersistence,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { auth } from '../firebase/client';
import { collectionGroup, doc, documentId, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
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
  loginWithGoogle: () => Promise<{ isNewUser: boolean }>;
  logout: () => Promise<void>;
  deleteAccount: (currentPassword?: string) => Promise<void>;
  refreshIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hadUserRef = useRef(false);

  useEffect(() => {
    if (IS_TEST_MODE) return;
    if (typeof window === 'undefined') return;
    setPersistence(auth, browserLocalPersistence).catch(() => {});
  }, []);

  // Flutter 앱에서 로그인 상태를 주입받기 위한 글로벌 핸들러
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__flutterAuthInject = async (customToken: string) => {
      try {
        await signInWithCustomToken(auth, customToken);
      } catch (e) {
        console.error('[FlutterBridge] Auth inject failed:', e);
      }
    };
    window.__flutterGetIdToken = async () => {
      try {
        if (!auth.currentUser) return null;
        return await getIdToken(auth.currentUser, true);
      } catch (e) {
        console.error('[FlutterBridge] Get idToken failed:', e);
        return null;
      }
    };
    return () => {
      delete window.__flutterAuthInject;
      delete window.__flutterGetIdToken;
    };
  }, []);

  useEffect(() => {
    if (IS_TEST_MODE) return; // 테스트 모드일 때는 실행 안 함

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIdToken(null);
        if (hadUserRef.current) {
          sendLogoutToFlutter();
          hadUserRef.current = false;
        }
        setInitializing(false);
        return;
      }

      hadUserRef.current = true;
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
      return { isNewUser: false };
    }
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    return { isNewUser: getAdditionalUserInfo(result)?.isNewUser ?? false };
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

  const deleteUserDocuments = useCallback(async (uid: string) => {
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, 'users', uid));
    batch.delete(doc(firestore, 'roles', uid));

    const refs = new Set<string>();
    try {
      const snap = await getDocs(
        query(collectionGroup(firestore, 'members'), where('uid', '==', uid)),
      );
      for (const d of snap.docs) refs.add(d.ref.path);
    } catch {
      // ignore
    }

    if (refs.size === 0) {
      try {
        const byDocId = await getDocs(
          query(collectionGroup(firestore, 'members'), where(documentId(), '==', uid)),
        );
        for (const d of byDocId.docs) refs.add(d.ref.path);
      } catch {
        // ignore
      }
    }

    for (const path of refs) {
      batch.delete(doc(firestore, path));
    }

    await batch.commit();
  }, []);

  const deleteAccount = useCallback(
    async (currentPassword?: string) => {
      if (IS_TEST_MODE) {
        console.log('[TEST] 계정 삭제 시도');
        return;
      }

      setError(null);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('로그인된 계정을 찾을 수 없습니다.');
      }

      const providerIds = new Set(
        currentUser.providerData.map((p) => p.providerId).filter((id) => id && id !== 'firebase'),
      );

      if (providerIds.has('password')) {
        const email = currentUser.email;
        if (!email) throw new Error('이메일 정보를 찾을 수 없습니다.');
        if (!currentPassword) throw new Error('계정 삭제를 위해 현재 비밀번호가 필요합니다.');
        const credential = EmailAuthProvider.credential(email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
      } else if (providerIds.has('google.com')) {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await reauthenticateWithPopup(currentUser, provider);
      } else {
        await currentUser.reload();
      }

      await deleteUserDocuments(currentUser.uid);
      await currentUser.delete();
      await signOut(auth).catch(() => {});
      sendLogoutToFlutter();
    },
    [deleteUserDocuments],
  );

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
          deleteAccount,
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
        deleteAccount,
        refreshIdToken,
      };
    },
    [user, idToken, initializing, error, loginWithEmail, registerWithEmail, loginWithGoogle, logout, deleteAccount, refreshIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
