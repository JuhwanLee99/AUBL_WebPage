// **`src/front/pages/LandingPage.tsx`**
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

const tickerItems = [
  '📢 [공지] 1월 25일 으뜸 토너먼트 4강전: 세종대 vs 경희대국제 / 연세대 vs 서울시립대 경기 예정',
  '🏆 [2024 결과] 으뜸 우승: 홍익대 / 버금 우승: 동국대 LAE',
  '⚾ [현재 시즌] 2026 AUBL 조별 예선 진행 중 (주최: 중앙대학교 서울)',
];

const valueProps = [
  {
    title: 'Pure Amateurism',
    desc: '엘리트 선수 출신이 아닌 순수 일반 대학생만 참가. 승리보다 값진 땀방울을 지향합니다.',
    icon: '🧢',
  },
  {
    title: 'National Scale',
    desc: '1981년 창설 이후 45년, 수도권을 중심으로 40여 개 대학이 함께하는 국내 최대 대학 야구 리그입니다.',
    icon: '🗺️',
  },
  {
    title: 'Student Governance',
    desc: '기획·운영·심판·기록까지 학생이 주도하는 자치 리그. 실시간 기록과 중계로 모두가 같은 정보를 공유합니다.',
    icon: '🎓',
  },
];

const seasonHighlights = [
  {
    title: '리그 규정 (Rulebook)',
    desc: '7이닝 경기, 5회 10점·6회 7점 콜드, 무단 불참 시 1년 출전 정지 등 최신 개정안을 반영했습니다.',
    icon: '📘',
    link: '/intro',
  },
  {
    title: '기록실 (Stats)',
    desc: '타율·방어율·홈런부터 TQB까지. 2026 시즌 최고의 팀과 선수를 데이터로 확인하세요.',
    icon: '📊',
    link: '/records',
  },
  {
    title: '팀 소개 (Teams)',
    desc: '중앙대, 연세대, 고려대, 한양대 등 40개 참가 팀의 프로필과 조 편성을 한눈에 모았습니다.',
    icon: '🏅',
    link: '/intro',
  },
];

