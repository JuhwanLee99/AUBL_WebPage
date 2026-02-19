import type * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
import {
  hasFlutterBridge,
  requestNativeGoogleSignInFromFlutter,
  sendLoginSuccessToFlutter,
} from '../../shared/bridge/flutterBridge';
import { auth } from '../../shared/firebase/client';

type LocationState = {
  from?: string;
};

export default function LoginPage() {
  const { loginWithEmail, registerWithEmail, loginWithGoogle, logout, error, user } = useAuth();
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
  const [showGoogleConsent, setShowGoogleConsent] = useState(false);
  const [googleAgreedTerms, setGoogleAgreedTerms] = useState(false);
  const [googleAgreedPrivacy, setGoogleAgreedPrivacy] = useState(false);
  // true: 이미 Firebase 로그인 완료 후 동의 대기 (신규 유저), false: 로그인 전 동의 (Flutter 네이티브)
  const [googleConsentPostSignIn, setGoogleConsentPostSignIn] = useState(false);
  const [googleConsentTab, setGoogleConsentTab] = useState<'terms' | 'privacy'>('terms');

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

  const openGoogleConsent = (postSignIn: boolean) => {
    setGoogleAgreedTerms(false);
    setGoogleAgreedPrivacy(false);
    setGoogleConsentPostSignIn(postSignIn);
    setMessage(null);
    setShowGoogleConsent(true);
  };

  const handleGoogleClick = async () => {
    // Flutter 네이티브: isNewUser를 알 수 없으므로 로그인 전에 동의 먼저
    if (embedded && (nativeGoogleEnabled || hasFlutterBridge())) {
      openGoogleConsent(false);
      return;
    }
    // 웹: 로그인 먼저, 신규 유저인 경우에만 동의 모달
    setSubmitting(true);
    setMessage(null);
    try {
      const { isNewUser } = await loginWithGoogle();
      if (isNewUser) {
        openGoogleConsent(true);
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

  const handleGoogleConsentDecline = async () => {
    setShowGoogleConsent(false);
    // 이미 로그인된 신규 유저가 동의 거부 → 계정 삭제
    if (googleConsentPostSignIn && auth.currentUser) {
      try {
        await auth.currentUser.delete();
      } catch {
        // ignore
      }
    }
  };

  const handleGoogleConsent = async () => {
    if (!googleAgreedTerms || !googleAgreedPrivacy) {
      setMessage('이용약관 및 개인정보 처리방침에 동의해 주세요.');
      return;
    }
    setShowGoogleConsent(false);
    // 웹 신규 유저: 이미 로그인됨 → 그냥 이동
    if (googleConsentPostSignIn) {
      if (auth.currentUser) void sendLoginSuccessToFlutter(auth.currentUser);
      navigate(redirectTo, { replace: true });
      return;
    }
    // Flutter 네이티브: 동의 후 실제 로그인 요청
    setSubmitting(true);
    setMessage(null);
    try {
      const sent = requestNativeGoogleSignInFromFlutter();
      if (!sent) {
        setMessage('앱 브리지 연결을 찾지 못했습니다. 앱을 다시 실행해 주세요.');
        return;
      }
      setMessage('앱에서 Google 로그인을 진행 중입니다.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '구글 로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* 상단: 간결한 제목 + 설명 */}
      <div className="auth-hero">
        <p className="eyebrow">AUBL 계정</p>
        <h1>로그인하고 경기 소식을 가장 빠르게 만나보세요</h1>
        <p className="lede">
          {embedded
            ? nativeGoogleEnabled
              ? '이메일·비밀번호 또는 Google 계정으로 로그인하세요.'
              : '앱 내 WebView에서는 이메일·비밀번호 로그인만 지원합니다.'
            : '이메일·비밀번호(재확인) 또는 Google 계정으로 간편 로그인하세요.'}
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
            <div style={{ display: 'grid', gap: '8px', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  style={{ accentColor: '#f97316', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span>
                  <Link to="/terms" target="_blank" className="auth-link" style={{ fontWeight: 700 }}>이용약관</Link>에 동의합니다 <span style={{ color: '#f97316' }}>*</span>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={agreedPrivacy}
                  onChange={(e) => setAgreedPrivacy(e.target.checked)}
                  style={{ accentColor: '#f97316', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span>
                  <Link to="/privacy" target="_blank" className="auth-link" style={{ fontWeight: 700 }}>개인정보 처리방침</Link>에 동의합니다 <span style={{ color: '#f97316' }}>*</span>
                </span>
              </label>
            </div>
          )}

          {(message || error) && (
            <div className="auth-alert">
              {message || error}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={submitting} style={{ marginTop: '6px' }}>
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
          </>
        )}

        {showGoogleConsent && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '16px',
            }}
            onClick={handleGoogleConsentDecline}
          >
            <div
              style={{
                background: '#1e293b', borderRadius: '16px', padding: '28px',
                maxWidth: '640px', width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', gap: '20px',
                maxHeight: '90vh', overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>
                  Google 계정으로 계속하기
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  AUBL 서비스 이용을 위해 아래 약관을 확인하고 동의해 주세요.
                </p>
              </div>

              {/* 탭 + 미리보기 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0', border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden' }}>
                {/* 탭 헤더 */}
                <div style={{ display: 'flex', borderBottom: '1px solid #334155' }}>
                  {(['terms', 'privacy'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setGoogleConsentTab(tab)}
                      style={{
                        flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                        fontSize: '13px', fontWeight: 600,
                        background: googleConsentTab === tab ? '#0f172a' : '#1e293b',
                        color: googleConsentTab === tab ? '#f97316' : '#64748b',
                        borderBottom: googleConsentTab === tab ? '2px solid #f97316' : '2px solid transparent',
                        transition: 'color 0.15s',
                      }}
                    >
                      {tab === 'terms' ? '이용약관' : '개인정보 처리방침'}
                    </button>
                  ))}
                </div>

                {/* 미리보기 스크롤 영역 */}
                <div style={{ height: '260px', overflowY: 'auto', padding: '16px', background: '#0f172a', display: 'grid', gap: '14px' }}>
                  {googleConsentTab === 'terms' ? (
                    <>
                      {[
                        { title: '제1조 (목적)', items: ['본 약관은 전국대학아마추어야구연합회(이하 "AUBL")가 제공하는 모바일 앱 및 웹 서비스의 이용 조건과 절차, 회원과 AUBL의 권리·의무를 규정함을 목적으로 합니다.'] },
                        { title: '제2조 (정의)', items: ['"서비스"란 경기 일정·결과 조회, 실시간 문자중계, 기록 열람, 커뮤니티, 푸시 알림 등 일체의 서비스를 말합니다.', '"회원"이란 본 약관에 동의하고 이메일·비밀번호 또는 Google/Apple(iOS 앱) 계정을 통해 가입한 이용자를 말합니다.'] },
                        { title: '제3조 (약관의 효력 및 변경)', items: ['변경된 약관에 동의하지 않는 경우 회원 탈퇴를 할 수 있으며, 고지 후 7일 이내 탈퇴하지 않은 경우 동의한 것으로 간주합니다.'] },
                        { title: '제4조 (회원 가입 및 탈퇴)', items: ['회원 가입은 이메일·비밀번호 등록 또는 Google/Apple(iOS 앱) 계정을 통한 소셜 로그인으로 이루어지며, 가입 시 본 약관 및 개인정보 처리방침에 동의한 것으로 간주합니다.', '회원은 언제든지 앱 내 "더보기 → 계정 → 회원 탈퇴"에서 탈퇴를 요청할 수 있으며, 웹 계정 삭제 안내 페이지(https://aubl.club/account-deletion)에서도 삭제 절차를 확인할 수 있습니다. 탈퇴 시 개인정보는 즉시 파기됩니다.'] },
                        { title: '제5조 (서비스의 제공 및 변경)', items: ['AUBL은 경기 일정·결과 조회, 실시간 문자중계, 선수 기록 열람, 커뮤니티, 팀 관리, 푸시 알림 서비스를 제공합니다.', '종료 경기 및 과거 시즌 기록 데이터는 AUBL 백엔드 API(api.aubl.club)와 운영 MariaDB를 통해 제공될 수 있으며, API 전송 구간에 Cloudflare 인프라가 사용될 수 있습니다.', '서비스는 무료로 제공되며, 향후 유료 서비스 도입 시 별도 고지 후 동의를 받습니다.'] },
                        { title: '제7조 (회원의 의무)', items: ['타인의 개인정보 도용, 허위 정보 등록, 서비스 운영 방해, 욕설·비방·음란물 게시, 상업적 광고 게시, 무단 크롤링·스크래핑을 금지합니다.', '위반 시 AUBL은 사전 통지 없이 서비스 이용을 제한하거나 회원 자격을 박탈할 수 있습니다.'] },
                        { title: '제8조 (게시물의 관리)', items: ['회원이 작성한 게시물의 저작권은 해당 회원에게 귀속됩니다.', '경기 기록·통계 데이터는 AUBL에 귀속되며, 서비스 운영 목적으로 활용됩니다.'] },
                        { title: '제9조 (책임의 제한)', items: ['AUBL은 비영리 대학생 단체로서 서비스를 "있는 그대로(AS-IS)" 제공하며, 서비스의 완전성·정확성·신뢰성을 보증하지 않습니다.', 'Cloudflare, 클라우드 사업자, 통신사, 외부 인프라 장애로 인한 지연·중단은 AUBL의 귀책 사유가 없는 한 책임이 제한될 수 있습니다.'] },
                        { title: '제10조 (준거법 및 분쟁 해결)', items: ['본 약관은 대한민국 법률에 의하여 규율됩니다.', '서비스 관련 문의: aublcau@gmail.com'] },
                        { title: '부칙', items: ['본 약관은 2026년 2월 21일부터 시행합니다.'] },
                      ].map((section) => (
                        <div key={section.title}>
                          <p style={{ margin: '0 0 5px', fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>{section.title}</p>
                          <ul style={{ margin: 0, paddingLeft: '16px', display: 'grid', gap: '3px' }}>
                            {section.items.map((item, i) => (
                              <li key={i} style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {[
                        { title: '1. 개인정보의 수집 항목 및 수집 방법', items: ['수집 항목: 이메일 주소, 이름(소셜 로그인 시 제공되는 경우), 계정 고유 식별자(UID)', '자동 수집: 기기 식별 정보, 앱 버전, OS 종류 및 버전, FCM 푸시 토큰', '커뮤니티(건의/문의) 이용 시 수집 항목: 게시글/댓글 내용, 작성 시각, 작성자 식별 정보(UID, 표시명)', '수집 방법: 이메일·비밀번호 회원가입 또는 Google/Apple(iOS 앱) 소셜 로그인'] },
                        { title: '2. 개인정보의 수집 및 이용 목적', items: ['회원 식별 및 가입 의사 확인', '리그 경기 일정·결과·기록 조회 서비스 제공', '커뮤니티 게시글 작성·관리', '건의/문의 접수, 답변, 처리 상태 안내', '팀 공지사항 및 경기 알림(푸시 알림) 발송'] },
                        { title: '3. 개인정보의 보유 및 이용 기간', items: ['회원 탈퇴 시까지 보유하며, 탈퇴 요청 즉시 파기합니다.', '통신비밀보호법에 의한 로그 기록: 3개월'] },
                        { title: '4. 개인정보의 제3자 제공', items: ['원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.', '이용자의 동의가 있는 경우 또는 법령에 의해 요구되는 경우에 한해 제공합니다.'] },
                        { title: '5. 개인정보의 처리 위탁', items: ['Firebase (Google LLC): 인증, 데이터 저장, 푸시 알림 서비스 운영', 'Google Cloud Platform: 클라우드 함수 실행 및 데이터 처리', 'Cloudflare, Inc.: API 보안 및 전송 최적화(리버스 프록시, CDN, WAF, DDoS 방어)', 'AUBL 운영 MariaDB 서버: 종료 경기 및 과거 시즌 기록 데이터 저장·조회 API 운영'] },
                        { title: '6. 이용자의 권리와 행사 방법', items: ['이용자는 언제든지 자신의 개인정보를 조회·수정·삭제할 수 있습니다.', '앱 내 "더보기 → 계정 → 회원 탈퇴"에서 직접 처리하거나, 웹 계정 삭제 안내 페이지(https://aubl.club/account-deletion)를 통해 요청할 수 있습니다.'] },
                        { title: '7. 개인정보의 파기 절차 및 방법', items: ['보유 기간 경과 또는 처리 목적 달성 시 지체 없이 파기합니다.', '전자적 파일: 복구 불가능한 방법으로 영구 삭제'] },
                        { title: '8. 개인정보 보호를 위한 기술적·관리적 대책', items: ['전송 데이터 암호화(HTTPS/TLS)', 'Firebase Security Rules를 통한 접근 제어', '관리자 계정 분리 및 최소 권한 원칙 적용'] },
                        { title: '9. 개인정보 보호책임자', items: ['책임자: 이주환 (AUBL 기록팀장)', '이메일: aublcau@gmail.com'] },
                        { title: '10. 개인정보 처리방침의 변경', items: ['시행일: 2026년 2월 21일'] },
                      ].map((section) => (
                        <div key={section.title}>
                          <p style={{ margin: '0 0 5px', fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>{section.title}</p>
                          <ul style={{ margin: 0, paddingLeft: '16px', display: 'grid', gap: '3px' }}>
                            {section.items.map((item, i) => (
                              <li key={i} style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* 동의 체크박스 */}
              <div style={{ display: 'grid', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#cbd5e1' }}>
                  <input
                    type="checkbox"
                    checked={googleAgreedTerms}
                    onChange={(e) => setGoogleAgreedTerms(e.target.checked)}
                    style={{ accentColor: '#f97316', width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span>
                    <Link to="/terms" target="_blank" className="auth-link" style={{ fontWeight: 700 }}>이용약관</Link>에 동의합니다 <span style={{ color: '#f97316' }}>*</span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#cbd5e1' }}>
                  <input
                    type="checkbox"
                    checked={googleAgreedPrivacy}
                    onChange={(e) => setGoogleAgreedPrivacy(e.target.checked)}
                    style={{ accentColor: '#f97316', width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span>
                    <Link to="/privacy" target="_blank" className="auth-link" style={{ fontWeight: 700 }}>개인정보 처리방침</Link>에 동의합니다 <span style={{ color: '#f97316' }}>*</span>
                  </span>
                </label>
              </div>

              {/* 오류 메시지 */}
              {message && <div className="auth-alert">{message}</div>}

              {/* 버튼 */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleGoogleConsentDecline}
                  style={{
                    flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #334155',
                    background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '14px',
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleGoogleConsent}
                  disabled={!googleAgreedTerms || !googleAgreedPrivacy}
                  style={{
                    flex: 2, padding: '11px', borderRadius: '8px', border: 'none',
                    background: (!googleAgreedTerms || !googleAgreedPrivacy) ? '#334155' : '#f97316',
                    color: (!googleAgreedTerms || !googleAgreedPrivacy) ? '#64748b' : '#fff',
                    cursor: (!googleAgreedTerms || !googleAgreedPrivacy) ? 'not-allowed' : 'pointer',
                    fontSize: '14px', fontWeight: 600,
                  }}
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
        <div
          className="auth-footer"
          style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', textAlign: 'center', fontSize: '12px' }}
        >
          <Link to="/terms" className="auth-link" style={{ fontWeight: 800, fontSize: '12px' }}>
            이용약관
          </Link>
          <Link to="/privacy" className="auth-link" style={{ fontWeight: 800, fontSize: '12px' }}>
            개인정보 처리방침
          </Link>
        </div>
      </div>

      {/* 하단: 상세 안내 (데스크톱에서는 hero 영역에, 모바일에서는 로그인 카드 아래) */}
      <div className="auth-tips-bottom">
        <div className="auth-tips">
          <div>
            <span>🎟️</span>
            <div>
              <strong>회원 전용</strong>
              <p>즐겨찾기 경기, 문자중계 구독 등 개인화 기능을 사용하려면 로그인하세요.</p>
            </div>
          </div>
          <div>
            <span>🔐</span>
            <div>
              <strong>안전한 인증</strong>
              <p>비밀번호는 안전하게 암호화 저장되며, 모든 통신은 HTTPS로 보호됩니다.</p>
            </div>
          </div>
          <div>
            <span>✅</span>
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
