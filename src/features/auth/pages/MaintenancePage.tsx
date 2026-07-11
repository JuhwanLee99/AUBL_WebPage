import { Link } from 'react-router-dom';

interface MaintenancePageProps {
  expectedResumeDate?: string; // 예: "2026년 3월 1일"
  message?: string;
}

export default function MaintenancePage({
  expectedResumeDate = '추후 공지',
  message = '더 나은 서비스를 위해 시스템 개선 작업을 진행하고 있습니다.',
}: MaintenancePageProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // 배경 설정 수정
        background: `linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.9) 50%, rgba(15, 23, 42, 0.9) 100%), url('/assets/aubl_clean.png')`,
        backgroundSize: 'contain', // 이미지가 잘리지 않고 전체가 다 보이도록 설정 ('cover' -> 'contain')
        backgroundPosition: 'center', // 항상 중앙에 위치
        backgroundRepeat: 'no-repeat', // 이미지 반복 방지
        backgroundAttachment: 'fixed', // (선택사항) 스크롤 발생 시에도 배경이 뷰포트 기준으로 고정되도록 함
        padding: '24px',
        textAlign: 'center',
      }}
    >
      {/* 로고 */}
      <div
        style={{
          fontSize: 'clamp(48px, 10vw, 72px)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          marginBottom: '32px',
        }}
      >
        <span style={{ color: '#60a5fa' }}>AUBL</span>
        <span style={{ color: '#f97316' }}>.</span>
      </div>

      {/* 아이콘 */}
      <div
        style={{
          fontSize: '64px',
          marginBottom: '24px',
          animation: 'pulse 2s ease-in-out infinite',
        }}
      >
        <span role="img" aria-label="maintenance">
          🔧
        </span>
      </div>

      {/* 메인 메시지 */}
      <h1
        style={{
          fontSize: 'clamp(24px, 5vw, 36px)',
          fontWeight: 900,
          color: '#f8fafc',
          marginBottom: '16px',
          lineHeight: 1.3,
        }}
      >
        서비스 개선 중입니다
      </h1>

      {/* 상세 설명 */}
      <p
        style={{
          fontSize: 'clamp(14px, 3vw, 18px)',
          color: '#cbd5e1',
          maxWidth: '500px',
          lineHeight: 1.6,
          marginBottom: '32px',
          whiteSpace: 'pre-line',
        }}
      >
        {message}
      </p>

      {/* 재개 예정일 박스 */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(251,146,60,0.1))',
          border: '1px solid rgba(249,115,22,0.4)',
          borderRadius: '16px',
          padding: '24px 32px',
          marginBottom: '40px',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#fb923c',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          서비스 재개 예정
        </div>
        <div
          style={{
            fontSize: 'clamp(20px, 4vw, 28px)',
            fontWeight: 900,
            color: '#f97316',
          }}
        >
          {expectedResumeDate}
        </div>
      </div>

      {/* 관리자 로그인 안내 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <p
          style={{
            fontSize: '14px',
            color: '#64748b',
          }}
        >
          관리자이신가요?
        </p>
        <Link
          to="/login"
          style={{
            background: 'rgba(148,163,184,0.15)',
            border: '1px solid rgba(148,163,184,0.3)',
            color: '#e2e8f0',
            padding: '12px 24px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(148,163,184,0.25)';
            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.5)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(148,163,184,0.15)';
            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)';
          }}
        >
          관리자 로그인
        </Link>
      </div>

      {/* 하단 연락처 */}
      <div
        style={{
          position: 'absolute',
          bottom: '32px',
          fontSize: '13px',
          color: '#475569',
        }}
      >
        문의: aublcau@gmail.com
      </div>

      {/* 펄스 애니메이션 */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
        `}
      </style>
    </div>
  );
}