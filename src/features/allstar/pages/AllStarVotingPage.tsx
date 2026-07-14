import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from 'react';
import { gsap } from 'gsap';
import { useAuth } from '@shared/auth/AuthProvider';
import { CylinderCardCarousel } from '../components/CylinderCardCarousel';
import type { CardDisplayCandidate } from '../components/PlayerCardSurface';
import { RookieCandidateReview } from '../components/RookieCandidateReview';
import { VoteResultsPanel } from '../components/VoteResultsPanel';
import {
  ALL_STAR_EVENT_CONFIG,
  ALL_STAR_POSITIONS,
  POSITION_LABELS,
  TEAM_META,
} from '../data/eventConfig';
import { ROOKIE_SCHOOL_COUNT } from '../data/rookieCandidates';
import { allStarVoteService, toBackendDivision } from '../services/votingService';
import type {
  AllStarDivision,
  AllStarPosition,
  AllStarTeam,
  BallotStatus,
  VoteEvent,
  VoteResults,
  VotingCandidate,
  VotingContest,
  VotingStatus,
} from '../types';
import './AllStarVotingPage.css';
import './AllStarExperience.css';

type ExperienceView =
  | 'HUB'
  | 'CANDIDATES'
  | 'AUTH'
  | 'VOTE'
  | 'TEAM_REVIEW'
  | 'FINAL_REVIEW'
  | 'RESULTS'
  | 'THANKS';
type SelectionState = Record<string, string[]>;
type ShareFeedback = 'IDLE' | 'SHARED' | 'COPIED' | 'ERROR';
type BallotSource = {
  version: string;
  published: boolean;
  candidates: readonly VotingCandidate[];
  contests: readonly VotingContest[];
};

const EVENT_CONFIG = ALL_STAR_EVENT_CONFIG;
const TEAMS: readonly AllStarTeam[] = ['TEAM_1', 'TEAM_2'];
const INTRO_STORAGE_KEY = 'aubl:allstar:intro-seen:2026';
const SELECTION_STORAGE_PREFIX = 'aubl:allstar-vote-draft';

const normalizePosition = (position: string | undefined): AllStarPosition | null => {
  if (position === 'LF' || position === 'CF' || position === 'RF' || position === 'OF') return 'OF';
  return ALL_STAR_POSITIONS.includes(position as AllStarPosition)
    ? (position as AllStarPosition)
    : null;
};

const normalizeTeam = (side: string | undefined): AllStarTeam | null => {
  const token = (side ?? '').toUpperCase().replace(/[\s_-]/g, '');
  if (token === 'TEAM1' || token === '1팀') return 'TEAM_1';
  if (token === 'TEAM2' || token === '2팀') return 'TEAM_2';
  return null;
};

const readDivisionFromUrl = (): AllStarDivision => {
  if (typeof window === 'undefined') return 'ALL_STAR';
  return new URLSearchParams(window.location.search).get('division') === 'rookie' ? 'ROOKIE' : 'ALL_STAR';
};

const readViewFromUrl = (): ExperienceView => {
  if (typeof window === 'undefined') return 'HUB';
  const view = new URLSearchParams(window.location.search).get('view');
  if (readDivisionFromUrl() === 'ROOKIE') return view ? 'CANDIDATES' : 'HUB';
  if (view === 'results') return 'RESULTS';
  if (view === 'candidates') return 'CANDIDATES';
  if (view === 'vote') return 'AUTH';
  return 'HUB';
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

const formatVotingPeriod = (opensAt: string | null, closesAt: string | null) => {
  const opens = formatDateTime(opensAt);
  const closes = formatDateTime(closesAt);
  if (opens && closes) return `${opens} – ${closes}`;
  if (opens) return `${opens}부터`;
  if (closes) return `${closes}까지`;
  return '투표 일정 확정 후 공개';
};

const DRAFT_PREVIEW_CANDIDATES: readonly VotingCandidate[] = TEAMS.flatMap((team) =>
  ALL_STAR_POSITIONS.flatMap((position) =>
    Array.from({ length: position === 'OF' ? 15 : 5 }, (_, index) => ({
      id: `preview-${team.toLowerCase()}-${position.toLowerCase()}-${index + 1}`,
      division: 'ALL_STAR' as const,
      team,
      position,
      name: `${POSITION_LABELS[position]} 후보 ${index + 1}`,
      school: '최종 명단 확정 전',
      group: '',
      draft: true,
    })),
  ),
);

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
      minSelections: position === 'OF' ? 6 : 1,
      maxSelections: position === 'OF' ? 6 : 1,
    })),
  ),
};

