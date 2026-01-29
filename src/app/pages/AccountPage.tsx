import { useAuth } from '../../shared/auth/AuthProvider';
import { useAdmin } from '../../shared/auth/useAdmin';

export default function AccountPage() {
  const { user, logout } = useAuth();
  const { isAdmin, roleLabel, roleDetail } = useAdmin();

  if (!user) {
    return (
      <div
        style={{
          borderRadius: '16px',
          border: '1px solid rgba(148,163,184,0.28)',
          background: 'rgba(15,23,42,0.7)',
          padding: '18px',
          color: '#e2e8f0',
          display: 'grid',
          gap: '10px',
        }}
      >
        <h2 style={{ margin: 0, fontWeight: 900, color: '#f97316' }}>로그인이 필요합니다</h2>
        <p style={{ margin: 0, color: '#cbd5e1' }}>상단의 로그인 버튼을 통해 계정에 로그인해 주세요.</p>
      </div>
    );
  }

  const profile = user.providerData?.[0];

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div
        style={{
          borderRadius: '18px',
          border: '1px solid rgba(96,165,250,0.25)',
          background: 'linear-gradient(140deg, rgba(14,165,233,0.12), rgba(59,130,246,0.14))',
          padding: '18px',
          boxShadow: '0 16px 42px rgba(0,0,0,0.32)',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '12px',
              background: isAdmin ? 'rgba(34,197,94,0.14)' : 'rgba(148,163,184,0.18)',
              color: isAdmin ? '#bbf7d0' : '#e2e8f0',
              border: isAdmin ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(148,163,184,0.35)',
              fontWeight: 800,
              fontSize: '12px',
            }}
          >
            {isAdmin ? 'ADMIN' : 'USER'}
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 900, fontSize: '18px' }}>{user.email ?? profile?.email ?? user.uid}</span>
        </div>
        <div style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontWeight: 700, fontSize: '14px' }}>
          <span>UID: {user.uid}</span>
          <span>PROVIDER: {profile?.providerId ?? 'unknown'}</span>
          <span>권한: {roleLabel} ({roleDetail})</span>
          {user.metadata?.creationTime && <span>가입일: {new Date(user.metadata.creationTime).toLocaleString('ko-KR')}</span>}
          {user.metadata?.lastSignInTime && <span>마지막 로그인: {new Date(user.metadata.lastSignInTime).toLocaleString('ko-KR')}</span>}
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
          <button
            type="button"
            onClick={logout}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(248,113,113,0.5)',
              background: 'rgba(248,113,113,0.12)',
              color: '#fecdd3',
              fontWeight: 800,
            }}
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
