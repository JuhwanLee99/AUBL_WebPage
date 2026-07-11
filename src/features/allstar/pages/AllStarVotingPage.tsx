import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { CandidateCard } from '../components/CandidateCard';
import { VoteResultsPanel } from '../components/VoteResultsPanel';
import {
  ALL_STAR_EVENT_CONFIG,
  ALL_STAR_POSITIONS,
  POSITION_LABELS,
  TEAM_META,
} from '../data/eventConfig';
import { allStarVoteService, toBackendDivision } from '../services/votingService';
import type {
  AllStarDivision,
  AllStarPosition,
  AllStarTeam,
  BallotStatus,
  VoteEvent,
  VotePolicy,
  VoteResults,
  VotingCandidate,
  VotingContest,
  VotingStatus,
} from '../types';
import './AllStarVotingPage.css';

type PositionFilter = string | 'ALL';
type SelectionState = Record<string, string[]>;
type ShareFeedback = 'IDLE' | 'SHARED' | 'COPIED' | 'ERROR';
type AllStarPageView = 'VOTE' | 'RESULTS';
type BallotSource = {
  version: string;
  published: boolean;
  candidates: readonly VotingCandidate[];
  contests: readonly VotingContest[];
};

const SELECTION_STORAGE_PREFIX = 'aubl:allstar-vote-draft';

const EVENT_CONFIG = ALL_STAR_EVENT_CONFIG;
const TEAMS: readonly AllStarTeam[] = ['TEAM_1', 'TEAM_2'];

const DRAFT_PREVIEW_CANDIDATES: readonly VotingCandidate[] = TEAMS.flatMap((draftTeam) =>
  ALL_STAR_POSITIONS.flatMap((position) =>
    Array.from({ length: 5 }, (_, index) => ({
      id: `preview-${draftTeam.toLowerCase()}-${position.toLowerCase()}-${index + 1}`,
      division: 'ALL_STAR' as const,
      team: draftTeam,
      position,
      name: `후보 ${index + 1}`,
      school: '명단 확정 전',
      group: '',
      draft: true,
    })),
  ),
);

const positionLabel = (position: string) => POSITION_LABELS[position as AllStarPosition] ?? position;

const positionSortIndex = (position: string) => {
  const index = ALL_STAR_POSITIONS.indexOf(position as AllStarPosition);
  return index < 0 ? ALL_STAR_POSITIONS.length : index;
};

const normalizeTeam = (side: string | undefined, contestId: string): AllStarTeam => {
  const token = `${side ?? ''} ${contestId}`.toUpperCase().replace(/[\s_-]/g, '');
  return token.includes('TEAM2') || token.includes('2팀') ? 'TEAM_2' : 'TEAM_1';
};

const readDivisionFromUrl = (): AllStarDivision => {
  if (typeof window === 'undefined') return 'ALL_STAR';
  return new URLSearchParams(window.location.search).get('division') === 'rookie' ? 'ROOKIE' : 'ALL_STAR';
};

const readPageViewFromUrl = (): AllStarPageView => {
  if (typeof window === 'undefined') return 'VOTE';
  return new URLSearchParams(window.location.search).get('view') === 'results' ? 'RESULTS' : 'VOTE';
};

const getSelectionStorageKey = (division: AllStarDivision, version: string) =>
  `${SELECTION_STORAGE_PREFIX}:${EVENT_CONFIG.eventId}:${toBackendDivision(division)}:${version}`;

const restoreSelections = (raw: string | null, source: BallotSource): SelectionState => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    return Object.fromEntries(
      source.contests.flatMap((contest) => {
        const saved = record[contest.id];
        if (!Array.isArray(saved)) return [];
        const allowed = new Set(contest.candidateIds);
        const candidateIds = Array.from(
          new Set(saved.filter((candidateId): candidateId is string => typeof candidateId === 'string' && allowed.has(candidateId))),
        ).slice(0, contest.maxSelections);
        return candidateIds.length ? [[contest.id, candidateIds] as const] : [];
      }),
    );
  } catch {
    return {};
  }
};

const formatDateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getPolicyLabel = (policy: VotePolicy) =>
  policy === 'ONCE_PER_DAY' ? 'Google 계정당 하루 1회' : 'Google 계정당 1회';

const DRAFT_BALLOT_SOURCE: BallotSource = {
  version: EVENT_CONFIG.candidateVersion,
  published: false,
  candidates: DRAFT_PREVIEW_CANDIDATES,
  contests: TEAMS.flatMap((team) =>
    ALL_STAR_POSITIONS.map((position) => ({
      id: `${team}:${position}`,
      label: `${TEAM_META[team].label} ${POSITION_LABELS[position]}`,
      team,
      position,
      candidateIds: DRAFT_PREVIEW_CANDIDATES.filter(
        (candidate) => candidate.team === team && candidate.position === position,
      ).map((candidate) => candidate.id),
      minSelections: 1,
      maxSelections: EVENT_CONFIG.maxSelectionsByPosition[position],
    })),
  ),
};

