import { FormEvent, useMemo, useState } from 'react';
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
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
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
        <p className="eyebrow">FIREBASE SECURED</p>
        <h1>로그인하고 리그 운영에 참여하세요</h1>
        <p className="lede">
          이메일/비밀번호 또는 Google 계정으로 로그인할 수 있습니다.
          <br />
          로그인 후 발급된 Firebase ID Token을 백엔드 요청 헤더에 첨부해 보안을 유지하세요.
        </p>
        <div className="auth-tips">
          <div>
            <span>🎟️</span>
            <div>
              <strong>권한별 접근</strong>
              <p>필요 시 특정 페이지를 <code>RequireAuth</code>로 감싸서 접근을 제한하세요.</p>
            </div>
          </div>
          <div>
            <span>🔐</span>
            <div>
              <strong>토큰 전달</strong>
              <p>API 요청 시 <code>Authorization: Bearer {'<idToken>'}</code> 헤더로 전달합니다.</p>
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

          {(message || error) && (
            <div className="auth-alert">
              {message || error}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={submitting}>
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
      </div>
    </div>
  );
}
