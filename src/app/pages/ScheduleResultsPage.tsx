import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHero,
  SectionHeader,
  SeasonBadge,
  SeasonButton,
  SeasonLinkButton,
  type SeasonBadgeTone,
} from '../../shared/components/season';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule, MatchStatus } from '../../shared/state/demoStore';
import './SchedulePublicPages.css';

const RESULTS_PAGE_SIZE = 12;

type StatusFilter = 'ALL' | MatchStatus;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: '전체 상태' },
  { value: 'completed', label: '경기 종료' },
  { value: 'canceled', label: '취소' },
  { value: 'inProgress', label: '진행 중' },
  { value: 'scheduled', label: '예정' },
];

const statusLabel = (match: MatchSchedule): { text: string; tone: SeasonBadgeTone } => {
  if (match.status === 'inProgress') return { text: '진행 중', tone: 'blue' };
  if (match.status === 'completed') return { text: '경기 종료', tone: 'navy' };
  if (match.status === 'canceled') return { text: '취소', tone: 'muted' };
  return { text: '예정', tone: 'muted' };
};

const matchMonthKey = (match: MatchSchedule) => {
  const date = new Date(match.startTime);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return `${year}년 ${month}월`;
};

const formatDateHeading = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '일정 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시간 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

export default function ScheduleResultsPage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const results = useMemo(
    () =>
      [...state.matches]
        .filter(
          (match) =>
            !match.deleted &&
            (match.status === 'completed' ||
              match.status === 'canceled' ||
              new Date(match.startTime).getTime() < nowTs),
        )
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [state.matches, nowTs],
  );

  const summary = useMemo(() => {
    if (!results.length) return { total: 0, avgRuns: 0, closeGames: 0 };
    const totalRuns = results.reduce(
      (sum, match) => sum + (match.homeScore ?? 0) + (match.awayScore ?? 0),
      0,
    );
    const closeGames = results.filter(
      (match) => Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0)) <= 2,
    ).length;
    return {
      total: results.length,
      avgRuns: Math.round((totalRuns / results.length) * 10) / 10,
      closeGames,
    };
  }, [results]);

  const monthOptions = useMemo(
    () =>
      Array.from(new Set(results.map(matchMonthKey).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a),
      ),
    [results],
  );

  const filteredResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    return results.filter((match) => {
      if (statusFilter !== 'ALL' && match.status !== statusFilter) return false;
      if (monthFilter !== 'ALL' && matchMonthKey(match) !== monthFilter) return false;
      if (!normalizedQuery) return true;
      return [match.homeTeamName, match.awayTeamName, match.venue]
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(normalizedQuery);
    });
  }, [monthFilter, query, results, statusFilter]);

  const visibleResults = filteredResults.slice(0, visibleCount);
  const groupedResults = useMemo(() => {
    const groups: { key: string; label: string; matches: MatchSchedule[] }[] = [];
    visibleResults.forEach((match) => {
      const key = Number.isNaN(new Date(match.startTime).getTime())
        ? 'unknown'
        : new Date(match.startTime).toLocaleDateString('en-CA');
      const existing = groups.find((group) => group.key === key);
      if (existing) {
        existing.matches.push(match);
        return;
      }
      groups.push({ key, label: formatDateHeading(match.startTime), matches: [match] });
    });
    return groups;
  }, [visibleResults]);

  const openMatch = (matchId: string) => {
    actions.selectMatch(matchId);
    navigate(`/scoreboard-text/${matchId}`);
  };

  const resetFilters = () => {
    setQuery('');
    setStatusFilter('ALL');
    setMonthFilter('ALL');
    setVisibleCount(RESULTS_PAGE_SIZE);
  };

  return (
    <div className="schedule-public schedule-public--results">
      <PageHero
        eyebrow="2026 SEASON · RESULTS"
        title="경기 결과"
        description={
          <p>최근 경기부터 날짜별로 확인하고, 팀과 경기장·상태를 기준으로 필요한 결과를 빠르게 찾을 수 있습니다.</p>
        }
        actions={
          <>
            <SeasonLinkButton to="/schedule" variant="secondary">
              전체 일정 보기
            </SeasonLinkButton>
            <SeasonButton
              onClick={() => {
                const targetId = results[0]?.id;
                if (targetId) openMatch(targetId);
                else {
                  actions.selectMatch(null);
                  navigate('/scoreboard-text');
                }
              }}
            >
              최근 경기 상세
            </SeasonButton>
          </>
        }
        aside={
          <div className="schedule-public__hero-aside" aria-label="경기 결과 요약">
            <span>RESULT ARCHIVE</span>
            <strong>{summary.total}</strong>
            <small>확인 가능한 경기</small>
          </div>
        }
      />

      <section className="schedule-public__summary" aria-label="경기 결과 통계">
        <article className="schedule-public__metric">
          <span>경기 수</span>
          <strong>{summary.total}</strong>
          <p>현재 결과 후보 전체 기준</p>
        </article>
        <article className="schedule-public__metric">
          <span>경기당 득점 합계</span>
          <strong>{summary.avgRuns}</strong>
          <p>양 팀 득점 합산 평균</p>
        </article>
        <article className="schedule-public__metric">
          <span>2점 차 이내</span>
          <strong>{summary.closeGames}</strong>
          <p>접전으로 집계된 경기</p>
        </article>
      </section>

      <section className="schedule-public__filters" aria-labelledby="result-filter-title">
        <div className="schedule-public__filter-heading">
          <div>
            <span>FIND A GAME</span>
            <h2 id="result-filter-title">결과 찾기</h2>
          </div>
          <p aria-live="polite">전체 {results.length}경기 중 {filteredResults.length}경기</p>
        </div>
        <div className="schedule-public__filter-grid">
          <label className="schedule-public__field schedule-public__field--search">
            <span>팀 또는 경기장</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(RESULTS_PAGE_SIZE);
              }}
              placeholder="팀명이나 경기장을 입력하세요"
            />
          </label>
          <label className="schedule-public__field">
            <span>경기 상태</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setVisibleCount(RESULTS_PAGE_SIZE);
              }}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="schedule-public__field">
            <span>경기 월</span>
            <select
              value={monthFilter}
              onChange={(event) => {
                setMonthFilter(event.target.value);
                setVisibleCount(RESULTS_PAGE_SIZE);
              }}
            >
              <option value="ALL">전체 월</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
          </label>
          <SeasonButton variant="ghost" onClick={resetFilters}>
            필터 초기화
          </SeasonButton>
        </div>
      </section>

      <section className="schedule-public__board" aria-labelledby="result-list-title">
        <SectionHeader
          eyebrow="GAME RESULTS"
          title="경기 결과 목록"
          description="같은 날짜의 경기를 묶어 시간 순서와 최종 스코어를 함께 표시합니다."
          headingId="result-list-title"
          action={<SeasonBadge tone="muted">{filteredResults.length} 경기</SeasonBadge>}
        />

        {groupedResults.length ? (
          <div id="schedule-results-list" className="schedule-public__date-groups">
            {groupedResults.map((group) => (
              <section key={group.key} className="schedule-public__date-group">
                <header className="schedule-public__date-heading">
                  <h3>{group.label}</h3>
                  <span>{group.matches.length} 경기</span>
                </header>
                <div className="schedule-public__match-list">
                  {group.matches.map((match) => {
                    const badge = statusLabel(match);
                    return (
                      <article key={match.id} className="schedule-public__match schedule-public__match--result">
                        <div className="schedule-public__match-meta">
                          <time dateTime={match.startTime}>{formatTime(match.startTime)}</time>
                          <span>{match.venue || '장소 미정'}</span>
                          <SeasonBadge tone={badge.tone}>{badge.text}</SeasonBadge>
                        </div>
                        <div className="schedule-public__score" aria-label={`${match.awayTeamName} 대 ${match.homeTeamName}`}>
                          <div>
                            <span>원정</span>
                            <strong>{match.awayTeamName}</strong>
                            <b>{match.awayScore ?? '-'}</b>
                          </div>
                          <div>
                            <span>홈</span>
                            <strong>{match.homeTeamName}</strong>
                            <b>{match.homeScore ?? '-'}</b>
                          </div>
                        </div>
                        <SeasonButton variant="secondary" size="compact" onClick={() => openMatch(match.id)}>
                          상세 보기
                        </SeasonButton>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="schedule-public__empty" role="status">
            <strong>{results.length ? '조건에 맞는 경기가 없습니다.' : '표시할 경기 결과가 아직 없습니다.'}</strong>
            {results.length ? <span>검색어 또는 필터를 조정해 보세요.</span> : null}
          </div>
        )}

        {visibleCount < filteredResults.length ? (
          <div className="schedule-public__more">
            <SeasonButton
              variant="secondary"
              aria-controls="schedule-results-list"
              onClick={() => setVisibleCount((current) => current + RESULTS_PAGE_SIZE)}
            >
              결과 더보기
            </SeasonButton>
            <span>
              {visibleResults.length} / {filteredResults.length} 경기 표시
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
