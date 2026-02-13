import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { firestore } from '../../../shared/firebase/client';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { useContent } from '../../../shared/state/contentProvider';
import { TEAM_GROUPS } from '../../../shared/lib/teamGroups';
import { encodeTeamId } from '../../../shared/lib/teamDirectory';
import type { UserProfile } from '../../../shared/types';

const cardStyle: CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(30,41,59,0.78))',
  padding: '16px',
  boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.3)',
  background: 'rgba(15,23,42,0.6)',
  color: '#e2e8f0',
  fontSize: '14px',
};

const labelStyle: CSSProperties = { color: '#cbd5e1', fontWeight: 800, fontSize: '13px', marginBottom: '6px', display: 'block' };

type CoachRoleEntry = {
  uid: string;
  teamId?: string;
  teamName?: string;
  email?: string | null;
  emailLower?: string | null;
  grantedAt?: number;
  grantedBy?: string | null;
};

export default function AdminRolesPage() {
  const { user } = useAuth();
  const { content } = useContent();
  const teamEntries = content.teams.entries.length ? content.teams.entries : TEAM_GROUPS;

  const teamOptions = useMemo(
    () => teamEntries.map((entry) => ({
      label: `${entry.name} (${entry.group}조)`,
      name: entry.name,
      id: encodeTeamId(entry.name),
    })),
    [teamEntries],
  );

  const [selectedTeamId, setSelectedTeamId] = useState<string>(teamOptions[0]?.id ?? '');
  const effectiveTeamId = selectedTeamId || teamOptions[0]?.id || '';
  const [emailInput, setEmailInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachRoles, setCoachRoles] = useState<CoachRoleEntry[]>([]);

  useEffect(() => {
    const q = query(collection(firestore, 'roles'), where('role', '==', 'coach'));
    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((docSnap) => ({ uid: docSnap.id, ...(docSnap.data() as CoachRoleEntry) }));
      setCoachRoles(next);
    });
    return () => unsub();
  }, []);

  const handleGrant = async () => {
    setError(null);
    setStatus(null);
    const emailLower = emailInput.trim().toLowerCase();
    if (!emailLower) {
      setError('감독 계정 이메일을 입력해주세요.');
      return;
    }
    if (!effectiveTeamId) {
      setError('팀을 선택해주세요.');
      return;
    }

    const userQuery = query(collection(firestore, 'users'), where('emailLower', '==', emailLower));
    const userSnap = await getDocs(userQuery);
    if (userSnap.empty) {
      setError('해당 이메일로 가입된 계정을 찾지 못했습니다. 먼저 회원가입을 완료해주세요.');
      return;
    }

    const userDoc = userSnap.docs[0];
    const userData = userDoc.data() as UserProfile;
    const teamName = teamOptions.find((t) => t.id === effectiveTeamId)?.name ?? effectiveTeamId;

    await setDoc(
      doc(firestore, 'roles', userDoc.id),
      {
        role: 'coach',
        teamId: effectiveTeamId,
        teamName,
        email: userData.email ?? emailLower,
        emailLower: userData.emailLower ?? emailLower,
        grantedAt: Date.now(),
        grantedBy: user?.uid ?? null,
        updatedAt: Date.now(),
      },
      { merge: true },
    );

    setStatus('감독 권한을 설정했습니다.');
    setEmailInput('');
  };

  const handleRevoke = async (uid: string) => {
    await deleteDoc(doc(firestore, 'roles', uid));
    setStatus('감독 권한을 해제했습니다.');
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {status && <div style={{ ...cardStyle, borderColor: 'rgba(34,197,94,0.45)', color: '#bbf7d0', fontWeight: 800 }}>{status}</div>}
      {error && <div style={{ ...cardStyle, borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca', fontWeight: 800 }}>{error}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>계정 권한 부여</h3>
        <div style={{ display: 'grid', gap: '10px' }}>
          <div>
            <label style={labelStyle}>팀 선택</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={effectiveTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>{team.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>감독 계정 이메일</label>
            <input
              style={inputStyle}
              placeholder="coach@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleGrant}
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 800 }}
          >
            감독 권한 부여
          </button>
        </div>
        <p style={{ marginTop: '12px', color: '#94a3b8', fontSize: '12px', lineHeight: 1.6 }}>
          감독 권한을 받은 계정은 해당 팀 페이지에서 팀원 명단을 관리할 수 있습니다.
        </p>
      </section>

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>현재 감독 목록</h3>
        {coachRoles.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {coachRoles.map((role) => (
              <div
                key={role.uid}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '10px',
                  alignItems: 'center',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ display: 'grid', gap: '6px' }}>
                  <div style={{ fontWeight: 800, color: '#e2e8f0' }}>{role.teamName ?? role.teamId}</div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>{role.email ?? role.uid}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(role.uid)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(248,113,113,0.5)',
                    background: 'rgba(248,113,113,0.12)',
                    color: '#fecdd3',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  권한 해제
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>설정된 감독 권한이 없습니다.</div>
        )}
      </section>
    </div>
  );
}