const buildPublishedBallotSource = (event: VoteEvent): BallotSource | null => {
  const candidateSet = event.candidateSet;
  if (!candidateSet) return null;

  const contests: VotingContest[] = [];
  for (const contest of Object.values(candidateSet.contests)) {
    const firstCandidate = candidateSet.candidates[contest.candidateIds[0] ?? ''];
    const team = normalizeTeam(contest.side ?? firstCandidate?.side);
    const position = normalizePosition(contest.position ?? firstCandidate?.position);
    if (!team || !position) return null;
    contests.push({
      id: contest.id,
      label: `${TEAM_META[team].label} ${POSITION_LABELS[position]}`,
      team,
      position,
      candidateIds: [...contest.candidateIds],
      minSelections: contest.minSelections,
      maxSelections: contest.maxSelections,
    });
  }

  contests.sort((left, right) => {
    if (left.team !== right.team) return left.team.localeCompare(right.team);
    return ALL_STAR_POSITIONS.indexOf(left.position as AllStarPosition)
      - ALL_STAR_POSITIONS.indexOf(right.position as AllStarPosition);
  });

  const membership = new Map<string, VotingContest>();
  contests.forEach((contest) => contest.candidateIds.forEach((id) => membership.set(id, contest)));

  const candidates: VotingCandidate[] = [];
  for (const candidate of Object.values(candidateSet.candidates)) {
    const contest = membership.get(candidate.id);
    const team = contest?.team ?? normalizeTeam(candidate.side);
    const position = contest?.position ?? normalizePosition(candidate.position);
    if (!team || !position) return null;
    candidates.push({
      id: candidate.id,
      division: event.division,
      team,
      position,
      name: candidate.name,
      school: candidate.school ?? '학교 정보 준비 중',
      group: (candidate.group ?? '').replace(/조$/, ''),
      draft: false,
      number: candidate.number,
    });
  }

  return { version: candidateSet.version, published: true, candidates, contests };
};

const getSelectionStorageKey = (division: AllStarDivision, version: string) =>
  `${SELECTION_STORAGE_PREFIX}:${EVENT_CONFIG.eventId}:${toBackendDivision(division)}:${version}`;

const restoreSelections = (raw: string | null, source: BallotSource): SelectionState => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      source.contests.flatMap((contest) => {
        const value = parsed[contest.id];
        if (!Array.isArray(value)) return [];
        const allowed = new Set(contest.candidateIds);
        const ids = [...new Set(value.filter((id): id is string => typeof id === 'string' && allowed.has(id)))]
          .slice(0, contest.maxSelections);
        return ids.length ? [[contest.id, ids] as const] : [];
      }),
    );
  } catch {
    return {};
  }
};

const toCardCandidate = (candidate: VotingCandidate): CardDisplayCandidate => ({
  id: candidate.id,
  name: candidate.name,
  school: candidate.school,
  group: candidate.group,
  position: candidate.position,
  team: candidate.team,
  number: candidate.number,
});

function CandidateUnavailable({ loading = false }: { loading?: boolean }) {
  return (
    <section className="allstar-auth-gate" aria-live="polite">
      <h1>{loading ? '후보 정보를 불러오고 있어요' : '공개 후보를 준비하고 있어요'}</h1>
      <p>{loading ? '잠시만 기다려 주세요.' : '후보 세트가 공개되면 이 페이지에서 로그인 없이 확인할 수 있습니다.'}</p>
    </section>
  );
}

