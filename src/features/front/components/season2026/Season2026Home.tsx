import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { BatterRanking, PitcherRanking } from '@core/api/backendClient';
import type { LandingContent, SiteAnnouncement } from '@shared/state/contentProvider';
import type { MatchSchedule } from '@shared/state/demoStore';
import type { Notice, TeamNotice } from '@shared/types';
import type {
  HomeDataPhase,
  HomeGroupView,
  QualificationState,
  Season2026Group,
  Season2026RecordPayload,
} from './types';

const UNIQUE_PLAY_URL = 'https://unique-play.com/league/57';
const INSTAGRAM_URL = 'https://www.instagram.com/aubl_1981/';
const GOLDBALLPARK_URL = 'https://www.goldballpark.co.kr/';
const BASEBALL_MAJOR_URL = 'https://www.baseballm.com/';
const ANNOUNCEMENT_COLLAPSED_KEY = 'aubl:home-announcement:collapsed:v1';
const ANNOUNCEMENT_HIDDEN_KEY = 'aubl:home-announcement:hidden:v1';
const ANNOUNCEMENT_HIDE_DURATION_MS = 24 * 60 * 60 * 1000;

type AnnouncementHiddenPreference = {
  revision: string;
  until: number;
};

type FeedPhase = 'loading' | 'ready' | 'error';

const associationSchoolCopy = (value: string) =>
  value
    .replace(/2026\s+HOST/giu, '2026 연합회교')
    .replace(/HOSTED BY/giu, '2026 연합회교')
    .replace(/호스트\s*대학/gu, '연합회교')
    .replace(/호스트/gu, '연합회교')
    .replace(/46주년 시즌 운영 전권을 맡은 연합회교/gu, '46주년 시즌 운영을 담당하는 연합회교');

interface Season2026HomeProps {
  landing: LandingContent;
  announcement: SiteAnnouncement;
  matches: MatchSchedule[];
  schedulePhase: FeedPhase;
  scheduleCheckedAt: number | null;
  recordPhase: HomeDataPhase;
  recordPayload: Season2026RecordPayload | null;
  groups: HomeGroupView[];
  notices: Notice[];
  noticePhase: FeedPhase;
  userSignedIn: boolean;
  myTeamId: string | null;
  myTeamName: string | null;
  teamNotices: TeamNotice[];
  teamNoticePhase: FeedPhase | 'idle';
  allstarEnabled: boolean;
  nowTs: number;
}

const readCollapsedAnnouncementRevision = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(ANNOUNCEMENT_COLLAPSED_KEY);
  } catch {
    return null;
  }
};

const readHiddenAnnouncementPreference = (): AnnouncementHiddenPreference | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ANNOUNCEMENT_HIDDEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AnnouncementHiddenPreference>;
    if (typeof parsed.revision !== 'string' || typeof parsed.until !== 'number' || parsed.until <= Date.now()) {
      window.localStorage.removeItem(ANNOUNCEMENT_HIDDEN_KEY);
      return null;
    }
    return { revision: parsed.revision, until: parsed.until };
  } catch {
    return null;
  }
};

