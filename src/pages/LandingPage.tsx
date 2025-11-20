// **`src/pages/LandingPage.tsx`**
import { Link } from 'react-router-dom';

const features = [
  {
    title: '실시간 Elo 순위',
    desc: '경기 결과와 점수 차를 반영한 라이브 Elo 레이팅으로 팀 전력을 한눈에 확인하세요.',
    icon: '📈',
  },
  {
    title: '팀·선수 데이터',
    desc: '팀 기록부터 선수별 세부 스탯까지, 데이터 중심으로 분석된 정보를 제공합니다.',
    icon: '📊',
  },
  {
    title: '예측 서비스',
    desc: '머신러닝 기반의 승부 예측 기능으로 다음 경기를 더 흥미롭게 즐겨보세요.',
    icon: '🎯',
  },
];

export default function LandingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '56px' }}>
      {/* Hero Section */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '32px',
          padding: '56px',
          background:
            'radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.18), transparent 35%), radial-gradient(circle at 80% 0%, rgba(249, 115, 22, 0.18), transparent 32%), linear-gradient(135deg, #0f172a 0%, #111827 100%)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '620px', display: 'grid', gap: '20px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.08em', color: '#f97316' }}>DATA DRIVEN COLLEGE BASEBALL</p>
          <h1 style={{ fontSize: '44px', lineHeight: 1.2, fontWeight: 900, margin: 0 }}>
            대학 야구의 열정,
            <br />
            <span style={{ color: '#f97316' }}>데이터</span>로 증명하다.
          </h1>
          <p style={{ color: '#cbd5e1', fontSize: '17px', margin: 0 }}>
            AUBL 공식 데이터 플랫폼에 오신 것을 환영합니다.
            Elo 레이팅 기반 순위, 실시간 스코어, 승부예측을 경험하세요.
          </p>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>
            <Link
              to="/standings"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '15px',
                backgroundColor: '#f97316',
                color: '#0f172a',
                boxShadow: '0 16px 40px rgba(249, 115, 22, 0.25)',
              }}
            >
              순위 보기
            </Link>
            <Link
              to="/prediction"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '15px',
                backgroundColor: 'rgba(148, 163, 184, 0.15)',
                color: '#e2e8f0',
                border: '1px solid rgba(148, 163, 184, 0.3)',
              }}
            >
              승부 예측하기
            </Link>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              "url('https://images.unsplash.com/photo-1587280501635-68a6e82cd7db?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.18,
          }}
        />
      </section>

      {/* Feature Grid */}
      <section style={{ display: 'grid', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#f97316',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(249, 115, 22, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 700, letterSpacing: '0.05em', fontSize: '13px' }}>AUBL 주요 기능</p>
        </div>
        <div
          style={{
            display: 'grid',
            gap: '18px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          {features.map(({ title, desc, icon }) => (
            <div
              key={title}
              style={{
                padding: '22px',
                borderRadius: '18px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'grid',
                gap: '12px',
                boxShadow: '0 16px 40px rgba(0, 0, 0, 0.22)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(249, 115, 22, 0.12)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '22px',
                  }}
                >
                  {icon}
                </div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>{title}</h3>
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
