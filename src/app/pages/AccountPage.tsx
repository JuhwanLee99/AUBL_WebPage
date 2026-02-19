import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
import { useAdmin } from '../../shared/auth/useAdmin';

export default function AccountPage() {
  const { user, logout, deleteAccount } = useAuth();
  const { isAdmin, roleLabel, roleDetail } = useAdmin();
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
  const providerIds = new Set(user.providerData.map((p) => p.providerId));
  const needsPassword = providerIds.has('password');

  const handleDelete = async () => {
    const ok = window.confirm(
      '회원 탈퇴 시 계정 정보가 삭제되며 복구할 수 없습니다.\n계속 진행하시겠습니까?',
    );
    if (!ok) return;
    if (needsPassword && !deletePassword.trim()) {
      setDeleteError('현재 비밀번호를 입력해 주세요.');
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(needsPassword ? deletePassword.trim() : undefined);
      window.alert('회원 탈퇴가 완료되었습니다.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '계정 삭제 중 오류가 발생했습니다.';
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

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
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(239,68,68,0.6)',
              background: deleting ? 'rgba(127,29,29,0.35)' : 'rgba(239,68,68,0.16)',
              color: '#fecaca',
              fontWeight: 800,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleting ? '탈퇴 처리 중...' : '회원 탈퇴'}
          </button>
          <Link
            to="/account-deletion"
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(148,163,184,0.12)',
              color: '#cbd5e1',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            계정 삭제 안내
          </Link>
        </div>
        {needsPassword && (
          <div style={{ display: 'grid', gap: '6px', marginTop: '6px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>
              비밀번호 재인증
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="회원 탈퇴를 위해 현재 비밀번호 입력"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.65)',
                color: '#e2e8f0',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        )}
        {deleteError && (
          <p style={{ margin: 0, color: '#fca5a5', fontSize: '13px', fontWeight: 700 }}>
            {deleteError}
          </p>
        )}
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', lineHeight: 1.6 }}>
          웹에서도 `/account`에서 회원 탈퇴를 진행할 수 있습니다. 데이터 처리 정책은
          {' '}
          <Link to="/privacy" style={{ color: '#93c5fd' }}>개인정보 처리방침</Link>
          {' '}
          및
          {' '}
          <Link to="/terms" style={{ color: '#93c5fd' }}>이용약관</Link>
          을 따릅니다.
        </p>
      </div>
    </div>
  );
}
