import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';
import { TEAMS } from '../../shared/lib/mockData';

const divisions = [
  { key: 'EUTTEUM', label: '으뜸조', color: '#4f46e5' },
  { key: 'BEOGEUM', label: '버금조', color: '#10b981' },
] as const;

const cardBase = {
  borderRadius: '16px',
  padding: '14px',
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.7)',
};

export default function ScheduleGroupsPage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();

  const divisionMatches = useMemo(() => {
    const byDiv: Record<string, typeof state.matches> = { EUTTEUM: [], BEOGEUM: [] };
    state.matches.forEach((match) => {
      const homeDiv = TEAMS.find((t) => t.id === match.homeTeamId)?.division;
      const awayDiv = TEAMS.find((t) => t.id === match.awayTeamId)?.division;
      if (!homeDiv || !awayDiv) return;
      if (homeDiv === awayDiv) {
        byDiv[homeDiv] = [...(byDiv[homeDiv] ?? []), match];
      }
    });
    Object.keys(byDiv).forEach((key) => {
      byDiv[key] = byDiv[key]
        .slice()
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    });
    return byDiv;
  }, [state.matches]);

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>조별 일정</h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>조(으뜸/버금) 단위로 예정 경기와 결과를 묶어서 확인하세요.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/schedule')}
          style={{
            padding: '10px 14px',
            borderRadius: '12px',
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          메인 일정 페이지
        </button>
      </header>

      <section style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', color: '#94a3b8', fontWeight: 700 }}>
          <span>조 범례:</span>
          {divisions.map((div) => (
            <span
              key={div.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '10px',
                border: `1px solid ${div.color}55`,
                background: `${div.color}14`,
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            >
              <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: div.color }} />
              {div.label}
            </span>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
        {divisions.map((div) => {
          const list = divisionMatches[div.key] ?? [];
          return (
            <div
              key={div.key}
              style={{
                ...cardBase,
                borderColor: `${div.color}55`,
                background: `linear-gradient(145deg, rgba(15,23,42,0.9), rgba(15,23,42,0.74)), radial-gradient(circle at 12% 16%, ${div.color}26, transparent 42%)`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '999px', background: div.color }} />
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{div.label}</h2>
                </div>
                <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '13px' }}>{list.length} 경기</span>
              </div>

              <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                {list.length ? (
                  list.map((match) => {
                    const isPast = new Date(match.startTime).getTime() < Date.now();
                    const badge = match.status === 'completed' || isPast ? { text: '종료', color: '#f97316' } : { text: '예정', color: '#22c55e' };
                    return (
                      <div
                        key={match.id}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '12px',
                          border: '1px solid rgba(148,163,184,0.25)',
                          background: 'rgba(255,255,255,0.03)',
                          display: 'grid',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                            {match.homeTeamName} vs {match.awayTeamName}
                          </span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: `${badge.color}22`,
                              color: badge.color,
                              fontWeight: 800,
                              fontSize: '11px',
                            }}
                          >
                            {badge.text}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#94a3b8', fontSize: '12px', flexWrap: 'wrap' }}>
                          <span>{new Date(match.startTime).toLocaleDateString('ko-KR')}</span>
                          <span>· {match.venue}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              actions.selectMatch(match.id);
                              navigate('/scoreboard-text');
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '10px',
                              border: '1px solid rgba(148,163,184,0.35)',
                              background: 'rgba(255,255,255,0.04)',
                              color: '#cbd5e1',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            문자중계
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              actions.selectMatch(match.id);
                              navigate('/scorekeeper');
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '10px',
                              border: '1px solid rgba(148,163,184,0.35)',
                              background: 'rgba(255,255,255,0.04)',
                              color: '#cbd5e1',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            기록 관리
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px dashed rgba(148,163,184,0.35)',
                      color: '#94a3b8',
                      fontWeight: 700,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    아직 등록된 {div.label} 일정이 없습니다.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
