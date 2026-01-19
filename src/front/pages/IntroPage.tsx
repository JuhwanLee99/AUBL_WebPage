import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

const historyHighlights = [
  {
    title: 'Since 1981',
    desc: '1981년 대학생들의 작은 교류전으로 출발해 45년을 이어온 국내 유일 순수 대학 아마추어 야구 리그.',
    accent: '#60a5fa',
  },
  {
    title: 'Dynasties',
    desc: '한국외국어대학교(서울)와 동국대학교(L.A.E)가 각각 통산 8회 우승으로 최다 우승 기록을 보유하며 리그의 역사를 이끌어왔습니다.',
    accent: '#a855f7',
  },
  {
    title: '2025 → 2026',
    desc: '2025년 아주대 주최 시즌을 지나 2026년에는 중앙대학교(서울)가 호스트를 맡아 8개 조 예선과 으뜸·버금 토너먼트로 리그를 운영합니다.',
    accent: '#34d399',
  },
];

const governance = [
  {
    label: '주최 (2026)',
    value: '중앙대학교(서울)',
    detail: '46주년 시즌 운영 전권을 위임받은 호스트 대학',
  },
  {
    label: '회장단',
    value: '회장 정흥영 · 기록부장 이주환',
    detail: '실시간 기록 · 중계 · 디지털화, 웹 개발을 기록부가 주도',
  },
  {
    label: '감사',
    value: '연 2회 회계 감사',
    detail: '주최 외 제3의 대학(차기 주최 등)이 상·하반기 2회 진행',
  },
];

const structureCards = [
  {
    title: '회원 자격',
    points: [
      '각 대학 본부에 정식 등록된 야구회 소속원만 참가',
      '재학생 원칙, 휴학생·군 복무자 참가 허용',
      '대학원생은 원칙적으로 불허',
      '엘리트 선수(대한야구소프트볼협회 등록) 출신 제한으로 순수 아마추어리즘 유지',
    ],
  },
  {
    title: '경기 운영',
    points: [
      '정규 7이닝, 4이닝 이상 진행 시 정식 경기 인정',
      '콜드 게임: 5회 10점 차 / 6회 7점 차',
      '노쇼 10분 경과 시 몰수, 무단 불참 시 1년 출전 정지',
    ],
  },
  {
    title: '순위 · 포스트시즌',
    points: [
      'A~H조, 조당 4~5팀 풀리그',
      '순위: 승률 → 승자승 → TQB → 최소 실점 → 최다 득점 → 추첨',
      '각 조 상위 2팀 으뜸 토너먼트 16강, 하위권 팀은 버금 16강으로 진출',
    ],
  },
];

const postseasonMatches = [
  {
    title: '으뜸 4강 (2026.01.25 예정)',
    matchups: ['세종대 Kings vs 경희대 국제 Lions', '연세대 Eagles vs 서울시립대 Falcons'],
  },
  {
    title: '버금 4강 (2026.01.24 예정)',
    matchups: ['한국공학대 Winners vs 한국외대 글로벌 Union', '경희대 서울 Braves vs 인하대 Biryong'],
  },
];

const teamNames = [
  '가천 WIND',
  '가톨릭대학교 텀블러즈',
  '강남대학교 타키온즈',
  '건국대 팬서스',
  '건국대(서울) 불소야구',
  '경기대학교 KGB',
  '경희대국제 LIONS',
  '경희대학교(서울) BRAVES',
  '고려대학교 백구회',
  '광운대학교 페가수스',
  '국민대학교 윈드밀스',
  '단국대 PANDAS',
  '단국대학교 하운드',
  '동국대학교 LAE',
  '명지대학교(서울) 나이너스',
  '백석대학교 칼로스',
  '상명대BUCKS',
  '서강대학교 야구반 알바트로스',
  '서경대학교 적시타',
  '서울과학기술대 미르',
  '서울시립대학교FALCONS',
  '성균관대학교 킹고야구반',
  '세종대학교 세종킹스',
  '숭실대학교 oners',
  '아주대학교 ABBA',
  '연세대학교 EAGLES',
  '외대(글로벌) 유니온',
  '인천대학교 바이킹',
  '인하대학교 비룡',
  '중앙대학교 랑데뷰',
  '한국공학대학교 WINNERS',
  '한국교통대학교 스윙스',
  '한국외대(서울) 야구부',
  '한국체대 루나틱스',
  '한국항공대 Astros',
  '한성대학교 TURTLES',
  '한신대학교 갱스터',
  '한양대ERICA HIBA',
  '한양대학교 불새',
  '홍익대학교 위너스',
];

