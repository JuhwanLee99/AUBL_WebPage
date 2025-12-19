import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

const upcoming = [
  {
    title: '라인업 기반 예측',
    desc: '투수-타자 매치업, 최근 컨디션, 홈/원정 지표를 반영한 승리 확률 제공 예정',
    accent: '#f97316',
  },
  {
    title: '모델 실험실',
    desc: 'Elo + 머신러닝 하이브리드 모델을 비교 테스트하고 예측 정확도를 시각화',
    accent: '#a855f7',
  },
  {
    title: '실시간 반영',
    desc: '경기 중 이벤트(득점, 교체) 업데이트 시 즉시 확률을 재산출하여 보여주기',
    accent: '#60a5fa',
  },
];

const steps = [
  '과거 경기 데이터 적재 · 전처리',
  'Elo, 최근 폼, 라인업 정보를 피처로 생성',
  '머신러닝 모델 학습 및 백테스트',
  '실시간 경기 이벤트 연동 후 확률 업데이트',
];

export default function PredictionPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blocks = pageRef.current?.querySelectorAll('.prediction-chunk');
      if (blocks) {
        gsap.fromTo(blocks, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power2.out' });
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div style={{ display: 'grid', gap: '28px' }} ref={pageRef}>
      <section
        className="prediction-chunk"
        style={{
          padding: '30px',
          borderRadius: '24px',
          background:
            'radial-gradient(circle at 12% 18%, rgba(96,165,250,0.16), transparent 32%), radial-gradient(circle at 86% -6%, rgba(249,115,22,0.2), transparent 30%), linear-gradient(135deg, #0f172a 0%, #0b1220 100%)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.32)',
          display: 'grid',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              background: 'rgba(249, 115, 22, 0.14)',
              color: '#f97316',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              fontSize: '12px',
            }}
          >
            PREDICTION LAB
          </span>
          <span style={{ color: '#cbd5e1', fontWeight: 700 }}>데이터 기반 승부 예측 · 베타 준비 중</span>
        </div>
        <h2 style={{ margin: 0, fontSize: '32px', fontWeight: 900 }}>
          승부 예측 — 경기 흐름과 데이터가 만나면,
          <br />
          더 똑똑한 확률이 만들어집니다.
        </h2>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '820px' }}>
          라인업, 컨디션, Elo, 홈/원정, 최근 5경기 폼 등을 결합하여 승리 확률을 계산하는 실험실을 준비 중입니다.
          UI/UX는 이미 준비되었으며, 백엔드와 모델이 연결되면 바로 사용할 수 있도록 설계했습니다.
        </p>
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
            현재 순위 보기
          </Link>
          <a
            href="https://www.instagram.com/aubl_1981/"
            target="_blank"
            rel="noreferrer"
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
            인스타그램 @aubl_1981
          </a>
        </div>
      </section>

      <section style={{ display: 'grid', gap: '16px' }} className="prediction-chunk">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#f97316',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(249, 115, 22, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>곧 제공될 기능</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {upcoming.map((item) => (
            <div
              key={item.title}
              style={{
                padding: '18px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '12px', letterSpacing: '0.08em', fontWeight: 800, color: item.accent }}>COMING SOON</span>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>{item.title}</p>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="prediction-chunk"
        style={{
          padding: '18px',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          background: 'linear-gradient(135deg, rgba(15,23,42,0.92), rgba(96,165,250,0.12))',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#22c55e',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(34, 197, 94, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>모델 준비 과정</p>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {steps.map((step, index) => (
            <div
              key={step}
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
              }}
            >
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(249, 115, 22, 0.16)',
                  color: '#f97316',
                  fontWeight: 900,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {index + 1}
              </span>
              <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 700 }}>{step}</p>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, color: '#94a3b8' }}>
          * 백엔드와 모델이 연결되면 실시간 확률, 누적 정확도, 추천 베팅/응원 포인트 등의 UX를 바로 활성화할 수 있도록 설계되어
          있습니다.
        </p>
      </section>
    </div>
  );
}
