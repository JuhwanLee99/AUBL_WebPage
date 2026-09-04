import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHero,
  SectionHeader,
  SeasonBadge,
  SeasonButton,
} from '../../shared/components/season';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchScoreInputMode, MatchStatus, MatchSchedule, PlayerSlot } from '../../shared/state/demoStore';
import type { LeagueDivision } from '../../shared/types';
import { TEAMS } from '../../shared/lib/mockData';
import './ScheduleManagePage.css';

const normalizeMatchDivision = (division?: LeagueDivision): 'LEAGUE' | 'PLAYOFF' => {
  if (division === 'PLAYOFF' || division === 'EUTTEUM' || division === 'BEOGEUM') return 'PLAYOFF';
  return 'LEAGUE';
};

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

const buildMatchId = (startTime: string, homeTeamName: string, awayTeamName: string) => {
  const dateObj = new Date(startTime);
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const cleanName = (name: string) => name.trim().replace(/\s+/g, '');
  const home = cleanName(homeTeamName || 'Home');
  const away = cleanName(awayTeamName || 'Away');
  return `${yyyy}${mm}${dd}-${home}-${away}`;
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
  const navigate = useNavigate();
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
    const startIso = start.toISOString();
    const matchId = buildMatchId(startIso, home.name, away.name);
    const lineups = {
      home: generateDummyLineup(),
      away: generateDummyLineup(),
    };
    const benches = {
      home: generateDummyBench(),
      away: generateDummyBench(),
    };
    const match: MatchSchedule = {
      id: matchId,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeTeamName: home.name,
      awayTeamName: away.name,
      division: 'LEAGUE',
      startTime: startIso,
      venue: 'AUBL 임시구장',
      status: 'scheduled',
      scoreInputMode: 'live',
      notes: '빠른 더미 등록',
      lineupPublic: false,
      // 더미 라인업 추가
      lineups,
      benches,
    };
    actions.addMatch(match);
    actions.saveMatchLineups(matchId, lineups, benches);
  };

  const openScorekeeperForMatch = (matchId: string) => {
    actions.selectMatch(matchId);
    navigate(`/scorekeeper/${matchId}`);
  };

  return (
    <div className="schedule-page schedule-manage">
      <PageHero
        eyebrow="2026 SEASON · SCHEDULE ADMIN"
        title="일정 관리"
        description="데모용 더미 일정을 빠르게 추가·상태 변경해 보세요."
        actions={(
          <>
            <SeasonButton variant="secondary" onClick={addQuickMock}>더미 일정 추가</SeasonButton>
            <SeasonButton onClick={() => actions.selectMatch(null)}>선택 초기화</SeasonButton>
            <SeasonButton
              variant="ghost"
              aria-expanded={showTrash}
              aria-controls="match-trash-bin"
              onClick={() => {
                setShowTrash((prev) => !prev);
                const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                setTimeout(() => document.getElementById('match-trash-bin')?.scrollIntoView({
                  behavior: reduceMotion ? 'auto' : 'smooth',
                }), 0);
              }}
            >
              {showTrash ? '휴지통 접기' : '휴지통 열기'}
            </SeasonButton>
          </>
        )}
      />

      <section className="schedule-manage__board" aria-labelledby="schedule-manage-status-heading">
        <SectionHeader
          headingId="schedule-manage-status-heading"
          eyebrow="MATCH CONTROL"
          title="빠른 상태 변경"
          description="등록된 전체 일정을 표시합니다."
        />

        <div className="schedule-manage__list">
          {upcoming.map((match) => (
            <article key={match.id} className="schedule-manage__match">
              <div className="schedule-manage__match-head">
                <div className="schedule-manage__match-copy">
                  <div className="schedule-manage__match-title-row">
                    <button
                      type="button"
                      onClick={() => openScorekeeperForMatch(match.id)}
                      className="schedule-manage__match-link"
                      title="기록원 페이지로 이동"
                    >
                      {match.awayTeamName} vs {match.homeTeamName}
                    </button>
                    <SeasonBadge tone={match.status === 'inProgress' ? 'blue' : match.status === 'canceled' ? 'danger' : 'muted'}>
                      {statusText[match.status]}
                    </SeasonBadge>
                    {(match.scoreInputMode ?? 'live') === 'manual' ? (
                      <SeasonBadge tone="blue">수기 입력</SeasonBadge>
                    ) : null}
                  </div>
                  <div className="schedule-manage__meta">
                    <time dateTime={match.startTime}>{new Date(match.startTime).toLocaleString('ko-KR')}</time>
                    <span>{match.venue}</span>
                  </div>
                </div>

                <div className="schedule-manage__controls">
                  <select
                    aria-label={`${match.awayTeamName} 대 ${match.homeTeamName} 경기 구분`}
                    value={normalizeMatchDivision(match.division)}
                    onChange={(e) =>
                      actions.updateMatch(match.id, {
                        division: e.target.value as LeagueDivision,
                      })
                    }
                  >
                    <option value="LEAGUE">리그</option>
                    <option value="PLAYOFF">플레이오프</option>
                  </select>
                  <div className="schedule-manage__choice-group" aria-label="경기 상태">
                    {(['scheduled', 'inProgress', 'completed', 'canceled'] as MatchStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={match.status === status}
                        className={match.status === status ? 'is-active' : ''}
                        onClick={() => actions.updateMatch(match.id, { status })}
                      >
                        {statusText[status]}
                      </button>
                    ))}
                  </div>
                  <div className="schedule-manage__choice-group" aria-label="점수 입력 방식">
                    {(['live', 'manual'] as MatchScoreInputMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={(match.scoreInputMode ?? 'live') === mode}
                        className={(match.scoreInputMode ?? 'live') === mode ? 'is-active' : ''}
                        onClick={() => actions.updateMatch(match.id, { scoreInputMode: mode })}
                      >
                        {mode === 'manual' ? '수기 입력' : '실시간 입력'}
                      </button>
                    ))}
                  </div>
                  <SeasonButton
                    variant="danger"
                    size="compact"
                    onClick={() => {
                      if (window.confirm('이 경기를 휴지통으로 이동할까요?')) actions.moveMatchToTrash(match.id);
                    }}
                  >
                    휴지통
                  </SeasonButton>
                </div>
              </div>

              <div className="schedule-manage__edit-grid">
                <input
                  aria-label="홈 팀 이름"
                  defaultValue={match.homeTeamName}
                  placeholder="홈 팀 이름"
                  onBlur={(e) => actions.updateMatch(match.id, { homeTeamName: e.target.value })}
                />
                <input
                  aria-label="원정 팀 이름"
                  defaultValue={match.awayTeamName}
                  placeholder="원정 팀 이름"
                  onBlur={(e) => actions.updateMatch(match.id, { awayTeamName: e.target.value })}
                />
                <input
                  aria-label="경기 시작 시각"
                  type="datetime-local"
                  defaultValue={toLocalInputValue(match.startTime)}
                  onBlur={(e) => {
                    const iso = toIsoString(e.target.value);
                    if (iso) actions.updateMatch(match.id, { startTime: iso });
                  }}
                />
                <input
                  aria-label="경기장"
                  defaultValue={match.venue}
                  placeholder="구장"
                  onBlur={(e) => actions.updateMatch(match.id, { venue: e.target.value })}
                />
                <select
                  aria-label="점수 입력 방식"
                  defaultValue={match.scoreInputMode ?? 'live'}
                  onChange={(e) => actions.updateMatch(match.id, { scoreInputMode: e.target.value as MatchScoreInputMode })}
                >
                  <option value="live">실시간 입력</option>
                  <option value="manual">수기 입력</option>
                </select>
                <input
                  aria-label="홈 팀 점수"
                  type="number"
                  min={0}
                  defaultValue={match.homeScore ?? ''}
                  placeholder="홈 점수"
                  onBlur={(e) => actions.updateMatch(match.id, { homeScore: Number(e.target.value) })}
                />
                <input
                  aria-label="원정 팀 점수"
                  type="number"
                  min={0}
                  defaultValue={match.awayScore ?? ''}
                  placeholder="원정 점수"
                  onBlur={(e) => actions.updateMatch(match.id, { awayScore: Number(e.target.value) })}
                />
                <input
                  aria-label="경기 메모"
                  defaultValue={match.notes ?? ''}
                  placeholder="메모"
                  onBlur={(e) => actions.updateMatch(match.id, { notes: e.target.value })}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="schedule-manage__board" aria-labelledby="schedule-manage-note-heading">
        <SectionHeader
          headingId="schedule-manage-note-heading"
          eyebrow="MATCH NOTES"
          title="메모 추가"
          description="업데이트하면 리스트에 즉시 반영됩니다."
        />

        <div className="schedule-manage__note-list">
          {upcoming.map((match) => (
            <div key={`${match.id}-note`} className="schedule-manage__note-row">
              <button
                type="button"
                onClick={() => openScorekeeperForMatch(match.id)}
                className="schedule-manage__match-link"
                title="기록원 페이지로 이동"
              >
                {match.awayTeamName} vs {match.homeTeamName}
              </button>
              <input
                aria-label={`${match.awayTeamName} 대 ${match.homeTeamName} 경기 메모`}
                defaultValue={match.notes ?? ''}
                placeholder="메모를 입력하세요"
                onBlur={(e) => actions.updateMatch(match.id, { notes: e.target.value })}
              />
            </div>
          ))}
        </div>
      </section>

      {showTrash && (
        <section id="match-trash-bin" className="schedule-manage__board" aria-labelledby="schedule-manage-trash-heading">
          <SectionHeader
            headingId="schedule-manage-trash-heading"
            eyebrow="RECOVERY"
            title="휴지통 (복원/영구 삭제)"
            description="30일 보관 후 자동 삭제"
          />

          {trashedMatches.length ? (
            <div className="schedule-manage__trash-list">
              {trashedMatches.map((entry) => (
                <article key={`trash-${entry.id}`} className="schedule-manage__trash-row">
                  <div className="schedule-manage__trash-copy">
                    <strong>{entry.awayTeamName} vs {entry.homeTeamName}</strong>
                    <span>{new Date(entry.startTime).toLocaleString('ko-KR')} · {entry.venue}</span>
                    <span className="schedule-manage__trash-date">
                      삭제됨: {entry.deletedAt ? new Date(entry.deletedAt).toLocaleString('ko-KR') : '알 수 없음'} · {formatRemaining(entry.purgeAt ?? 0)}
                    </span>
                  </div>
                  <div className="schedule-manage__trash-actions">
                    <SeasonButton variant="secondary" size="compact" onClick={() => actions.restoreMatch(entry.id)}>
                      복원
                    </SeasonButton>
                    <SeasonButton
                      variant="danger"
                      size="compact"
                      onClick={() => {
                        if (window.confirm('이 경기를 영구 삭제할까요? (취소 불가)')) actions.purgeTrash(entry.id);
                      }}
                    >
                      영구 삭제
                    </SeasonButton>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="schedule-manage__empty">휴지통이 비어 있습니다.</div>
          )}
        </section>
      )}
    </div>
  );
}