export default function AllStarVotingPage() {
  const { user, idToken, initializing, error: authError, loginWithGoogle } = useAuth();
  const introRef = useRef<HTMLElement | null>(null);
  const introTouchStartRef = useRef<number | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const advanceLockRef = useRef(false);
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    const isAllStarHubLoad = readDivisionFromUrl() === 'ALL_STAR' && !params.has('view');
    if (isAllStarHubLoad) return true;
    try { return window.sessionStorage.getItem(INTRO_STORAGE_KEY) !== '1'; } catch { return true; }
  });
  const [division, setDivision] = useState<AllStarDivision>(readDivisionFromUrl);
  const [view, setView] = useState<ExperienceView>(readViewFromUrl);
  const [voteEvent, setVoteEvent] = useState<VoteEvent | null>(null);
  const [voteResults, setVoteResults] = useState<VoteResults | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [reviewTeam, setReviewTeam] = useState<AllStarTeam>('TEAM_1');
  const [reviewPosition, setReviewPosition] = useState<AllStarPosition>('P');
  const [resultsTeam, setResultsTeam] = useState<AllStarTeam>('TEAM_1');
  const [wizardTeamIndex, setWizardTeamIndex] = useState(0);
  const [wizardPositionIndex, setWizardPositionIndex] = useState(0);
  const [selections, setSelections] = useState<SelectionState>({});
  const [ballotStatus, setBallotStatus] = useState<BallotStatus | null>(null);
  const [ballotStatusLoading, setBallotStatusLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback>('IDLE');
  const [previewThanks, setPreviewThanks] = useState(false);

  const serviceAvailable = allStarVoteService.isAvailable;
  const draftPreviewEnabled = import.meta.env.DEV || import.meta.env.VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES === 'true';

  useEffect(() => {
    const syncFromHistory = () => {
      setDivision(readDivisionFromUrl());
      setView(readViewFromUrl());
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (showIntro) shell.setAttribute('inert', '');
    else shell.removeAttribute('inert');
    return () => shell.removeAttribute('inert');
  }, [showIntro]);

  useEffect(() => {
    const intro = introRef.current;
    if (!showIntro || !intro) return;
    const preventPageScroll = (event: globalThis.TouchEvent) => event.preventDefault();
    intro.addEventListener('touchmove', preventPageScroll, { passive: false });
    return () => intro.removeEventListener('touchmove', preventPageScroll);
  }, [showIntro]);

  useEffect(() => {
    let cancelled = false;
    if (!serviceAvailable) {
      setVoteEvent(null);
      setEventLoading(false);
      return () => { cancelled = true; };
    }
    let hasLoaded = false;
    const load = (initial = false) => {
      if (initial) {
        setEventError(null);
        setEventLoading(true);
      }
      void allStarVoteService.getVoteEvent({ eventId: EVENT_CONFIG.eventId, division: 'ALL_STAR' })
        .then((event) => {
          if (cancelled) return;
          hasLoaded = true;
          setVoteEvent(event);
          setEventError(null);
        })
        .catch(() => {
          if (!cancelled && !hasLoaded) setEventError('투표 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        })
        .finally(() => { if (!cancelled && initial) setEventLoading(false); });
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') load(); };
    load(true);
    const timer = window.setInterval(load, 60_000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [serviceAvailable]);

  const useDraftPreview = division === 'ALL_STAR' && draftPreviewEnabled
    && (!serviceAvailable || (voteEvent?.state === 'DRAFT' && !voteEvent.candidateSet) || Boolean(eventError));
  const ballotSource = useMemo(() => {
    if (division !== 'ALL_STAR') return null;
    if (voteEvent?.candidateSet) return buildPublishedBallotSource(voteEvent);
    return useDraftPreview ? DRAFT_BALLOT_SOURCE : null;
  }, [division, useDraftPreview, voteEvent]);

  const runtimeStatus: VotingStatus = serviceAvailable ? voteEvent?.state ?? 'DISABLED' : EVENT_CONFIG.status;
  const previewMode = Boolean(ballotSource && !ballotSource.published);
  const votingOpen = runtimeStatus === 'OPEN' && Boolean(voteEvent?.published && ballotSource?.published) && serviceAvailable;
  const canEnterVote = previewMode || votingOpen;
  const eventReady = !serviceAvailable || voteEvent !== null || Boolean(eventError);
  const votePolicy = voteEvent?.policy ?? EVENT_CONFIG.votePolicy;
  const votePolicyLabel = votePolicy === 'ONCE_PER_DAY'
    ? 'Google 계정당 하루 1회'
    : 'Google 계정당 이벤트 1회';
  const resolvedView: ExperienceView = division === 'ROOKIE'
    ? (view === 'HUB' ? 'HUB' : 'CANDIDATES')
    : view === 'AUTH' && previewMode
      ? 'VOTE'
      : view === 'AUTH' && eventReady && !eventLoading && !canEnterVote
        ? 'HUB'
        : view;
  const chromelessView = resolvedView === 'CANDIDATES' || resolvedView === 'VOTE';
  const voteView = resolvedView === 'VOTE';
  const candidateView = division === 'ALL_STAR' && resolvedView === 'CANDIDATES';
  const viewportLocked = division === 'ALL_STAR'
    && (resolvedView === 'CANDIDATES' || resolvedView === 'VOTE');

  useEffect(() => {
    if (!viewportLocked) return;

    const root = document.documentElement;
    const body = document.body;
    const visualViewport = window.visualViewport;
    let frame = 0;
    const updateVisualHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const height = Math.floor(visualViewport?.height ?? window.innerHeight);
        root.style.setProperty('--allstar-visual-height', `${height}px`);
      });
    };

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    root.classList.add('allstar-viewport-locked');
    body.classList.add('allstar-viewport-locked');
    updateVisualHeight();
    visualViewport?.addEventListener('resize', updateVisualHeight);
    visualViewport?.addEventListener('scroll', updateVisualHeight);
    window.addEventListener('resize', updateVisualHeight);
    window.addEventListener('orientationchange', updateVisualHeight);

    return () => {
      window.cancelAnimationFrame(frame);
      visualViewport?.removeEventListener('resize', updateVisualHeight);
      visualViewport?.removeEventListener('scroll', updateVisualHeight);
      window.removeEventListener('resize', updateVisualHeight);
      window.removeEventListener('orientationchange', updateVisualHeight);
      root.classList.remove('allstar-viewport-locked');
      body.classList.remove('allstar-viewport-locked');
      root.style.removeProperty('--allstar-visual-height');
    };
  }, [viewportLocked]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('division', toBackendDivision(division));
    const publicView = resolvedView === 'RESULTS'
      ? 'results'
      : resolvedView === 'CANDIDATES'
        ? 'candidates'
        : ['AUTH', 'VOTE', 'TEAM_REVIEW', 'FINAL_REVIEW', 'THANKS'].includes(resolvedView)
          ? 'vote'
          : null;
    if (publicView) url.searchParams.set('view', publicView);
    else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [division, resolvedView]);

  useEffect(() => {
    const previous = document.title;
    document.title = division === 'ROOKIE'
      ? '2026 AUBL 루키 후보'
      : resolvedView === 'RESULTS'
        ? '2026 AUBL 올스타 투표 현황'
        : '2026 AUBL 올스타 팬 투표';
    return () => { document.title = previous; };
  }, [division, resolvedView]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    if (resolvedView !== 'RESULTS' || division !== 'ALL_STAR' || !serviceAvailable || !voteEvent?.published) {
      return () => { cancelled = true; };
    }
    const load = () => {
      void allStarVoteService.getVoteResults({ eventId: EVENT_CONFIG.eventId, division })
        .then((result) => { if (!cancelled) setVoteResults(result); })
        .catch(() => { /* keep the last successful public result during a transient failure */ });
    };
    load();
    timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [division, resolvedView, serviceAvailable, voteEvent?.candidateVersion, voteEvent?.published]);

  const selectionStorageKey = ballotSource ? getSelectionStorageKey(division, ballotSource.version) : null;
  const persistSelections = useCallback((next: SelectionState) => {
    if (!selectionStorageKey) return;
    try {
      const hasValue = Object.values(next).some((ids) => ids.length);
      if (hasValue) window.sessionStorage.setItem(selectionStorageKey, JSON.stringify(next));
      else window.sessionStorage.removeItem(selectionStorageKey);
    } catch { /* private browsing can disable storage */ }
  }, [selectionStorageKey]);

  useEffect(() => {
    if (!ballotSource || !selectionStorageKey) {
      setSelections({});
      return;
    }
    try {
      const prefix = `${SELECTION_STORAGE_PREFIX}:${EVENT_CONFIG.eventId}:${toBackendDivision(division)}:`;
      Object.keys(window.sessionStorage).forEach((key) => {
        if (key.startsWith(prefix) && key !== selectionStorageKey) window.sessionStorage.removeItem(key);
      });
      setSelections(restoreSelections(window.sessionStorage.getItem(selectionStorageKey), ballotSource));
    } catch { setSelections({}); }
  }, [ballotSource, division, selectionStorageKey]);

  const hasDirectGoogleIdentity = Boolean(user?.providerData.some((provider) => provider.providerId === 'google.com'));
  const hasAllowedCustomIdentity = Boolean(user && user.providerData.length === 0 && voteEvent?.allowedAuthProviders.includes('custom'));
  const votingIdentityEligible = hasDirectGoogleIdentity || hasAllowedCustomIdentity;

  useEffect(() => {
    let cancelled = false;
    if (!votingOpen || !user || !idToken || !votingIdentityEligible) {
      setBallotStatus(null);
      setBallotStatusLoading(false);
      return () => { cancelled = true; };
    }
    setBallotStatusLoading(true);
    void allStarVoteService.getBallotStatus({ eventId: EVENT_CONFIG.eventId, division: 'ALL_STAR' })
      .then((status) => { if (!cancelled) setBallotStatus(status); })
      .catch(() => { if (!cancelled) setBallotStatus({ eligibility: 'UNAVAILABLE', votedAt: null, nextEligibleAt: null }); })
      .finally(() => { if (!cancelled) setBallotStatusLoading(false); });
    return () => { cancelled = true; };
  }, [division, idToken, user, votingIdentityEligible, votingOpen]);

  useEffect(() => {
    if (view === 'AUTH' && votingOpen && user && votingIdentityEligible && !ballotStatusLoading) {
      if (ballotStatus?.eligibility === 'ALREADY_VOTED') {
        setNotice('이미 이 부문에 투표했습니다. 현재 투표 현황을 확인해 주세요.');
        setView('RESULTS');
      } else if (ballotStatus?.eligibility === 'ELIGIBLE') {
        setView('VOTE');
      }
    }
  }, [ballotStatus, ballotStatusLoading, user, view, votingIdentityEligible, votingOpen]);

  const candidateById = useMemo(
    () => new Map((ballotSource?.candidates ?? []).map((candidate) => [candidate.id, candidate])),
    [ballotSource],
  );

  const contestFor = useCallback((team: AllStarTeam, position: AllStarPosition) =>
    ballotSource?.contests.find((contest) => contest.team === team && contest.position === position) ?? null,
  [ballotSource]);

  const reviewContest = contestFor(reviewTeam, reviewPosition);
  const reviewCandidates = useMemo(
    () => (reviewContest?.candidateIds ?? []).flatMap((id) => {
      const candidate = candidateById.get(id);
      return candidate ? [toCardCandidate(candidate)] : [];
    }),
    [candidateById, reviewContest],
  );

  const currentTeam = TEAMS[wizardTeamIndex] ?? 'TEAM_1';
  const currentPosition = ALL_STAR_POSITIONS[wizardPositionIndex] ?? 'P';
  const currentContest = contestFor(currentTeam, currentPosition);
  const currentSelection = currentContest ? selections[currentContest.id] ?? [] : [];
  const currentCandidates = useMemo(
    () => (currentContest?.candidateIds ?? []).flatMap((id) => {
      const candidate = candidateById.get(id);
      return candidate ? [toCardCandidate(candidate)] : [];
    }),
    [candidateById, currentContest],
  );
  const currentComplete = Boolean(currentContest
    && currentSelection.length >= currentContest.minSelections
    && currentSelection.length <= currentContest.maxSelections);

  const ballotComplete = Boolean(ballotSource?.contests.length
    && ballotSource.contests.every((contest) => {
      const length = (selections[contest.id] ?? []).length;
      return length >= contest.minSelections && length <= contest.maxSelections;
    }));

  const completeIntro = useCallback(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setShowIntro(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      mainRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const dismissIntro = useCallback(() => {
    try { window.sessionStorage.setItem(INTRO_STORAGE_KEY, '1'); } catch { /* continue */ }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!introRef.current || reduced) {
      completeIntro();
      return;
    }
    gsap.to(introRef.current, {
      yPercent: -104,
      duration: 0.62,
      ease: 'power3.inOut',
      onComplete: completeIntro,
    });
  }, [completeIntro]);

  const handleIntroTouchStart = (event: TouchEvent<HTMLElement>) => {
    introTouchStartRef.current = event.touches[0]?.clientY ?? null;
  };
  const handleIntroTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = introTouchStartRef.current;
    introTouchStartRef.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientY ?? start;
    if (start - end >= 60) dismissIntro();
  };

  const goTo = (next: ExperienceView) => {
    setNotice(null);
    setView(next);
    window.scrollTo({
      top: 0,
      behavior: viewportLocked || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const resetWizard = () => {
    setWizardTeamIndex(0);
    setWizardPositionIndex(0);
    setPreviewThanks(false);
  };

  const startVote = () => {
    if (!canEnterVote || !ballotSource) return;
    resetWizard();
    if (previewMode) {
      goTo('VOTE');
      return;
    }
    if (user && votingIdentityEligible) {
      if (ballotStatus?.eligibility === 'ALREADY_VOTED') {
        setNotice(votePolicy === 'ONCE_PER_DAY' ? '오늘 투표를 이미 완료했습니다.' : '이미 투표를 완료했습니다.');
        goTo('RESULTS');
        return;
      }
      if (ballotStatus?.eligibility === 'ELIGIBLE') {
        goTo('VOTE');
        return;
      }
      goTo('AUTH');
      return;
    }
    goTo('AUTH');
  };

  const toggleCandidate = useCallback((candidate: CardDisplayCandidate) => {
    if (!currentContest) return;
    setSelections((current) => {
      const ids = current[currentContest.id] ?? [];
      let nextIds: string[];
      if (ids.includes(candidate.id)) nextIds = ids.filter((id) => id !== candidate.id);
      else if (currentContest.maxSelections === 1) nextIds = [candidate.id];
      else if (ids.length < currentContest.maxSelections) nextIds = [...ids, candidate.id];
      else return current;
      const next = { ...current, [currentContest.id]: nextIds };
      persistSelections(next);
      return next;
    });
  }, [currentContest, persistSelections]);

  const goToPreviousStep = () => {
    if (wizardPositionIndex > 0) {
      setWizardPositionIndex((index) => index - 1);
      return;
    }
    if (wizardTeamIndex > 0) {
      setWizardTeamIndex((index) => index - 1);
      setWizardPositionIndex(ALL_STAR_POSITIONS.length - 1);
      return;
    }
    goTo('HUB');
  };

  const confirmCurrentStep = () => {
    if (!currentComplete || advanceLockRef.current) return;
    advanceLockRef.current = true;
    if (wizardPositionIndex < ALL_STAR_POSITIONS.length - 1) {
      setWizardPositionIndex(wizardPositionIndex + 1);
      window.requestAnimationFrame(() => {
        advanceLockRef.current = false;
        mainRef.current?.focus({ preventScroll: true });
      });
      return;
    }
    setView('TEAM_REVIEW');
    window.requestAnimationFrame(() => {
      advanceLockRef.current = false;
      mainRef.current?.focus({ preventScroll: true });
    });
  };

  const continueAfterTeamReview = () => {
    if (wizardTeamIndex === 0) {
      setWizardTeamIndex(1);
      setWizardPositionIndex(0);
      goTo('VOTE');
    } else {
      goTo('FINAL_REVIEW');
    }
  };

  const handleGoogleLogin = async () => {
    if (!consentAgreed) {
      setNotice('Google 로그인 전에 이용약관과 개인정보 처리방침에 동의해 주세요.');
      return;
    }
    persistSelections(selections);
    setAuthLoading(true);
    setNotice(null);
    try {
      await loginWithGoogle({ useRedirect: true });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Google 로그인에 실패했습니다.');
    } finally {
      setAuthLoading(false);
    }
  };

  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isInAppBrowser = /(FBAN|FBAV|Instagram|KAKAOTALK|NAVER|Line\/|; wv\)|WebView)/i.test(userAgent);

  const copyText = async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('copy failed');
  };

  const openInChrome = () => {
    const { host, pathname, search, hash, protocol } = window.location;
    if (isAndroid) {
      window.location.href = `intent://${host}${pathname}${search}${hash}#Intent;scheme=${protocol.replace(':', '')};package=com.android.chrome;end`;
      return;
    }
    if (isIOS) {
      const scheme = protocol === 'https:' ? 'googlechromes' : 'googlechrome';
      window.location.href = `${scheme}://${host}${pathname}${search}${hash}`;
      window.setTimeout(() => setNotice('Chrome이 열리지 않으면 아래 링크 복사를 눌러 Chrome 주소창에 붙여 넣어 주세요.'), 1200);
      return;
    }
    void copyText(window.location.href)
      .then(() => setNotice('현재 링크를 복사했습니다. Chrome 주소창에 붙여 넣어 주세요.'))
      .catch(() => setNotice('주소창의 링크를 직접 복사해 Chrome에서 열어 주세요.'));
  };

  const copyCurrentLink = () => {
    void copyText(window.location.href)
      .then(() => setNotice('링크를 복사했습니다. Chrome 주소창에 붙여 넣어 주세요.'))
      .catch(() => setNotice('주소창의 링크를 직접 복사해 주세요.'));
  };

  const submitBallot = async () => {
    if (!ballotSource || !ballotComplete) return;
    if (previewMode) {
      setPreviewThanks(true);
      goTo('THANKS');
      return;
    }
    if (!voteEvent || !votingOpen || !user || !idToken || !votingIdentityEligible || ballotStatus?.eligibility !== 'ELIGIBLE') {
      setNotice('현재 계정의 투표 가능 상태를 확인하지 못했습니다. 다시 로그인해 주세요.');
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await allStarVoteService.submitBallot({
        eventId: EVENT_CONFIG.eventId,
        division: 'ALL_STAR',
        candidateVersion: ballotSource.version,
        selections: Object.fromEntries(ballotSource.contests.map((contest) => [contest.id, selections[contest.id] ?? []])),
      });
      if (selectionStorageKey) window.sessionStorage.removeItem(selectionStorageKey);
      setPreviewThanks(false);
      setBallotStatus({ eligibility: 'ALREADY_VOTED', votedAt: result.submittedAt, nextEligibleAt: result.nextEligibleAt });
      goTo('THANKS');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '투표 제출에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    const data = {
      title: division === 'ROOKIE' ? '2026 AUBL 루키 후보' : '2026 AUBL 올스타 팬 투표',
      text: division === 'ROOKIE'
        ? `${ROOKIE_SCHOOL_COUNT}개 학교의 루키 후보를 확인해 주세요.`
        : '올스타 후보와 투표 현황을 확인해 주세요.',
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        setShareFeedback('SHARED');
      } else {
        await copyText(data.url);
        setShareFeedback('COPIED');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareFeedback('ERROR');
    }
    window.setTimeout(() => setShareFeedback('IDLE'), 2200);
  };

  const teamSummary = (team: AllStarTeam) => (
    <section key={team}>
      <h2>{TEAM_META[team].label} 선택 · 12명</h2>
      <dl>
        {ALL_STAR_POSITIONS.map((position) => {
          const contest = contestFor(team, position);
          const names = (contest ? selections[contest.id] ?? [] : [])
            .map((id) => candidateById.get(id)?.name)
            .filter(Boolean)
            .join(', ');
          return (
            <div key={position}>
              <dt>{POSITION_LABELS[position]}</dt>
              <dd>{names || '선택 전'}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );

  const opensAt = voteEvent?.opensAt ?? EVENT_CONFIG.opensAt;
  const closesAt = voteEvent?.closesAt ?? EVENT_CONFIG.closesAt;
  const gameStartsAt = voteEvent?.gameStartsAt ?? EVENT_CONFIG.gameStartsAt;
  const venue = voteEvent?.venue ?? EVENT_CONFIG.venue;
  const publishedResultCounts = voteResults?.available
    && voteResults.totalBallots > 0
    && voteResults.candidateVersion === ballotSource?.version
    ? voteResults.counts
    : null;
  return (
    <div className={`allstar-experience${chromelessView ? ' is-chromeless' : ''}${voteView ? ' is-vote-view' : ''}${candidateView ? ' is-candidate-view' : ''}${viewportLocked ? ' is-viewport-locked' : ''}`}>
      {showIntro ? (
        <section
          className="allstar-intro"
          ref={introRef}
          onTouchStart={handleIntroTouchStart}
          onTouchEnd={handleIntroTouchEnd}
          aria-label="2026 AUBL 올스타전 투표 시작 화면"
        >
          <div className="allstar-intro__brand"><span className="allstar-intro__logo"><img src="/assets/aubl_clean.png" alt="" /></span>AUBL</div>
          <div className="allstar-intro__content">
            <p className="allstar-intro__season">2026 AUBL</p>
            <h1>ALL-STAR <span>FAN VOTE</span></h1>
            <p className="allstar-intro__sub">당신의 선택으로 완성되는 두 팀의 올스타 로스터</p>
            <div className="allstar-intro__cards" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          </div>
          <div className="allstar-intro__enter">
            <span className="allstar-intro__chevron" aria-hidden="true">⌃</span>
            <button type="button" onClick={dismissIntro}>위로 밀어 시작하기</button>
            <span>화면을 위로 쓸어올려도 시작할 수 있어요</span>
          </div>
        </section>
      ) : null}

      <div className="allstar-shell" ref={shellRef} aria-hidden={showIntro ? true : undefined}>
      {!chromelessView ? <header className="allstar-shell__header">
        <div className="allstar-shell__header-inner">
          <button type="button" className="allstar-shell__brand" onClick={() => goTo('HUB')}>
            <span className="allstar-shell__logo"><img src="/assets/aubl_clean.png" alt="" /></span>
            <span><strong>AUBL</strong><small>2026 ALL-STAR</small></span>
          </button>
          <div className="allstar-shell__actions">
            <button type="button" onClick={() => { window.location.href = '/'; }}>메인</button>
            <button type="button" onClick={handleShare}>
              {shareFeedback === 'SHARED' ? '공유됨' : shareFeedback === 'COPIED' ? '복사됨' : shareFeedback === 'ERROR' ? '다시 시도' : '공유'}
            </button>
          </div>
        </div>
      </header> : null}

      <main className={`allstar-shell__main${chromelessView ? ' is-chromeless' : ''}${voteView ? ' is-vote-view' : ''}`} ref={mainRef} tabIndex={-1}>
        {resolvedView !== 'HUB' && !chromelessView ? <button type="button" className="allstar-back" onClick={() => goTo('HUB')}>← 올스타전 홈</button> : null}
        {eventError ? <div className="allstar-notice-v2" role="alert">{eventError}</div> : null}
        {authError ? <div className="allstar-notice-v2" role="alert">{authError}</div> : null}
        {notice ? <div className="allstar-notice-v2" role="status">{notice}</div> : null}

        {resolvedView === 'HUB' ? (
          <section className="allstar-hub">
            <div className="allstar-hub__hero">
              <p>2026 AUBL ALL-STAR</p>
              <h1>올스타전 안내</h1>
              <dl className="allstar-hub__details">
                <div><dt>투표 기간</dt><dd>{formatVotingPeriod(opensAt, closesAt)}</dd></div>
                <div><dt>올스타전 일시</dt><dd>{formatDateTime(gameStartsAt) ?? '경기 일정 확정 후 공개'}</dd></div>
                <div><dt>올스타전 장소</dt><dd>{venue?.trim() || '경기 장소 확정 후 공개'}</dd></div>
              </dl>
            </div>

            <div className="allstar-division-picker" role="group" aria-label="부문 선택">
              <button type="button" className={division === 'ALL_STAR' ? 'is-active' : ''} aria-pressed={division === 'ALL_STAR'} onClick={() => setDivision('ALL_STAR')}>
                <strong>올스타</strong><small>포지션별 팬 투표</small>
              </button>
              <button type="button" className={division === 'ROOKIE' ? 'is-active' : ''} aria-pressed={division === 'ROOKIE'} onClick={() => setDivision('ROOKIE')}>
                <strong>루키</strong><small>추천 후보 확인</small>
              </button>
            </div>

            <div className="allstar-hub__menu">
              <button type="button" onClick={() => goTo('CANDIDATES')}>
                <span>01</span><span><strong>후보 확인하기</strong><small>로그인 없이 모든 후보 카드를 확인합니다.</small></span><span>›</span>
              </button>
              {division === 'ALL_STAR' ? (
                <>
                  <button type="button" disabled={!canEnterVote || !ballotSource} onClick={startVote}>
                    <span>02</span><span><strong>{previewMode ? '투표 화면 미리보기' : votingOpen ? '투표 시작하기' : '투표 준비 중'}</strong><small>1팀부터 2팀까지 포지션 순서로 선택합니다.</small></span><span>›</span>
                  </button>
                  <button type="button" disabled={!ballotSource} onClick={() => goTo('RESULTS')}>
                    <span>03</span><span><strong>투표 현황 보기</strong><small>순위표와 그라운드 선두 라인업을 확인합니다.</small></span><span>›</span>
                  </button>
                </>
              ) : (
                <button type="button" disabled>
                  <span>02</span><span><strong>루키 투표 방식 협의 중</strong><small>투표 단위와 선발 기준이 확정되면 연결됩니다.</small></span><span>·</span>
                </button>
              )}
            </div>
          </section>
        ) : null}

        {resolvedView === 'CANDIDATES' && division === 'ROOKIE' ? (
          <RookieCandidateReview selectedTeam={reviewTeam} onTeamChange={setReviewTeam} onBack={() => goTo('HUB')} />
        ) : null}

        {resolvedView === 'CANDIDATES' && division === 'ALL_STAR' ? (
          ballotSource ? (
            <section className="allstar-card-screen">
              <header className="allstar-card-screen__heading has-home">
                <button type="button" className="allstar-card-screen__home" onClick={() => goTo('HUB')} aria-label="올스타전 홈으로 돌아가기">←</button>
                <h1>올스타 후보 확인</h1>
                <span>팀과 포지션을 고른 뒤 카드를 좌우로 넘겨 보세요.</span>
              </header>
              <div className="allstar-team-picker" role="group" aria-label="후보 팀 선택">
                {TEAMS.map((team) => <button type="button" key={team} className={reviewTeam === team ? 'is-active' : ''} aria-pressed={reviewTeam === team} onClick={() => setReviewTeam(team)}>{TEAM_META[team].label}<br /><small>{TEAM_META[team].groups}</small></button>)}
              </div>
              <div className="allstar-position-picker" role="group" aria-label="후보 포지션 선택">
                {ALL_STAR_POSITIONS.map((position) => <button type="button" key={position} className={reviewPosition === position ? 'is-active' : ''} aria-pressed={reviewPosition === position} onClick={() => setReviewPosition(position)}>{POSITION_LABELS[position]}</button>)}
              </div>
              <CylinderCardCarousel key={`${reviewTeam}:${reviewPosition}:${ballotSource.version}`} candidates={reviewCandidates} selectedIds={[]} selectionLimit={reviewPosition === 'OF' ? 6 : 1} readOnly />
            </section>
          ) : <CandidateUnavailable loading={eventLoading} />
        ) : null}

        {resolvedView === 'AUTH' ? (
          <section className="allstar-auth-gate">
            <h1>Google 계정으로 투표하기</h1>
            <p>후보 확인은 로그인 없이 가능하며, 실제 투표 제출에만 계정 확인이 필요합니다. 현재 정책은 {votePolicyLabel}입니다.</p>
            {user && votingIdentityEligible ? (
              <div className="allstar-auth-gate__status" role="status" aria-live="polite">
                <strong>{ballotStatusLoading || !ballotStatus ? '투표 가능 상태를 확인하고 있어요' : '현재 계정으로 투표할 수 없어요'}</strong>
                <span>{ballotStatusLoading || !ballotStatus ? '확인이 끝나면 자동으로 투표 화면으로 이동합니다.' : '잠시 후 페이지를 새로고침해 다시 확인해 주세요.'}</span>
                {ballotStatus && ballotStatus.eligibility === 'UNAVAILABLE' ? <button type="button" onClick={() => window.location.reload()}>다시 확인</button> : null}
              </div>
            ) : (
              <>
                {isInAppBrowser ? (
                  <aside className="allstar-browser-warning">
                    <strong>앱 안 브라우저에서는 Google 로그인이 막힐 수 있어요</strong>
                    <p>Chrome에서 열기를 권장합니다. 자동 전환이 되지 않으면 링크를 복사해 Chrome 주소창에 붙여 넣어 주세요.</p>
                    <div className="allstar-browser-warning__actions">
                      <button type="button" onClick={openInChrome}>Chrome에서 열기</button>
                      <button type="button" onClick={copyCurrentLink}>링크 복사</button>
                    </div>
                  </aside>
                ) : null}
                <label className="allstar-auth-gate__consent">
                  <input type="checkbox" checked={consentAgreed} onChange={(event) => setConsentAgreed(event.target.checked)} />
                  <span><a href="/terms" target="_blank" rel="noreferrer">이용약관</a> 및 <a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리방침</a>에 동의합니다.</span>
                </label>
                <button type="button" className="allstar-auth-gate__google" disabled={authLoading || initializing || ballotStatusLoading} onClick={handleGoogleLogin}>
                  {authLoading || initializing ? '로그인 확인 중…' : 'Google 계정으로 계속'}
                </button>
                {isInAppBrowser ? <button type="button" className="allstar-back" onClick={handleGoogleLogin}>현재 브라우저에서 계속 시도</button> : null}
              </>
            )}
          </section>
        ) : null}

        {resolvedView === 'VOTE' && ballotSource && currentContest ? (
          <section className="allstar-card-screen is-vote">
            <header className="allstar-card-screen__heading has-home">
              <button type="button" className="allstar-card-screen__home" onClick={() => goTo('HUB')} aria-label="올스타전 홈으로 돌아가기">←</button>
              <h1>{POSITION_LABELS[currentPosition]} 선택</h1>
              <span>{TEAM_META[currentTeam].groups} · {currentPosition === 'OF' ? '15명 중 6명을 선택해 주세요.' : '5명 중 1명을 선택해 주세요.'}</span>
            </header>
            <div className="allstar-wizard-progress">
              <div className="allstar-wizard-progress__bar"><span style={{ width: `${(((wizardTeamIndex * ALL_STAR_POSITIONS.length) + wizardPositionIndex) / (TEAMS.length * ALL_STAR_POSITIONS.length)) * 100}%` }} /></div>
              <p>{TEAM_META[currentTeam].label} · 전체 {(wizardTeamIndex * ALL_STAR_POSITIONS.length) + wizardPositionIndex + 1}/14단계</p>
            </div>
            <div className="allstar-selection-message" aria-live="polite">
              <strong>{currentSelection.length}/{currentContest.maxSelections}</strong>
              {currentPosition === 'OF' ? `15명 중 ${currentSelection.length}명 선택` : currentSelection.length ? '선택 완료' : '카드를 눌러 선수를 확인하세요'}
            </div>
            <CylinderCardCarousel
              key={`${currentTeam}:${currentPosition}:${ballotSource.version}`}
              candidates={currentCandidates}
              selectedIds={currentSelection}
              selectionLimit={currentContest.maxSelections}
              selectionComplete={currentComplete}
              onToggle={toggleCandidate}
              onConfirm={confirmCurrentStep}
            />
            <div className="allstar-step-actions">
              <button type="button" onClick={goToPreviousStep}>이전</button>
              <button type="button" className="is-primary" disabled={!currentComplete} onClick={confirmCurrentStep}>
                {!currentComplete
                  ? '카드를 눌러 선택해주세요'
                  : wizardPositionIndex === ALL_STAR_POSITIONS.length - 1
                    ? '팀 선택 확인'
                    : '선택 확인 및 다음'}
              </button>
            </div>
          </section>
        ) : null}

        {resolvedView === 'TEAM_REVIEW' ? (
          <section className="allstar-review-summary">
            <h1>{TEAM_META[currentTeam].label} 선택 완료</h1>
            <p>선택한 선수를 확인한 뒤 {wizardTeamIndex === 0 ? '2팀 투표로 넘어가세요.' : '전체 최종 확인으로 넘어가세요.'}</p>
            <div className="allstar-summary-list">{teamSummary(currentTeam)}</div>
            <div className="allstar-summary-actions">
              <button type="button" onClick={() => { setWizardPositionIndex(ALL_STAR_POSITIONS.length - 1); goTo('VOTE'); }}>수정하기</button>
              <button type="button" className="is-primary" onClick={continueAfterTeamReview}>{wizardTeamIndex === 0 ? '2팀 투표 시작 →' : '전체 선택 확인 →'}</button>
            </div>
          </section>
        ) : null}

        {resolvedView === 'FINAL_REVIEW' ? (
          <section className="allstar-review-summary">
            <h1>최종 선택 확인</h1>
            <p>양 팀 합계 24명의 선택을 확인해 주세요. 실제 제출 후에는 변경할 수 없습니다.</p>
            <div className="allstar-summary-list">{TEAMS.map(teamSummary)}</div>
            <div className="allstar-summary-actions">
              <button type="button" onClick={() => { setWizardTeamIndex(1); setWizardPositionIndex(ALL_STAR_POSITIONS.length - 1); goTo('VOTE'); }}>수정하기</button>
              <button type="button" className="is-primary" disabled={!ballotComplete || submitting} onClick={submitBallot}>{submitting ? '제출 중…' : previewMode ? '검수 흐름 완료' : '투표 제출'}</button>
            </div>
          </section>
        ) : null}

        {resolvedView === 'THANKS' ? (
          <section className="allstar-thank-you">
            <h1>{previewThanks ? '검수 흐름을 완료했습니다' : '투표해 주셔서 감사합니다'}</h1>
            <p>{previewThanks ? '현재는 검수용 화면이라 실제 득표는 저장되지 않았습니다.' : '선택한 선수들의 현재 득표 현황을 바로 확인할 수 있습니다.'}</p>
            <div className="allstar-summary-actions">
              <button type="button" onClick={() => goTo('HUB')}>올스타전 홈</button>
              <button type="button" className="is-primary" onClick={() => goTo('RESULTS')}>투표 현황 보기</button>
            </div>
          </section>
        ) : null}

        {resolvedView === 'RESULTS' && division === 'ALL_STAR' ? (
          ballotSource ? (
            <VoteResultsPanel candidates={ballotSource.candidates} contests={ballotSource.contests} resultCounts={publishedResultCounts} preview={!ballotSource.published} updatedAt={voteResults?.updatedAt ?? null} selectedTeam={resultsTeam} onTeamChange={setResultsTeam} />
          ) : <CandidateUnavailable loading={eventLoading} />
        ) : null}

      </main>
      </div>
    </div>
  );
}
