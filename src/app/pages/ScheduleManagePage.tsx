import type React from 'react';
import { useMemo } from 'react';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchStatus, MatchSchedule } from '../../shared/state/demoStore';
import type { LeagueDivision } from '../../shared/types';
import { TEAMS } from '../../shared/lib/mockData';

const inputStyle: React.CSSProperties = {
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.35)',
  padding: '9px 12px',
  background: 'rgba(15,23,42,0.8)',
  color: '#e2e8f0',
};

const divisionColor = (teamId?: string) =>
  TEAMS.find((t) => t.id === teamId)?.logoColor ?? '#94a3b8';

const statusText: Record<MatchStatus, string> = {
  scheduled: '예정',
  inProgress: '진행 중',
  completed: '종료',
  canceled: '취소',
};

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInputValue = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIsoString = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

export default function ScheduleManagePage() {
  const { state, actions } = useDemoStore();

  const upcoming = useMemo(
    () =>
      [...state.matches].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [state.matches],
  );

  const addQuickMock = () => {
    const teams = TEAMS.slice().sort(() => Math.random() - 0.5);
    const [home, away] = teams.slice(0, 2);
    const start = new Date(Date.now() + 1000 * 60 * 60 * (Math.floor(Math.random() * 96) + 12));
    const match: MatchSchedule = {
      id: `mock-${Date.now()}`,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeTeamName: home.name,
      awayTeamName: away.name,
      division: home.division === away.division ? home.division : undefined,
      startTime: start.toISOString(),
      venue: 'AUBL 임시구장',
      status: 'scheduled',
      notes: '빠른 더미 등록',
    };
    actions.addMatch(match);
  };

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>일정 관리</h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>데모용 더미 일정을 빠르게 추가·상태 변경해 보세요.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={addQuickMock}
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
            더미 일정 추가
          </button>
          <button
            type="button"
            onClick={() => actions.selectMatch(null)}
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
            선택 초기화
          </button>
        </div>
      </header>

      <section
        style={{
          border: '1px solid rgba(148,163,184,0.25)',
          borderRadius: '16px',
          padding: '14px',
          background: 'rgba(15,23,42,0.7)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>빠른 상태 변경</h2>
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>최근 일정 6개 표시</span>
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          {upcoming.map((match) => {
            const color = divisionColor(match.homeTeamId);
            return (
              <div key={match.id} style={{ display: 'grid', gap: '8px' }}>
                <div
                  style={{
                    border: '1px solid rgba(148,163,184,0.25)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.02)',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '10px',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: color }} />
                      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                        {match.homeTeamName} vs {match.awayTeamName}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: 'rgba(148,163,184,0.14)',
                          color: '#cbd5e1',
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        {statusText[match.status]}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', color: '#94a3b8', fontSize: '12px', flexWrap: 'wrap' }}>
                      <span>{new Date(match.startTime).toLocaleString('ko-KR')}</span>
                      <span>· {match.venue}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <select
                      value={match.division ?? 'auto'}
                      onChange={(e) =>
                        actions.updateMatch(match.id, {
                          division: e.target.value === 'auto' ? undefined : (e.target.value as LeagueDivision),
                        })
                      }
                      style={{
                        ...inputStyle,
                        width: '130px',
                        padding: '8px 10px',
                        background: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      <option value="auto">구분: 자동</option>
                      <option value="EUTTEUM">으뜸</option>
                      <option value="BEOGEUM">버금</option>
                    </select>
                    {(['scheduled', 'inProgress', 'completed', 'canceled'] as MatchStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => actions.updateMatch(match.id, { status })}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: match.status === status ? '1px solid #f97316' : '1px solid rgba(148,163,184,0.35)',
                          background: match.status === status ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.04)',
                          color: match.status === status ? '#f97316' : '#cbd5e1',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {statusText[status]}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('이 경기를 삭제하시겠습니까?')) actions.deleteMatch(match.id);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(239,68,68,0.7)',
                        background: 'rgba(248,113,113,0.12)',
                        color: '#fca5a5',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '8px',
                    padding: '8px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(148,163,184,0.25)',
                  }}
                >
                  <input
                    defaultValue={match.homeTeamName}
                    placeholder="홈 팀 이름"
                    style={inputStyle}
                    onBlur={(e) => actions.updateMatch(match.id, { homeTeamName: e.target.value })}
                  />
                  <input
                    defaultValue={match.awayTeamName}
                    placeholder="원정 팀 이름"
                    style={inputStyle}
                    onBlur={(e) => actions.updateMatch(match.id, { awayTeamName: e.target.value })}
                  />
                  <input
                    type="datetime-local"
                    defaultValue={toLocalInputValue(match.startTime)}
                    style={inputStyle}
                    onBlur={(e) => {
                      const iso = toIsoString(e.target.value);
                      if (iso) actions.updateMatch(match.id, { startTime: iso });
                    }}
                  />
                  <input
                    defaultValue={match.venue}
                    placeholder="구장"
                    style={inputStyle}
                    onBlur={(e) => actions.updateMatch(match.id, { venue: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    defaultValue={match.homeScore ?? ''}
                    placeholder="홈 점수"
                    style={inputStyle}
                    onBlur={(e) => actions.updateMatch(match.id, { homeScore: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    min={0}
                    defaultValue={match.awayScore ?? ''}
                    placeholder="원정 점수"
                    style={inputStyle}
                    onBlur={(e) => actions.updateMatch(match.id, { awayScore: Number(e.target.value) })}
                  />
                  <input
                    defaultValue={match.notes ?? ''}
                    placeholder="메모"
                    style={inputStyle}
                    onBlur={(e) => actions.updateMatch(match.id, { notes: e.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        style={{
          border: '1px solid rgba(148,163,184,0.25)',
          borderRadius: '16px',
          padding: '14px',
          background: 'rgba(15,23,42,0.7)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>메모 추가</h2>
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>업데이트하면 리스트에 즉시 반영됩니다.</span>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          {upcoming.map((match) => (
            <div
              key={`${match.id}-note`}
              style={{
                border: '1px dashed rgba(148,163,184,0.35)',
                borderRadius: '12px',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: '6px',
              }}
            >
              <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                {match.homeTeamName} vs {match.awayTeamName}
              </span>
              <input
                defaultValue={match.notes ?? ''}
                placeholder="메모를 입력하세요"
                style={inputStyle}
                onBlur={(e) => actions.updateMatch(match.id, { notes: e.target.value })}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
