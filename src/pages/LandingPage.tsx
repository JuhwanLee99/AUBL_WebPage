// **`src/pages/LandingPage.tsx`**
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

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
  {
    title: '경기 하이라이트',
    desc: '인스타그램(@aubl_1981)의 현장 사진과 영상을 통해 뜨거운 순간을 바로 만나보세요.',
    icon: '📸',
  },
];

const heritageCards = [
  {
    label: 'SINCE 1981',
    value: '서울·수도권 대학 야구',
    desc: '1981년부터 이어온 아마추어 대학 야구 리그, 지역 대학들의 뜨거운 라이벌전을 담습니다.',
  },
  {
    label: '12 TEAMS',
    value: '시즌 통합 운영',
    desc: '경기·훈련·축제 일정까지 통합 관리해 팬과 팀이 모두 접근하기 쉽도록 구성했습니다.',
  },
  {
    label: 'COMMUNITY',
    value: '인스타그램 @aubl_1981',
    desc: '선수들의 스토리, 경기 비하인드, 팬 이벤트까지 SNS로 실시간 공유합니다.',
  },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const featureRefs = useRef<HTMLDivElement[]>([]);
  const heritageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      const heroElements = heroRef.current?.querySelectorAll('.hero-animate');
      if (heroElements) {
        tl.fromTo(
          heroElements,
          { y: 36, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.15, stagger: 0.08 },
        );
      }

      if (featureRefs.current.length) {
        gsap.fromTo(
          featureRefs.current,
          { y: 28, opacity: 0, scale: 0.97 },
          { y: 0, opacity: 1, scale: 1, duration: 1, stagger: 0.1, ease: 'power2.out', delay: 0.15 },
        );
      }

      const heritageBlocks = heritageRef.current?.querySelectorAll('.heritage-card');
      if (heritageBlocks) {
        gsap.fromTo(
          heritageBlocks,
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.95, stagger: 0.06, ease: 'power2.out', delay: 0.1 },
        );
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
      {/* Hero Section */}
      <section
        ref={heroRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '32px',
          padding: '56px',
          background:
            'radial-gradient(circle at 15% 20%, rgba(99, 102, 241, 0.18), transparent 32%), radial-gradient(circle at 85% 0%, rgba(249, 115, 22, 0.18), transparent 28%), linear-gradient(135deg, #0f172a 0%, #111827 100%)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          isolation: 'isolate',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="hero-animate" style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#f97316' }}>
              DATA DRIVEN COLLEGE BASEBALL
            </span>
            <span className="hero-animate" style={{ padding: '6px 12px', borderRadius: '999px', background: 'rgba(99, 102, 241, 0.12)', color: '#cbd5e1', fontSize: '12px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
              Instagram @aubl_1981
            </span>
          </div>
          <h1 className="hero-animate" style={{ fontSize: '46px', lineHeight: 1.15, fontWeight: 900, margin: 0 }}>
            대학 야구의 열정,
            <br />
            <span style={{ color: '#f97316' }}>데이터</span>로 증명하다.
          </h1>
          <p className="hero-animate" style={{ color: '#cbd5e1', fontSize: '17px', margin: 0, maxWidth: '720px' }}>
            1981년부터 이어온 AUBL은 서울·수도권 대학 선수들의 경쟁과 우정을 기록해온 리그입니다. Elo 레이팅, 라이브 스코어,
            승부예측을 한 곳에서 확인하고, 인스타그램 속 생생한 현장을 함께 즐겨보세요.
          </p>
          <div className="hero-animate" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>
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
            <a
              className="hero-animate"
              href="https://www.instagram.com/aubl_1981/"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '15px',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                color: '#c7d2fe',
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              인스타그램 팔로우
            </a>
          </div>
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              "url('https://images.unsplash.com/photo-1587280501635-68a6e82cd7db?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.16,
          }}
        />
      </section>

      {/* League Heritage Section */}
      <section
        ref={heritageRef}
        style={{
          display: 'grid',
          gap: '22px',
          padding: '18px 0',
        }}
      >
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
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>AUBL HERITAGE</p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {heritageCards.map(({ label, value, desc }) => (
            <div
              key={label}
              className="heritage-card"
              style={{
                borderRadius: '18px',
                padding: '20px 22px',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(148,163,184,0.05))',
                border: '1px solid rgba(148, 163, 184, 0.22)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '12px', letterSpacing: '0.08em', fontWeight: 800, color: '#f97316' }}>{label}</span>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>{value}</p>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
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
          {features.map(({ title, desc, icon }, index) => (
            <div
              key={title}
              ref={(el) => {
                if (el) featureRefs.current[index] = el;
              }}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    backgroundColor: 'rgba(249, 115, 22, 0.12)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '24px',
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

      {/* Social CTA */}
      <section
        style={{
          borderRadius: '24px',
          padding: '26px 28px',
          background: 'linear-gradient(120deg, rgba(249, 115, 22, 0.16), rgba(99, 102, 241, 0.16))',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '18px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '6px', minWidth: '260px' }}>
          <span style={{ fontSize: '12px', letterSpacing: '0.05em', fontWeight: 800, color: '#a4a9b5ff' }}>FOLLOW</span>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#a4a9b5ff' }}>
            인스타그램 @aubl_1981 에서 실시간 경기 사진과 이벤트를 확인하세요.
          </p>
          <span style={{ color: '#a4a9b5ff', opacity: 0.8, fontWeight: 600 }}>선수들의 루틴, 경기 비하인드, 팬 굿즈 소식까지 놓치지 마세요.</span>
        </div>
        <a
          href="https://www.instagram.com/aubl_1981/"
          target="_blank"
          rel="noreferrer"
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '15px',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            border: '1px solid rgba(15, 23, 42, 0.6)',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.28)',
          }}
        >
          인스타그램 바로가기 →
        </a>
      </section>
    </div>
  );
}
