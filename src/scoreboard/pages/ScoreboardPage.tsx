import { useMemo } from 'react';
import { MATCHES, TEAMS } from '../../shared/lib/mockData';

const liveFeeds = [
  { title: 'LocalDisplay', desc: '기록원 앱 ↔ 전광판 WebSocket, 경기장 저지연 피드', accent: '#22d3ee' },
  { title: 'Cloud Subscribe', desc: '클라우드 DB/EloEngine 이벤트를 실시간 구독해 동기화', accent: '#a855f7' },
];

const displayTargets = [
  { title: '웹 전광판', desc: 'React 기반 PublicWeb에서 실시간 스트림 표시', accent: '#f97316' },
  { title: '앱 전광판', desc: '모바일 앱/웹뷰에서도 동일 UI를 공유', accent: '#38bdf8' },
  { title: 'API Fallback', desc: '실시간 연결 실패 시 REST 폴링으로 보강', accent: '#facc15' },
];

const demoFeed = [
  { time: 'T3', event: '알파 SS 김하늘 2타점 2B — 3:1', accent: '#22d3ee' },
  { time: 'B5', event: '베타 PH 최민재 솔로 홈런 — 3:2', accent: '#f97316' },
  { time: 'T7', event: '알파 투수 교체: 이도현 → 조현우', accent: '#a855f7' },
  { time: 'B9', event: '세이브 상황: 주자 1,2루 · 1아웃', accent: '#38bdf8' },
];

export default function ScoreboardPage() {
  const latestMatch = useMemo(() => {
    const reversed = [...MATCHES].reverse();
    return reversed.find((m) => m.isFinished) ?? reversed[0];
  }, []);

  const homeTeam = TEAMS.find((t) => t.id === latestMatch?.homeTeamId);
  const awayTeam = TEAMS.find((t) => t.id === latestMatch?.awayTeamId);

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <section
        style={{
          padding: '26px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #0f172a 0%, #0b1220 100%)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          color: '#e2e8f0',
          boxShadow: '0 20px 48px rgba(0,0,0,0.28)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em', color: '#a855f7' }}>SCOREBOARD</span>
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em', color: '#94a3b8' }}>
            웹/앱 전광판 공용 UI
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>전광판 데이터 흐름</h1>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
          기록원 앱이 보낸 WebSocket 데이터를 LocalDisplay에 즉시 반영하고, 클라우드 DB/EloEngine 구독으로 점수·레팅을
          지속 동기화합니다. 웹/앱 전광판은 동일 컴포넌트를 재사용합니다.
        </p>

        <div
          style={{
            marginTop: '6px',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(255,255,255,0.03)',
            display: 'grid',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#22d3ee' }}>MOCK GAME</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>데모 데이터 (백엔드 없이 구동)</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '14px',
              alignItems: 'stretch',
            }}
          >
            <div
              style={{
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.28)',
                background: 'rgba(0,0,0,0.25)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>최신 경기</span>
                <span style={{ padding: '4px 10px', borderRadius: '10px', background: 'rgba(148, 163, 184, 0.15)', color: '#e2e8f0', fontWeight: 800 }}>
                  {latestMatch?.isFinished ? '종료' : 'LIVE'}
                </span>
              </div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <TeamScoreRow teamName={awayTeam?.name ?? 'Away'} score={latestMatch?.awayScore ?? 0} color={awayTeam?.logoColor ?? '#94a3b8'} />
                <TeamScoreRow teamName={homeTeam?.name ?? 'Home'} score={latestMatch?.homeScore ?? 0} color={homeTeam?.logoColor ?? '#f97316'} highlight />
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '13px' }}>
                WebSocket → 전광판 반영, 실패 시 REST 폴백 · EloEngine 갱신 구독
              </p>
            </div>

            <div
              style={{
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.28)',
                background: 'rgba(0,0,0,0.25)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#f97316' }}>LIVE FEED (MOCK)</span>
              <div style={{ display: 'grid', gap: '8px' }}>
                {demoFeed.map((item) => (
                  <div
                    key={`${item.time}-${item.event}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        width: '48px',
                        textAlign: 'center',
                        borderRadius: '10px',
                        padding: '6px 8px',
                        background: 'rgba(148, 163, 184, 0.15)',
                        fontWeight: 800,
                        color: item.accent,
                        fontSize: '12px',
                      }}
                    >
                      {item.time}
                    </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{item.event}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>백엔드 없이도 데모 가능: mock feed → UI 렌더</p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            marginTop: '8px',
          }}
        >
          {liveFeeds.map((feed) => (
            <div
              key={feed.title}
              style={{
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.28)',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 800, color: feed.accent }}>{feed.title}</span>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>{feed.desc}</p>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            marginTop: '4px',
          }}
        >
          {displayTargets.map((target) => (
            <div
              key={target.title}
              style={{
                padding: '16px',
                borderRadius: '14px',
                border: '1px dashed rgba(148, 163, 184, 0.3)',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 800, color: target.accent }}>{target.title}</span>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>{target.desc}</p>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'grid',
            gap: '10px',
            marginTop: '6px',
            padding: '16px',
            borderRadius: '14px',
            border: '1px solid rgba(148, 163, 184, 0.28)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#f97316' }}>TODO</span>
          <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li>WebSocket/Server-Sent Events 클라이언트 연결 및 재연결 로직</li>
            <li>이닝별 스코어, 투수/타자 라인, 하이라이트 섹션 UI 구현</li>
            <li>웹/앱 전광판을 위한 공용 상태스토어 및 테마 구성</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function TeamScoreRow({
  teamName,
  score,
  color,
  highlight,
}: {
  teamName: string;
  score: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px',
        borderRadius: '12px',
        background: highlight ? 'rgba(249, 115, 22, 0.12)' : 'rgba(255,255,255,0.03)',
        border: highlight ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(148, 163, 184, 0.2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: color,
            boxShadow: `0 0 0 6px ${color}20`,
          }}
        />
        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{teamName}</span>
      </div>
      <span style={{ fontWeight: 900, fontSize: '20px', color: '#e2e8f0' }}>{score}</span>
    </div>
  );
}
