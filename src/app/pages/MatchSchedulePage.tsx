import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';
import type {
  MatchSchedule,
  MatchStatus,
  MatchRecordMode,
  PostGameRecord,
  PostGameBatterLine,
  PostGamePitcherLine,
} from '../../shared/state/demoStore';
import type { LeagueDivision } from '../../shared/types';
import { TEAMS } from '../../shared/lib/mockData';
import { useAdmin } from '../../shared/auth/useAdmin';

const emptyForm = {
  homeTeamName: '',
  awayTeamName: '',
  startTime: '',
  venue: '',
  status: 'scheduled' as MatchStatus,
  recordMode: 'official' as MatchRecordMode,
  division: 'auto' as 'auto' | LeagueDivision,
  homeScore: '',
  awayScore: '',
  homeLineup: '',
  awayLineup: '',
  notes: '',
};

type Side = 'home' | 'away';
type PlayerSlot = NonNullable<MatchSchedule['lineups']>['home'][number];
// [수정] 직접 타입 import 사용 (기존 infer 로직 제거)
type PostGamePitcher = PostGamePitcherLine;
type PostGameBatter = PostGameBatterLine;

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

const normalizeLineupForEditing = (lineup: PlayerSlot[] | undefined, mode: MatchRecordMode) => {
  if (mode === 'practice') {
    if (!lineup?.length) return createEmptyLineup();
    const filled = lineup.map((slot) => ({ ...defaultPlayerSlot, ...slot }));
    const hasTrailingPitcher = filled.length > 0 && filled[filled.length - 1].pos.toUpperCase() === 'P';
    const hasAnyPitcher = filled.some((slot) => slot.pos.toUpperCase() === 'P');
    if (!hasAnyPitcher || !hasTrailingPitcher) {
      filled.push({ ...defaultPlayerSlot, pos: 'P' });
    }
    return filled;
  }
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

const updateLineupSlot = (lineup: PlayerSlot[], index: number, updates: Partial<PlayerSlot>) => {
  const next = [...lineup];
  while (next.length <= index) next.push({ ...defaultPlayerSlot });
  next[index] = { ...next[index], ...updates };
  return next;
};

const addPracticeBatterSlot = (lineup: PlayerSlot[]) => {
  const next = [...lineup];
  let pitcherIndex = -1;
  for (let idx = next.length - 1; idx >= 0; idx -= 1) {
    if (next[idx].pos.toUpperCase() === 'P') {
      pitcherIndex = idx;
      break;
    }
  }
  if (pitcherIndex >= 0) {
    next.splice(pitcherIndex, 0, { ...defaultPlayerSlot });
    return next;
  }
  next.push({ ...defaultPlayerSlot });
  return next;
};

const normalizeLineupByMode = (lineup: PlayerSlot[], mode: MatchRecordMode) => {
  if (mode === 'practice') return lineup;
  return lineup.slice(0, 10);
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

const divisionStyles: Record<LeagueDivision, { label: string; color: string }> = {
  EUTTEUM: { label: '으뜸', color: '#4f46e5' },
  BEOGEUM: { label: '버금', color: '#10b981' },
};

const deriveDivision = (match: MatchSchedule): LeagueDivision | undefined => {
  if (match.division === 'EUTTEUM' || match.division === 'BEOGEUM') return match.division;
  const homeDiv = TEAMS.find((t) => t.id === match.homeTeamId)?.division;
  const awayDiv = TEAMS.find((t) => t.id === match.awayTeamId)?.division;
  if (homeDiv && awayDiv && homeDiv === awayDiv) return homeDiv;
  if (homeDiv && !awayDiv) return homeDiv;
  if (awayDiv && !homeDiv) return awayDiv;
  return undefined;
};

function extractDateParts(value: string) {
  if (!value) return { date: '', hour: '', minute: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', hour: '', minute: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    // date input은 로컬 캘린더 날짜를 써야 UTC 변환으로 하루가 밀리지 않는다.
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
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
    case 'canceled':
      return { text: '취소', color: '#94a3b8', background: 'rgba(148,163,184,0.18)' };
    default:
      return { text: '예정', color: '#22c55e', background: 'rgba(34,197,94,0.15)' };
  }
}

const deriveDisplayStatus = (match: MatchSchedule): MatchStatus => {
  if (match.status === 'completed' || match.status === 'inProgress' || match.status === 'canceled') return match.status;
  const startTime = getSafeTime(match.startTime);
  if (startTime > 0 && startTime < Date.now()) return 'completed';
  return 'scheduled';
};

const getSafeTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export default function MatchSchedulePage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  const canEdit = isAdmin;
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
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
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

  const aliveMatches = useMemo(() => state.matches.filter((m) => !m.deleted), [state.matches]);

  const sortedMatches = useMemo(() => {
    return [...aliveMatches].sort((a, b) => getSafeTime(a.startTime) - getSafeTime(b.startTime));
  }, [aliveMatches]);

  const categorizedMatches = useMemo(() => {
    const live = sortedMatches.filter((match) => match.status === 'inProgress');
    const upcoming = sortedMatches.filter(
      (match) => match.status === 'scheduled' && getSafeTime(match.startTime) >= nowTs,
    );
    // [수정] match.status === 'scheduled' 이면 'inProgress'일 수 없으므로 redundant check 제거
    const past = sortedMatches.filter(
      (match) =>
        match.status === 'completed' ||
        match.status === 'canceled' ||
        (match.status === 'scheduled' && getSafeTime(match.startTime) < nowTs),
    );
    return { live, upcoming, past };
  }, [sortedMatches, nowTs]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const showBlockedTooltip = (el: HTMLElement | null) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltip({
      text: '관리자 로그인이 필요합니다',
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  };

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
    if (!canEdit) return;
    const homeLineup = form.homeLineup.trim();
    const awayLineup = form.awayLineup.trim();
    const selectedDivision = form.division === 'auto' ? undefined : (form.division as LeagueDivision);
    const lineupsFromText =
      homeLineup || awayLineup ? { home: parseLineup(homeLineup), away: parseLineup(awayLineup) } : undefined;
    const trimmedLineups = form.status === 'scheduled'
      ? {
          home: normalizeLineupByMode(
            formLineups.home.filter(hasMeaningfulPlayerData).map(normalizePlayerSlot),
            form.recordMode,
          ),
          away: normalizeLineupByMode(
            formLineups.away.filter(hasMeaningfulPlayerData).map(normalizePlayerSlot),
            form.recordMode,
          ),
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
      recordMode: form.recordMode,
      division: selectedDivision,
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
    if (!canEdit) return;
    const mode = match.recordMode ?? 'official';
    setEditingLineups({
      home: normalizeLineupForEditing(match.lineups?.home, mode),
      away: normalizeLineupForEditing(match.lineups?.away, mode),
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
    if (!canEdit) return;
    const targetMatch = state.matches.find((match) => match.id === matchId);
    const mode = targetMatch?.recordMode ?? 'official';
    const trimmedLineups = {
      home: normalizeLineupByMode(
        editingLineups.home.filter(hasMeaningfulPlayerData).map(normalizePlayerSlot),
        mode,
      ),
      away: normalizeLineupByMode(
        editingLineups.away.filter(hasMeaningfulPlayerData).map(normalizePlayerSlot),
        mode,
      ),
    };
    const trimmedBenches = {
      home: editingBenches.home.filter((player) => player.name.trim()).map(normalizePlayerSlot),
      away: editingBenches.away.filter((player) => player.name.trim()).map(normalizePlayerSlot),
    };
    actions.saveMatchLineups(matchId, trimmedLineups, trimmedBenches);
    resetEditingState();
  };

  const renderMatchCard = (match: MatchSchedule) => {
    const displayStatus = deriveDisplayStatus(match);
    const badge = statusLabel(displayStatus);
    const isActive = state.activeMatchId === match.id;
    const hasLiveOverlay = Boolean((match.liveVideoUrl || '').trim());
    const textButtonLabel = match.status === 'completed' ? '경기 결과' : match.status === 'canceled' ? '취소됨' : '문자중계';
    const goTo = (path: string) => {
      actions.selectMatch(match.id);
      navigate(path);
    };
    const goToScorekeeper = (buttonEl: HTMLButtonElement | null) => {
      if (!isAdmin) {
        showBlockedTooltip(buttonEl);
        return;
      }
      setTooltip(null);
      goTo('/scorekeeper');
    };
    const division = deriveDivision(match);
    const mode = match.recordMode ?? 'official';
    const quickActionStyle: CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 10px',
      borderRadius: '999px',
      border: '1px solid rgba(148,163,184,0.35)',
      background: 'rgba(255,255,255,0.03)',
      color: '#e2e8f0',
      fontWeight: 800,
      fontSize: '12px',
      cursor: 'pointer',
      transition: 'border-color 120ms ease, transform 120ms ease, background 120ms ease',
    };
    const quickActionDisabledStyle: CSSProperties = {
      ...quickActionStyle,
      border: '1px dashed rgba(248, 113, 113, 0.6)',
      color: '#f87171',
      background: 'rgba(248, 113, 113, 0.08)',
      cursor: 'not-allowed',
    };
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
                {match.awayTeamName} vs {match.homeTeamName}
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
              {mode === 'practice' && (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: 'rgba(16,185,129,0.16)',
                    color: '#34d399',
                    fontSize: '12px',
                    fontWeight: 800,
                  }}
                >
                  연습경기
                </span>
              )}
            </div>
            <div style={{ color: '#94a3b8', marginTop: '4px', fontSize: '13px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span>
                {formatDateTimeLabel(match.startTime)} · {match.venue}
              </span>
              {division && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '999px',
                    border: `1px solid ${divisionStyles[division].color}55`,
                    background: `${divisionStyles[division].color}14`,
                    color: divisionStyles[division].color,
                    fontWeight: 800,
                    fontSize: '12px',
                  }}
                >
                  <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: divisionStyles[division].color }} />
                  {divisionStyles[division].label}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {match.status === 'completed' && (
              <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                결과: {match.awayScore ?? 0} - {match.homeScore ?? 0}
              </span>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => goTo('/scoreboard')} style={quickActionStyle} title="전광판">
                <span aria-hidden>📺</span>
                전광판
              </button>
              <button type="button" onClick={() => goTo('/scoreboard-text')} style={quickActionStyle} title={textButtonLabel}>
                <span aria-hidden>💬</span>
                {textButtonLabel}
              </button>
              <button
                type="button"
                onClick={() => hasLiveOverlay && goTo('/live-overlay')}
                style={hasLiveOverlay ? quickActionStyle : quickActionDisabledStyle}
                title={hasLiveOverlay ? '라이브 오버레이' : '기록원에서 유튜브 링크 미입력'}
                disabled={!hasLiveOverlay}
              >
                <span aria-hidden>{hasLiveOverlay ? '🛰️' : '🚫'}</span>
                {hasLiveOverlay ? '라이브 오버레이' : '라이브 없음'}
              </button>
              <button
                type="button"
                onClick={(e) => goToScorekeeper(e.currentTarget)}
                onMouseEnter={(e) => {
                  if (!isAdmin) showBlockedTooltip(e.currentTarget);
                }}
                onMouseLeave={() => setTooltip(null)}
                onFocus={(e) => {
                  if (!isAdmin) showBlockedTooltip(e.currentTarget);
                }}
                onBlur={() => setTooltip(null)}
                style={{
                  ...quickActionStyle,
                  cursor: isAdmin ? 'pointer' : 'not-allowed',
                  color: isAdmin ? quickActionStyle.color : 'rgba(203,213,225,0.6)',
                }}
                title="기록원"
              >
                <span aria-hidden>📝</span>
                기록원
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                if (!canEdit) {
                  showBlockedTooltip(e.currentTarget);
                  return;
                }
                handleEditLineups(match);
              }}
              onMouseEnter={(e) => {
                if (!canEdit) showBlockedTooltip(e.currentTarget);
              }}
              onMouseLeave={() => setTooltip(null)}
              onFocus={(e) => {
                if (!canEdit) showBlockedTooltip(e.currentTarget);
              }}
              onBlur={() => setTooltip(null)}
              style={{
                ...secondaryButtonStyle,
                cursor: canEdit ? 'pointer' : 'not-allowed',
                color: canEdit ? secondaryButtonStyle.color : 'rgba(203,213,225,0.65)',
                border: canEdit ? secondaryButtonStyle.border : '1px solid rgba(148,163,184,0.35)',
                background: canEdit ? secondaryButtonStyle.background : 'rgba(255,255,255,0.04)',
              }}
            >
              라인업 편집
            </button>
          </div>
        </div>

        {match.notes && <div style={{ color: '#cbd5e1', fontSize: '13px' }}>메모: {match.notes}</div>}

        {match.status === 'completed' && match.postGame && <CompletedResultCard match={match} />}

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
                label="원정 라인업 & 후보"
                side="away"
                lineup={editingLineups.away}
                practiceMode={(match.recordMode ?? 'official') === 'practice'}
                bench={editingBenches.away}
                benchInput={editingBenchInputs.away}
                onSetLineup={(side, index, updates) =>
                  setEditingLineups((prev) => ({
                    ...prev,
                    [side]: updateLineupSlot(prev[side], index, updates),
                  }))
                }
                onAddBatterSlot={(side) =>
                  setEditingLineups((prev) => ({
                    ...prev,
                    [side]: addPracticeBatterSlot(prev[side]),
                  }))
                }
                onRemoveBatterSlot={(side, index) =>
                  setEditingLineups((prev) => ({
                    ...prev,
                    [side]: prev[side].filter((_, idx) => idx !== index),
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
                label="홈 라인업 & 후보"
                side="home"
                lineup={editingLineups.home}
                practiceMode={(match.recordMode ?? 'official') === 'practice'}
                bench={editingBenches.home}
                benchInput={editingBenchInputs.home}
                onSetLineup={(side, index, updates) =>
                  setEditingLineups((prev) => ({
                    ...prev,
                    [side]: updateLineupSlot(prev[side], index, updates),
                  }))
                }
                onAddBatterSlot={(side) =>
                  setEditingLineups((prev) => ({
                    ...prev,
                    [side]: addPracticeBatterSlot(prev[side]),
                  }))
                }
                onRemoveBatterSlot={(side, index) =>
                  setEditingLineups((prev) => ({
                    ...prev,
                    [side]: prev[side].filter((_, idx) => idx !== index),
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
    <>
      <style>
        {`
          input[type="date"]::-webkit-calendar-picker-indicator {
            filter: invert(1);
            cursor: pointer;
          }
        `}
      </style>
      <div style={{ display: 'grid', gap: '24px' }}>
        {tooltip && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x,
              top: tooltip.y + 10,
              transform: 'translate(-50%, 0)',
              background: 'rgba(15,23,42,0.95)',
              color: '#f97316',
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              fontSize: '12px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            boxShadow: '0 10px 30px rgba(56, 46, 46, 0.25)',
            zIndex: 2000,
          }}
        >
          {tooltip.text}
        </div>
      )}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px' }}>경기 일정 및 결과</h1>
          <p style={{ color: '#94a3b8' }}>경기 일정, 결과, 라인업 사전 저장을 한 곳에서 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            if (!canEdit) {
              showBlockedTooltip(e.currentTarget);
              return;
            }
            setShowForm((prev) => !prev);
          }}
          onMouseEnter={(e) => {
            if (!canEdit) showBlockedTooltip(e.currentTarget);
          }}
          onMouseLeave={() => setTooltip(null)}
          onFocus={(e) => {
            if (!canEdit) showBlockedTooltip(e.currentTarget);
          }}
          onBlur={() => setTooltip(null)}
          style={{
            borderRadius: '999px',
            padding: '10px 18px',
            border: '1px solid rgba(148,163,184,0.4)',
            background: canEdit
              ? showForm
                ? 'rgba(148,163,184,0.2)'
                : 'linear-gradient(90deg, #f97316, #f59e0b)'
              : 'rgba(148,163,184,0.15)',
            color: canEdit ? (showForm ? '#e2e8f0' : '#0b0f1a') : 'rgba(203,213,225,0.7)',
            fontWeight: 800,
            cursor: canEdit ? 'pointer' : 'not-allowed',
          }}
        >
          {showForm ? '추가 폼 닫기' : '경기 추가'}
        </button>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px',
          border: '1px solid rgba(148,163,184,0.25)',
          borderRadius: '14px',
          padding: '12px',
          background: 'rgba(15,23,42,0.4)',
        }}
      >
        {[
          { path: '/schedule/results', label: '경기 결과', desc: '종료 경기 모아보기' },
          { path: '/schedule/groups', label: '조별 일정', desc: '구분(으뜸/버금)별 캘린더' },
          { path: '/schedule/practice', label: '연습경기', desc: '연습경기 전용 목록' },
          { path: '/schedule/manage', label: '일정 관리', desc: '데모용 더미 등록 & 상태 변경' },
        ].map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            style={{
              display: 'grid',
              gap: '4px',
              alignItems: 'start',
              textAlign: 'left',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'rgba(255,255,255,0.03)',
              color: '#e2e8f0',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>{item.label}</span>
            <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>{item.desc}</span>
          </button>
        ))}
      </div>

      {canEdit && showForm && (
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px 1fr 150px', gap: '12px' }}>
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
              홈 팀
              <input
                value={form.homeTeamName}
                onChange={(event) => setForm((prev) => ({ ...prev, homeTeamName: event.target.value }))}
                placeholder="홈 팀 이름"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
              경기 일시
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 75px 75px',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                <input
                  type="date"
                  value={startTimeParts.date}
                  onChange={(event) => updateStartTime({ date: event.target.value })}
                  style={{
                    ...inputStyle,
                    colorScheme: 'white',
                  }}
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
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
              구분
              <select
                value={form.division}
                onChange={(event) => setForm((prev) => ({ ...prev, division: event.target.value as 'auto' | LeagueDivision }))}
                style={inputStyle}
              >
                <option value="auto">자동(팀 소속 또는 미정)</option>
                <option value="EUTTEUM">으뜸 경기</option>
                <option value="BEOGEUM">버금 경기</option>
              </select>
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
                <option value="canceled">경기 취소</option>
                <option value="inProgress">경기 진행 중</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1' }}>
              경기 모드
              <select
                value={form.recordMode}
                onChange={(event) => setForm((prev) => ({ ...prev, recordMode: event.target.value as MatchRecordMode }))}
                style={inputStyle}
              >
                <option value="official">AUBL 공식경기</option>
                <option value="practice">연습경기 (공식기록 미반영)</option>
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
                  label="원정 라인업 & 후보"
                  side="away"
                  lineup={formLineups.away}
                  practiceMode={form.recordMode === 'practice'}
                  bench={formBenches.away}
                  benchInput={benchInputs.away}
                  onSetLineup={(side, index, updates) =>
                    setFormLineups((prev) => ({
                      ...prev,
                      [side]: updateLineupSlot(prev[side], index, updates),
                    }))
                  }
                  onAddBatterSlot={(side) =>
                    setFormLineups((prev) => ({
                      ...prev,
                      [side]: addPracticeBatterSlot(prev[side]),
                    }))
                  }
                  onRemoveBatterSlot={(side, index) =>
                    setFormLineups((prev) => ({
                      ...prev,
                      [side]: prev[side].filter((_, idx) => idx !== index),
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
                  label="홈 라인업 & 후보"
                  side="home"
                  lineup={formLineups.home}
                  practiceMode={form.recordMode === 'practice'}
                  bench={formBenches.home}
                  benchInput={benchInputs.home}
                  onSetLineup={(side, index, updates) =>
                    setFormLineups((prev) => ({
                      ...prev,
                      [side]: updateLineupSlot(prev[side], index, updates),
                    }))
                  }
                  onAddBatterSlot={(side) =>
                    setFormLineups((prev) => ({
                      ...prev,
                      [side]: addPracticeBatterSlot(prev[side]),
                    }))
                  }
                  onRemoveBatterSlot={(side, index) =>
                    setFormLineups((prev) => ({
                      ...prev,
                      [side]: prev[side].filter((_, idx) => idx !== index),
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
                          const displayStatus = deriveDisplayStatus(match);
                          const badge = statusLabel(displayStatus);
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
                                  {match.awayTeamName} vs {match.homeTeamName}
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
                                  {match.awayScore ?? 0} - {match.homeScore ?? 0}
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
    </>
  );
}

function CompletedResultCard({ match }: { match: MatchSchedule }) {
  const [open, setOpen] = useState(false);
  const detail = match.postGame as PostGameRecord | undefined;
  if (!detail) return null;
  const teams = { home: match.homeTeamName, away: match.awayTeamName };
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.3)',
        borderRadius: '12px',
        padding: '12px',
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <div style={{ display: 'grid', gap: '4px' }}>
        <span style={{ fontWeight: 900, color: '#e2e8f0' }}>경기 결과</span>
        <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>박스스코어와 투수·타자 기록을 바로 확인하세요.</span>
      </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {detail.note && <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>{detail.note}</span>}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              padding: '6px 10px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {open ? '접기' : '펼치기'}
          </button>
        </div>
      </div>

      {open && (
        <>
          <LineScoreCompact teams={teams} detail={detail} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
            <TeamTotalsPill title={`${teams.away} 타격 요약`} totals={detail.teamBatterSummary?.away} color="#60a5fa" />
            <TeamTotalsPill title={`${teams.home} 타격 요약`} totals={detail.teamBatterSummary?.home} color="#f97316" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
            <PitchingMiniTable title={`${teams.away} 투수`} color="#60a5fa" pitchers={detail.pitchers?.away ?? []} />
            <PitchingMiniTable title={`${teams.home} 투수`} color="#f97316" pitchers={detail.pitchers?.home ?? []} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
            <BattingMiniTable title={`${teams.away} 타자`} color="#60a5fa" batters={detail.batters?.away ?? []} />
            <BattingMiniTable title={`${teams.home} 타자`} color="#f97316" batters={detail.batters?.home ?? []} />
          </div>
        </>
      )}
    </div>
  );
}

// [수정] 인터페이스 명시하여 유니온 타입 속성 오류 해결
interface LineScoreCell {
  text: string;
  bold?: boolean;
  color?: string;
}

function LineScoreCompact({ teams, detail }: { teams: { home: string; away: string }; detail: PostGameRecord }) {
  if (!detail.lineScore) return null;
  const innings = detail.lineScore.innings || [];
  const header = ['팀', ...innings, 'R', 'H', 'E', 'LOB'];
  // [수정] 반환 타입 명시
  const row = (label: string, scores: number[] = [], totals?: { runs?: number; hits?: number; errors?: number; lob?: number }, color?: string): LineScoreCell[] => [
    { text: label, bold: true, color },
    ...innings.map((_, idx) => ({ text: scores[idx] != null ? String(scores[idx]) : '-' })),
    { text: totals?.runs != null ? String(totals.runs) : '-', bold: true },
    { text: totals?.hits != null ? String(totals.hits) : '-' },
    { text: totals?.errors != null ? String(totals.errors) : '-' },
    { text: totals?.lob != null ? String(totals.lob) : '-' },
  ];
  const rows = [
    row(teams.away, detail.lineScore.away, detail.totals?.away, '#60a5fa'),
    row(teams.home, detail.lineScore.home, detail.totals?.home, '#f97316'),
  ];
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))`, background: 'rgba(255,255,255,0.03)' }}>
        {header.map((h) => (
          <div key={h} style={{ padding: '6px', textAlign: 'center', fontWeight: 900, color: '#e2e8f0', fontSize: '12px' }}>
            {h}
          </div>
        ))}
      </div>
      {rows.map((cells, ridx) => (
        <div key={ridx} style={{ display: 'grid', gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))`, borderTop: '1px solid rgba(148,163,184,0.2)' }}>
          {cells.map((cell, cidx) => (
            <div
              key={cidx}
              style={{
                padding: '6px',
                textAlign: 'center',
                color: cell.color ?? '#cbd5e1',
                fontWeight: cell.bold ? 800 : 700,
                fontSize: '12px',
              }}
            >
              {cell.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TeamTotalsPill({
  title,
  totals,
  color,
}: {
  title: string;
  totals?: { ab?: number; h?: number; rbi?: number; r?: number; sb?: number };
  color: string;
}) {
  const items = [
    { label: '타수', value: totals?.ab },
    { label: '안타', value: totals?.h },
    { label: '득점', value: totals?.r },
    { label: '타점', value: totals?.rbi },
    { label: '도루', value: totals?.sb },
  ].filter((item) => item.value != null);
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: '10px',
        padding: '10px',
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: '6px',
      }}
    >
      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{title}</span>
      {items.length ? (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {items.map((item) => (
            <span
              key={item.label}
              style={{
                padding: '6px 10px',
                borderRadius: '10px',
                border: `1px solid ${color}55`,
                background: 'rgba(255,255,255,0.03)',
                color,
                fontWeight: 800,
                fontSize: '12px',
              }}
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>요약 없음</span>
      )}
    </div>
  );
}

function PitchingMiniTable({
  title,
  pitchers,
  color,
}: {
  title: string;
  pitchers: PostGamePitcher[];
  color: string;
}) {
  const header = ['투수', 'IP', 'BF', 'H', 'HR', 'BB', 'HBP', 'SO', 'R', 'ER', 'NP'];
  // [수정] v가 unknown 타입이므로 렌더링 안전성을 위해 String()으로 명시적 변환
  const value = (v: unknown) => (v == null ? '-' : String(v));
  
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: '10px',
        padding: '10px',
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{title}</span>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>{pitchers.length}명</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${header.length}, minmax(40px, 1fr))`, gap: '4px' }}>
        {header.map((h) => (
          <div key={h} style={{ textAlign: 'center', fontWeight: 800, color: '#cbd5e1', fontSize: '11px' }}>
            {h}
          </div>
        ))}
        {pitchers.map((p) =>
          [p.name, p.ip, p.bf, p.h, p.hr, p.bb, p.hbp, p.so, p.r, p.er, p.pitches].map((v, idx) => (
            <div
              key={`${p.name}-${idx}`}
              style={{
                textAlign: 'center',
                color: idx === 0 ? color : '#e2e8f0',
                fontWeight: idx === 0 ? 800 : 700,
                fontSize: '12px',
              }}
            >
              {value(v)}
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function BattingMiniTable({
  title,
  batters,
  color,
}: {
  title: string;
  batters: PostGameBatter[];
  color: string;
}) {
  if (!batters.length) return null;
  const header = ['순번', '선수', '포지션', 'AB', 'H', 'R', 'RBI', 'SB', 'AVG', '시즌'];
  // [수정] v가 unknown 타입이므로 렌더링 안전성을 위해 String()으로 명시적 변환
  const value = (v: unknown) => (v == null ? '-' : String(v));
  
  const formatAvg = (n?: number) => {
    if (n == null) return '-';
    const fixed = Number(n).toFixed(3);
    return fixed.startsWith('0') ? fixed.slice(1) : fixed;
  };
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: '10px',
        padding: '10px',
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{title}</span>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>{batters.length}명</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${header.length}, minmax(48px, 1fr))`, gap: '4px' }}>
        {header.map((h) => (
          <div key={h} style={{ textAlign: 'center', fontWeight: 800, color: '#cbd5e1', fontSize: '11px' }}>
            {h}
          </div>
        ))}
        {batters.map((b) =>
          [
            b.order ?? '-',
            b.name,
            b.pos ?? b.slot ?? '-',
            b.ab,
            b.h,
            b.r,
            b.rbi,
            b.sb,
            formatAvg(typeof b.avg === 'number' ? b.avg : (b.avg as unknown as number)),
            formatAvg(typeof b.seasonAvg === 'number' ? b.seasonAvg : (b.seasonAvg as unknown as number)),
          ].map((v, idx) => (
            <div
              key={`${b.name}-${idx}`}
              style={{
                textAlign: 'center',
                color: idx === 1 ? color : '#e2e8f0',
                fontWeight: idx <= 2 ? 800 : 700,
                fontSize: '12px',
              }}
            >
              {value(v)}
            </div>
          )),
        )}
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
  practiceMode,
  bench,
  benchInput,
  onSetLineup,
  onAddBatterSlot,
  onRemoveBatterSlot,
  onChangeBenchInput,
  onAddBench,
  onRemoveBench,
}: {
  label: string;
  side: Side;
  lineup: PlayerSlot[];
  practiceMode: boolean;
  bench: PlayerSlot[];
  benchInput: PlayerSlot;
  onSetLineup: (side: Side, index: number, updates: Partial<PlayerSlot>) => void;
  onAddBatterSlot: (side: Side) => void;
  onRemoveBatterSlot: (side: Side, index: number) => void;
  onChangeBenchInput: (side: Side, updates: Partial<PlayerSlot>) => void;
  onAddBench: (side: Side, player: PlayerSlot) => void;
  onRemoveBench: (side: Side, index: number) => void;
}) {
  const lineupEntries = lineup.map((slot, idx) => ({ slot, idx }));
  const officialPitcherEntry = lineupEntries[9];
  const practicePitcherEntry = practiceMode
    ? [...lineupEntries].reverse().find((entry) => entry.slot.pos.toUpperCase() === 'P') ?? null
    : null;
  const battingEntries = practiceMode
    ? lineupEntries.filter((entry) => entry.idx !== practicePitcherEntry?.idx)
    : lineupEntries.slice(0, 9);
  const pitcherEntry = practiceMode ? practicePitcherEntry : officialPitcherEntry;
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
              gridTemplateColumns: practiceMode ? '24px 1fr 70px 60px 70px 70px 56px' : '24px 1fr 70px 60px 70px 70px',
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
            {practiceMode && (
              <button
                type="button"
                onClick={() => onRemoveBatterSlot(side, entry.idx)}
                style={{
                  borderRadius: '8px',
                  border: '1px solid rgba(239,68,68,0.45)',
                  background: 'rgba(248,113,113,0.08)',
                  color: '#fca5a5',
                  fontWeight: 900,
                  fontSize: '11px',
                  padding: '6px 8px',
                  cursor: 'pointer',
                }}
              >
                삭제
              </button>
            )}
          </div>
        ))}
        {practiceMode && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => onAddBatterSlot(side)}
              style={{
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid rgba(59,130,246,0.4)',
                background: 'rgba(59,130,246,0.1)',
                color: '#93c5fd',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              타자 슬롯 추가
            </button>
          </div>
        )}
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
