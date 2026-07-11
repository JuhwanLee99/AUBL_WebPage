import { Link } from 'react-router-dom';

export default function AccountDeletionPage() {
  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', display: 'grid', gap: '18px' }}>
      <section
        style={{
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid rgba(148,163,184,0.25)',
          background: 'linear-gradient(140deg, #0a1a3f 0%, #0f2f8f 100%)',
          display: 'grid',
          gap: '10px',
        }}
      >
        <p style={{ margin: 0, color: '#bfdbfe', fontWeight: 800, fontSize: '12px' }}>
          ACCOUNT DELETION
        </p>
        <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: '28px', fontWeight: 900 }}>
          AUBL 계정 삭제 안내
        </h1>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7 }}>
          Google Play 및 App Store 정책에 따라, AUBL 계정 삭제 방법을 앱 내/웹에서 모두 제공합니다.
          아래 방법 중 편한 방법을 선택해 주세요.
        </p>
      </section>

      <section
        style={{
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid rgba(148,163,184,0.16)',
          background: 'rgba(15,23,42,0.62)',
          color: '#e2e8f0',
          display: 'grid',
          gap: '10px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px' }}>1) 웹에서 즉시 삭제</h2>
        <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.7, color: '#cbd5e1' }}>
          <li>
            <Link to="/account" style={{ color: '#93c5fd', fontWeight: 700 }}>
              /account
            </Link>
            에 로그인
          </li>
          <li>회원 탈퇴 버튼 선택</li>
          <li>재인증 후 삭제 완료</li>
        </ol>
      </section>

      <section
        style={{
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid rgba(148,163,184,0.16)',
          background: 'rgba(15,23,42,0.62)',
          color: '#e2e8f0',
          display: 'grid',
          gap: '10px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px' }}>2) 앱에서 즉시 삭제</h2>
        <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.7, color: '#cbd5e1' }}>
          <li>AUBL 앱 로그인</li>
          <li>더보기 → 계정 → 회원 탈퇴</li>
          <li>회원 탈퇴 버튼 선택 후 재인증 진행</li>
        </ol>
      </section>

      <section
        style={{
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid rgba(148,163,184,0.16)',
          background: 'rgba(15,23,42,0.62)',
          color: '#e2e8f0',
          display: 'grid',
          gap: '10px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px' }}>3) 이메일로 삭제 요청</h2>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7 }}>
          계정 접근이 어려운 경우 아래 이메일로 삭제 요청을 보낼 수 있습니다. 본인 확인 후 처리합니다.
        </p>
        <a
          href="mailto:aublcau@gmail.com?subject=[AUBL]%20%EA%B3%84%EC%A0%95%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD&body=UID%20(%EC%95%8C%EA%B3%A0%20%EC%9E%88%EB%8A%94%20%EA%B2%BD%EC%9A%B0)%3A%0A%EB%A1%9C%EA%B7%B8%EC%9D%B8%20%EC%9D%B4%EB%A9%94%EC%9D%BC%3A%0A%EC%9A%94%EC%B2%AD%20%EC%82%AC%EC%9C%A0%3A"
          style={{
            display: 'inline-flex',
            width: 'fit-content',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(59,130,246,0.45)',
            background: 'rgba(59,130,246,0.15)',
            color: '#bfdbfe',
            textDecoration: 'none',
            fontWeight: 800,
            fontSize: '13px',
          }}
        >
          이메일로 삭제 요청 보내기
        </a>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.7 }}>
          탈퇴 시 인증 계정과 기본 프로필 데이터는 삭제됩니다. 단, 커뮤니티 게시물은 운영 정책에 따라
          일부 유지될 수 있습니다.
        </p>
      </section>

      <section style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link
          to="/privacy"
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            textDecoration: 'none',
            border: '1px solid rgba(148,163,184,0.3)',
            color: '#cbd5e1',
            fontWeight: 700,
          }}
        >
          개인정보 처리방침
        </Link>
        <Link
          to="/terms"
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            textDecoration: 'none',
            border: '1px solid rgba(148,163,184,0.3)',
            color: '#cbd5e1',
            fontWeight: 700,
          }}
        >
          이용약관
        </Link>
      </section>
    </div>
  );
}
