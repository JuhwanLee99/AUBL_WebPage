import { useEffect, useState } from 'react';
import { collectionGroup, doc, FieldPath, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { useAuth } from './AuthProvider';

// 개발 모드(DEV)에서만 true로 설정 가능하도록 제한
const FORCE_ADMIN = import.meta.env.DEV && false; 

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isScorer, setIsScorer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roleLabel, setRoleLabel] = useState('일반');
  const [roleDetail, setRoleDetail] = useState('사용자');

  useEffect(() => {
    let cancelled = false;
    // user 변경 직후 로딩 상태를 다음 tick에 반영한다.
    const loadingTimer = setTimeout(() => setLoading(true), 0);
    const run = async () => {
      if (FORCE_ADMIN) {
        setIsAdmin(true);
        setIsScorer(false);
        setLoading(false);
        setRoleLabel('관리자');
        setRoleDetail('정식 승인');
        return;
      }
      if (!user) {
        setIsAdmin(false);
        setIsScorer(false);
        setLoading(false);
        setRoleLabel('일반');
        setRoleDetail('사용자');
        return;
      }

      let admin = false;
      try {
        const idTokenResult = await user.getIdTokenResult(true);
        admin = !!idTokenResult.claims.admin;
      } catch (err) {
        console.error('권한 확인 실패(idToken):', err);
      }
      if (cancelled) return;
      setIsAdmin(admin);
      setIsScorer(false);
      if (admin) {
        setRoleLabel('관리자');
        setRoleDetail('정식 승인');
        setLoading(false);
        return;
      }

      try {
        const roleDoc = await getDoc(doc(firestore, 'roles', user.uid));
        if (cancelled) return;
        if (roleDoc.exists()) {
          const data = roleDoc.data();
          if (data?.role === 'scorer') {
            setRoleLabel('기록원');
            setRoleDetail('기록/중계');
            setIsScorer(true);
            setLoading(false);
            return;
          }
          if (data?.role === 'coach') {
            setRoleLabel('감독');
            setRoleDetail(data?.teamName ?? data?.teamId ?? '감독');
            setIsScorer(false);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error('권한 확인 실패(roles):', err);
      }

      try {
        let memberSnap = await getDocs(
          query(collectionGroup(firestore, 'members'), where('uid', '==', user.uid), limit(1)),
        );
        if (cancelled) return;
        if (memberSnap.empty) {
          memberSnap = await getDocs(
            query(collectionGroup(firestore, 'members'), where(FieldPath.documentId(), '==', user.uid), limit(1)),
          );
          if (cancelled) return;
        }
        if (!memberSnap.empty) {
          const docSnap = memberSnap.docs[0];
          const member = docSnap.data() as { role?: string };
          const teamRef = docSnap.ref.parent.parent;
          const teamId = teamRef?.id ?? null;
          const label =
            member.role === 'coach'
              ? '감독'
              : member.role === 'staff'
                ? '스태프'
                : '선수';
          setRoleLabel(label);
          setIsScorer(false);
          if (teamId) {
            try {
              const teamDoc = await getDoc(doc(firestore, 'teams', teamId));
              if (cancelled) return;
              setRoleDetail(teamDoc.exists() ? (teamDoc.data()?.name as string) ?? teamId : teamId);
            } catch (err) {
              console.error('권한 확인 실패(team):', err);
              setRoleDetail(teamId);
            }
          } else {
            setRoleDetail('팀 소속');
          }
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('권한 확인 실패(members):', err);
      }

      if (!cancelled) {
        setRoleLabel('일반');
        setRoleDetail('사용자');
        setIsScorer(false);
        setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      clearTimeout(loadingTimer);
    };
  }, [user]);

  const canUseScorekeeper = isAdmin || isScorer;
  const canEditGameRecords = isAdmin || isScorer;

  return { 
    isAdmin, 
    isScorer,
    canUseScorekeeper,
    canEditGameRecords,
    loading, 
    roleLabel,
    roleDetail 
  };
}
