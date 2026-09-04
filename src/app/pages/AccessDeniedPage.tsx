import { Link } from 'react-router-dom';
import './AccessDeniedPage.css';

export default function AccessDeniedPage() {
  return (
    <div className="access-denied-page">
      <section className="access-denied-card" aria-labelledby="access-denied-title">
        <p className="access-denied-card__eyebrow">ACCESS CONTROL</p>
        <h1 id="access-denied-title">접근 권한이 필요합니다</h1>
        <p className="access-denied-card__description">
          이 페이지에 접근하려면 로그인이 필요하거나 더 높은 권한이 요구됩니다. 관리자에게 권한 요청을 하거나 올바른 계정으로 로그인해주세요.
        </p>
        <div className="access-denied-card__actions">
          <Link to="/login" className="access-denied-card__action access-denied-card__action--primary">
            로그인하기
          </Link>
          <Link to="/" className="access-denied-card__action access-denied-card__action--secondary">
            홈으로 돌아가기
          </Link>
        </div>
      </section>
    </div>
  );
}
