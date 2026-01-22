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

type Side = 'home' | 'away';
type PlayerSlot = NonNullable<MatchSchedule['lineups']>['home'][number];

const defaultPlayerSlot: PlayerSlot = {
  name: '',
  pos: '',
  number: '',
  throws: 'R',
  bats: 'R',
};

const createEmptyLineup = (): PlayerSlot[] => [
  ...Array.from({ length: 9 }, () => ({ ...defaultPlayerSlot })),
  { ...defaultPlayerSlot, pos: 'P' },
];

const createEmptyBenchInput = () => ({
  name: '',
  pos: '',
  number: '',
  throws: 'R',
  bats: 'R',
});

const normalizeLineupForEditing = (lineup?: PlayerSlot[]) => {
  const base = lineup?.length ? lineup.map((slot) => ({ ...defaultPlayerSlot, ...slot })) : createEmptyLineup();
  const filled = [...base];
  const hasPitcher = filled.some((slot) => slot.pos.toUpperCase() === 'P');
  while (filled.length < 10) {
    filled.push({ ...defaultPlayerSlot });
  }
  if (!hasPitcher) {
    filled.push({ ...defaultPlayerSlot, pos: 'P' });
  }
  return filled;
};

const normalizeBenchForEditing = (bench?: PlayerSlot[]) =>
  bench?.length ? bench.map((player) => ({ ...defaultPlayerSlot, ...player })) : [];

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

function formatTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시간 미정';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
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

const positionOptions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF', 'IF', 'PH', 'PR'];

const filterPositionOptions = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return positionOptions;
  return positionOptions.filter((option) => option.includes(normalized));
};

const hasMeaningfulPlayerData = (player: PlayerSlot) => {
  const name = player.name.trim();
  const number = player.number.trim();
  const pos = player.pos.trim().toUpperCase();
  if (name || number) return true;
  return pos !== '' && pos !== 'P';
};

const normalizePlayerSlot = (player: PlayerSlot): PlayerSlot => ({
  name: player.name.trim() || '미정',
  pos: player.pos.trim() || 'UT',
  number: player.number.trim(),
  throws: player.throws || 'R',
  bats: player.bats || 'R',
});

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

const getSafeTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export default function MatchSchedulePage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formLineups, setFormLineups] = useState<{ home: PlayerSlot[]; away: PlayerSlot[] }>(() => ({
    home: createEmptyLineup(),
    away: createEmptyLineup(),
  }));
  const [formBenches, setFormBenches] = useState<{ home: PlayerSlot[]; away: PlayerSlot[] }>(() => ({
    home: [],
    away: [],
  }));
  const [benchInputs, setBenchInputs] = useState(() => ({
    home: createEmptyBenchInput(),
    away: createEmptyBenchInput(),
  }));
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editingLineups, setEditingLineups] = useState<{ home: PlayerSlot[]; away: PlayerSlot[] }>(() => ({
    home: createEmptyLineup(),
    away: createEmptyLineup(),
  }));
  const [editingBenches, setEditingBenches] = useState<{ home: PlayerSlot[]; away: PlayerSlot[] }>(() => ({
    home: [],
    away: [],
  }));
  const [editingBenchInputs, setEditingBenchInputs] = useState(() => ({
    home: createEmptyBenchInput(),
    away: createEmptyBenchInput(),
  }));
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

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
    return [...state.matches].sort((a, b) => getSafeTime(a.startTime) - getSafeTime(b.startTime));
  }, [state.matches]);

  const categorizedMatches = useMemo(() => {
    const now = Date.now();
    const live = sortedMatches.filter((match) => match.status === 'inProgress');
    const upcoming = sortedMatches.filter(
      (match) => match.status === 'scheduled' && getSafeTime(match.startTime) >= now,
    );
    const past = sortedMatches.filter(
      (match) =>
        match.status === 'completed' || (match.status === 'scheduled' && match.status !== 'inProgress' && getSafeTime(match.startTime) < now),
    );
    return { live, upcoming, past };
  }, [sortedMatches]);

  const calendarWeeks = useMemo(() => {
    const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1);
    const firstWeekday = firstDay.getDay(); // 0=일요일
    const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(firstWeekday).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      week.push(day);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [calendarMonth]);

  const matchesByDay = useMemo(() => {
    const map: Record<number, MatchSchedule[]> = {};
    sortedMatches.forEach((match) => {
      const date = new Date(match.startTime);
      if (Number.isNaN(date.getTime())) return;
      if (date.getFullYear() !== calendarMonth.year || date.getMonth() !== calendarMonth.month) return;
      const day = date.getDate();
      map[day] = map[day] ? [...map[day], match] : [match];
    });
    Object.values(map).forEach((list) => list.sort((a, b) => getSafeTime(a.startTime) - getSafeTime(b.startTime)));
    return map;
  }, [sortedMatches, calendarMonth]);

  const calendarLabel = useMemo(
    () => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(new Date(calendarMonth.year, calendarMonth.month, 1)),
    [calendarMonth],
  );

  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  const isToday = (day: number | null) => {
    if (!day) return false;
    const today = new Date();
    return today.getFullYear() === calendarMonth.year && today.getMonth() === calendarMonth.month && today.getDate() === day;
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const homeLineup = form.homeLineup.trim();
    const awayLineup = form.awayLineup.trim();
    const lineupsFromText =
      homeLineup || awayLineup ? { home: parseLineup(homeLineup), away: parseLineup(awayLineup) } : undefined;
    const trimmedLineups = form.status === 'scheduled'
      ? {
          home: formLineups.home.filter(hasMeaningfulPlayerData).map(normalizePlayerSlot),
          away: formLineups.away.filter(hasMeaningfulPlayerData).map(normalizePlayerSlot),
        }
      : undefined;
    const trimmedBenches = form.status === 'scheduled'
      ? {
          home: formBenches.home.filter((player) => player.name.trim()).map(normalizePlayerSlot),
          away: formBenches.away.filter((player) => player.name.trim()).map(normalizePlayerSlot),
        }
      : undefined;
    const hasStructuredLineups = Boolean(trimmedLineups?.home.length || trimmedLineups?.away.length);
    const hasStructuredBenches = Boolean(trimmedBenches?.home.length || trimmedBenches?.away.length);
    const match: MatchSchedule = {
      id: `match-${Date.now()}`,
      homeTeamName: form.homeTeamName || '홈팀',
      awayTeamName: form.awayTeamName || '원정팀',
      startTime: toIsoString(form.startTime),
      venue: form.venue || '미정',
      status: form.status,
      homeScore: form.status === 'completed' ? Number(form.homeScore || 0) : null,
      awayScore: form.status === 'completed' ? Number(form.awayScore || 0) : null,
      lineups: hasStructuredLineups ? trimmedLineups : lineupsFromText,
      benches: hasStructuredBenches ? trimmedBenches : undefined,
      notes: form.notes || undefined,
    };
    actions.addMatch(match);
    setForm(emptyForm);
    setFormLineups({ home: createEmptyLineup(), away: createEmptyLineup() });
    setFormBenches({ home: [], away: [] });
    setBenchInputs({ home: createEmptyBenchInput(), away: createEmptyBenchInput() });
    setShowForm(false);
  };

  const handleEditLineups = (match: MatchSchedule) => {
    setEditingLineups({
      home: normalizeLineupForEditing(match.lineups?.home),
      away: normalizeLineupForEditing(match.lineups?.away),
    });
    setEditingBenches({
      home: normalizeBenchForEditing(match.benches?.home),
      away: normalizeBenchForEditing(match.benches?.away),
    });
    setEditingBenchInputs({ home: createEmptyBenchInput(), away: createEmptyBenchInput() });
    setEditingMatchId(match.id);
  };

  const resetEditingState = () => {
    setEditingMatchId(null);
    setEditingLineups({ home: createEmptyLineup(), away: createEmptyLineup() });
    setEditingBenches({ home: [], away: [] });
    setEditingBenchInputs({ home: createEmptyBenchInput(), away: createEmptyBenchInput() });
  };

  const handleSaveLineups = (matchId: string) => {
    const trimmedLineups = {
      home: editingLineups.home.filter(hasMeaningfulPlayerData).map(normalizePlayerSlot),
      away: editingLineups.away.filter(hasMeaningfulPlayerData).map(normalizePlayerSlot),
    };
    const trimmedBenches = {
      home: editingBenches.home.filter((player) => player.name.trim()).map(normalizePlayerSlot),
      away: editingBenches.away.filter((player) => player.name.trim()).map(normalizePlayerSlot),
    };
    actions.saveMatchLineups(matchId, trimmedLineups, trimmedBenches);
    resetEditingState();
  };

  const renderMatchCard = (match: MatchSchedule) => {
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
              <ScheduleLineupEditor
                label="홈 라인업 & 후보"
                side="home"
                lineup={editingLineups.home}
                bench={editingBenches.home}
                benchInput={editingBenchInputs.home}
                onSetLineup={(side, index, updates) =>
                  setEditingLineups((prev) => ({
                    ...prev,
                    [side]: prev[side].map((slot, idx) => (idx === index ? { ...slot, ...updates } : slot)),
                  }))
                }
                onChangeBenchInput={(side, updates) =>
                  setEditingBenchInputs((prev) => ({ ...prev, [side]: { ...prev[side], ...updates } }))
                }
                onAddBench={(side, player) => setEditingBenches((prev) => ({ ...prev, [side]: [...prev[side], player] }))}
                onRemoveBench={(side, index) =>
                  setEditingBenches((prev) => ({ ...prev, [side]: prev[side].filter((_, idx) => idx !== index) }))
                }
              />
              <ScheduleLineupEditor
                label="원정 라인업 & 후보"
                side="away"
                lineup={editingLineups.away}
                bench={editingBenches.away}
                benchInput={editingBenchInputs.away}
                onSetLineup={(side, index, updates) =>
                  setEditingLineups((prev) => ({
                    ...prev,
                    [side]: prev[side].map((slot, idx) => (idx === index ? { ...slot, ...updates } : slot)),
                  }))
                }
                onChangeBenchInput={(side, updates) =>
                  setEditingBenchInputs((prev) => ({ ...prev, [side]: { ...prev[side], ...updates } }))
                }
                onAddBench={(side, player) => setEditingBenches((prev) => ({ ...prev, [side]: [...prev[side], player] }))}
                onRemoveBench={(side, index) =>
                  setEditingBenches((prev) => ({ ...prev, [side]: prev[side].filter((_, idx) => idx !== index) }))
                }
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={resetEditingState} style={secondaryButtonStyle}>
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
  };

  const renderSection = (title: string, matches: MatchSchedule[], emptyText: string) => (
    <section
      style={{
        border: '1px solid rgba(148,163,184,0.2)',
        borderRadius: '14px',
        padding: '12px',
        background: 'rgba(15,23,42,0.4)',
        display: 'grid',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 900, fontSize: '17px', color: '#e2e8f0' }}>{title}</span>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: '999px',
              background: 'rgba(148,163,184,0.16)',
              color: '#cbd5e1',
              fontWeight: 800,
              fontSize: '12px',
            }}
          >
            {matches.length} 경기
          </span>
        </div>
      </div>
      {matches.length ? (
        <div style={{ display: 'grid', gap: '12px' }}>{matches.map(renderMatchCard)}</div>
      ) : (
        <div
          style={{
            borderRadius: '12px',
            padding: '14px',
            background: 'rgba(255,255,255,0.02)',
            color: '#94a3b8',
            fontWeight: 700,
          }}
        >
          {emptyText}
        </div>
      )}
    </section>
  );

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
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                <ScheduleLineupEditor
                  label="홈 라인업 & 후보"
                  side="home"
                  lineup={formLineups.home}
                  bench={formBenches.home}
                  benchInput={benchInputs.home}
                  onSetLineup={(side, index, updates) =>
                    setFormLineups((prev) => ({
                      ...prev,
                      [side]: prev[side].map((slot, idx) => (idx === index ? { ...slot, ...updates } : slot)),
                    }))
                  }
                  onChangeBenchInput={(side, updates) =>
                    setBenchInputs((prev) => ({ ...prev, [side]: { ...prev[side], ...updates } }))
                  }
                  onAddBench={(side, player) =>
                    setFormBenches((prev) => ({ ...prev, [side]: [...prev[side], player] }))
                  }
                  onRemoveBench={(side, index) =>
                    setFormBenches((prev) => ({ ...prev, [side]: prev[side].filter((_, idx) => idx !== index) }))
                  }
                />
                <ScheduleLineupEditor
                  label="원정 라인업 & 후보"
                  side="away"
                  lineup={formLineups.away}
                  bench={formBenches.away}
                  benchInput={benchInputs.away}
                  onSetLineup={(side, index, updates) =>
                    setFormLineups((prev) => ({
                      ...prev,
                      [side]: prev[side].map((slot, idx) => (idx === index ? { ...slot, ...updates } : slot)),
                    }))
                  }
                  onChangeBenchInput={(side, updates) =>
                    setBenchInputs((prev) => ({ ...prev, [side]: { ...prev[side], ...updates } }))
                  }
                  onAddBench={(side, player) =>
                    setFormBenches((prev) => ({ ...prev, [side]: [...prev[side], player] }))
                  }
                  onRemoveBench={(side, index) =>
                    setFormBenches((prev) => ({ ...prev, [side]: prev[side].filter((_, idx) => idx !== index) }))
                  }
                />
              </div>
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

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: '14px',
          padding: '12px',
          background: 'rgba(15,23,42,0.35)',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <span style={{ fontWeight: 800, color: '#e2e8f0' }}>구분된 일정 보기</span>
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>
            진행 상태별 섹션과 달력 뷰 중 원하는 방식으로 확인하세요.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(['list', 'calendar'] as const).map((mode) => {
            const isActive = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: isActive ? '1px solid rgba(249,115,22,0.7)' : '1px solid rgba(148,163,184,0.3)',
                  background: isActive ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.02)',
                  color: isActive ? '#f97316' : '#cbd5e1',
                  fontWeight: 800,
                  cursor: 'pointer',
                  minWidth: '110px',
                }}
              >
                {mode === 'list' ? '목록 보기' : '달력 보기'}
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === 'list' ? (
        <div style={{ display: 'grid', gap: '14px' }}>
          {renderSection('진행 중 경기', categorizedMatches.live, '현재 진행 중인 경기가 없습니다.')}
          {renderSection('예정된 경기', categorizedMatches.upcoming, '예정된 경기가 없습니다.')}
          {renderSection('종료된 경기', categorizedMatches.past, '지난 경기가 없습니다.')}
        </div>
      ) : (
        <div
          style={{
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: '14px',
            padding: '14px',
            background: 'rgba(15,23,42,0.35)',
            display: 'grid',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: '2px' }}>
              <span style={{ fontWeight: 900, color: '#e2e8f0', fontSize: '18px' }}>{calendarLabel}</span>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                날짜별 예정·진행·종료 경기를 한눈에 확인하세요.
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((prev) => ({
                    year: prev.month === 0 ? prev.year - 1 : prev.year,
                    month: prev.month === 0 ? 11 : prev.month - 1,
                  }))
                }
                style={secondaryButtonStyle}
              >
                이전 달
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((prev) => ({
                    year: prev.month === 11 ? prev.year + 1 : prev.year,
                    month: prev.month === 11 ? 0 : prev.month + 1,
                  }))
                }
                style={secondaryButtonStyle}
              >
                다음 달
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setCalendarMonth({ year: today.getFullYear(), month: today.getMonth() });
                }}
                style={secondaryButtonStyle}
              >
                이번 달
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', textAlign: 'center', color: '#94a3b8', fontWeight: 800 }}>
            {weekdayLabels.map((label) => (
              <div key={label} style={{ padding: '6px 0' }}>
                {label}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: '6px' }}>
            {calendarWeeks.map((week, weekIdx) => (
              <div key={`${weekIdx}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                {week.map((day, dayIdx) => {
                  const dayMatches = day ? matchesByDay[day] ?? [] : [];
                  const todayMark = isToday(day);
                  return (
                    <div
                      key={`${weekIdx}-${dayIdx}`}
                      style={{
                        minHeight: '110px',
                        borderRadius: '12px',
                        border: todayMark ? '1px solid rgba(249,115,22,0.7)' : '1px solid rgba(148,163,184,0.2)',
                        background: todayMark ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.02)',
                        padding: '10px',
                        display: 'grid',
                        gap: '6px',
                        alignContent: 'start',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#e2e8f0', fontWeight: 800 }}>{day ?? ''}</span>
                        {todayMark && <span style={{ color: '#f97316', fontSize: '11px', fontWeight: 800 }}>오늘</span>}
                      </div>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        {dayMatches.map((match) => {
                          const badge = statusLabel(match.status);
                          return (
                            <button
                              key={match.id}
                              type="button"
                              onClick={() => {
                                actions.selectMatch(match.id);
                                navigate('/scorekeeper');
                              }}
                              style={{
                                textAlign: 'left',
                                border: '1px solid rgba(148,163,184,0.25)',
                                borderRadius: '10px',
                                padding: '8px',
                                background: 'rgba(15,23,42,0.7)',
                                color: '#e2e8f0',
                                cursor: 'pointer',
                                display: 'grid',
                                gap: '4px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, fontSize: '13px' }}>
                                  {match.homeTeamName} vs {match.awayTeamName}
                                </span>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    background: badge.background,
                                    color: badge.color,
                                    fontWeight: 800,
                                    fontSize: '11px',
                                  }}
                                >
                                  {badge.text}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', color: '#94a3b8', fontSize: '12px' }}>
                                <span>{formatTimeLabel(match.startTime)}</span>
                                <span>· {match.venue}</span>
                              </div>
                              {match.status === 'completed' && (
                                <span style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '12px' }}>
                                  {match.homeScore ?? 0} - {match.awayScore ?? 0}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {!dayMatches.length && <span style={{ color: '#475569', fontSize: '12px' }}>경기 없음</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
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

function ScheduleLineupEditor({
  label,
  side,
  lineup,
  bench,
  benchInput,
  onSetLineup,
  onChangeBenchInput,
  onAddBench,
  onRemoveBench,
}: {
  label: string;
  side: Side;
  lineup: PlayerSlot[];
  bench: PlayerSlot[];
  benchInput: PlayerSlot;
  onSetLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) => void;
  onChangeBenchInput: (side: Side, updates: Partial<PlayerSlot>) => void;
  onAddBench: (side: Side, player: PlayerSlot) => void;
  onRemoveBench: (side: Side, index: number) => void;
}) {
  const lineupEntries = lineup.map((slot, idx) => ({ slot, idx }));
  const battingEntries = lineupEntries.filter((entry) => entry.slot.pos.toUpperCase() !== 'P');
  const pitcherEntry = lineupEntries.find((entry) => entry.slot.pos.toUpperCase() === 'P');
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <span style={{ fontWeight: 800, color: '#cbd5e1' }}>{label}</span>
      <div
        style={{
          background: '#0b0f1a',
          borderRadius: '12px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        {battingEntries.map((entry, orderIdx) => (
          <div
            key={entry.idx}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 85px 55px 50px 70px 70px',
              gap: '8px',
              alignItems: 'center',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid transparent',
              background: 'transparent',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ color: '#94a3b8', fontWeight: 800 }}>{orderIdx + 1}.</span>
            <input
              value={entry.slot.name}
              onChange={(e) => onSetLineup(side, entry.idx, { name: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
                width: '100%',
              }}
            />
            <input
              value={entry.slot.pos}
              onChange={(e) => onSetLineup(side, entry.idx, { pos: e.target.value })}
              list={`schedule-lineup-pos-${side}-${entry.idx}`}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            />
            <datalist id={`schedule-lineup-pos-${side}-${entry.idx}`}>
              {filterPositionOptions(entry.slot.pos).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              value={entry.slot.number}
              onChange={(e) => onSetLineup(side, entry.idx, { number: e.target.value })}
              placeholder="#"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            />
            <select
              value={entry.slot.throws}
              onChange={(e) => onSetLineup(side, entry.idx, { throws: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            >
              <option value="R">투 R</option>
              <option value="L">투 L</option>
            </select>
            <select
              value={entry.slot.bats}
              onChange={(e) => onSetLineup(side, entry.idx, { bats: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            >
              <option value="R">타 R</option>
              <option value="L">타 L</option>
            </select>
          </div>
        ))}
        <div
          style={{
            marginTop: '6px',
            padding: '10px',
            borderRadius: '10px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(255,255,255,0.03)',
            display: 'grid',
            gap: '6px',
          }}
        >
          <span style={{ fontWeight: 800, color: '#cbd5e1' }}>투수</span>
          {pitcherEntry ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '85px 50px 70px 70px 50px',
                gap: '8px',
                alignItems: 'center',
                padding: '4px',
                borderRadius: '10px',
                border: '1px solid transparent',
                background: 'transparent',
                boxSizing: 'border-box',
              }}
            >
              <input
                value={pitcherEntry.slot.name}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { name: e.target.value, pos: 'P' })}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              />
              <input
                value={pitcherEntry.slot.number}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { number: e.target.value })}
                placeholder="#"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              />
              <select
                value={pitcherEntry.slot.throws}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { throws: e.target.value })}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                <option value="R">투 R</option>
                <option value="L">투 L</option>
              </select>
              <select
                value={pitcherEntry.slot.bats}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { bats: e.target.value })}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                <option value="R">타 R</option>
                <option value="L">타 L</option>
              </select>
              <input
                value="P"
                readOnly
                style={{
                  background: 'rgba(15,23,42,0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#94a3b8',
                  fontWeight: 800,
                  textAlign: 'center',
                }}
              />
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>투수 미지정</span>
          )}
        </div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          border: '1px dashed rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={benchInput.name}
            placeholder="후보 이름"
            onChange={(e) => onChangeBenchInput(side, { name: e.target.value })}
            style={{
              flex: 1,
              minWidth: '120px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <input
            value={benchInput.number}
            placeholder="등번호"
            onChange={(e) => onChangeBenchInput(side, { number: e.target.value })}
            style={{
              width: '70px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <input
            value={benchInput.pos}
            placeholder="포지션"
            onChange={(e) => onChangeBenchInput(side, { pos: e.target.value })}
            list={`schedule-bench-pos-${side}`}
            style={{
              width: '90px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <datalist id={`schedule-bench-pos-${side}`}>
            {filterPositionOptions(benchInput.pos).map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <select
            value={benchInput.throws}
            onChange={(e) => onChangeBenchInput(side, { throws: e.target.value })}
            style={{
              width: '100px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          >
            <option value="R">투 R</option>
            <option value="L">투 L</option>
          </select>
          <select
            value={benchInput.bats}
            onChange={(e) => onChangeBenchInput(side, { bats: e.target.value })}
            style={{
              width: '100px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          >
            <option value="R">타 R</option>
            <option value="L">타 L</option>
          </select>
          <button
            type="button"
            onClick={() => {
              if (!benchInput.name.trim()) return;
              onAddBench(side, {
                name: benchInput.name,
                pos: benchInput.pos || 'PH',
                number: benchInput.number,
                throws: benchInput.throws,
                bats: benchInput.bats,
              });
              onChangeBenchInput(side, createEmptyBenchInput());
            }}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(255,255,255,0.08)',
              color: '#cbd5e1',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            후보 추가
          </button>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {bench.map((player, benchIdx) => (
            <div
              key={`${player.name}-${benchIdx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '10px',
                padding: '8px 10px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <div style={{ display: 'grid', gap: '2px' }}>
                <span style={{ fontWeight: 800 }}>{player.name}</span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>
                  #{player.number || '--'} · {player.pos} · 투 {player.throws} / 타 {player.bats}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveBench(side, benchIdx)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid rgba(239,68,68,0.45)',
                  background: 'rgba(248,113,113,0.08)',
                  color: '#fca5a5',
                  fontWeight: 900,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
