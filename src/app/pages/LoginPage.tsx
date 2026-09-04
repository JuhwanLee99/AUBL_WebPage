import type * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
import {
  hasFlutterBridge,
  requestNativeGoogleSignInFromFlutter,
  sendLoginSuccessToFlutter,
} from '../../shared/bridge/flutterBridge';
import { auth } from '../../shared/firebase/client';
import './LoginPage.css';

type LocationState = {
  from?: string;
};

type SocialProvider = 'google' | 'apple';

function AppleLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <path d="M16.365 1.43c0 1.14-.43 2.273-1.15 3.115-.864 1.01-2.274 1.79-3.664 1.675-.177-1.094.33-2.273 1.046-3.09.79-.93 2.268-1.79 3.768-1.7zM21.54 17.057c-.584 1.286-.864 1.86-1.62 3.01-1.055 1.62-2.549 3.64-4.409 3.653-1.655.017-2.082-1.077-4.329-1.065-2.247.013-2.715 1.086-4.37 1.069-1.86-.013-3.274-1.831-4.33-3.449C-.866 15.563-.462 10.03 2.375 7.693c2.016-1.662 5.209-1.332 6.443.37.957 1.307.884 3.123.439 4.685-.402 1.414-1.365 2.69-1.254 4.102.1 1.27 1.124 2.523 2.396 2.643 1.34.127 2.04-.947 3.3-.944 1.206.003 1.87 1.071 3.09.942 1.06-.111 1.92-.99 2.43-1.87.606-1.045.855-2.044.886-2.097-.023-.007-3.402-1.307-3.436-5.192-.028-3.25 2.652-4.803 2.773-4.878-1.53-2.236-3.896-2.54-4.73-2.602-2.046-.16-3.79 1.104-4.77 1.104-1.008 0-2.53-1.075-4.156-1.048-2.093.032-4.053 1.22-5.127 3.084-2.219 3.845-.564 9.52 1.608 12.656 1.05 1.525 2.297 3.227 3.938 3.167 1.608-.067 2.225-1.02 4.178-1.02 1.95 0 2.53 1.02 4.191.98 1.723-.028 2.807-1.54 3.857-3.072" />
    </svg>
  );
}

