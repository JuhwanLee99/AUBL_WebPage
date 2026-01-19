import { TEAMS } from '../../shared/lib/mockData';

interface PlayerCard {
  name: string;
  stat: string;
  team: string;
  color: string;
}

const battingLeaders: PlayerCard[] = [
  { name: '김민규', stat: '.415 · 성균관대', team: '성균관대', color: '#dc2626' },
  { name: '박준수', stat: '.392 · 고려대', team: '고려대', color: '#7c2d12' },
  { name: '이승우', stat: '.388 · 연세대', team: '연세대', color: '#1d4ed8' },
];

const eraLeaders: PlayerCard[] = [
  { name: '최지훈', stat: '1.12 · 연세대', team: '연세대', color: '#1d4ed8' },
  { name: '강현우', stat: '1.45 · 고려대', team: '고려대', color: '#7c2d12' },
  { name: '김동현', stat: '1.78 · 서울대', team: '서울대', color: '#b91c1c' },
];

const tabs = ['타율', '평균자책점', '홈런', '도루'];

export default function RecordRoomPage() {
  const topTeams = [...TEAMS]
    .slice(0, 3)
    .map((t, idx) => ({ ...t, points: 42 - idx * 4 }))
    .sort((a, b) => b.points - a.points);

  return (
    <div
      style={{
        maxWidth: '480px',
        margin: '0 auto',
        background: '#0f172a',
        borderRadius: '20px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          background: '#8b1b24',
          color: '#fff',
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 800,
          letterSpacing: '-0.02em',
        }}
      >
        기록실
        <span style={{ fontSize: '13px', opacity: 0.8 }}>모바일 데모</span>
      </header>

      <div style={{ padding: '18px 18px 12px', background: 'linear-gradient(135deg, #111827 0%, #0f172a 100%)', color: '#e2e8f0' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 800 }}>현재 팀 순위</p>
        <div
          style={{
            background: '#fff',
            color: '#111827',
            borderRadius: '12px',
            padding: '12px 14px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
            display: 'grid',
            gap: '6px',
          }}
        >
          {topTeams.map((team, idx) => (
            <div key={team.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
              <span
                style={{
                  width: '22px',
                  textAlign: 'center',
                  color: '#8b1b24',
                }}
              >
                {idx + 1}.
              </span>
              <span style={{ flex: 1 }}>{team.name}</span>
              <span style={{ color: '#6b7280', fontWeight: 700 }}>{team.points}점</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 18px 18px', color: '#e2e8f0' }}>
        <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid rgba(148,163,184,0.25)', paddingBottom: '10px' }}>
          {tabs.map((tab, idx) => (
            <span
              key={tab}
              style={{
                paddingBottom: '6px',
                fontWeight: 800,
                color: idx === 0 ? '#e11d48' : '#94a3b8',
                borderBottom: idx === 0 ? '2px solid #e11d48' : '2px solid transparent',
                cursor: 'default',
              }}
            >
              {tab}
            </span>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '12px', marginTop: '14px' }}>
          <LeaderBlock title="타율 (Top 3)" players={battingLeaders} />
          <LeaderBlock title="평균자책점 (Top 3)" players={eraLeaders} />
        </div>
      </div>

      <footer
        aria-label="모바일 네비게이션 데모"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          background: '#0b1220',
          borderTop: '1px solid rgba(148, 163, 184, 0.25)',
          color: '#94a3b8',
          fontSize: '12px',
        }}
      >
        {['홈', '기록', '중계', '하이라이트', '더보기'].map((item, idx) => (
          <div key={item} style={{ textAlign: 'center', padding: '10px 0', fontWeight: 700, color: idx === 1 ? '#e11d48' : '#94a3b8' }}>
            {item}
          </div>
        ))}
      </footer>
    </div>
  );
}

function LeaderBlock({ title, players }: { title: string; players: PlayerCard[] }) {
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <p style={{ margin: 0, fontWeight: 800 }}>{title}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
        {players.map((player) => (
          <div
            key={player.name}
            style={{
              background: '#111827',
              borderRadius: '12px',
              padding: '12px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              display: 'grid',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '100%',
                aspectRatio: '3 / 2',
                borderRadius: '10px',
                background: `linear-gradient(145deg, ${player.color} 0%, #111827 80%)`,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                fontWeight: 900,
                fontSize: '20px',
              }}
              aria-label={`${player.name} 이미지 대체`}
            >
              {player.name.slice(0, 2)}
            </div>
            <div style={{ display: 'grid', gap: '2px' }}>
              <span style={{ fontWeight: 800 }}>{player.name}</span>
              <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{player.stat}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
