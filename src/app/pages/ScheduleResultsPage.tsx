import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule } from '../../shared/state/demoStore';

const gradientCard = (color: string) => ({
  borderRadius: '18px',
  padding: '16px',
  border: '1px solid rgba(148,163,184,0.25)',
  background: `linear-gradient(145deg, rgba(15,23,42,0.92), rgba(15,23,42,0.75)), radial-gradient(circle at 12% 20%, ${color}22, transparent 40%)`,
  boxShadow: '0 14px 32px rgba(0,0,0,0.35)',
});

const statusLabel = (match: MatchSchedule) => {
  if (match.status === 'inProgress') return { text: '진행 중', color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' };
  if (match.status === 'completed') return { text: '경기 종료', color: '#f97316', bg: 'rgba(249,115,22,0.14)' };
  if (match.status === 'canceled') return { text: '취소', color: '#94a3b8', bg: 'rgba(148,163,184,0.18)' };
  return { text: '예정', color: '#22c55e', bg: 'rgba(34,197,94,0.14)' };
};

export default function ScheduleResultsPage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const results = useMemo(
    () =>
      [...state.matches]
        .filter(
          (m) =>
            !m.deleted &&
            (m.status === 'completed' || m.status === 'canceled' || new Date(m.startTime).getTime() < nowTs),
        )
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 8),
    [state.matches, nowTs],
  );

  const summary = useMemo(() => {
    if (!results.length) return { total: 0, avgRuns: 0, closeGames: 0 };
    const totalRuns = results.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
    const closeGames = results.filter((m) => Math.abs((m.homeScore ?? 0) - (m.awayScore ?? 0)) <= 2).length;
    return {
      total: results.length,
      avgRuns: Math.round((totalRuns / results.length) * 10) / 10,
      closeGames,
    };
  }, [results]);

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, margin: 0 }}>경기 결과</h1>
          <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>최신 종료 경기 흐름을 한눈에 확인하세요.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/schedule')}
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            전체 일정 보기
          </button>
          <button
            type="button"
            onClick={() => {
              const targetId = results[0]?.id ?? null;
              actions.selectMatch(targetId);
              if (targetId) {
                navigate(`/scoreboard-text/${targetId}`);
              } else {
                navigate('/scoreboard-text');
              }
            }}
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(90deg, #f97316, #f59e0b)',
              color: '#0b0f1a',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            문자중계 이동
          </button>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <div style={gradientCard('#f97316')}>
          <span style={{ color: '#fca5a5', fontWeight: 700, fontSize: '12px' }}>TOTAL</span>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#e2e8f0' }}>{summary.total} 경기</div>
          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' }}>최근 8경기 기준</p>
        </div>
        <div style={gradientCard('#38bdf8')}>
          <span style={{ color: '#bae6fd', fontWeight: 700, fontSize: '12px' }}>AVG RUNS</span>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#e2e8f0' }}>{summary.avgRuns}</div>
          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' }}>경기당 득점 합계</p>
        </div>
        <div style={gradientCard('#22c55e')}>
          <span style={{ color: '#bbf7d0', fontWeight: 700, fontSize: '12px' }}>CLOSE GAMES</span>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#e2e8f0' }}>{summary.closeGames} 경기</div>
          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' }}>2점 차 이내 접전</p>
        </div>
      </section>

      <section
        style={{
          border: '1px solid rgba(148,163,184,0.25)',
          borderRadius: '16px',
          padding: '16px',
          background: 'rgba(15,23,42,0.65)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>최근 경기 타임라인</h2>
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>최대 8경기 표시</span>
        </div>

        {results.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {results.map((match, idx) => {
              const badge = statusLabel(match);
              return (
                <div
                  key={match.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ width: '28px', height: '28px', borderRadius: '999px', background: 'rgba(249,115,22,0.14)', color: '#f97316', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
                    {idx + 1}
                  </div>
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                        {match.awayTeamName} <span style={{ color: '#94a3b8' }}>vs</span> {match.homeTeamName}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        {badge.text}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', color: '#94a3b8', fontSize: '12px', flexWrap: 'wrap' }}>
                      <span>{new Date(match.startTime).toLocaleString('ko-KR')}</span>
                      <span>· {match.venue}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'grid', gap: '4px', justifyItems: 'end' }}>
                    <span style={{ fontWeight: 900, color: '#e2e8f0' }}>
                      {match.awayScore ?? '-'} : {match.homeScore ?? '-'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        actions.selectMatch(match.id);
                        navigate(`/scoreboard-text/${match.id}`);
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(148,163,184,0.35)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#cbd5e1',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      상세 보기
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              padding: '14px',
              borderRadius: '12px',
              border: '1px dashed rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.03)',
              color: '#94a3b8',
              fontWeight: 700,
            }}
          >
            표시할 경기 결과가 아직 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}