const heroMetrics = [
  { label: '2026 HOST', value: '중앙대학교(서울)', note: '제46회 AUBL 운영' },
  { label: '참가 규모', value: '약 40개 대학', note: 'A~H조 조별 예선 후 으뜸·버금' },
  { label: '핵심 가치', value: '실시간 기록 · 중계 · 디지털화', note: '정흥영 회장 / 이주환 기록부장(웹개발 리드)' },
];

export default function IntroPage() {
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
    <div style={{ display: 'grid', gap: '32px' }} ref={pageRef}>
      <section
        className="intro-chunk"
        style={{
          display: 'grid',
          gap: '18px',
          padding: '34px',
          borderRadius: '24px',
          background:
            'radial-gradient(circle at 12% 18%, rgba(59,130,246,0.16), transparent 32%), radial-gradient(circle at 90% 0%, rgba(56,189,248,0.16), transparent 26%), linear-gradient(140deg, #0a1a3f 0%, #0f2f8f 100%)',
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
              background: 'rgba(96,165,250,0.16)',
              color: '#bfdbfe',
              border: '1px solid rgba(96, 165, 250, 0.35)',
              fontSize: '12px',
            }}
          >
            AUBL · LEAGUE INTRO
          </span>
          <span style={{ color: '#cbd5e1', fontWeight: 700 }}>46th Amateur University Baseball League · Hosted by Chung-Ang University (Seoul)</span>
        </div>
        <div style={{ display: 'grid', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '34px', lineHeight: 1.2, fontWeight: 900 }}>
            순수 아마추어 대학 야구의 46년 — 2026년, 중앙대학교(서울)와 함께 새로운 도약을 준비합니다.
          </h2>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '880px' }}>
            1981년 출범한 전국대학아마추어야구연합회(AUBL)는 엘리트 선수 중심이 아닌 일반 대학생들의 땀방울로 성장했습니다.
            2026 시즌은 중앙대학교(서울)가 주최를 맡아 조별 예선과 으뜸·버금 토너먼트를 통해 리그의 전통과 혁신을 모두 보여줄 예정입니다.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          {heroMetrics.map((metric) => (
            <div
              key={metric.label}
              style={{
                padding: '16px',
                borderRadius: '16px',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                background: 'rgba(255,255,255,0.04)',
                display: 'grid',
                gap: '6px',
              }}
            >
              <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', fontSize: '12px' }}>{metric.label}</p>
              <p style={{ margin: 0, fontWeight: 900, fontSize: '22px', color: '#e2e8f0' }}>{metric.value}</p>
              <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 600 }}>{metric.note}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
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
            2026 경기 일정 보기
          </Link>
          <Link
            to="/records"
            style={{
              padding: '14px 18px',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '15px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
              border: '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            기록실 바로가기
          </Link>
        </div>
      </section>

      <section className="intro-chunk" style={{ display: 'grid', gap: '14px', padding: '24px', borderRadius: '18px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(255,255,255,0.02)' }}>
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
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>회장단 인사말</p>
        </div>
        <div style={{ display: 'grid', gap: '10px', color: '#e2e8f0', lineHeight: 1.7 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '18px' }}>“변화와 혁신, 그리고 변하지 않는 열정으로”</p>
          <p style={{ margin: 0 }}>
            존경하는 야구 가족 여러분, 안녕하십니까. 2026년 제46대 전국대학아마추어야구연합회(AUBL) 회장을 맡게 된 <strong>정흥영(중앙대학교 서울)</strong>입니다. 1981년 시작된 AUBL은
            46년 동안 대한민국 대학 스포츠를 대표하는 커뮤니티로 성장했습니다. 올해 저희 집행부는 <strong>“소통하는 리그, 공정한 리그, 안전한 리그”</strong>를 목표로, 경기는 치열하게 그러나 끝나면
            서로의 어깨를 두드려주는 대학 야구의 낭만을 지켜가겠습니다.
          </p>
          <p style={{ margin: 0 }}>
            2026 시즌은 웹 플랫폼 고도화의 해입니다. 기록부장 <strong>이주환(중앙대학교 서울)</strong>이 주도하는 디지털 전환으로 선수들이 자신의 기록과 일정을 언제 어디서나 확인할 수 있도록 하고,
            모든 운영진이 여러분의 땀방울이 헛되지 않도록 최선을 다하겠습니다. 부상 없는 즐거운 시즌이 되길 바랍니다.
          </p>
          <p style={{ margin: 0, color: '#a4a9b5ff', fontWeight: 700 }}>제46대 전국대학아마추어야구연합회장 정흥영</p>
        </div>
      </section>

      <section className="intro-chunk" style={{ display: 'grid', gap: '16px', padding: '24px', borderRadius: '18px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(255,255,255,0.02)' }}>
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
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>역사와 유산</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {historyHighlights.map((item) => (
            <div
              key={item.title}
              style={{
                padding: '18px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '12px', letterSpacing: '0.08em', fontWeight: 800, color: item.accent }}>{item.title}</span>
              <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.6 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="intro-chunk" style={{ display: 'grid', gap: '16px', padding: '24px', borderRadius: '18px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(255,255,255,0.02)' }}>
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
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>조직 구성</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {governance.map((item) => (
            <div
              key={item.label}
              style={{
                padding: '18px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '12px', letterSpacing: '0.08em', fontWeight: 800, color: '#34d399' }}>{item.label}</span>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '18px', color: '#e2e8f0' }}>{item.value}</p>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="intro-chunk" style={{ display: 'grid', gap: '16px', padding: '24px', borderRadius: '18px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(255,255,255,0.02)' }}>
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
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>리그 구조 · 규정 요약</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {structureCards.map((card) => (
            <div
              key={card.title}
              style={{
                padding: '18px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <p style={{ margin: 0, fontWeight: 800, fontSize: '16px', color: '#e2e8f0' }}>{card.title}</p>
              <div style={{ display: 'grid', gap: '8px' }}>
                {card.points.map((point) => (
                  <div key={point} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#cbd5e1', lineHeight: 1.5 }}>
                    <span aria-hidden style={{ color: '#f97316' }}>
                      •
                    </span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Link
          to="/intro"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: '#93c5fd',
            fontWeight: 800,
            marginTop: '4px',
          }}
        >
          자세한 규정 보기 (Rule 페이지 준비 중) →
        </Link>
      </section>

      <section className="intro-chunk" style={{ display: 'grid', gap: '16px', padding: '24px', borderRadius: '18px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#a855f7',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(168, 85, 247, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>2026 포스트시즌 스냅샷</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {postseasonMatches.map((block) => (
            <div
              key={block.title}
              style={{
                padding: '18px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <p style={{ margin: 0, fontWeight: 800, fontSize: '16px', color: '#e2e8f0' }}>{block.title}</p>
              <div style={{ display: 'grid', gap: '8px' }}>
                {block.matchups.map((match) => (
                  <div key={match} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                    <span aria-hidden style={{ color: '#a855f7' }}>
                      •
                    </span>
                    <span>{match}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="intro-chunk" style={{ display: 'grid', gap: '14px', padding: '24px', borderRadius: '18px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'rgba(255,255,255,0.02)' }}>
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
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>2026 참가팀 목록</p>
        </div>
        <p style={{ margin: 0, color: '#cbd5e1' }}>총 40여 개 대학이 아마추어리즘을 지키며 AUBL 46주년 시즌을 함께합니다.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {teamNames.map((name) => (
            <span
              key={name}
              style={{
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'rgba(96,165,250,0.08)',
                border: '1px solid rgba(96, 165, 250, 0.2)',
                color: '#e2e8f0',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              {name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
