import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule } from '../../shared/state/demoStore';
import IndependentScoreboardPanel from '../../features/scoreboard/components/IndependentScoreboardPanel';

function safeMatchTime(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export default function ScheduleLivePage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const [liveMatchesRealtime, setLiveMatchesRealtime] = useState<MatchSchedule[]>([]);

  // 라이브 경기 계산
  const liveMatches = useMemo(() => {
    const source = liveMatchesRealtime.length ? liveMatchesRealtime : state.matches;
    return source
      .filter((match) => match.status === 'inProgress')
      .sort((a, b) => safeMatchTime(a.startTime) - safeMatchTime(b.startTime));
  }, [liveMatchesRealtime, state.matches]);

  // 전체 일정 로드
  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  // 실시간 진행 중인 경기 구독
  useEffect(() => {
    const liveQuery = query(collection(firestore, 'matches'), where('status', '==', 'inProgress'));
    const unsub = onSnapshot(
      liveQuery,
      (snap) => {
        const incoming = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Partial<MatchSchedule>),
        }));
        setLiveMatchesRealtime(
          incoming
            .filter((m) => !m.deleted)
            .sort((a, b) => safeMatchTime(a.startTime || '') - safeMatchTime(b.startTime || '')) as MatchSchedule[],
        );
      },
      (error) => {
        console.error('[live page] snapshot error', error);
        setLiveMatchesRealtime([]);
      },
    );
    return unsub;
  }, []);

  return (
    <div style={{ display: 'grid', gap: '24px', padding: '0 0 40px' }}>
      {/* 헤더 */}
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, margin: 0, color: '#f8fafc' }}>
            실시간 경기 전광판
          </h1>
          <p style={{ color: '#94a3b8', margin: '8px 0 0', fontSize: '15px' }}>
            진행 중인 모든 경기의 전광판을 한눈에 확인하세요
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/schedule')}
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            전체 일정 보기
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            홈으로
          </button>
        </div>
      </header>

      {liveMatches.length === 0 ? (
        <div
          style={{
            borderRadius: '18px',
            padding: '80px 20px',
            border: '1px solid rgba(148,163,184,0.25)',
            background: 'linear-gradient(145deg, rgba(15,23,42,0.92), rgba(15,23,42,0.75))',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>⚾</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#e2e8f0', marginBottom: '12px' }}>
            진행 중인 경기가 없습니다
          </div>
          <p style={{ color: '#94a3b8', fontSize: '16px', margin: 0 }}>
            경기가 시작되면 실시간 전광판이 표시됩니다
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: liveMatches.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 600px), 1fr))',
            gap: '24px',
          }}
        >
          {liveMatches.map((match) => {
            // 각 경기마다 임시로 선택하여 전광판 표시
            return (
              <div
                key={match.id}
                style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: '2px solid rgba(56, 189, 248, 0.3)',
                  background: '#050505',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
                onClick={() => {
                  actions.selectMatch(match.id);
                  navigate('/scoreboard-text/' + match.id);
                }}
              >
                {/* 경기 정보 헤더 */}
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.15), rgba(99, 102, 241, 0.10))',
                    borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: 'rgba(248, 113, 113, 0.2)',
                        color: '#fca5a5',
                        fontWeight: 900,
                        fontSize: '11px',
                        letterSpacing: '0.08em',
                        border: '1px solid rgba(248, 113, 113, 0.4)',
                      }}
                    >
                      LIVE
                    </span>
                    <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>
                      {match.awayTeamName} vs {match.homeTeamName}
                    </span>
                  </div>
                  {match.notes && (
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'rgba(34, 197, 94, 0.14)',
                        color: '#86efac',
                        fontWeight: 800,
                        fontSize: '11px',
                      }}
                    >
                      {match.notes}
                    </span>
                  )}
                </div>

                {/* 전광판 */}
                <div
                  style={{
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.selectMatch(match.id);
                    navigate('/scoreboard-text/' + match.id);
                  }}
                >
                  <IndependentScoreboardPanel
                    matchId={match.id}
                    style={{
                      width: '100%',
                      minHeight: '400px',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