function HomeAnnouncement({ announcement }: { announcement: SiteAnnouncement }) {
  const titleId = useId();
  const [collapsedRevision, setCollapsedRevision] = useState<string | null>(readCollapsedAnnouncementRevision);
  const [hiddenPreference, setHiddenPreference] = useState<AnnouncementHiddenPreference | null>(readHiddenAnnouncementPreference);
  const collapsed = collapsedRevision === announcement.revision;
  const hidden = hiddenPreference?.revision === announcement.revision;

  useEffect(() => {
    if (!hiddenPreference) return;
    const remaining = Math.max(0, hiddenPreference.until - Date.now());
    const timer = window.setTimeout(() => setHiddenPreference(null), remaining);
    return () => window.clearTimeout(timer);
  }, [hiddenPreference]);

  if (!announcement.enabled || !announcement.title || !announcement.message || hidden) return null;

  const toggleCollapsed = () => {
    const nextRevision = collapsed ? null : announcement.revision;
    setCollapsedRevision(nextRevision);
    try {
      if (nextRevision) window.sessionStorage.setItem(ANNOUNCEMENT_COLLAPSED_KEY, nextRevision);
      else window.sessionStorage.removeItem(ANNOUNCEMENT_COLLAPSED_KEY);
    } catch {
      // The in-memory state still provides the interaction when storage is unavailable.
    }
  };

  const hideForOneDay = () => {
    const next = {
      revision: announcement.revision,
      until: Date.now() + ANNOUNCEMENT_HIDE_DURATION_MS,
    };
    setHiddenPreference(next);
    try {
      window.localStorage.setItem(ANNOUNCEMENT_HIDDEN_KEY, JSON.stringify(next));
    } catch {
      // The current page still hides the announcement when storage is unavailable.
    }
  };

  const action = announcement.linkLabel && announcement.linkHref
    ? announcement.linkHref.startsWith('/')
      ? <Link className="s26-announcement__link" to={announcement.linkHref}>{announcement.linkLabel}</Link>
      : <a className="s26-announcement__link" href={announcement.linkHref}>{announcement.linkLabel}</a>
    : null;

  return (
    <aside
      className={`s26-announcement is-${announcement.tone}${collapsed ? ' is-collapsed' : ''}`}
      aria-labelledby={titleId}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="s26-announcement__marker" aria-hidden="true" />
      <div className="s26-announcement__copy">
        <span className="s26-announcement__label">
          {announcement.tone === 'warning' ? '긴급 안내' : '중요 공지'}
        </span>
        <strong id={titleId}>{announcement.title}</strong>
        {!collapsed ? <p>{announcement.message}</p> : null}
      </div>
      <div className="s26-announcement__actions">
        {!collapsed ? action : null}
        <button type="button" className="s26-announcement__button" onClick={toggleCollapsed}>
          {collapsed ? '펼치기' : '접어두기'}
        </button>
        <button type="button" className="s26-announcement__button" onClick={hideForOneDay}>
          24시간 보지 않기
        </button>
      </div>
    </aside>
  );
}

const getKstDateKey = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = read('year');
  const month = read('month');
  const day = read('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
};

const is2026OfficialMatch = (match: MatchSchedule) => {
  if ((match.recordMode ?? 'official') !== 'official' || match.deleted) return false;
  const dateKey = getKstDateKey(match.startTime);
  return dateKey == null || dateKey.startsWith('2026-');
};

const matchTimestamp = (match: MatchSchedule) => {
  const timestamp = new Date(match.startTime).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const compareMatchTimeAsc = (a: MatchSchedule, b: MatchSchedule) =>
  (matchTimestamp(a) ?? Number.MAX_SAFE_INTEGER) - (matchTimestamp(b) ?? Number.MAX_SAFE_INTEGER);

const compareMatchTimeDesc = (a: MatchSchedule, b: MatchSchedule) =>
  (matchTimestamp(b) ?? Number.MIN_SAFE_INTEGER) - (matchTimestamp(a) ?? Number.MIN_SAFE_INTEGER);

const formatMatchDay = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '일정 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
};

const formatMatchTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시간 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const formatCheckedAt = (value: number | null | undefined) => {
  if (!value) return '확인 전';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
};

const formatSourceDateTime = (value: string | null | undefined) => {
  if (!value) return '게시 전';
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasOffset ? value : `${value}+09:00`);
  if (Number.isNaN(date.getTime())) return '시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const formatNoticeDate = (value: number) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
};

