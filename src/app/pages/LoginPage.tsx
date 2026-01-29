import type * as React from 'react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';

type LocationState = {
  from?: string;
};

export default function LoginPage() {
  const { loginWithEmail, registerWithEmail, loginWithGoogle, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = useMemo(() => (location.state as LocationState | null)?.from || '/', [location.state]);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleSubmit = async (evt: React.FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
        if (password !== confirmPassword) {
          setSubmitting(false);
          setMessage('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
          return;
        }
        await registerWithEmail(email, password);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      await loginWithGoogle();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '구글 로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <p className="eyebrow">AUBL 계정</p>
        <h1>로그인하고 경기 소식을 가장 빠르게 만나보세요</h1>
        <p className="lede">
          이메일·비밀번호(재확인) 또는 Google 계정으로 간편 로그인하세요.
          <br />
          로그인하면 실시간 전광판, 일정, 기록 열람과 알림 설정을 이용할 수 있습니다.
        </p>
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

          {(message || error) && (
            <div className="auth-alert">
              {message || error}
            </div>
          )}

          <div style={{ marginTop: '0px' }} />
          <button type="submit" className="auth-submit" disabled={submitting} style={{ marginTop: '6px' }}>
            {submitting ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>

        <div className="auth-divider">
          <span>또는</span>
        </div>

        <button type="button" className="auth-google" onClick={handleGoogle} disabled={submitting}>
          <span>G</span>
          Google 계정으로 계속하기
        </button>

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
          <button
            type="button"
            className="auth-link"
            style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 800, fontSize: '12px' }}
            onClick={() => setShowTerms((v) => !v)}
          >
            회원약관 보기
          </button>
          <button
            type="button"
            className="auth-link"
            style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 800, fontSize: '12px' }}
            onClick={() => setShowPrivacy((v) => !v)}
          >
            개인정보 보호 안내
          </button>
        </div>
        {showTerms && (
          <div
            className="auth-alert"
            style={{
              background: 'rgba(96,165,250,0.12)',
              borderColor: 'rgba(96,165,250,0.4)',
              textAlign: 'center',
              fontSize: '12px',
            }}
          >
            <strong>회원약관 요약</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', color: '#e2e8f0', lineHeight: 1.5 }}>
              <li>리그 운영 목적 내에서만 계정을 사용합니다.</li>
              <li>타인의 정보를 무단으로 사용하지 않습니다.</li>
              <li>위반 시 관리자 권한으로 계정이 제한될 수 있습니다.</li>
            </ul>
          </div>
        )}
        {showPrivacy && (
          <div
            className="auth-alert"
            style={{
              background: 'rgba(34,197,94,0.12)',
              borderColor: 'rgba(34,197,94,0.4)',
              textAlign: 'center',
              fontSize: '12px',
            }}
          >
            <strong>개인정보 보호 안내</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 0, listStyle: 'none', color: '#e2e8f0', lineHeight: 1.5 }}>
              <li>이메일과 로그인 기록은 인증 및 보안 감사 목적에만 사용됩니다.</li>
              <li>비밀번호는 Firebase Auth에서 안전하게 해시 저장됩니다.</li>
              <li>요청 시 계정 삭제 및 로그 기록 정리에 대해 관리자에게 문의하세요.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