const buildPublishedBallotSource = (event: VoteEvent): BallotSource | null => {
  const candidateSet = event.candidateSet;
  if (!candidateSet) return null;

  const contests = Object.values(candidateSet.contests)
    .map((contest) => {
      const firstCandidate = candidateSet.candidates[contest.candidateIds[0] ?? ''];
      return {
        id: contest.id,
        label: contest.label,
        team: normalizeTeam(contest.side ?? firstCandidate?.side, contest.id),
        position: contest.position ?? firstCandidate?.position ?? contest.label,
        candidateIds: [...contest.candidateIds],
        minSelections: contest.minSelections,
        maxSelections: contest.maxSelections,
      } satisfies VotingContest;
    })
    .sort((left, right) => {
      if (left.team !== right.team) return left.team.localeCompare(right.team);
      const byPosition = positionSortIndex(left.position) - positionSortIndex(right.position);
      return byPosition || left.label.localeCompare(right.label, 'ko');
    });

  const membership = new Map<string, VotingContest>();
  contests.forEach((contest) => {
    contest.candidateIds.forEach((candidateId) => {
      if (!membership.has(candidateId)) membership.set(candidateId, contest);
    });
  });

  const candidates = Object.values(candidateSet.candidates).map((candidate) => {
    const contest = membership.get(candidate.id);
    return {
      id: candidate.id,
      division: event.division,
      team: contest?.team ?? normalizeTeam(candidate.side, candidate.id),
      position: contest?.position ?? candidate.position ?? '후보',
      name: candidate.name,
      school: candidate.school ?? '학교 정보 준비 중',
      group: (candidate.group ?? '').replace(/조$/, ''),
      draft: false,
      number: candidate.number,
    } satisfies VotingCandidate;
  });

  return {
    version: candidateSet.version,
    published: true,
    candidates,
    contests,
  };
};

function RookiePreparation() {
  return (
    <section className="allstar-rookie" aria-labelledby="rookie-preparation-title">
      <div className="allstar-rookie__mark" aria-hidden="true">R</div>
      <p className="allstar-eyebrow">ROOKIE SHOWCASE</p>
      <h2 id="rookie-preparation-title">루키 후보를 준비하고 있어요</h2>
      <p>출전 기준과 포지션 구성을 확정한 뒤 후보 명단을 공개합니다. 올스타 투표와는 별도 투표로 진행됩니다.</p>
      <ol className="allstar-progress" aria-label="루키 투표 준비 단계">
        <li className="is-current"><span>1</span><strong>후보 검토</strong></li>
        <li><span>2</span><strong>명단 확정</strong></li>
        <li><span>3</span><strong>투표 오픈</strong></li>
      </ol>
    </section>
  );
}

function CandidateUnavailable({ loading }: { loading: boolean }) {
  return (
    <section className="allstar-rookie" aria-live="polite">
      <div className="allstar-rookie__mark" aria-hidden="true">{loading ? '···' : '!'}</div>
      <p className="allstar-eyebrow">AUBL ALL-STAR VOTE</p>
      <h2>{loading ? '투표 정보를 불러오고 있어요' : '공개 후보를 준비하고 있어요'}</h2>
      <p>{loading ? '잠시만 기다려 주세요.' : '후보가 공개되면 이 페이지에서 바로 확인하고 투표할 수 있습니다.'}</p>
    </section>
  );
}

type AllStarInfoHeroProps = {
  title: string;
  opensAt: string | null;
  closesAt: string | null;
  gameStartsAt: string | null;
  venue: string | null;
};

const formatVotingPeriod = (opensAt: string | null, closesAt: string | null) => {
  const opens = formatDateTime(opensAt);
  const closes = formatDateTime(closesAt);
  if (opens && closes) return `${opens} – ${closes}`;
  if (opens) return `${opens}부터`;
  if (closes) return `${closes}까지`;
  return '투표 일정 확정 후 공개';
};

