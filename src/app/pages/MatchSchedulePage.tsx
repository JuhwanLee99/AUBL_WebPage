import type { CSSProperties, FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule, MatchStatus } from '../../shared/state/demoStore';

const emptyForm = {
  homeTeamName: '',
  awayTeamName: '',
  startTime: '',
  venue: '',
  status: 'scheduled' as MatchStatus,
  homeScore: '',
  awayScore: '',
  homeLineup: '',
  awayLineup: '',
  notes: '',
};

function toIsoString(value: string) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function formatDateTimeLabel(value: string) {
  if (!value) return '미정';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return value;
  }
}

function parseLineup(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [name, pos = 'UT', number = ''] = line.split(',').map((part) => part.trim());
    return {
      name: name || '미정',
      pos: pos || 'UT',
      number: number || '',
      throws: 'R',
      bats: 'R',
    };
  });
}

function extractDateParts(value: string) {
  if (!value) return { date: '', hour: '', minute: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', hour: '', minute: '' };
  return {
    date: date.toISOString().slice(0, 10),
    hour: String(date.getHours()).padStart(2, '0'),
    minute: String(date.getMinutes()).padStart(2, '0'),
  };
}

function buildDateTimeIso(date: string, hour: string, minute: string) {
  if (!date) return '';
  const safeHour = hour ? hour.padStart(2, '0') : '00';
  const safeMinute = minute ? minute.padStart(2, '0') : '00';
  return toIsoString(`${date}T${safeHour}:${safeMinute}:00`);
}

function formatLineupText(lineups?: MatchSchedule['lineups']) {
  if (!lineups) return '';
  return lineups.home
    .map((player) => `${player.name}, ${player.pos}, ${player.number ?? ''}`.trim())
    .join('\n');
}

function formatAwayLineupText(lineups?: MatchSchedule['lineups']) {
  if (!lineups) return '';
  return lineups.away
    .map((player) => `${player.name}, ${player.pos}, ${player.number ?? ''}`.trim())
    .join('\n');
}

function statusLabel(status: MatchStatus) {
  switch (status) {
    case 'completed':
      return { text: '경기 종료', color: '#f97316', background: 'rgba(249,115,22,0.15)' };
    case 'inProgress':
      return { text: '진행 중', color: '#38bdf8', background: 'rgba(56,189,248,0.15)' };
    default:
      return { text: '예정', color: '#22c55e', background: 'rgba(34,197,94,0.15)' };
  }
}

export default function MatchSchedulePage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editingHomeLineup, setEditingHomeLineup] = useState('');
  const [editingAwayLineup, setEditingAwayLineup] = useState('');

  const startTimeParts = useMemo(() => extractDateParts(form.startTime), [form.startTime]);
  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')), []);
  const minuteOptions = useMemo(
    () => Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')),
    [],
  );

  const updateStartTime = (updates: Partial<{ date: string; hour: string; minute: string }>) => {
    setForm((prev) => {
      const current = extractDateParts(prev.startTime);
      const nextDate = updates.date ?? current.date;
      const nextHour = updates.hour ?? current.hour;
      const nextMinute = updates.minute ?? current.minute;
      const startTime = nextDate ? buildDateTimeIso(nextDate, nextHour, nextMinute) : '';
      return { ...prev, startTime };
    });
  };

  const sortedMatches = useMemo(() => {
    return [...state.matches].sort((a, b) => {
      const aTime = new Date(a.startTime).getTime();
      const bTime = new Date(b.startTime).getTime();
      const safeATime = Number.isNaN(aTime) ? 0 : aTime;
      const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
      return safeATime - safeBTime;
    });
  }, [state.matches]);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const homeLineup = form.homeLineup.trim();
    const awayLineup = form.awayLineup.trim();
    const lineups = homeLineup || awayLineup ? { home: parseLineup(homeLineup), away: parseLineup(awayLineup) } : undefined;
    const match: MatchSchedule = {
      id: `match-${Date.now()}`,
      homeTeamName: form.homeTeamName || '홈팀',
      awayTeamName: form.awayTeamName || '원정팀',
      startTime: toIsoString(form.startTime),
      venue: form.venue || '미정',
      status: form.status,
      homeScore: form.status === 'completed' ? Number(form.homeScore || 0) : null,
      awayScore: form.status === 'completed' ? Number(form.awayScore || 0) : null,
      lineups,
      notes: form.notes || undefined,
    };
    actions.addMatch(match);
    setForm(emptyForm);
    setShowForm(false);
  };

  const handleEditLineups = (match: MatchSchedule) => {
    setEditingMatchId(match.id);
    setEditingHomeLineup(formatLineupText(match.lineups));
    setEditingAwayLineup(formatAwayLineupText(match.lineups));
  };

  const handleSaveLineups = (matchId: string) => {
    actions.saveMatchLineups(matchId, {
      home: parseLineup(editingHomeLineup),
      away: parseLineup(editingAwayLineup),
    });
    setEditingMatchId(null);
    setEditingHomeLineup('');
    setEditingAwayLineup('');
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px' }}>경기 일정 및 결과</h1>
          <p style={{ color: '#94a3b8' }}>경기 일정, 결과, 라인업 사전 저장을 한 곳에서 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          style={{
            borderRadius: '999px',
            padding: '10px 18px',
            border: '1px solid rgba(148,163,184,0.4)',
            background: showForm ? 'rgba(148,163,184,0.2)' : 'linear-gradient(90deg, #f97316, #f59e0b)',
            color: showForm ? '#e2e8f0' : '#0b0f1a',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {showForm ? '추가 폼 닫기' : '경기 추가'}
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={handleFormSubmit}
          style={{
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid rgba(148,163,184,0.3)',
            background: '#0b0f1a',
            display: 'grid',
            gap: '16px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
              홈 팀
              <input
                value={form.homeTeamName}
                onChange={(event) => setForm((prev) => ({ ...prev, homeTeamName: event.target.value }))}
                placeholder="홈 팀 이름"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
              원정 팀
              <input
                value={form.awayTeamName}
                onChange={(event) => setForm((prev) => ({ ...prev, awayTeamName: event.target.value }))}
                placeholder="원정 팀 이름"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
              경기 일시
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr 0.8fr',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                <input
                  type="date"
                  value={startTimeParts.date}
                  onChange={(event) => updateStartTime({ date: event.target.value })}
                  style={inputStyle}
                />
                <select
                  value={startTimeParts.hour}
                  onChange={(event) => updateStartTime({ hour: event.target.value })}
                  style={inputStyle}
                >
                  <option value="">시 선택</option>
                  {hourOptions.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}시
                    </option>
                  ))}
                </select>
                <select
                  value={startTimeParts.minute}
                  onChange={(event) => updateStartTime({ minute: event.target.value })}
                  style={inputStyle}
                >
                  <option value="">분 선택</option>
                  {minuteOptions.map((minute) => (
                    <option key={minute} value={minute}>
                      {minute}분
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
              구장
              <input
                value={form.venue}
                onChange={(event) => setForm((prev) => ({ ...prev, venue: event.target.value }))}
                placeholder="경기장 이름"
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
              상태
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MatchStatus }))}
                style={inputStyle}
              >
                <option value="scheduled">경기 예정</option>
                <option value="completed">경기 종료</option>
              </select>
            </label>
            {form.status === 'completed' && (
              <>
                <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
                  홈 점수
                  <input
                    type="number"
                    min={0}
                    value={form.homeScore}
                    onChange={(event) => setForm((prev) => ({ ...prev, homeScore: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
                  원정 점수
                  <input
                    type="number"
                    min={0}
                    value={form.awayScore}
                    onChange={(event) => setForm((prev) => ({ ...prev, awayScore: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
              </>
            )}
          </div>

          {form.status === 'scheduled' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
                홈 라인업(선택)
                <textarea
                  rows={5}
                  value={form.homeLineup}
                  onChange={(event) => setForm((prev) => ({ ...prev, homeLineup: event.target.value }))}
                  placeholder="예) 김지찬, 2B, 1"
                  style={textareaStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
                원정 라인업(선택)
                <textarea
                  rows={5}
                  value={form.awayLineup}
                  onChange={(event) => setForm((prev) => ({ ...prev, awayLineup: event.target.value }))}
                  placeholder="예) 정수빈, CF, 31"
                  style={textareaStyle}
                />
              </label>
            </div>
          )}

          <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
            메모
            <input
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="추가 메모"
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="submit" style={primaryButtonStyle}>
              경기 저장
            </button>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gap: '16px' }}>
        {sortedMatches.map((match) => {
          const badge = statusLabel(match.status);
          const isActive = state.activeMatchId === match.id;
          return (
            <div
              key={match.id}
              style={{
                borderRadius: '16px',
                border: isActive ? '1px solid rgba(249,115,22,0.6)' : '1px solid rgba(148,163,184,0.3)',
                padding: '16px',
                background: 'rgba(15,23,42,0.6)',
                display: 'grid',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800 }}>
                      {match.homeTeamName} vs {match.awayTeamName}
                    </span>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        color: badge.color,
                        background: badge.background,
                        fontSize: '12px',
                        fontWeight: 800,
                      }}
                    >
                      {badge.text}
                    </span>
                    {isActive && <span style={{ fontSize: '12px', color: '#f97316' }}>선택됨</span>}
                  </div>
                  <div style={{ color: '#94a3b8', marginTop: '4px', fontSize: '13px' }}>
                    {formatDateTimeLabel(match.startTime)} · {match.venue}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {match.status === 'completed' && (
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                      결과: {match.homeScore ?? 0} - {match.awayScore ?? 0}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      actions.selectMatch(match.id);
                      navigate('/scorekeeper');
                    }}
                    style={secondaryButtonStyle}
                  >
                    기록 선택
                  </button>
                  <button type="button" onClick={() => handleEditLineups(match)} style={secondaryButtonStyle}>
                    라인업 편집
                  </button>
                </div>
              </div>

              {match.notes && <div style={{ color: '#cbd5e1', fontSize: '13px' }}>메모: {match.notes}</div>}

              {editingMatchId === match.id && (
                <div
                  style={{
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.3)',
                    padding: '12px',
                    display: 'grid',
                    gap: '12px',
                    background: '#0b0f1a',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                    <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
                      홈 라인업
                      <textarea
                        rows={5}
                        value={editingHomeLineup}
                        onChange={(event) => setEditingHomeLineup(event.target.value)}
                        style={textareaStyle}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
                      원정 라인업
                      <textarea
                        rows={5}
                        value={editingAwayLineup}
                        onChange={(event) => setEditingAwayLineup(event.target.value)}
                        style={textareaStyle}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={() => setEditingMatchId(null)} style={secondaryButtonStyle}>
                      취소
                    </button>
                    <button type="button" onClick={() => handleSaveLineups(match.id)} style={primaryButtonStyle}>
                      라인업 저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.4)',
  padding: '10px 12px',
  background: 'rgba(15,23,42,0.8)',
  color: '#e2e8f0',
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: 'inherit',
};

const primaryButtonStyle: CSSProperties = {
  borderRadius: '999px',
  padding: '10px 18px',
  border: 'none',
  background: 'linear-gradient(90deg, #f97316, #f59e0b)',
  color: '#0b0f1a',
  fontWeight: 800,
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  borderRadius: '999px',
  padding: '8px 14px',
  border: '1px solid rgba(148,163,184,0.4)',
  background: 'rgba(148,163,184,0.15)',
  color: '#e2e8f0',
  fontWeight: 700,
  cursor: 'pointer',
};
