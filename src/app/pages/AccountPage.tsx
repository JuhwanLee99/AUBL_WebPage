import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
import { useAdmin } from '../../shared/auth/useAdmin';
import { useBlockedUsers } from '../../shared/moderation/useBlockedUsers';
import { unblockUser } from '../../shared/moderation/moderationService';
import {
  PageHero,
  SectionHeader,
  SeasonBadge,
  SeasonButton,
  SeasonLinkButton,
} from '../../shared/components/season';
import './AccountPage.css';

export default function AccountPage() {
  const { user, logout, deleteAccount } = useAuth();
  const { isAdmin, roleLabel, roleDetail } = useAdmin();
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);
  const { blockedUsers, loading: blockedLoading, uid } = useBlockedUsers();

  if (!user) {
    return (
      <div className="account-page account-page--signed-out">
        <PageHero
          eyebrow="AUBL ACCOUNT"
          title="로그인이 필요합니다"
          description="상단의 로그인 버튼을 통해 계정에 로그인해 주세요."
        />
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

  const handleUnblock = async (blockedUid: string) => {
    if (!uid) return;
    setUnblockingUid(blockedUid);
    try {
      await unblockUser(uid, blockedUid);
    } catch (error) {
      window.alert(`차단 해제 실패: ${String(error)}`);
    } finally {
      setUnblockingUid(null);
    }
  };

  return (
    <div className="account-page">
      <PageHero
        eyebrow="AUBL ACCOUNT"
        title="계정 설정"
        description="로그인 정보와 권한을 확인하고 계정 관련 설정을 관리합니다."
        aside={(
          <div className="account-page__hero-aside">
            <span>현재 권한</span>
            <SeasonBadge tone={isAdmin ? 'blue' : 'navy'}>{isAdmin ? 'ADMIN' : 'USER'}</SeasonBadge>
            <strong>{roleLabel}</strong>
          </div>
        )}
      />

      <section className="account-page__board" aria-labelledby="account-profile-heading">
        <SectionHeader
          headingId="account-profile-heading"
          eyebrow="PROFILE"
          title="계정 정보"
          description={user.email ?? profile?.email ?? user.uid}
        />

        <dl className="account-page__details">
          <div>
            <dt>UID</dt>
            <dd>{user.uid}</dd>
          </div>
          <div>
            <dt>PROVIDER</dt>
            <dd>{profile?.providerId ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>권한</dt>
            <dd>{roleLabel} ({roleDetail})</dd>
          </div>
          {user.metadata?.creationTime && (
            <div>
              <dt>가입일</dt>
              <dd>{new Date(user.metadata.creationTime).toLocaleString('ko-KR')}</dd>
            </div>
          )}
          {user.metadata?.lastSignInTime && (
            <div>
              <dt>마지막 로그인</dt>
              <dd>{new Date(user.metadata.lastSignInTime).toLocaleString('ko-KR')}</dd>
            </div>
          )}
        </dl>

        {needsPassword && (
          <label className="account-page__field">
            <span>비밀번호 재인증</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="회원 탈퇴를 위해 현재 비밀번호 입력"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
          </label>
        )}

        {deleteError && <p className="account-page__error" role="alert">{deleteError}</p>}

        <div className="account-page__actions">
          <SeasonButton variant="secondary" onClick={logout}>로그아웃</SeasonButton>
          <SeasonButton variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? '탈퇴 처리 중...' : '회원 탈퇴'}
          </SeasonButton>
          <SeasonLinkButton to="/account-deletion" variant="ghost">계정 삭제 안내</SeasonLinkButton>
        </div>

        <p className="account-page__policy">
          웹에서도 `/account`에서 회원 탈퇴를 진행할 수 있습니다. 데이터 처리 정책은{' '}
          <Link to="/privacy">개인정보 처리방침</Link>{' '}및{' '}
          <Link to="/terms">이용약관</Link>을 따릅니다.
        </p>
      </section>

      <section className="account-page__board" aria-labelledby="account-blocked-heading">
        <SectionHeader
          headingId="account-blocked-heading"
          eyebrow="COMMUNITY PRIVACY"
          title="차단한 사용자"
          description="차단 시 해당 사용자의 게시글/댓글이 커뮤니티에서 즉시 숨겨집니다."
        />

        {blockedLoading ? (
          <div className="account-page__empty" role="status">차단 목록을 불러오는 중...</div>
        ) : blockedUsers.length === 0 ? (
          <div className="account-page__empty">현재 차단한 사용자가 없습니다.</div>
        ) : (
          <div className="account-page__blocked-list">
            {blockedUsers.map((blocked) => (
              <article key={blocked.uid} className="account-page__blocked-row">
                <div>
                  <strong>{blocked.label}</strong>
                  <span>차단일: {blocked.blockedAt > 0 ? new Date(blocked.blockedAt).toLocaleString('ko-KR') : '-'}</span>
                </div>
                <SeasonButton
                  variant="secondary"
                  size="compact"
                  onClick={() => void handleUnblock(blocked.uid)}
                  disabled={unblockingUid === blocked.uid}
                >
                  {unblockingUid === blocked.uid ? '처리 중...' : '차단 해제'}
                </SeasonButton>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