const matchScore = (match: MatchSchedule, side: 'home' | 'away') => {
  const direct = side === 'home' ? match.homeScore : match.awayScore;
  const postGame = side === 'home' ? match.postGame?.totals.home.runs : match.postGame?.totals.away.runs;
  const value = direct ?? postGame;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const qualificationClass = (state: QualificationState) => `s26-qualification is-${state}`;

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  link,
  linkLabel,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  link?: string;
  linkLabel?: string;
}) {
  return (
    <div className="s26-section-heading">
      <div>
        <p className="s26-eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        {description ? <p className="s26-section-description">{description}</p> : null}
      </div>
      {link && linkLabel ? (
        <Link className="s26-text-link" to={link}>
          {linkLabel} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

function CampaignHero({ landing }: { landing: LandingContent }) {
  const campaignLead = '우리의 청춘은 이번에도';

  return (
    <section className="s26-hero" aria-labelledby="season-campaign-title">
      <div className="s26-hero__art" aria-hidden="true">
        <span className="s26-orbit s26-orbit--one" />
        <span className="s26-orbit s26-orbit--two" />
        <span className="s26-star s26-star--one" />
        <span className="s26-star s26-star--two" />
        <span className="s26-star s26-star--three" />
        <span className="s26-ball" />
      </div>

      <div className="s26-hero__copy">
        <div className="s26-hero__topline">
          <span>2026 SEASON AUBL</span>
          <span>{landing.heroBadgeText}</span>
        </div>
        <h1 id="season-campaign-title">
          <span>{campaignLead}</span>
          <strong>PLAY BALL</strong>
        </h1>
        <p className="s26-hero__description">{landing.heroDescription}</p>
        <p className="s26-hero__subcopy">{associationSchoolCopy(landing.heroSubDescription)}</p>
        <div className="s26-actions">
          <Link className="s26-button s26-button--primary" to="/schedule">
            경기 일정 · 결과
          </Link>
          <Link className="s26-button s26-button--secondary" to="/records?tab=standings">
            조별 순위 보기
          </Link>
        </div>
      </div>

      <div className="s26-hero__facts" aria-label="2026 시즌 요약">
        {landing.snapshotCards.slice(0, 3).map((item, index) => (
          <div key={`${item.label}-${index}`}>
            <span>{associationSchoolCopy(item.label)}</span>
            <strong>{item.value}</strong>
            <p>{associationSchoolCopy(item.desc)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FreshnessBar({
  schedulePhase,
  scheduleCheckedAt,
  recordPhase,
  recordPayload,
}: Pick<
  Season2026HomeProps,
  'schedulePhase' | 'scheduleCheckedAt' | 'recordPhase' | 'recordPayload'
>) {
  const recordStateLabel =
    recordPhase === 'loading'
      ? '확인 중'
      : recordPhase === 'ready'
        ? '조회 완료'
        : recordPhase === 'partial'
          ? '일부 확인 필요'
          : '연결 확인 필요';
  const scheduleStateLabel =
    schedulePhase === 'loading' ? '확인 중' : schedulePhase === 'ready' ? '조회 완료' : '연결 확인 필요';
  const freshness = recordPayload?.sourceFreshness;
  const revision = freshness?.publishedRevision;
  const sourceStatus = freshness?.status === 'CURRENT'
    ? '게시 완료'
    : freshness?.status === 'PENDING_MATERIALIZATION'
      ? '반영 확인 필요'
      : '게시 전';

  return (
    <section className="s26-freshness" aria-labelledby="freshness-title">
      <div className="s26-freshness__intro">
        <p className="s26-eyebrow">DATA STATUS</p>
        <h2 id="freshness-title">데이터 확인 현황</h2>
      </div>
      <dl className="s26-freshness__items">
        <div>
          <dt><span className={`s26-status-square is-${schedulePhase}`} />일정 · 결과</dt>
          <dd>{scheduleStateLabel} · {formatCheckedAt(scheduleCheckedAt)}</dd>
        </div>
        <div>
          <dt><span className={`s26-status-square is-${recordPhase}`} />조별 · 개인 기록</dt>
          <dd>{recordStateLabel} · 게시 {formatSourceDateTime(freshness?.publishedAt)}</dd>
        </div>
        <div>
          <dt><span className="s26-status-square is-manual" />원본 대조</dt>
          <dd>{sourceStatus} · UniquePlay 수동 검수 {revision ? `· ${revision.slice(0, 8)}` : ''}</dd>
        </div>
      </dl>
      <a className="s26-text-link" href={UNIQUE_PLAY_URL} target="_blank" rel="noreferrer">
        원본 페이지 <span aria-hidden="true">↗</span>
      </a>
      {recordPayload?.warnings.length ? (
        <p className="s26-freshness__warning" role="status">
          {recordPayload.warnings[0]}
        </p>
      ) : null}
    </section>
  );
}

function MatchItem({ match }: { match: MatchSchedule }) {
  const homeScore = matchScore(match, 'home');
  const awayScore = matchScore(match, 'away');
  const isFinal = match.status === 'completed';
  const isLive = match.status === 'inProgress';

  return (
    <article className="s26-match-card">
      <div className="s26-match-card__meta">
        <span>{formatMatchDay(match.startTime)} · {formatMatchTime(match.startTime)}</span>
        <span className={`s26-match-state${isLive ? ' is-live' : ''}`}>
          {isLive ? '진행 중' : isFinal ? '경기 종료' : '경기 예정'}
        </span>
      </div>
      <div className="s26-match-card__teams">
        <div>
          <span>HOME</span>
          <strong>{match.homeTeamName || '홈팀 미정'}</strong>
          {isFinal || isLive ? <b>{homeScore ?? '-'}</b> : null}
        </div>
        <div>
          <span>AWAY</span>
          <strong>{match.awayTeamName || '원정팀 미정'}</strong>
          {isFinal || isLive ? <b>{awayScore ?? '-'}</b> : null}
        </div>
      </div>
      <div className="s26-match-card__footer">
        <p className="s26-match-card__venue">{match.venue || '장소 미정'}</p>
        <Link className="s26-match-card__detail" to={`/scoreboard-text/${match.id}`}>
          경기 상세
        </Link>
      </div>
    </article>
  );
}

function MatchBoard({ matches, schedulePhase, nowTs }: Pick<Season2026HomeProps, 'matches' | 'schedulePhase' | 'nowTs'>) {
  const { featured, featuredTitle, recent } = useMemo(() => {
    const official = matches.filter(is2026OfficialMatch);
    const todayKey = getKstDateKey(nowTs);
    const live = official.filter((match) => match.status === 'inProgress').sort(compareMatchTimeAsc);
    const scheduled = official
      .filter((match) => {
        if (match.status !== 'scheduled') return false;
        const dateKey = getKstDateKey(match.startTime);
        return dateKey == null || todayKey == null || dateKey >= todayKey;
      })
      .sort(compareMatchTimeAsc);
    const today = scheduled.filter((match) => getKstDateKey(match.startTime) === todayKey);
    const nextDateKey = scheduled.length ? getKstDateKey(scheduled[0].startTime) : null;
    const nearest = nextDateKey ? scheduled.filter((match) => getKstDateKey(match.startTime) === nextDateKey) : [];
    const chosen = [...live, ...(today.length ? today : nearest)].filter(
      (match, index, rows) => rows.findIndex((candidate) => candidate.id === match.id) === index,
    );
    const title = live.length
      ? '지금 진행 중인 경기'
      : today.length
        ? '오늘의 경기'
        : nearest.length
          ? `${formatMatchDay(nearest[0].startTime)} 다음 경기`
          : '다음 경기';
    const completed = official
      .filter((match) => match.status === 'completed')
      .sort(compareMatchTimeDesc)
      .slice(0, 4);
    return { featured: chosen.slice(0, 4), featuredTitle: title, recent: completed };
  }, [matches, nowTs]);

  return (
    <section className="s26-section s26-match-board" aria-labelledby="match-board-title">
      <SectionHeading
        id="match-board-title"
        eyebrow="GAMES"
        title="일정과 결과를 한눈에"
        description="당일 경기가 없으면 가장 가까운 예정 경기를 보여드립니다."
        link="/schedule"
        linkLabel="전체 일정"
      />
      <div className="s26-match-board__columns">
        <div>
          <div className="s26-subheading">
            <h3>{featuredTitle}</h3>
            <span>{featured.length}경기</span>
          </div>
          {schedulePhase === 'loading' ? (
            <div className="s26-empty" role="status">일정을 불러오는 중입니다.</div>
          ) : featured.length ? (
            <div className="s26-match-list">{featured.map((match) => <MatchItem key={match.id} match={match} />)}</div>
          ) : (
            <div className="s26-empty">등록된 예정 경기가 없습니다.</div>
          )}
        </div>
        <div>
          <div className="s26-subheading">
            <h3>최근 경기 결과</h3>
            <Link to="/schedule/results">전체 결과</Link>
          </div>
          {schedulePhase === 'loading' ? (
            <div className="s26-empty" role="status">결과를 불러오는 중입니다.</div>
          ) : recent.length ? (
            <div className="s26-match-list">{recent.map((match) => <MatchItem key={match.id} match={match} />)}</div>
          ) : (
            <div className="s26-empty">아직 완료된 경기가 없습니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}

const formatWinPct = (row: HomeGroupView['rows'][number]) => {
  if (row.wins + row.losses === 0) return '-';
  return row.winPct === 1 ? '1.000' : row.winPct.toFixed(3).replace(/^0/, '');
};

function GroupStandings({
  groups,
  recordPhase,
  preferredTeamName,
}: Pick<Season2026HomeProps, 'groups' | 'recordPhase'> & { preferredTeamName: string | null }) {
  const [selectedGroup, setSelectedGroup] = useState<Season2026Group | null>(null);
  const preferredGroup = useMemo(() => {
    const key = preferredTeamName?.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
    if (!key) return null;
    return groups.find((group) => group.rows.some((row) =>
      row.teamName.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR') === key
    ))?.group ?? null;
  }, [groups, preferredTeamName]);
  const activeGroup = selectedGroup ?? preferredGroup ?? groups[0]?.group ?? 'A';
  const selected = groups.find((group) => group.group === activeGroup) ?? groups[0];
  const focusGroupTab = (index: number) => {
    if (!groups.length) return;
    const normalizedIndex = (index + groups.length) % groups.length;
    const nextGroup = groups[normalizedIndex]?.group;
    if (!nextGroup) return;
    setSelectedGroup(nextGroup);
    window.requestAnimationFrame(() => document.getElementById(`group-tab-${nextGroup}`)?.focus());
  };
  const handleGroupTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusGroupTab(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusGroupTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusGroupTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusGroupTab(groups.length - 1);
    }
  };

  return (
    <section className="s26-section s26-groups" aria-labelledby="group-title">
      <SectionHeading
        id="group-title"
        eyebrow="GROUP STANDINGS"
        title="A–H조 현황"
        description="1·2위는 현재 으뜸권, 3·4위는 현재 버금권입니다. 경계 순위가 동률이면 확정 대신 검토 중으로 표시합니다."
        link="/records?tab=standings"
        linkLabel="전체 순위"
      />

      <div className="s26-group-tabs" role="tablist" aria-label="조 선택">
        {groups.map((group, index) => (
          <button
            key={group.group}
            type="button"
            role="tab"
            aria-selected={activeGroup === group.group}
            aria-controls={`group-panel-${group.group}`}
            id={`group-tab-${group.group}`}
            className={activeGroup === group.group ? 'is-active' : undefined}
            tabIndex={activeGroup === group.group ? 0 : -1}
            onClick={() => setSelectedGroup(group.group)}
            onKeyDown={(event) => handleGroupTabKeyDown(event, index)}
          >
            {group.group}조
          </button>
        ))}
      </div>

      {selected ? (
        <div
          className="s26-group-panel"
          id={`group-panel-${selected.group}`}
          role="tabpanel"
          aria-labelledby={`group-tab-${selected.group}`}
        >
          <div className="s26-group-panel__meta">
            <div>
              <strong>{selected.group}조</strong>
              <span>{selected.rows.length}팀 참가</span>
            </div>
            <div>
              <span>조별리그 진행</span>
              <strong>{selected.completedGames} / {selected.expectedGames}경기</strong>
            </div>
          </div>

          {recordPhase === 'loading' && selected.source === 'team-directory' ? (
            <div className="s26-empty" role="status">조별 기록을 확인하는 중입니다.</div>
          ) : selected.rows.length ? (
            <div className="s26-table-wrap">
              <table className="s26-standings-table">
                <caption className="s26-visually-hidden">{selected.group}조 현재 순위</caption>
                <thead>
                  <tr>
                    <th scope="col">순위</th>
                    <th scope="col">팀</th>
                    <th scope="col">승</th>
                    <th scope="col">패</th>
                    <th scope="col">무</th>
                    <th scope="col">승률</th>
                    <th scope="col">현재 구간</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.rows.map((row) => (
                    <tr key={`${selected.group}-${row.teamId}-${row.teamName}`}>
                      <td><strong>{row.rank}{row.tied ? 'T' : ''}</strong></td>
                      <th scope="row">{row.teamName}</th>
                      <td>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{row.ties}</td>
                      <td>{formatWinPct(row)}</td>
                      <td><span className={qualificationClass(row.qualification)}>{row.qualificationLabel}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="s26-empty">표시할 조별 순위가 없습니다.</div>
          )}
          <p className="s26-group-note">
            이 표시는 현재 기록을 기준으로 한 임시 구간입니다. 시즌 종료 후 운영진이 명시적으로 확정한 경우에만 '확정'으로 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="s26-empty">조별 현황을 준비 중입니다.</div>
      )}
    </section>
  );
}

function BatterLeader({ player, index }: { player: BatterRanking; index: number }) {
  return (
    <Link className="s26-leader-row" to={`/records/player/${player.playerId}`}>
      <span>{index + 1}</span>
      <div><strong>{player.playerName}</strong><small>{player.teamName || '팀 미정'}</small></div>
      <div><strong>{player.battingAverage.toFixed(3).replace(/^0/, '')}</strong><small>AVG</small></div>
    </Link>
  );
}

function PitcherLeader({ player, index }: { player: PitcherRanking; index: number }) {
  return (
    <Link className="s26-leader-row" to={`/records/player/${player.playerId}`}>
      <span>{index + 1}</span>
      <div><strong>{player.playerName}</strong><small>{player.teamName || '팀 미정'}</small></div>
      <div><strong>{player.era.toFixed(2)}</strong><small>ERA</small></div>
    </Link>
  );
}

function RecordLeaders({ recordPhase, recordPayload }: Pick<Season2026HomeProps, 'recordPhase' | 'recordPayload'>) {
  const loading = recordPhase === 'loading';
  const batters = recordPayload?.batters.slice(0, 3) ?? [];
  const pitchers = recordPayload?.pitchers.slice(0, 3) ?? [];

  return (
    <section className="s26-section" aria-labelledby="leaders-title">
      <SectionHeading
        id="leaders-title"
        eyebrow="RECORD LEADERS"
        title="주목할 선수"
        description="규정 타석과 이닝 기준을 충족한 리그 기록 상위 선수입니다."
        link="/records"
        linkLabel="전체 기록"
      />
      <div className="s26-leader-grid">
        <div className="s26-leader-card">
          <div className="s26-subheading"><h3>타자 · 타율</h3><Link to="/records?tab=batters">상세</Link></div>
          {loading ? <div className="s26-empty" role="status">타자 기록 확인 중</div> : null}
          {!loading && batters.length ? batters.map((player, index) => <BatterLeader key={player.playerId} player={player} index={index} />) : null}
          {!loading && !batters.length ? <div className="s26-empty">공개된 타자 기록이 없습니다.</div> : null}
        </div>
        <div className="s26-leader-card">
          <div className="s26-subheading"><h3>투수 · 평균자책점</h3><Link to="/records?tab=pitchers">상세</Link></div>
          {loading ? <div className="s26-empty" role="status">투수 기록 확인 중</div> : null}
          {!loading && pitchers.length ? pitchers.map((player, index) => <PitcherLeader key={player.playerId} player={player} index={index} />) : null}
          {!loading && !pitchers.length ? <div className="s26-empty">공개된 투수 기록이 없습니다.</div> : null}
        </div>
      </div>
    </section>
  );
}

function NoticeList({ notices, phase }: { notices: Notice[]; phase: FeedPhase }) {
  if (phase === 'loading') return <div className="s26-empty" role="status">공지를 불러오는 중입니다.</div>;
  if (phase === 'error') return <div className="s26-empty" role="alert">공지를 확인하지 못했습니다.</div>;
  if (!notices.length) return <div className="s26-empty">등록된 공지가 없습니다.</div>;

  return (
    <div className="s26-notice-list">
      {notices.slice(0, 5).map((notice) => (
        <Link key={notice.id} to={`/community/notices/${notice.id}`}>
          <span>{notice.isImportant ? '중요' : notice.category}</span>
          <strong>{notice.title}</strong>
          <time dateTime={notice.createdAt ? new Date(notice.createdAt).toISOString() : undefined}>{formatNoticeDate(notice.createdAt)}</time>
        </Link>
      ))}
    </div>
  );
}

function MyTeamNotice({
  userSignedIn,
  myTeamId,
  myTeamName,
  teamNotices,
  phase,
}: Pick<Season2026HomeProps, 'userSignedIn' | 'myTeamId' | 'myTeamName' | 'teamNotices'> & { phase: Season2026HomeProps['teamNoticePhase'] }) {
  if (!userSignedIn) {
    return <div className="s26-empty">로그인하면 내 팀 공지를 확인할 수 있습니다. <Link to="/login">로그인</Link></div>;
  }
  if (phase === 'loading') return <div className="s26-empty" role="status">내 팀 공지 확인 중</div>;
  if (!myTeamId) return <div className="s26-empty">연결된 소속 팀이 없습니다.</div>;
  if (phase === 'error') return <div className="s26-empty" role="alert">내 팀 공지를 확인하지 못했습니다.</div>;

  return (
    <div className="s26-team-notices">
      <div className="s26-team-notices__name">
        <strong>{myTeamName || '내 팀'}</strong>
        <Link to={`/teams/${myTeamId}`}>팀 페이지</Link>
      </div>
      {teamNotices.length ? teamNotices.slice(0, 3).map((notice) => (
        <Link key={notice.id} to={`/teams/${myTeamId}/notices/${notice.id}`}>
          <span>{notice.pinned ? '고정 · ' : ''}{notice.category || '일반'}</span>
          <strong>{notice.title}</strong>
        </Link>
      )) : <div className="s26-empty">등록된 팀 공지가 없습니다.</div>}
    </div>
  );
}

function CommunityBoard(props: Pick<
  Season2026HomeProps,
  'notices' | 'noticePhase' | 'userSignedIn' | 'myTeamId' | 'myTeamName' | 'teamNotices' | 'teamNoticePhase'
>) {
  return (
    <section className="s26-section" aria-labelledby="community-title">
      <SectionHeading
        id="community-title"
        eyebrow="COMMUNITY"
        title="리그와 내 팀의 소식"
        link="/community/notices"
        linkLabel="전체 공지"
      />
      <div className="s26-community-grid">
        <div>
          <div className="s26-subheading"><h3>운영 공지</h3><span>최신 {props.notices.length}건</span></div>
          <NoticeList notices={props.notices} phase={props.noticePhase} />
        </div>
        <div>
          <div className="s26-subheading"><h3>내 팀 공지</h3><Link to="/teams">팀 허브</Link></div>
          <MyTeamNotice
            userSignedIn={props.userSignedIn}
            myTeamId={props.myTeamId}
            myTeamName={props.myTeamName}
            teamNotices={props.teamNotices}
            phase={props.teamNoticePhase}
          />
        </div>
      </div>
    </section>
  );
}

function PartnerLinks({ allstarEnabled }: { allstarEnabled: boolean }) {
  return (
    <section className="s26-links" aria-labelledby="official-links-title">
      <div>
        <p className="s26-eyebrow">OFFICIAL LINKS</p>
        <h2 id="official-links-title">오피셜 파트너 · 채널</h2>
      </div>
      <div className="s26-links__items">
        <a href={UNIQUE_PLAY_URL} target="_blank" rel="noreferrer"><span>RECORD PARTNER</span><strong>UniquePlay</strong><b aria-hidden="true">↗</b></a>
        <a href={GOLDBALLPARK_URL} target="_blank" rel="noreferrer"><span>OFFICIAL BALL</span><strong>골드볼파크 · 공인구</strong><b aria-hidden="true">↗</b></a>
        <a href={BASEBALL_MAJOR_URL} target="_blank" rel="noreferrer"><span>BAT</span><strong>메이저 · 배트</strong><b aria-hidden="true">↗</b></a>
        <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><span>OFFICIAL SOCIAL</span><strong>@aubl_1981</strong><b aria-hidden="true">↗</b></a>
        {allstarEnabled ? (
          <Link to="/allstar"><span>2026 EVENT</span><strong>AUBL ALL-STAR</strong><b aria-hidden="true">→</b></Link>
        ) : (
          <Link to="/intro/teams"><span>2026 LEAGUE</span><strong>참가팀 · 조편성</strong><b aria-hidden="true">→</b></Link>
        )}
      </div>
    </section>
  );
}

export default function Season2026Home(props: Season2026HomeProps) {
  return (
    <div className="s26-home">
      <HomeAnnouncement announcement={props.announcement} />
      <CampaignHero landing={props.landing} />
      <FreshnessBar
        schedulePhase={props.schedulePhase}
        scheduleCheckedAt={props.scheduleCheckedAt}
        recordPhase={props.recordPhase}
        recordPayload={props.recordPayload}
      />
      <MatchBoard matches={props.matches} schedulePhase={props.schedulePhase} nowTs={props.nowTs} />
      <GroupStandings groups={props.groups} recordPhase={props.recordPhase} preferredTeamName={props.myTeamName} />
      <RecordLeaders recordPhase={props.recordPhase} recordPayload={props.recordPayload} />
      <CommunityBoard
        notices={props.notices}
        noticePhase={props.noticePhase}
        userSignedIn={props.userSignedIn}
        myTeamId={props.myTeamId}
        myTeamName={props.myTeamName}
        teamNotices={props.teamNotices}
        teamNoticePhase={props.teamNoticePhase}
      />
      <PartnerLinks allstarEnabled={props.allstarEnabled} />
    </div>
  );
}
