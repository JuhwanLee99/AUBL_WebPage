import type { CSSProperties } from 'react';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule } from '../../shared/state/demoStore';

const cardStyle: CSSProperties = {
  border: '1px solid rgba(148,163,184,0.25)',
  borderRadius: '14px',
  padding: '14px',
  background: 'rgba(15,23,42,0.65)',
  display: 'grid',
  gap: '10px',
};

const statusBadge = (match: MatchSchedule) => {
  if (match.status === 'inProgress') return { text: '진행 중', color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' };
  if (match.status === 'completed') return { text: '종료', color: '#f97316', bg: 'rgba(249,115,22,0.14)' };
  if (match.status === 'canceled') return { text: '취소', color: '#94a3b8', bg: 'rgba(148,163,184,0.16)' };
  return { text: '예정', color: '#22c55e', bg: 'rgba(34,197,94,0.14)' };
};

export default function SchedulePracticePage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  const practiceMatches = useMemo(
    () =>
      state.matches
        .filter((m) => !m.deleted && (m.recordMode ?? 'official') === 'practice')
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [state.matches],
  );

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>연습경기</h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
            공식기록 미반영 경기만 모아봅니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
            일정 메인
          </button>
        </div>
      </header>

      {practiceMatches.length === 0 ? (
        <div
          style={{
            border: '1px dashed rgba(148,163,184,0.35)',
            borderRadius: '14px',
            padding: '20px',
            background: 'rgba(255,255,255,0.03)',
            color: '#94a3b8',
            fontWeight: 700,
          }}
        >
          등록된 연습경기가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {practiceMatches.map((match) => {
            const badge = statusBadge(match);
            return (
              <div key={match.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 900, color: '#e2e8f0' }}>
                      {match.awayTeamName} vs {match.homeTeamName}
                    </span>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        background: badge.bg,
                        color: badge.color,
                        fontWeight: 800,
                        fontSize: '11px',
                      }}
                    >
                      {badge.text}
                    </span>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        background: 'rgba(16,185,129,0.16)',
                        color: '#34d399',
                        fontWeight: 800,
                        fontSize: '11px',
                      }}
                    >
                      연습경기
                    </span>
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
                        color: '#e2e8f0',
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
                        color: '#e2e8f0',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      기록원
                    </button>
                  </div>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '13px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span>{new Date(match.startTime).toLocaleString('ko-KR')}</span>
                  <span>· {match.venue}</span>
                  <span>· 점수 {match.awayScore ?? '-'} : {match.homeScore ?? '-'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