function AllStarInfoHero({
  title,
  opensAt,
  closesAt,
  gameStartsAt,
  venue,
}: AllStarInfoHeroProps) {
  const details = [
    {
      key: 'vote',
      label: '투표 기간',
      value: formatVotingPeriod(opensAt, closesAt),
    },
    {
      key: 'game',
      label: '올스타전 일시',
      value: formatDateTime(gameStartsAt) ?? '경기 일정 확정 후 공개',
    },
    {
      key: 'venue',
      label: '올스타전 장소',
      value: venue?.trim() || '경기 장소 확정 후 공개',
    },
  ];

  return (
    <section className="allstar-info-hero" aria-labelledby="allstar-page-title">
      <header className="allstar-info-hero__header">
        <div>
          <p>{title}</p>
          <h1 id="allstar-page-title">올스타전 안내</h1>
        </div>
      </header>

      <div className="allstar-info-hero__details">
        {details.map((detail) => (
          <article className={`is-${detail.key}`} key={detail.key}>
            <small>{detail.label}</small>
            <strong>{detail.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function AllStarVotingPage() {
  const { user, idToken, initializing, error: authError, loginWithGoogle } = useAuth();
  const [division, setDivision] = useState<AllStarDivision>(readDivisionFromUrl);
  const [pageView, setPageView] = useState<AllStarPageView>(readPageViewFromUrl);
  const [voteEvent, setVoteEvent] = useState<VoteEvent | null>(null);
  const [voteResults, setVoteResults] = useState<VoteResults | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [team, setTeam] = useState<AllStarTeam>('TEAM_1');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL');
  const [selections, setSelections] = useState<SelectionState>({});
  const [ballotStatus, setBallotStatus] = useState<BallotStatus | null>(null);
  const [ballotStatusLoading, setBallotStatusLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>('IDLE');
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingBottomTeam, setPendingBottomTeam] = useState<AllStarTeam | null>(null);
  const topTeamButtonRefs = useRef<Partial<Record<AllStarTeam, HTMLButtonElement | null>>>({});

  const serviceAvailable = allStarVoteService.isAvailable;
  const draftPreviewEnabled =
    import.meta.env.DEV || import.meta.env.VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES === 'true';

  useEffect(() => {
    const syncFromHistory = () => {
      setDivision(readDivisionFromUrl());
      setPageView(readPageViewFromUrl());
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const nextDivision = toBackendDivision(division);
    const nextView = pageView === 'RESULTS' ? 'results' : null;
    const divisionMatches = url.searchParams.get('division') === nextDivision;
    const viewMatches = nextView
      ? url.searchParams.get('view') === nextView
      : !url.searchParams.has('view');
    if (divisionMatches && viewMatches) return;
    url.searchParams.set('division', nextDivision);
    if (nextView) url.searchParams.set('view', nextView);
    else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [division, pageView]);

  useEffect(() => {
    if (division === 'ROOKIE' && pageView === 'RESULTS') setPageView('VOTE');
  }, [division, pageView]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title =
      division === 'ROOKIE'
        ? '2026 AUBL 루키 팬 투표'
        : pageView === 'RESULTS'
          ? '2026 AUBL 올스타 실시간 투표 현황'
          : '2026 AUBL 올스타 팬 투표';
    return () => {
      document.title = previousTitle;
    };
  }, [division, pageView]);

  useEffect(() => {
    let cancelled = false;
    setEventError(null);
    if (!serviceAvailable) {
      setVoteEvent(null);
      setEventLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setEventLoading(true);
    setVoteEvent(null);
    void allStarVoteService
      .getVoteEvent({ eventId: EVENT_CONFIG.eventId, division })
      .then((event) => {
        if (!cancelled) setVoteEvent(event);
      })
      .catch(() => {
        if (!cancelled) setEventError('투표 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        if (!cancelled) setEventLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [division, serviceAvailable]);

  const useDraftPreview =
    division === 'ALL_STAR' &&
    draftPreviewEnabled &&
    (!serviceAvailable || (voteEvent?.state === 'DRAFT' && !voteEvent.candidateSet) || Boolean(eventError));

  const ballotSource = useMemo(() => {
    if (voteEvent?.candidateSet) return buildPublishedBallotSource(voteEvent);
    return useDraftPreview ? DRAFT_BALLOT_SOURCE : null;
  }, [useDraftPreview, voteEvent]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | null = null;
    const canLoadResults =
      division === 'ALL_STAR' && serviceAvailable && Boolean(voteEvent?.published);

    if (!canLoadResults) {
      setVoteResults(null);
      return () => {
        cancelled = true;
      };
    }

    const loadResults = () => {
      void allStarVoteService
        .getVoteResults({ eventId: EVENT_CONFIG.eventId, division })
        .then((result) => {
          if (!cancelled) setVoteResults(result);
        })
        .catch(() => {
          if (!cancelled) setVoteResults(null);
        });
    };

    loadResults();
    refreshTimer = window.setInterval(loadResults, 60_000);

    return () => {
      cancelled = true;
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
    };
  }, [division, serviceAvailable, voteEvent?.candidateVersion, voteEvent?.published]);

  const selectionStorageKey = ballotSource
    ? getSelectionStorageKey(division, ballotSource.version)
    : null;
  const hasDirectGoogleIdentity = Boolean(
    user?.providerData.some((provider) => provider.providerId === 'google.com'),
  );
  const hasAllowedCustomIdentity = Boolean(
    user && user.providerData.length === 0 && voteEvent?.allowedAuthProviders.includes('custom'),
  );
  const votingIdentityEligible = hasDirectGoogleIdentity || hasAllowedCustomIdentity;

  const runtimeStatus: VotingStatus = serviceAvailable ? voteEvent?.state ?? 'DISABLED' : EVENT_CONFIG.status;
  const runtimePolicy = voteEvent?.policy ?? EVENT_CONFIG.votePolicy;
  const previewResults = Boolean(ballotSource && !ballotSource.published);
  const publishedResultCounts =
    voteResults?.available && voteResults.candidateVersion === ballotSource?.version
      ? voteResults.counts
      : null;

  const candidateById = useMemo(
    () => new Map((ballotSource?.candidates ?? []).map((candidate) => [candidate.id, candidate])),
    [ballotSource],
  );

  const displayTeams = useMemo(() => {
    if (!ballotSource) return TEAMS;
    const available = TEAMS.filter((targetTeam) => ballotSource.contests.some((contest) => contest.team === targetTeam));
    return available.length ? available : TEAMS;
  }, [ballotSource]);

  useEffect(() => {
    if (!displayTeams.includes(team)) setTeam(displayTeams[0] ?? 'TEAM_1');
  }, [displayTeams, team]);

  const availablePositions = useMemo(() => {
    if (!ballotSource) return [];
    return Array.from(
      new Set(ballotSource.contests.filter((contest) => contest.team === team).map((contest) => contest.position)),
    ).sort((left, right) => positionSortIndex(left) - positionSortIndex(right) || left.localeCompare(right, 'ko'));
  }, [ballotSource, team]);

  useEffect(() => {
    if (positionFilter !== 'ALL' && !availablePositions.includes(positionFilter)) setPositionFilter('ALL');
  }, [availablePositions, positionFilter]);

  useEffect(() => {
    setPositionFilter('ALL');
    setBallotStatus(null);
    setNotice(null);
    setConfirmOpen(false);

    if (!ballotSource || !selectionStorageKey) {
      setSelections({});
      return;
    }

    try {
      const currentDivisionPrefix = `${SELECTION_STORAGE_PREFIX}:${EVENT_CONFIG.eventId}:${toBackendDivision(division)}:`;
      Object.keys(window.sessionStorage).forEach((key) => {
        if (key.startsWith(currentDivisionPrefix) && key !== selectionStorageKey) {
          window.sessionStorage.removeItem(key);
        }
      });
      setSelections(restoreSelections(window.sessionStorage.getItem(selectionStorageKey), ballotSource));
    } catch {
      setSelections({});
    }
  }, [ballotSource, division, selectionStorageKey]);

  const persistSelections = useCallback(
    (nextSelections: SelectionState) => {
      if (!selectionStorageKey) return;
      try {
        const hasSelection = Object.values(nextSelections).some((candidateIds) => candidateIds.length > 0);
        if (hasSelection) {
          window.sessionStorage.setItem(selectionStorageKey, JSON.stringify(nextSelections));
        } else {
          window.sessionStorage.removeItem(selectionStorageKey);
        }
      } catch {
        // Storage can be unavailable in strict private browsing modes; voting still works in-memory.
      }
    },
    [selectionStorageKey],
  );

  useEffect(() => {
    let cancelled = false;
    const canLoadStatus =
      runtimeStatus === 'OPEN' &&
      Boolean(voteEvent?.published && ballotSource?.published) &&
      Boolean(user && idToken && votingIdentityEligible) &&
      serviceAvailable;
    if (!canLoadStatus) {
      setBallotStatus(null);
      setBallotStatusLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setBallotStatusLoading(true);
    void allStarVoteService
      .getBallotStatus({ eventId: EVENT_CONFIG.eventId, division })
      .then((status) => {
        if (!cancelled) setBallotStatus(status);
      })
      .catch(() => {
        if (!cancelled) setBallotStatus({ eligibility: 'UNAVAILABLE', votedAt: null, nextEligibleAt: null });
      })
      .finally(() => {
        if (!cancelled) setBallotStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ballotSource?.published, division, idToken, runtimeStatus, serviceAvailable, user, voteEvent?.published, votingIdentityEligible]);

  const visibleContests = useMemo(() => {
    if (!ballotSource) return [];
    return ballotSource.contests.filter(
      (contest) => contest.team === team && (positionFilter === 'ALL' || contest.position === positionFilter),
    );
  }, [ballotSource, positionFilter, team]);

  const selectedCandidates = useMemo(
    () =>
      Array.from(new Set(Object.values(selections).flat()))
        .map((id) => candidateById.get(id))
        .filter((candidate): candidate is VotingCandidate => Boolean(candidate)),
    [candidateById, selections],
  );

  const selectedForTeam = selectedCandidates.filter((candidate) => candidate.team === team);

  const contestProgress = useMemo(
    () =>
      (ballotSource?.contests ?? []).map((contest) => {
        const count = (selections[contest.id] ?? []).length;
        return { contest, count, complete: count >= contest.minSelections && count <= contest.maxSelections };
      }),
    [ballotSource, selections],
  );

  const completedContestCount = contestProgress.filter((item) => item.complete).length;
  const remainingContestCount = contestProgress.length - completedContestCount;
  const ballotComplete = contestProgress.length > 0 && remainingContestCount === 0;
  const teamOneProgress = contestProgress.filter((item) => item.contest.team === 'TEAM_1');
  const teamTwoProgress = contestProgress.filter((item) => item.contest.team === 'TEAM_2');
  const teamOneComplete = teamOneProgress.length > 0 && teamOneProgress.every((item) => item.complete);
  const teamTwoComplete = teamTwoProgress.length > 0 && teamTwoProgress.every((item) => item.complete);
  const activeTeamProgress = team === 'TEAM_1' ? teamOneProgress : teamTwoProgress;
  const activeTeamCompletedCount = activeTeamProgress.filter((item) => item.complete).length;
  const guideToTeamTwo =
    team === 'TEAM_1' &&
    teamOneComplete &&
    !teamTwoComplete &&
    displayTeams.includes('TEAM_2');

  const handleBottomTeamSelect = useCallback((nextTeam: AllStarTeam) => {
    setTeam(nextTeam);
    setPositionFilter('ALL');
    setPendingBottomTeam(nextTeam);
  }, []);

  useEffect(() => {
    if (!pendingBottomTeam) return;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('allstar-ballot')?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      topTeamButtonRefs.current[pendingBottomTeam]?.focus({ preventScroll: true });
      setPendingBottomTeam(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingBottomTeam]);

  const toggleCandidate = useCallback((contest: VotingContest, candidate: VotingCandidate) => {
    setNotice(null);
    setSelections((current) => {
      const currentIds = current[contest.id] ?? [];
      if (currentIds.includes(candidate.id)) {
        const next = { ...current, [contest.id]: currentIds.filter((id) => id !== candidate.id) };
        persistSelections(next);
        return next;
      }
      const selectedElsewhere = Object.entries(current).some(
        ([contestId, candidateIds]) => contestId !== contest.id && candidateIds.includes(candidate.id),
      );
      if (selectedElsewhere || currentIds.length >= contest.maxSelections) return current;
      const next = { ...current, [contest.id]: [...currentIds, candidate.id] };
      persistSelections(next);
      return next;
    });
  }, [persistSelections]);

  const handleGoogleLogin = useCallback(async () => {
    if (!consentAgreed) {
      setNotice('Google 로그인 전에 이용약관과 개인정보 처리방침에 동의해 주세요.');
      window.requestAnimationFrame(() => {
        document.getElementById('allstar-login-consent')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    persistSelections(selections);
    setAuthLoading(true);
    setNotice(null);
    try {
      const useRedirect =
        window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches;
      await loginWithGoogle({ useRedirect });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setAuthLoading(false);
    }
  }, [consentAgreed, loginWithGoogle, persistSelections, selections]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title:
        division === 'ROOKIE'
          ? '2026 AUBL 루키 팬 투표'
          : pageView === 'RESULTS'
            ? '2026 AUBL 올스타 실시간 투표 현황'
            : '2026 AUBL 올스타 팬 투표',
      text:
        pageView === 'RESULTS'
          ? '포지션별 득표 순위와 현재 TOP 2 라인업을 확인해 보세요.'
          : '후보를 확인하고 최종 로스터를 함께 완성해 주세요.',
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareFeedback('SHARED');
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setShareFeedback('COPIED');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareFeedback('ERROR');
    }
    window.setTimeout(() => setShareFeedback('IDLE'), 2400);
  }, [division, pageView]);

  const exactSelections = useMemo(
    () =>
      Object.fromEntries(
        (ballotSource?.contests ?? []).map((contest) => [contest.id, selections[contest.id] ?? []]),
      ),
    [ballotSource, selections],
  );

  const submitBallot = useCallback(async () => {
    const canAttemptSubmit =
      runtimeStatus === 'OPEN' &&
      serviceAvailable &&
      Boolean(voteEvent?.published && ballotSource?.published) &&
      Boolean(user && idToken && votingIdentityEligible) &&
      ballotStatus?.eligibility === 'ELIGIBLE' &&
      ballotComplete;
    if (!canAttemptSubmit || !voteEvent) return;

    setConfirmOpen(false);
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await allStarVoteService.submitBallot({
        eventId: voteEvent.eventId,
        division,
        candidateVersion: voteEvent.candidateVersion,
        selections: exactSelections,
      });
      setBallotStatus({
        eligibility: 'ALREADY_VOTED',
        votedAt: result.submittedAt,
        nextEligibleAt: result.nextEligibleAt,
      });
      if (selectionStorageKey) {
        try {
          window.sessionStorage.removeItem(selectionStorageKey);
        } catch {
          // Ignore storage cleanup failures after a successful server submission.
        }
      }
      setNotice('투표가 정상적으로 제출됐습니다. 참여해 주셔서 감사합니다.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '투표를 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [ballotComplete, ballotSource?.published, ballotStatus?.eligibility, division, exactSelections, idToken, runtimeStatus, selectionStorageKey, serviceAvailable, user, voteEvent, votingIdentityEligible]);

  const currentContest =
    positionFilter === 'ALL'
      ? null
      : ballotSource?.contests.find((contest) => contest.team === team && contest.position === positionFilter) ?? null;
  const currentContestIds = currentContest ? selections[currentContest.id] ?? [] : [];
  const alreadyVoted = ballotStatus?.eligibility === 'ALREADY_VOTED';
  const ballotInteractionLocked = runtimeStatus === 'CLOSED' || runtimeStatus === 'DISABLED' || alreadyVoted;
  const publishedReady = Boolean(voteEvent?.published && ballotSource?.published);
  const canSubmit =
    runtimeStatus === 'OPEN' &&
    serviceAvailable &&
    publishedReady &&
    Boolean(user && idToken && votingIdentityEligible) &&
    ballotStatus?.eligibility === 'ELIGIBLE' &&
    ballotComplete &&
    !submitting;
  const loginFromDock =
    runtimeStatus === 'OPEN' && publishedReady && (!user || !votingIdentityEligible) && !initializing;

  const submitLabel = (() => {
    if (eventLoading) return '투표 정보 확인 중';
    if (runtimeStatus === 'DRAFT') return '후보 확정 후 투표 시작';
    if (runtimeStatus === 'SCHEDULED') return '투표 오픈 예정';
    if (runtimeStatus === 'CLOSED') return '투표가 종료됐어요';
    if (runtimeStatus === 'DISABLED' || !serviceAvailable || !publishedReady) return '투표 시스템 준비 중';
    if (!user || !votingIdentityEligible) return authLoading ? 'Google 연결 중…' : 'Google 로그인 후 투표';
    if (ballotStatusLoading) return '투표 이력 확인 중';
    if (alreadyVoted) return runtimePolicy === 'ONCE_PER_DAY' ? '오늘 투표 완료' : '투표 완료';
    if (ballotStatus?.eligibility !== 'ELIGIBLE') return '투표 가능 상태 확인 필요';
    if (!ballotComplete) return `${remainingContestCount}개 항목을 더 선택해 주세요`;
    return submitting ? '제출 중…' : '선택한 후보로 투표하기';
  })();

  const showBallot = Boolean(ballotSource);

  return (
    <div className="allstar-page">
      <header className="allstar-header">
        <div className="allstar-header__inner">
          <div className="allstar-brand" aria-label="AUBL 올스타전">
            <span className="allstar-brand__mark">A</span>
            <span><strong>AUBL</strong><small>ALL-STAR 2026</small></span>
          </div>
          <button type="button" className="allstar-share" onClick={handleShare} aria-label="올스타 투표 링크 공유하기">
            <span aria-hidden="true">↗</span>
            {shareFeedback === 'COPIED' ? '복사됨' : shareFeedback === 'SHARED' ? '공유됨' : shareFeedback === 'ERROR' ? '다시 시도' : '공유'}
          </button>
        </div>
      </header>

      <main className="allstar-main">
        <div className="allstar-division" role="tablist" aria-label="투표 구분">
          <button type="button" role="tab" aria-selected={division === 'ALL_STAR'} className={division === 'ALL_STAR' ? 'is-active' : ''} onClick={() => setDivision('ALL_STAR')}>
            <span>ALL-STAR</span> 올스타
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={division === 'ROOKIE'}
            className={division === 'ROOKIE' ? 'is-active' : ''}
            onClick={() => {
              setDivision('ROOKIE');
              setPageView('VOTE');
            }}
          >
            <span>ROOKIE</span> 루키
          </button>
        </div>

        {division === 'ALL_STAR' ? (
          <AllStarInfoHero
            title={voteEvent?.title ?? EVENT_CONFIG.seasonLabel}
            opensAt={voteEvent?.opensAt ?? EVENT_CONFIG.opensAt}
            closesAt={voteEvent?.closesAt ?? EVENT_CONFIG.closesAt}
            gameStartsAt={voteEvent?.gameStartsAt ?? EVENT_CONFIG.gameStartsAt}
            venue={voteEvent?.venue ?? EVENT_CONFIG.venue}
          />
        ) : null}

        {division === 'ALL_STAR' ? (
          <div className="allstar-page-view" role="tablist" aria-label="올스타 페이지 보기">
            <button
              type="button"
              role="tab"
              aria-selected={pageView === 'VOTE'}
              className={pageView === 'VOTE' ? 'is-active' : ''}
              onClick={() => setPageView('VOTE')}
            >
              <span aria-hidden="true">✓</span>
              후보 투표
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pageView === 'RESULTS'}
              className={pageView === 'RESULTS' ? 'is-active' : ''}
              onClick={() => setPageView('RESULTS')}
            >
              <span aria-hidden="true">↗</span>
              투표 현황
            </button>
          </div>
        ) : null}

        {eventError ? <div className="allstar-notice" role="alert">{eventError}</div> : null}
        {authError ? (
          <div className="allstar-notice" role="alert">
            Google 로그인 상태를 확인하지 못했습니다. Chrome 또는 Safari에서 다시 시도해 주세요.
          </div>
        ) : null}
        {notice ? <div className="allstar-notice" role="alert">{notice}</div> : null}

        {division === 'ALL_STAR' && pageView === 'RESULTS' ? (
          <VoteResultsPanel
            candidates={ballotSource?.candidates ?? []}
            contests={ballotSource?.contests ?? []}
            resultCounts={publishedResultCounts}
            preview={previewResults}
            updatedAt={voteResults?.updatedAt ?? null}
            selectedTeam={team}
            onTeamChange={(nextTeam) => {
              setTeam(nextTeam);
              setPositionFilter('ALL');
            }}
          />
        ) : !showBallot ? (
          eventLoading ? <CandidateUnavailable loading /> : division === 'ROOKIE' ? <RookiePreparation /> : <CandidateUnavailable loading={false} />
        ) : (
          <>
            <section className="allstar-auth" aria-label="투표 로그인 상태">
              <div className="allstar-auth__icon" aria-hidden="true">G</div>
              <div className="allstar-auth__copy">
                <strong>
                  {votingIdentityEligible
                    ? '투표 계정 확인 완료'
                    : user
                      ? 'Google 계정으로 다시 로그인해 주세요'
                      : '투표에는 Google 로그인이 필요해요'}
                </strong>
                <span>
                  {user && votingIdentityEligible
                    ? runtimeStatus === 'OPEN' && publishedReady
                      ? ballotStatusLoading
                        ? '이전 투표 이력을 확인하고 있어요.'
                        : alreadyVoted
                          ? `${formatDateTime(ballotStatus?.votedAt ?? null) ?? ''} 투표를 완료했어요.`
                          : ballotStatus?.eligibility === 'ELIGIBLE'
                            ? '이 계정으로 투표할 준비가 됐어요.'
                            : '현재 투표 가능 상태를 확인하지 못했어요.'
                      : '투표 이력 조회는 투표 오픈 시 활성화됩니다.'
                    : user
                      ? '현재 로그인 방식으로는 Google 계정별 투표 자격을 확인할 수 없습니다.'
                    : `${getPolicyLabel(runtimePolicy)} 원칙으로 중복 투표를 방지합니다.`}
                </span>
                {!votingIdentityEligible ? <em>인앱 브라우저에서 로그인이 막히면 Chrome 또는 Safari로 열어 주세요.</em> : null}
              </div>
              {!votingIdentityEligible ? (
                <label className="allstar-auth__consent" id="allstar-login-consent">
                  <input
                    type="checkbox"
                    checked={consentAgreed}
                    onChange={(event) => setConsentAgreed(event.target.checked)}
                  />
                  <span>
                    <a href="/terms" target="_blank" rel="noreferrer">이용약관</a> 및{' '}
                    <a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리방침</a>에 동의합니다.
                  </span>
                </label>
              ) : null}
              {!votingIdentityEligible && !initializing ? (
                <button type="button" onClick={handleGoogleLogin} disabled={authLoading || !consentAgreed}>
                  {authLoading ? '연결 중…' : user ? 'Google 계정으로 전환' : 'Google 로그인'}
                </button>
              ) : null}
            </section>

            <section id="allstar-ballot" className="allstar-ballot" aria-labelledby="candidate-list-title">
              <div className="allstar-section-heading">
                <div>
                  <p className="allstar-eyebrow">{ballotSource?.published ? 'PUBLISHED NOMINEES' : 'DRAFT CANDIDATES'} · {ballotSource?.candidates.length ?? 0}</p>
                  <h2 id="candidate-list-title">{division === 'ROOKIE' ? '루키 후보' : '올스타 후보'}</h2>
                </div>
                <p>팀과 항목을 고른 뒤 표시된 선택 인원만큼 후보를 선택하세요.</p>
              </div>

              <div className="allstar-team-switch" role="group" aria-label="상단 팀 선택">
                {displayTeams.map((item) => (
                  <button
                    type="button"
                    key={item}
                    ref={(element) => {
                      topTeamButtonRefs.current[item] = element;
                    }}
                    aria-pressed={team === item}
                    className={`${team === item ? 'is-active ' : ''}is-${TEAM_META[item].tone}`}
                    onClick={() => setTeam(item)}
                  >
                    <span>{TEAM_META[item].label}</span>
                    <small>{TEAM_META[item].groups}</small>
                  </button>
                ))}
              </div>

              <div className="allstar-position-scroll">
                <div className="allstar-position-filter" aria-label="포지션 필터">
                  <button type="button" className={positionFilter === 'ALL' ? 'is-active' : ''} aria-pressed={positionFilter === 'ALL'} onClick={() => setPositionFilter('ALL')}>전체</button>
                  {availablePositions.map((position) => (
                    <button type="button" key={position} className={positionFilter === position ? 'is-active' : ''} aria-pressed={positionFilter === position} onClick={() => setPositionFilter(position)}>
                      {position}
                    </button>
                  ))}
                </div>
              </div>

              <div className="allstar-position-groups">
                {visibleContests.map((contest, contestIndex) => {
                  const selectedIds = selections[contest.id] ?? [];
                  const candidates = contest.candidateIds
                    .map((candidateId) => candidateById.get(candidateId))
                    .filter((candidate): candidate is VotingCandidate => Boolean(candidate));
                  return (
                    <section className="allstar-position-group" key={contest.id} aria-labelledby={`contest-${contestIndex}-title`}>
                      <div className="allstar-position-group__heading">
                        <h3 id={`contest-${contestIndex}-title`}><span>{contest.position}</span>{contest.label}</h3>
                        <p><strong>{selectedIds.length}</strong> / {contest.maxSelections}명 선택{contest.minSelections > 0 ? ` · 최소 ${contest.minSelections}명` : ''}</p>
                      </div>
                      <div className="allstar-candidate-grid">
                        {candidates.map((candidate, index) => {
                          const selectedElsewhere = Object.entries(selections).some(
                            ([contestId, candidateIds]) => contestId !== contest.id && candidateIds.includes(candidate.id),
                          );
                          return (
                            <CandidateCard
                              key={candidate.id}
                              candidate={candidate}
                              selected={selectedIds.includes(candidate.id)}
                              selectionBlocked={selectedIds.length >= contest.maxSelections || selectedElsewhere}
                              interactionLocked={ballotInteractionLocked}
                              displayNumber={candidate.number ?? index + 1}
                              onToggle={(selectedCandidate) => toggleCandidate(contest, selectedCandidate)}
                            />
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className={`allstar-team-switch-footer${guideToTeamTwo ? ' is-guiding' : ''}`}>
                {guideToTeamTwo ? (
                  <div id="allstar-team-two-guidance" className="allstar-team-switch-footer__prompt" role="status" aria-live="polite">
                    <span aria-hidden="true">✓</span>
                    <span>
                      <strong>1팀 선택을 마쳤어요</strong>
                      <small>이제 2팀 후보를 선택해 전체 투표를 완성해 주세요.</small>
                    </span>
                  </div>
                ) : null}
                <div className="allstar-team-switch allstar-team-switch--bottom" role="group" aria-label="하단 팀 선택">
                  {displayTeams.map((item) => (
                    <button
                      type="button"
                      key={item}
                      aria-pressed={team === item}
                      aria-describedby={guideToTeamTwo && item === 'TEAM_2' ? 'allstar-team-two-guidance' : undefined}
                      className={`${team === item ? 'is-active ' : ''}is-${TEAM_META[item].tone}${guideToTeamTwo && item === 'TEAM_2' ? ' is-next-team' : ''}`}
                      onClick={() => handleBottomTeamSelect(item)}
                    >
                      <span>{TEAM_META[item].label}</span>
                      <small>{TEAM_META[item].groups}</small>
                      {guideToTeamTwo && item === 'TEAM_2' ? <em>다음 팀 →</em> : null}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {showBallot && pageView === 'VOTE' ? (
        <aside className="allstar-vote-dock" aria-label="투표 선택 요약">
          <div className="allstar-vote-dock__inner">
            <div className="allstar-vote-dock__summary" aria-live="polite">
              <span className="allstar-vote-dock__count">{selectedForTeam.length}</span>
              <span>
                <strong>{TEAM_META[team].label} 선택</strong>
                <small>
                  {positionFilter === 'ALL'
                    ? `${activeTeamCompletedCount}/${activeTeamProgress.length}개 항목 완료`
                    : `${positionLabel(positionFilter)} ${currentContestIds.length}/${currentContest?.maxSelections ?? 0}명`}
                </small>
              </span>
              {selectedForTeam.length > 0 ? (
                <button type="button" className="allstar-vote-dock__reset" onClick={() => {
                  setSelections((current) => {
                    const next = { ...current };
                    ballotSource?.contests.filter((contest) => contest.team === team).forEach((contest) => delete next[contest.id]);
                    persistSelections(next);
                    return next;
                  });
                }}>초기화</button>
              ) : null}
            </div>
            <button
              type="button"
              className="allstar-vote-dock__submit"
              disabled={loginFromDock ? authLoading : !canSubmit}
              onClick={loginFromDock ? handleGoogleLogin : () => setConfirmOpen(true)}
            >
              {submitLabel}
            </button>
            {!ballotSource?.published ? (
              <small>초안 선택은 이 탭에만 임시 보관되며 서버에는 저장되지 않습니다.</small>
            ) : null}
          </div>
        </aside>
      ) : null}

      {confirmOpen ? (
        <div
          className="allstar-confirm"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !submitting) setConfirmOpen(false);
          }}
        >
          <section
            className="allstar-confirm__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="allstar-confirm-title"
            aria-describedby="allstar-confirm-description"
          >
            <p className="allstar-eyebrow">FINAL CHECK</p>
            <h2 id="allstar-confirm-title">이대로 투표할까요?</h2>
            <p id="allstar-confirm-description">
              제출 후에는 선택을 수정할 수 없습니다. 아래 후보를 마지막으로 확인해 주세요.
            </p>
            <div className="allstar-confirm__summary">
              {contestProgress.map(({ contest, count }) => (
                <div key={contest.id}>
                  <span>{contest.label}</span>
                  <strong>
                    {(selections[contest.id] ?? [])
                      .map((candidateId) => candidateById.get(candidateId)?.name)
                      .filter((name): name is string => Boolean(name))
                      .join(' · ') || `${count}명 선택`}
                  </strong>
                </div>
              ))}
            </div>
            <div className="allstar-confirm__actions">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={submitting}>다시 확인</button>
              <button type="button" onClick={submitBallot} disabled={submitting}>
                {submitting ? '제출 중…' : '확인하고 투표 제출'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