const snapshotCards = [
  {
    label: '2026 HOST',
    value: '중앙대학교(서울)',
    desc: '46주년 시즌 운영 전권을 맡은 호스트 대학',
  },
  {
    label: 'FORMAT',
    value: 'A~H조 8개 조 / 약 40팀',
    desc: '조별 예선 후 으뜸·버금 이원화 토너먼트로 최강자를 가립니다.',
  },
  {
    label: 'VISION',
    value: '실시간 기록 · 중계 · 디지털화',
    desc: '웹 플랫폼 기반 실시간 기록과 중계로 리그 소식을 즉시 전달하는 2026 시즌',
  },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const highlightRefs = useRef<HTMLDivElement[]>([]);
  const snapshotRef = useRef<HTMLDivElement>(null);

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

      if (highlightRefs.current.length) {
        gsap.fromTo(
          highlightRefs.current,
          { y: 24, opacity: 0, scale: 0.97 },
          { y: 0, opacity: 1, scale: 1, duration: 0.95, stagger: 0.08, ease: 'power2.out', delay: 0.2 },
        );
      }

      const snapshotBlocks = snapshotRef.current?.querySelectorAll('.snapshot-card');
      if (snapshotBlocks) {
        gsap.fromTo(
          snapshotBlocks,
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.95, stagger: 0.06, ease: 'power2.out', delay: 0.1 },
        );
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '56px' }}>
      {/* Hero Section */}
      <section
        ref={heroRef}
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '32px',
          padding: '56px',
          background:
            'radial-gradient(circle at 18% 22%, rgba(59,130,246,0.24), transparent 32%), radial-gradient(circle at 90% 0%, rgba(12,74,110,0.18), transparent 30%), linear-gradient(140deg, #0b1f46 0%, #0d2f7f 100%)',
          boxShadow: '0 24px 60px rgba(6, 15, 40, 0.55)',
          isolation: 'isolate',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="hero-animate" style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#60a5fa' }}>
              46TH AUBL · HOSTED BY CHUNG-ANG UNIVERSITY (SEOUL)
            </span>
            <span className="hero-animate" style={{ padding: '6px 12px', borderRadius: '999px', background: 'rgba(255, 255, 255, 0.08)', color: '#e2e8f0', fontSize: '12px', border: '1px solid rgba(148, 163, 184, 0.28)' }}>
              전국대학아마추어야구연합회 · SINCE 1981
            </span>
          </div>
          <div className="hero-animate" style={{ display: 'grid', gap: '12px' }}>
            <h1 className="hero-animate" style={{ fontSize: '46px', lineHeight: 1.15, fontWeight: 900, margin: 0 }}>
              그라운드 위의 지성,
              <br />
              멈추지 않는 열정.
            </h1>
            <p className="hero-animate" style={{ color: '#cbd5e1', fontSize: '17px', margin: 0, maxWidth: '760px' }}>
              2026 제46회 전국대학아마추어야구연합회(AUBL). 대한민국 유일의 순수 대학 아마추어 야구 리그에서
              <br />
              40개 대학 2,000여 명의 선수가 써 내려가는 각본 없는 드라마가 지금 시작됩니다.
            </p>
            <p className="hero-animate" style={{ color: '#93c5fd', fontWeight: 700, margin: 0 }}>
              중앙대학교(서울)가 주최하는 2026 시즌 — 실시간 기록과 중계, 디지털화를 핵심 가치로 리그의 새로운 도약을 준비했습니다.
            </p>
          </div>
          <div className="hero-animate" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>
            <Link
              to="/schedule"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '15px',
                backgroundColor: '#60a5fa',
                color: '#0b1635',
                boxShadow: '0 16px 40px rgba(96, 165, 250, 0.28)',
              }}
            >
              2026 경기 일정 확인하기
            </Link>
            <Link
              to="/intro"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '15px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#e2e8f0',
                border: '1px solid rgba(148, 163, 184, 0.32)',
              }}
            >
              참가 팀 및 조 편성 보기
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
                backgroundColor: 'rgba(99, 102, 241, 0.18)',
                color: '#dbeafe',
                border: '1px solid rgba(99, 102, 241, 0.36)',
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
            background: "url('/assets/aubl_clean.png')",
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.32,
            pointerEvents: 'none',
          }}
        />
      </section>

      {/* Live Info Ticker */}
      <section
        style={{
          borderRadius: '18px',
          padding: '12px 16px',
          border: '1px solid rgba(148, 163, 184, 0.28)',
          background: 'rgba(15, 23, 42, 0.7)',
          boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(96, 165, 250, 0.14)',
            color: '#bfdbfe',
            fontWeight: 800,
            letterSpacing: '0.04em',
            fontSize: '12px',
            flexShrink: 0,
            border: '1px solid rgba(96, 165, 250, 0.24)',
          }}
        >
          LIVE INFO
        </div>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
          {tickerItems.map((item) => (
            <span
              key={item}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                color: '#e2e8f0',
                fontWeight: 600,
                border: '1px solid rgba(148, 163, 184, 0.22)',
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Key Value Propositions */}
      <section
        ref={snapshotRef}
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
              backgroundColor: '#60a5fa',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(96, 165, 250, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>AUBL KEY VALUES</p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {valueProps.map(({ title, desc, icon }) => (
            <div
              key={title}
              className="snapshot-card"
              style={{
                borderRadius: '18px',
                padding: '20px 22px',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(148,163,184,0.05))',
                border: '1px solid rgba(148, 163, 184, 0.22)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '24px' }}>{icon}</span>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>{title}</p>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 2026 Season Snapshot */}
      <section
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
              backgroundColor: '#34d399',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(52, 211, 153, 0.16)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>2026 시즌 스냅샷</p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {snapshotCards.map(({ label, value, desc }) => (
            <div
              key={label}
              className="snapshot-card"
              style={{
                borderRadius: '18px',
                padding: '20px 22px',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(52,211,153,0.06))',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '12px', letterSpacing: '0.08em', fontWeight: 800, color: '#34d399' }}>{label}</span>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>{value}</p>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Season Highlights */}
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
          <p style={{ margin: 0, fontWeight: 700, letterSpacing: '0.05em', fontSize: '13px' }}>2026 시즌 하이라이트 & 바로가기</p>
        </div>
        <div
          style={{
            display: 'grid',
            gap: '18px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          {seasonHighlights.map(({ title, desc, icon, link }, index) => (
            <div
              key={title}
              ref={(el) => {
                if (el) highlightRefs.current[index] = el;
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
              {link && (
                <Link
                  to={link}
                  style={{
                    marginTop: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#93c5fd',
                    fontWeight: 700,
                  }}
                >
                  바로가기 →
                </Link>
              )}
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
