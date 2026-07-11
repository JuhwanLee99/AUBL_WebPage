import { Link } from 'react-router-dom';

export default function AccessDeniedPage() {
  return (
    <div className="auth-shell" style={{ paddingTop: '80px' }}>
      <div className="auth-card" style={{ maxWidth: '640px' }}>
        <p className="eyebrow">ACCESS CONTROL</p>
        <h1 style={{ marginBottom: '12px' }}>접근 권한이 필요합니다</h1>
        <p style={{ color: '#cbd5e1', lineHeight: 1.6, marginBottom: '22px' }}>
          이 페이지에 접근하려면 로그인이 필요하거나 더 높은 권한이 요구됩니다. 관리자에게 권한 요청을 하거나 올바른 계정으로 로그인해주세요.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Link to="/login" className="auth-submit" style={{ textDecoration: 'none', textAlign: 'center' }}>
            로그인하기
          </Link>
          <Link
            to="/"
            className="auth-google"
            style={{ textDecoration: 'none', textAlign: 'center', gap: '10px', justifyContent: 'center' }}
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
