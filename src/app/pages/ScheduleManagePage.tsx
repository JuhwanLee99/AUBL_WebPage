import type React from 'react';
import { useMemo, useState } from 'react';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchStatus, MatchSchedule, PlayerSlot } from '../../shared/state/demoStore';
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

const formatRemaining = (purgeAt: number) => {
  const diff = purgeAt - Date.now();
  if (diff <= 0) return '만료됨';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  if (days > 0) return `${days}일 ${hours}시간 후 삭제`;
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return `${hours}시간 ${minutes}분 후 삭제`;
};

// 더미 라인업 생성 (더미 일정 전용)
const DUMMY_NAMES = [
  '김민수', '이정훈', '박준호', '최승우', '정대현',
  '강현우', '윤성민', '장우진', '임태양', '한지훈',
  '오승환', '신동욱', '황재민', '배성훈', '조영준',
  '서진우', '유현석', '문정호', '권도윤', '안재현',
];

const generateDummyLineup = (): PlayerSlot[] => {
  const positions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const shuffledNames = [...DUMMY_NAMES].sort(() => Math.random() - 0.5);

  const lineup: PlayerSlot[] = positions.map((pos, idx) => ({
    name: shuffledNames[idx],
    pos,
    number: String(Math.floor(Math.random() * 99) + 1),
    throws: Math.random() > 0.2 ? 'R' : 'L',
    bats: Math.random() > 0.3 ? 'R' : 'L',
  }));

  // 투수 추가 (10번째)
  lineup.push({
    name: shuffledNames[9],
    pos: 'P',
    number: String(Math.floor(Math.random() * 99) + 1),
    throws: Math.random() > 0.3 ? 'R' : 'L',
    bats: 'R',
  });

  return lineup;
};

const generateDummyBench = (): PlayerSlot[] => {
  const benchPositions = ['C', 'IF', 'OF', 'P', 'P'];
  const shuffledNames = [...DUMMY_NAMES].sort(() => Math.random() - 0.5).slice(10, 15);

  return benchPositions.map((pos, idx) => ({
    name: shuffledNames[idx] || `후보${idx + 1}`,
    pos,
    number: String(Math.floor(Math.random() * 99) + 1),
    throws: Math.random() > 0.3 ? 'R' : 'L',
    bats: Math.random() > 0.3 ? 'R' : 'L',
  }));
};

export default function ScheduleManagePage() {
  const { state, actions } = useDemoStore();
  const [showTrash, setShowTrash] = useState(false);

  const activeMatches = useMemo(() => state.matches.filter((m) => !m.deleted), [state.matches]);
  const trashedMatches = useMemo(() => state.matches.filter((m) => m.deleted), [state.matches]);

  const upcoming = useMemo(
    () => [...activeMatches].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [activeMatches],
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
      // 더미 라인업 추가
      lineups: {
        home: generateDummyLineup(),
        away: generateDummyLineup(),
      },
      benches: {
        home: generateDummyBench(),
        away: generateDummyBench(),
      },
    };
    actions.addMatch(match);
  };

  return (
    <>
      <style>
        {`
          input[type="datetime-local"]::-webkit-calendar-picker-indicator {
            filter: invert(1);
            cursor: pointer;
          }
        `}
      </style>
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
          <button
            type="button"
            onClick={() => {
              setShowTrash((prev) => !prev);
              setTimeout(() => document.getElementById('match-trash-bin')?.scrollIntoView({ behavior: 'smooth' }), 0);
            }}
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
            {showTrash ? '휴지통 접기' : '휴지통 열기'}
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
                        {match.awayTeamName} vs {match.homeTeamName}
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
                        if (window.confirm('이 경기를 휴지통으로 이동할까요?')) actions.moveMatchToTrash(match.id);
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
                      휴지통
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '130px 130px 190px 120px 1fr 1fr 1fr',
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
                    style={{
                      ...inputStyle,
                      colorScheme: 'dark',
                    }}
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
                {match.awayTeamName} vs {match.homeTeamName}
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

      {showTrash && (
        <section
          id="match-trash-bin"
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
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>휴지통 (복원/영구 삭제)</h2>
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>30일 보관 후 자동 삭제</span>
          </div>

          {trashedMatches.length ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              {trashedMatches.map((entry) => (
                <div
                  key={`trash-${entry.id}`}
                  style={{
                    border: '1px dashed rgba(148,163,184,0.35)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.02)',
                    display: 'grid',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                        {entry.awayTeamName} vs {entry.homeTeamName}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                        {new Date(entry.startTime).toLocaleString('ko-KR')} · {entry.venue}
                      </span>
                      <span style={{ color: '#fca5a5', fontSize: '12px' }}>
                        삭제됨: {entry.deletedAt ? new Date(entry.deletedAt).toLocaleString('ko-KR') : '알 수 없음'} · {formatRemaining(entry.purgeAt ?? 0)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => actions.restoreMatch(entry.id)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid rgba(34,197,94,0.6)',
                          background: 'rgba(34,197,94,0.12)',
                          color: '#4ade80',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        복원
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('이 경기를 영구 삭제할까요? (취소 불가)')) actions.purgeTrash(entry.id);
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
                        영구 삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: '12px',
                borderRadius: '12px',
                border: '1px dashed rgba(148,163,184,0.35)',
                background: 'rgba(255,255,255,0.02)',
                color: '#94a3b8',
                fontWeight: 700,
              }}
            >
              휴지통이 비어 있습니다.
            </div>
          )}
        </section>
      )}
      </div>
    </>
  );
}