export default function LoginPage() {
  const { loginWithEmail, registerWithEmail, loginWithGoogle, loginWithApple, logout, error, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const embedded = searchParams.get('embedded') === 'flutter';
  const nativeGoogleEnabled = searchParams.get('nativeGoogle') === '1';
  const rawNext = searchParams.get('next');
  const forceLogout = searchParams.get('forceLogout') === '1';
  const next = rawNext && rawNext.startsWith('/') ? rawNext : null;
  const redirectTo = useMemo(() => next || (location.state as LocationState | null)?.from || '/', [location.state, next]);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [logoutReady, setLogoutReady] = useState(!forceLogout);
  const [showSocialConsent, setShowSocialConsent] = useState(false);
  const [socialConsentProvider, setSocialConsentProvider] = useState<SocialProvider>('google');
  const [socialAgreedTerms, setSocialAgreedTerms] = useState(false);
  const [socialAgreedPrivacy, setSocialAgreedPrivacy] = useState(false);
  // true: 이미 Firebase 로그인 완료 후 동의 대기 (신규 유저), false: 로그인 전 동의 (Flutter 네이티브)
  const [socialConsentPostSignIn, setSocialConsentPostSignIn] = useState(false);
  const [socialConsentTab, setSocialConsentTab] = useState<'terms' | 'privacy'>('terms');
  const socialConsentDialogRef = useRef<HTMLDivElement>(null);
  const socialConsentReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!embedded || !user) return;
    if (forceLogout && !logoutReady) return;
    void sendLoginSuccessToFlutter(user);
    navigate(redirectTo, { replace: true });
  }, [embedded, forceLogout, logoutReady, navigate, redirectTo, user]);

  useEffect(() => {
    if (!forceLogout) return;
    let cancelled = false;
    const run = async () => {
      try {
        await logout();
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLogoutReady(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [forceLogout, logout]);

  const handleSubmit = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
        if (!agreedTerms || !agreedPrivacy) {
          setSubmitting(false);
          setMessage('이용약관 및 개인정보 처리방침에 동의해 주세요.');
          return;
        }
        if (password !== confirmPassword) {
          setSubmitting(false);
          setMessage('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
          return;
        }
        await registerWithEmail(email, password);
      }
      if (auth.currentUser) {
        void sendLoginSuccessToFlutter(auth.currentUser);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const socialProviderLabel = socialConsentProvider === 'google' ? 'Google' : 'Apple';

  const openSocialConsent = (provider: SocialProvider, postSignIn: boolean) => {
    socialConsentReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setSocialConsentProvider(provider);
    setSocialAgreedTerms(false);
    setSocialAgreedPrivacy(false);
    setSocialConsentPostSignIn(postSignIn);
    setSocialConsentTab('terms');
    setMessage(null);
    setShowSocialConsent(true);
  };

  const handleGoogleClick = async () => {
    // Flutter 네이티브: isNewUser를 알 수 없으므로 로그인 전에 동의 먼저
    if (embedded && (nativeGoogleEnabled || hasFlutterBridge())) {
      openSocialConsent('google', false);
      return;
    }
    // 웹: 로그인 먼저, 신규 유저인 경우에만 동의 모달
    setSubmitting(true);
    setMessage(null);
    try {
      const { isNewUser } = await loginWithGoogle();
      if (isNewUser) {
        openSocialConsent('google', true);
        setSubmitting(false);
        return;
      }
      if (auth.currentUser) void sendLoginSuccessToFlutter(auth.currentUser);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '구글 로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAppleClick = async () => {
    if (embedded) {
      openSocialConsent('apple', false);
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const { isNewUser } = await loginWithApple();
      if (isNewUser) {
        openSocialConsent('apple', true);
        setSubmitting(false);
        return;
      }
      if (auth.currentUser) void sendLoginSuccessToFlutter(auth.currentUser);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
      if (code === 'auth/operation-not-allowed') {
        setMessage('Apple 로그인 설정이 아직 완료되지 않았습니다. 설정 완료 후 다시 시도해 주세요.');
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setMessage('Apple 로그인이 취소되었습니다.');
      } else {
        setMessage(err instanceof Error ? err.message : 'Apple 로그인에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialConsentDecline = useCallback(async () => {
    setShowSocialConsent(false);
    // 이미 로그인된 신규 유저가 동의 거부 → 계정 삭제
    if (socialConsentPostSignIn && auth.currentUser) {
      try {
        await auth.currentUser.delete();
      } catch {
        // ignore
      }
    }
  }, [socialConsentPostSignIn]);

  const handleSocialConsent = async () => {
    if (!socialAgreedTerms || !socialAgreedPrivacy) {
      setMessage('이용약관 및 개인정보 처리방침에 동의해 주세요.');
      return;
    }
    setShowSocialConsent(false);
    // 웹 신규 유저: 이미 로그인됨 → 그냥 이동
    if (socialConsentPostSignIn) {
      if (auth.currentUser) void sendLoginSuccessToFlutter(auth.currentUser);
      navigate(redirectTo, { replace: true });
      return;
    }
    // Flutter 네이티브: 동의 후 실제 로그인 요청
    setSubmitting(true);
    setMessage(null);
    try {
      if (socialConsentProvider === 'google') {
        const sent = requestNativeGoogleSignInFromFlutter();
        if (!sent) {
          setMessage('앱 브리지 연결을 찾지 못했습니다. 앱을 다시 실행해 주세요.');
          return;
        }
        setMessage('앱에서 Google 로그인을 진행 중입니다.');
        return;
      }
      await loginWithApple({ useRedirect: true });
      setMessage('앱에서 Apple 로그인을 진행 중입니다.');
    } catch (err) {
      if (socialConsentProvider === 'apple') {
        const code =
          typeof err === 'object' && err && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (code === 'auth/operation-not-allowed') {
          setMessage('Apple 로그인 설정이 아직 완료되지 않았습니다. 설정 완료 후 다시 시도해 주세요.');
          return;
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          setMessage('Apple 로그인이 취소되었습니다.');
          return;
        }
        setMessage(err instanceof Error ? err.message : 'Apple 로그인에 실패했습니다.');
        return;
      }
      setMessage(err instanceof Error ? err.message : '구글 로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!showSocialConsent) return;
    const dialog = socialConsentDialogRef.current;
    if (!dialog) return;

    const focusableSelector = [
      'button:not(:disabled):not([tabindex="-1"])',
      'a[href]',
      'input:not(:disabled)',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const focusFirstControl = window.requestAnimationFrame(() => {
      dialog.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void handleSocialConsentDecline();
        return;
      }
      if (event.key !== 'Tab') return;

      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hasAttribute('disabled') && element.tabIndex >= 0);
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    const returnFocusTarget = socialConsentReturnFocusRef.current;
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      document.removeEventListener('keydown', handleDialogKeyDown);
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus();
    };
  }, [handleSocialConsentDecline, showSocialConsent]);

  return (
    <div className="auth-shell">
      {/* 상단: 간결한 제목 + 설명 */}
      <div className="auth-hero">
        <p className="eyebrow">AUBL 계정</p>
        <h1>로그인하고 경기 소식을 가장 빠르게 만나보세요</h1>
        <p className="lede">
          {embedded
            ? nativeGoogleEnabled
              ? '이메일·비밀번호 또는 Google/Apple 계정으로 로그인하세요.'
              : '앱 내 WebView에서는 이메일·비밀번호 로그인만 지원합니다.'
            : '이메일·비밀번호(재확인) 또는 Google/Apple 계정으로 간편 로그인하세요.'}
        </p>
      </div>

      {/* 로그인 카드 */}
      <div className="auth-card">
        <div className="auth-card__header">
          <button
            type="button"
            className={`auth-tab${mode === 'login' ? ' is-active' : ''}`}
            onClick={() => setMode('login')}
            disabled={submitting}
          >
            로그인
          </button>
          <button
            type="button"
            className={`auth-tab${mode === 'register' ? ' is-active' : ''}`}
            onClick={() => setMode('register')}
            disabled={submitting}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            이메일
            <input
              className="auth-input"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="auth-label">
            비밀번호
            <input
              className="auth-input"
              type="password"
              name="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {mode === 'register' && (
            <label className="auth-label">
              비밀번호 확인
              <input
                className="auth-input"
                type="password"
                name="passwordConfirm"
                autoComplete="new-password"
                placeholder="다시 한 번 입력"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
          )}
          {mode === 'register' && (
            <div className="auth-consent-list">
              <label className="auth-consent-check">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                />
                <span>
                  <Link to="/terms" target="_blank" className="auth-link">이용약관</Link>에 동의합니다 <span className="auth-required">*</span>
                </span>
              </label>
              <label className="auth-consent-check">
                <input
                  type="checkbox"
                  checked={agreedPrivacy}
                  onChange={(e) => setAgreedPrivacy(e.target.checked)}
                />
                <span>
                  <Link to="/privacy" target="_blank" className="auth-link">개인정보 처리방침</Link>에 동의합니다 <span className="auth-required">*</span>
                </span>
              </label>
            </div>
          )}

          {(message || error) && (
            <div className="auth-alert">
              {message || error}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>

        {(!embedded || nativeGoogleEnabled) && (
          <>
            <div className="auth-divider">
              <span>또는</span>
            </div>

            <button type="button" className="auth-google" onClick={handleGoogleClick} disabled={submitting}>
              <span>G</span>
              Google 계정으로 계속하기
            </button>
            <button type="button" className="auth-apple" onClick={handleAppleClick} disabled={submitting}>
              <span className="auth-apple__icon">
                <AppleLogoIcon />
              </span>
              Apple 계정으로 계속하기
            </button>
          </>
        )}

        {showSocialConsent && (
          <div
            className="auth-consent-modal"
            onClick={handleSocialConsentDecline}
          >
            <div
              ref={socialConsentDialogRef}
              className="auth-consent-modal__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="social-consent-title"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="auth-consent-modal__heading">
                <h2 id="social-consent-title">
                  {socialProviderLabel} 계정으로 계속하기
                </h2>
                <p>
                  AUBL 서비스 이용을 위해 아래 약관을 확인하고 동의해 주세요.
                </p>
              </div>

              {/* 탭 + 미리보기 */}
              <div className="auth-consent-document">
                {/* 탭 헤더 */}
                <div className="auth-consent-document__tabs" role="tablist" aria-label="동의 문서 선택">
                  {(['terms', 'privacy'] as const).map((tab) => (
                    <button
                      key={tab}
                      id={`social-consent-tab-${tab}`}
                      type="button"
                      role="tab"
                      aria-selected={socialConsentTab === tab}
                      aria-controls="social-consent-panel"
                      tabIndex={socialConsentTab === tab ? 0 : -1}
                      className={socialConsentTab === tab ? 'is-active' : ''}
                      onClick={() => setSocialConsentTab(tab)}
                      onKeyDown={(event) => {
                        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const nextTab = event.key === 'ArrowLeft' || event.key === 'Home' ? 'terms' : 'privacy';
                        setSocialConsentTab(nextTab);
                        window.requestAnimationFrame(() => {
                          document.getElementById(`social-consent-tab-${nextTab}`)?.focus();
                        });
                      }}
                    >
                      {tab === 'terms' ? '이용약관' : '개인정보 처리방침'}
                    </button>
                  ))}
                </div>

                {/* 미리보기 스크롤 영역 */}
                <div
                  id="social-consent-panel"
                  className="auth-consent-document__body"
                  role="tabpanel"
                  aria-labelledby={`social-consent-tab-${socialConsentTab}`}
                  tabIndex={0}
                >
                  {socialConsentTab === 'terms' ? (
                    <>
                      {[
                        { title: '제1조 (목적)', items: ['본 약관은 전국대학아마추어야구연합회(이하 "AUBL")가 제공하는 모바일 앱 및 웹 서비스의 이용 조건과 절차, 회원과 AUBL의 권리·의무를 규정함을 목적으로 합니다.'] },
                        { title: '제2조 (정의)', items: ['"서비스"란 경기 일정·결과 조회, 실시간 문자중계, 기록 열람, 커뮤니티, 푸시 알림 등 일체의 서비스를 말합니다.', '"회원"이란 본 약관에 동의하고 이메일·비밀번호 또는 Google/Apple 계정을 통해 가입한 이용자를 말합니다.'] },
                        { title: '제3조 (약관의 효력 및 변경)', items: ['변경된 약관에 동의하지 않는 경우 회원 탈퇴를 할 수 있으며, 고지 후 7일 이내 탈퇴하지 않은 경우 동의한 것으로 간주합니다.'] },
                        { title: '제4조 (회원 가입 및 탈퇴)', items: ['회원 가입은 이메일·비밀번호 등록 또는 Google/Apple 계정을 통한 소셜 로그인으로 이루어지며, 가입 시 본 약관 및 개인정보 처리방침에 동의한 것으로 간주합니다.', '회원은 언제든지 앱 내 "더보기 → 계정 → 회원 탈퇴"에서 탈퇴를 요청할 수 있으며, 웹 계정 삭제 안내 페이지(https://aubl.club/account-deletion)에서도 삭제 절차를 확인할 수 있습니다. 탈퇴 시 회원 정보는 지체 없이 파기하되, 활성화된 투표에 참여한 경우 이의 처리 및 법령상 보존이 필요한 기록은 개인정보 처리방침의 기간을 따릅니다.'] },
                        { title: '제5조 (서비스의 제공 및 변경)', items: ['AUBL은 경기 일정·결과 조회, 실시간 문자중계, 선수 기록 열람, 커뮤니티, 팀 관리, 푸시 알림 서비스를 제공합니다.', 'AUBL은 별도로 활성화하고 공지한 이벤트 기간에 올스타·루키 후보 공개 및 투표 기능을 제공할 수 있으며, 이 경우 공지된 참여 주기, 후보와 포지션별 선택 수, 투표 기간에 따라 운영합니다.', '종료 경기 및 과거 시즌 기록 데이터는 AUBL 백엔드 API(api.aubl.club)와 운영 MariaDB를 통해 제공될 수 있으며, API 전송 구간에 Cloudflare 인프라가 사용될 수 있습니다.', '서비스는 무료로 제공되며, 향후 유료 서비스 도입 시 별도 고지 후 동의를 받습니다.'] },
                        { title: '제7조 (회원의 의무)', items: ['타인의 개인정보 도용, 허위 정보 등록, 서비스 운영 방해, 욕설·비방·음란물 게시, 상업적 광고 게시, 무단 크롤링·스크래핑을 금지합니다.', '투표 기능이 활성화된 경우 여러 계정, 자동화 도구 또는 인증 우회 수단으로 참여 제한을 회피하거나 결과를 조작해서는 안 됩니다.', '위반 시 AUBL은 사전 통지 없이 서비스 이용을 제한하거나 회원 자격을 박탈할 수 있습니다.'] },
                        { title: '제8조 (게시물의 관리)', items: ['회원이 작성한 게시물의 저작권은 해당 회원에게 귀속됩니다.', '경기 기록·통계 데이터는 AUBL에 귀속되며, 서비스 운영 목적으로 활용됩니다.'] },
                        { title: '제9조 (책임의 제한)', items: ['AUBL은 비영리 대학생 단체로서 서비스를 "있는 그대로(AS-IS)" 제공하며, 서비스의 완전성·정확성·신뢰성을 보증하지 않습니다.', 'Cloudflare, 클라우드 사업자, 통신사, 외부 인프라 장애로 인한 지연·중단은 AUBL의 귀책 사유가 없는 한 책임이 제한될 수 있습니다.'] },
                        { title: '제10조 (준거법 및 분쟁 해결)', items: ['본 약관은 대한민국 법률에 의하여 규율됩니다.', '서비스 관련 문의: aublcau@gmail.com'] },
                        { title: '부칙', items: ['본 약관은 2026년 7월 11일부터 시행합니다.'] },
                      ].map((section) => (
                        <div key={section.title}>
                          <p>{section.title}</p>
                          <ul>
                            {section.items.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {[
                        { title: '1. 개인정보의 수집 항목 및 수집 방법', items: ['수집 항목: 이메일 주소, 이름(소셜 로그인 시 제공되는 경우), 계정 고유 식별자(UID)', '자동 수집: 기기 식별 정보, 앱 버전, OS 종류 및 버전, FCM 푸시 토큰', '커뮤니티(건의/문의) 이용 시 수집 항목: 게시글/댓글 내용, 작성 시각, 작성자 식별 정보(UID, 표시명)', '올스타·루키 투표 기능이 활성화되어 참여하는 경우 처리 항목: Firebase 인증에서 확인한 Google 계정 식별값을 HMAC 처리한 가명 중복 방지 키, 이벤트·부문·후보 버전, 선택 후보, 제출 시각 및 적용 투표 주기', '수집 방법: 이메일·비밀번호 회원가입 또는 Google/Apple 소셜 로그인'] },
                        { title: '2. 개인정보의 수집 및 이용 목적', items: ['회원 식별 및 가입 의사 확인', '리그 경기 일정·결과·기록 조회 서비스 제공', '커뮤니티 게시글 작성·관리', '건의/문의 접수, 답변, 처리 상태 안내', '팀 공지사항 및 경기 알림(푸시 알림) 발송', '활성화된 올스타·루키 투표의 참여 자격 확인, 계정별 중복 투표 방지, 결과 집계 및 이의 처리'] },
                        { title: '3. 개인정보의 보유 및 이용 기간', items: ['회원 정보는 회원 탈퇴 시까지 보유하며, 탈퇴 요청 시 지체 없이 파기합니다. 다만 활성화된 투표에 참여한 경우 투표 기록과 법령상 보존 대상은 각 보유 기준을 따릅니다.', '해당 투표의 중복 방지 키와 선택 내역은 결과 확정 및 이의 처리에 필요한 기간 동안 보관한 뒤 삭제하거나 개인을 식별할 수 없는 집계 정보만 남깁니다.', '통신비밀보호법에 의한 로그 기록: 3개월'] },
                        { title: '4. 개인정보의 제3자 제공', items: ['원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.', '이용자의 동의가 있는 경우 또는 법령에 의해 요구되는 경우에 한해 제공합니다.'] },
                        { title: '5. 개인정보의 처리 위탁', items: ['Firebase (Google LLC): 인증, 데이터 저장, 푸시 알림 서비스 운영', 'Google Cloud Platform: 클라우드 함수 실행 및 데이터 처리', 'Cloudflare, Inc.: API 보안 및 전송 최적화(리버스 프록시, CDN, WAF, DDoS 방어)', 'AUBL 운영 MariaDB 서버: 종료 경기 및 과거 시즌 기록 데이터 저장·조회 API 운영'] },
                        { title: '6. 이용자의 권리와 행사 방법', items: ['이용자는 언제든지 자신의 개인정보를 조회·수정·삭제할 수 있습니다.', '앱 내 "더보기 → 계정 → 회원 탈퇴"에서 직접 처리하거나, 웹 계정 삭제 안내 페이지(https://aubl.club/account-deletion)를 통해 요청할 수 있습니다.'] },
                        { title: '7. 개인정보의 파기 절차 및 방법', items: ['보유 기간 경과 또는 처리 목적 달성 시 지체 없이 파기합니다.', '전자적 파일: 복구 불가능한 방법으로 영구 삭제'] },
                        { title: '8. 개인정보 보호를 위한 기술적·관리적 대책', items: ['전송 데이터 암호화(HTTPS/TLS)', 'Firebase Security Rules를 통한 접근 제어', '인증된 Cloud Functions 트랜잭션을 통한 투표 유효성·중복 검증 및 원본 UID·Google 계정 식별값 비저장', '관리자 계정 분리 및 최소 권한 원칙 적용'] },
                        { title: '9. 개인정보 보호책임자', items: ['책임자: 이주환 (AUBL 기록팀장)', '이메일: aublcau@gmail.com'] },
                        { title: '10. 개인정보 처리방침의 변경', items: ['시행일: 2026년 7월 11일'] },
                      ].map((section) => (
                        <div key={section.title}>
                          <p>{section.title}</p>
                          <ul>
                            {section.items.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* 동의 체크박스 */}
              <div className="auth-consent-list">
                <label className="auth-consent-check">
                  <input
                    type="checkbox"
                    checked={socialAgreedTerms}
                    onChange={(e) => setSocialAgreedTerms(e.target.checked)}
                  />
                  <span>
                    <Link to="/terms" target="_blank" className="auth-link">이용약관</Link>에 동의합니다 <span className="auth-required">*</span>
                  </span>
                </label>
                <label className="auth-consent-check">
                  <input
                    type="checkbox"
                    checked={socialAgreedPrivacy}
                    onChange={(e) => setSocialAgreedPrivacy(e.target.checked)}
                  />
                  <span>
                    <Link to="/privacy" target="_blank" className="auth-link">개인정보 처리방침</Link>에 동의합니다 <span className="auth-required">*</span>
                  </span>
                </label>
              </div>

              {/* 오류 메시지 */}
              {message && <div className="auth-alert">{message}</div>}

              {/* 버튼 */}
              <div className="auth-consent-modal__actions">
                <button
                  type="button"
                  className="auth-consent-modal__cancel"
                  onClick={handleSocialConsentDecline}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="auth-consent-modal__confirm"
                  onClick={handleSocialConsent}
                  disabled={!socialAgreedTerms || !socialAgreedPrivacy}
                >
                  동의 후 계속하기
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="auth-footer">
          관리 권한이 없나요?{' '}
          <Link to="/access-denied" className="auth-link">
            권한 안내 보기
          </Link>
        </p>
        <div className="auth-footer auth-footer--legal">
          <Link to="/terms" className="auth-link">
            이용약관
          </Link>
          <Link to="/privacy" className="auth-link">
            개인정보 처리방침
          </Link>
        </div>
      </div>

      {/* 하단: 상세 안내 (데스크톱에서는 hero 영역에, 모바일에서는 로그인 카드 아래) */}
      <div className="auth-tips-bottom">
        <div className="auth-tips">
          <div>
            <span>01</span>
            <div>
              <strong>회원 전용</strong>
              <p>즐겨찾기 경기, 문자중계 구독 등 개인화 기능을 사용하려면 로그인하세요.</p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <strong>안전한 인증</strong>
              <p>비밀번호는 안전하게 암호화 저장되며, 모든 통신은 HTTPS로 보호됩니다.</p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <strong>알림 설정</strong>
              <p>로그인하면 즐겨찾는 팀의 경기 시작/득점 알림을 바로 받아볼 수 있습니다.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
