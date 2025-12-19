import { useMemo } from 'react';
import { MATCHES, TEAMS } from '../../shared/lib/mockData';

const realtimeSteps = [
  { title: 'Hotspot · WebSocket', desc: '경기장 핫스팟 또는 저지연 네트워크에서 <50ms 지연 목표', accent: '#22d3ee' },
  { title: 'LocalDisplay', desc: '입력 즉시 전광판/태블릿에 반영', accent: '#f97316' },
];

const syncSteps = [
  { title: 'Async Upload', desc: 'REST/Socket로 클라우드 API에 비동기 업로드', accent: '#a855f7' },
  { title: 'DB + EloEngine', desc: '배치 처리 후 Elo/Bradley-Terry 레이팅 갱신', accent: '#38bdf8' },
  { title: 'Subscribe', desc: 'PublicWeb·앱에서 실시간 구독 및 반영', accent: '#facc15' },
];

const mockQueue = [
  { id: 'ev-1', inning: 'T3', text: '김하늘 2점 적시 2B (R2, R3 득점)', severity: 'info' },
  { id: 'ev-2', inning: 'B4', text: '최민재 솔로 HR, 비디오 판독 승인', severity: 'success' },
  { id: 'ev-3', inning: 'T6', text: '투수 교체: 이도현 → 조현우', severity: 'info' },
  { id: 'ev-4', inning: 'B8', text: '우익수 파울 플라이, 기록 보정 대기', severity: 'warning' },
];

export default function ScorekeeperPage() {
  const currentMatch = useMemo(() => MATCHES[0], []);
  const homeTeam = TEAMS.find((t) => t.id === currentMatch?.homeTeamId);
  const awayTeam = TEAMS.find((t) => t.id === currentMatch?.awayTeamId);

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
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em', color: '#f97316' }}>RECORDER</span>
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em', color: '#94a3b8' }}>
            Flutter Host · 웹/앱 동일 서비스
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>기록원 컨트롤러 흐름</h1>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
          경기장에서는 Flutter(모바일/웹) 호스트로 입력해 WebSocket을 통해 전광판(LocalDisplay)에 즉시 반영하고, 동시에
          API로 비동기 업로드해 클라우드 DB와 EloEngine이 갱신됩니다.
        </p>

        <div
          style={{
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(255,255,255,0.03)',
            display: 'grid',
            gap: '12px',
            marginTop: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#22d3ee' }}>MOCK ENTRY</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>백엔드 없이 입력 흐름 데모</span>
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
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#f97316' }}>현재 경기 (Mock)</span>
              <div style={{ display: 'grid', gap: '10px' }}>
                <TeamRow label="AWAY" teamName={awayTeam?.name ?? 'Away'} color={awayTeam?.logoColor ?? '#94a3b8'} />
                <TeamRow label="HOME" teamName={homeTeam?.name ?? 'Home'} color={homeTeam?.logoColor ?? '#f97316'} />
              </div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
                Flutter 입력 → WebSocket 전송 → 로컬 전광판 반영 (mock 데이터)
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
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#facc15' }}>플레이 입력 큐 (Mock)</span>
              <div style={{ display: 'grid', gap: '8px' }}>
                {mockQueue.map((item) => (
                  <div
                    key={item.id}
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
                        color: badgeColor(item.severity),
                        fontSize: '12px',
                      }}
                    >
                      {item.inning}
                    </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{item.text}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>백엔드 없이 입력 → 큐 → 전송 시뮬레이션</p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            marginTop: '6px',
          }}
        >
          {realtimeSteps.map((step) => (
            <div
              key={step.title}
              style={{
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.28)',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 800, color: step.accent }}>{step.title}</span>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>{step.desc}</p>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            marginTop: '4px',
          }}
        >
          {syncSteps.map((step) => (
            <div
              key={step.title}
              style={{
                padding: '16px',
                borderRadius: '14px',
                border: '1px dashed rgba(148, 163, 184, 0.3)',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 800, color: step.accent }}>{step.title}</span>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>{step.desc}</p>
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
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#facc15' }}>TODO</span>
          <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li>Flutter WebView/JS bridge 또는 REST/WebSocket 클라이언트 연결</li>
            <li>플레이 이벤트(득점, 교체, 투구 결과) 입력 폼과 검수 스텝</li>
            <li>전광판/LocalDisplay로의 즉시 반영 및 재전송 실패 재시도 큐</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function TeamRow({ label, teamName, color }: { label: string; teamName: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '10px',
            background: 'rgba(148, 163, 184, 0.15)',
            fontWeight: 800,
            color: '#cbd5e1',
            fontSize: '12px',
          }}
        >
          {label}
        </span>
        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{teamName}</span>
      </div>
      <span
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          backgroundColor: color,
          boxShadow: `0 0 0 6px ${color}20`,
        }}
      />
    </div>
  );
}

function badgeColor(severity: string) {
  switch (severity) {
    case 'success':
      return '#22c55e';
    case 'warning':
      return '#facc15';
    default:
      return '#60a5fa';
  }
}
