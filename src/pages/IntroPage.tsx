import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { MATCHES, TEAMS } from '../shared/lib/mockData';

const pillars = [
  {
    title: 'HISTORY',
    highlight: '1981년부터 이어온 대학 야구',
    description:
      '서울·수도권 대학들이 참여한 AUBL은 40년 넘는 기록과 라이벌전을 데이터와 함께 담아냅니다.',
    accent: '#f97316',
  },
  {
    title: 'DATA DNA',
    highlight: 'Elo · 세부 스탯 · 영상 아카이브',
    description: '경기력과 성장 곡선을 동시에 추적할 수 있도록 데이터와 미디어를 통합 제공합니다.',
    accent: '#a855f7',
  },
  {
    title: 'COMMUNITY',
    highlight: '인스타그램 @aubl_1981',
    description: '선수들의 루틴, 팬 이벤트, 현장 사진을 SNS로 실시간 공유하며 더 가까운 응원을 이끕니다.',
    accent: '#60a5fa',
  },
];

const milestones = [
  {
    year: '1981',
    title: '리그 출범',
    desc: '서울·수도권 아마추어 대학 야구 리그 AUBL 시작',
  },
  {
    year: '2000s',
    title: '데이터 기록 도입',
    desc: '박스 스코어와 선수별 기록을 전자화하여 관리 시작',
  },
  {
    year: '2020s',
    title: 'Elo·예측·SNS 통합',
    desc: '실시간 Elo, 승부예측, 인스타그램 하이라이트를 한 곳에서',
  },
];

export default function IntroPage() {
  const totalTeams = TEAMS.length;
  const finishedMatches = MATCHES.filter((match) => match.isFinished).length;

  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blocks = pageRef.current?.querySelectorAll('.intro-chunk');
      if (blocks) {
        gsap.fromTo(
          blocks,
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power2.out' },
        );
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div style={{ display: 'grid', gap: '36px' }} ref={pageRef}>
      <section
        className="intro-chunk"
        style={{
          display: 'grid',
          gap: '18px',
          padding: '34px',
          borderRadius: '24px',
          background:
            'radial-gradient(circle at 10% 20%, rgba(96,165,250,0.12), transparent 32%), radial-gradient(circle at 90% 0%, rgba(168,85,247,0.18), transparent 26%), linear-gradient(140deg, #0f172a 0%, #111827 100%)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: 'rgba(249, 115, 22, 0.14)',
              color: '#f97316',
              border: '1px solid rgba(249, 115, 22, 0.35)',
              fontSize: '12px',
            }}
          >
            LEAGUE INTRO
          </span>
          <span style={{ color: '#cbd5e1', fontWeight: 700 }}>AUBL · Amateur University Baseball League</span>
        </div>
        <div style={{ display: 'grid', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '34px', lineHeight: 1.2, fontWeight: 900 }}>
            리그 소개 — 대학 야구의 열정을 데이터로 기록하고,
            <br />
            팬과 선수 모두가 더 깊이 즐길 수 있도록 설계했습니다.
          </h2>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '860px' }}>
            AUBL은 대학 선수들이 성장하는 여정을 경기 기록, Elo 레이팅, 하이라이트와 함께 담아내는 공간입니다.
            실력과 스토리를 동시에 보여줄 수 있도록 UI/UX를 구성했고, 추후 백엔드 연동 시에도 자연스럽게 데이터가
            연결되도록 설계되어 있습니다.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div
            style={{
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', fontSize: '12px' }}>
              참여 팀
            </p>
            <p style={{ margin: '4px 0 0', fontWeight: 900, fontSize: '24px' }}>{totalTeams}개 팀</p>
          </div>
          <div
            style={{
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', fontSize: '12px' }}>
              기록된 경기
            </p>
            <p style={{ margin: '4px 0 0', fontWeight: 900, fontSize: '24px' }}>{finishedMatches}경기</p>
          </div>
          <div
            style={{
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', fontSize: '12px' }}>
              주요 채널
            </p>
            <p style={{ margin: '4px 0 0', fontWeight: 900, fontSize: '24px' }}>Instagram @aubl_1981</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
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
            라이브 순위 보기
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
            승부 예측 미리보기
          </Link>
        </div>
      </section>

      <section style={{ display: 'grid', gap: '16px' }} className="intro-chunk">
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
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>AUBL IDENTITY</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              style={{
                padding: '20px',
                borderRadius: '18px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                boxShadow: '0 14px 36px rgba(0, 0, 0, 0.2)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '12px', letterSpacing: '0.08em', fontWeight: 800, color: pillar.accent }}>{pillar.title}</span>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>{pillar.highlight}</p>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{pillar.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="intro-chunk"
        style={{
          borderRadius: '20px',
          padding: '22px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(99, 102, 241, 0.12))',
          border: '1px solid rgba(148, 163, 184, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#a855f7',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(168, 85, 247, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>AUBL TIMELINE</p>
        </div>
        <div style={{ display: 'grid', gap: '12px' }}>
          {milestones.map((item) => (
            <div
              key={item.year}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr',
                gap: '12px',
                alignItems: 'start',
                padding: '12px 14px',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <div>
                <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800 }}>{item.year}</p>
                <p style={{ margin: 0, fontWeight: 800, color: '#e2e8f0' }}>{item.title}</p>
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
