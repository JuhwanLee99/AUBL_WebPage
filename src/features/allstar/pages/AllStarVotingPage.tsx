import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import html2canvas from 'html2canvas';
import { useAuth } from '@shared/auth/AuthProvider';
import { CylinderCardCarousel } from '../components/CylinderCardCarousel';
import { PlayerCardDetailDialog } from '../components/PlayerCardDetailDialog';
import type { CardDisplayCandidate } from '../components/PlayerCardSurface';
import { RookieCandidateReview } from '../components/RookieCandidateReview';
import { RosterReviewGrid } from '../components/RosterReviewGrid';
import { RosterShareSheet } from '../components/RosterShareSheet';
import { SharedRosterPackReveal } from '../components/SharedRosterPackReveal';
import { VoteResultsPanel } from '../components/VoteResultsPanel';
import {
  ALL_STAR_EVENT_CONFIG,
  ALL_STAR_POSITIONS,
  POSITION_LABELS,
  TEAM_META,
} from '../data/eventConfig';
import { ROOKIE_SCHOOL_COUNT } from '../data/rookieCandidates';
import { useIntroSwipeDismiss } from '../hooks/useIntroSwipeDismiss';
import {
  loadRosterReceipt,
  saveRosterReceipt,
  type RosterReceipt,
} from '../lib/rosterSession';
import {
  createRosterShareToken,
  parseRosterShareToken,
} from '../lib/rosterShareLink';
import {
  clearPendingSubmission,
  clearPendingSubmissionForCandidateChange,
  createSelectionFingerprint,
  loadPendingSubmissionId,
  savePendingSubmission,
} from '../lib/submissionRetry';
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
type RosterShareFeedback = 'IDLE' | 'RENDERING' | 'SHARED' | 'DOWNLOADED' | 'COPIED' | 'ERROR';
type RosterDetailState = { team: AllStarTeam; index: number } | null;
type SharedRosterRequest = { token: string; requestKey: string } | null;
type ExitTarget = 'HUB' | 'MAIN';
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
const SUBMISSION_SCOPE = { eventId: EVENT_CONFIG.eventId, division: 'ALL_STAR' as const };

const createSubmissionId = () => {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return `submission-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
};

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
  if (view === 'roster') return 'FINAL_REVIEW';
  if (view === 'thanks') return 'THANKS';
  if (view === 'vote') return 'AUTH';
  return 'HUB';
};

const readSharedRosterRequestFromUrl = (): SharedRosterRequest => {
  if (typeof window === 'undefined' || readDivisionFromUrl() !== 'ALL_STAR') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') !== 'roster' || !params.has('share')) return null;
  const tokens = params.getAll('share');
  const token = tokens.length === 1 ? tokens[0] : '';
  return { token, requestKey: `${tokens.length}:${token}` };
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
  const experienceRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const rosterShareSheetRef = useRef<HTMLDivElement | null>(null);
  const exitStayButtonRef = useRef<HTMLButtonElement | null>(null);
  const advanceLockRef = useRef(false);
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (readSharedRosterRequestFromUrl()) return false;
    const params = new URLSearchParams(window.location.search);
    const isAllStarHubLoad = readDivisionFromUrl() === 'ALL_STAR' && !params.has('view');
    if (isAllStarHubLoad) return true;
    try { return window.sessionStorage.getItem(INTRO_STORAGE_KEY) !== '1'; } catch { return true; }
  });
  const [sharedRosterRequest, setSharedRosterRequest] = useState<SharedRosterRequest>(readSharedRosterRequestFromUrl);
  const [showSharedRosterReveal, setShowSharedRosterReveal] = useState(() => Boolean(readSharedRosterRequestFromUrl()));
  const [showFinalRosterReveal, setShowFinalRosterReveal] = useState(false);
  const [division, setDivision] = useState<AllStarDivision>(readDivisionFromUrl);
  const [view, setView] = useState<ExperienceView>(readViewFromUrl);
  const [voteEvent, setVoteEvent] = useState<VoteEvent | null>(null);
  const [voteResults, setVoteResults] = useState<VoteResults | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [reviewTeam, setReviewTeam] = useState<AllStarTeam>('TEAM_1');
  const [reviewPosition, setReviewPosition] = useState<AllStarPosition>('P');
  const [resultsTeam, setResultsTeam] = useState<AllStarTeam>('TEAM_1');
  const [rosterReviewTeam, setRosterReviewTeam] = useState<AllStarTeam>('TEAM_1');
  const [rosterDetail, setRosterDetail] = useState<RosterDetailState>(null);
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
  const [rosterShareFeedback, setRosterShareFeedback] = useState<RosterShareFeedback>('IDLE');
  const [rosterShareFallback, setRosterShareFallback] = useState(false);
  const [rosterReceipt, setRosterReceipt] = useState<RosterReceipt | null>(null);
  const [rosterReceiptChecked, setRosterReceiptChecked] = useState(false);
  const [sharedRosterActive, setSharedRosterActive] = useState(false);
  const [previewThanks, setPreviewThanks] = useState(false);
  const [pendingExitTarget, setPendingExitTarget] = useState<ExitTarget | null>(null);
  const rosterPackRevealActive = showSharedRosterReveal || showFinalRosterReveal;
  const entryOverlayActive = showIntro || rosterPackRevealActive;
  const interactionOverlayActive = entryOverlayActive || pendingExitTarget !== null;

  const serviceAvailable = allStarVoteService.isAvailable;
  const draftPreviewEnabled = import.meta.env.DEV || import.meta.env.VITE_ALLSTAR_SHOW_DRAFT_CANDIDATES === 'true';

  useEffect(() => {
    const syncFromHistory = () => {
      const nextSharedRequest = readSharedRosterRequestFromUrl();
      setDivision(readDivisionFromUrl());
      setView(readViewFromUrl());
      setSharedRosterRequest(nextSharedRequest);
      setShowSharedRosterReveal(Boolean(nextSharedRequest));
      if (nextSharedRequest) setShowIntro(false);
    };
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (interactionOverlayActive) shell.setAttribute('inert', '');
    else shell.removeAttribute('inert');
    return () => shell.removeAttribute('inert');
  }, [interactionOverlayActive]);

  useEffect(() => {
    if (!pendingExitTarget) return;
    const frame = window.requestAnimationFrame(() => exitStayButtonRef.current?.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setPendingExitTarget(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pendingExitTarget]);

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
    let loadedVersion: string | null = null;
    let inFlight = false;
    const load = async (initial = false) => {
      if (inFlight || (!initial && document.visibilityState !== 'visible')) return;
      inFlight = true;
      if (initial) {
        setEventError(null);
        setEventLoading(true);
      }
      try {
        let event = initial || !loadedVersion
          ? await allStarVoteService.getVoteEvent({ eventId: EVENT_CONFIG.eventId, division: 'ALL_STAR' })
          : await allStarVoteService.getVoteEventState({ eventId: EVENT_CONFIG.eventId, division: 'ALL_STAR' });
        if (!initial && loadedVersion && event.candidateVersion !== loadedVersion) {
          event = await allStarVoteService.getVoteEvent({ eventId: EVENT_CONFIG.eventId, division: 'ALL_STAR' });
        }
        if (cancelled) return;
        hasLoaded = true;
        loadedVersion = event.candidateVersion;
        setVoteEvent((previous) => event.candidateSet ? event : previous ? { ...event, candidateSet: previous.candidateSet } : event);
        setEventError(null);
      } catch {
        if (!cancelled && !hasLoaded) setEventError('투표 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        inFlight = false;
        if (!cancelled && initial) setEventLoading(false);
      }
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    void load(true);
    const timer = window.setInterval(() => { void load(); }, 60_000);
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
  const isUnsubmittedVotingFlow = division === 'ALL_STAR'
    && !sharedRosterActive
    && !rosterReceipt?.submitted
    && (resolvedView === 'VOTE' || resolvedView === 'TEAM_REVIEW' || resolvedView === 'FINAL_REVIEW');
  const viewportLocked = division === 'ALL_STAR'
    && (interactionOverlayActive || resolvedView === 'CANDIDATES' || resolvedView === 'VOTE');

  useEffect(() => {
    if (!sharedRosterRequest || !eventReady || ballotSource) return;
    setShowSharedRosterReveal(false);
    setSharedRosterRequest(null);
    setSharedRosterActive(false);
    setNotice('공유 로스터를 불러올 후보 명단이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
    setView('HUB');
  }, [ballotSource, eventReady, sharedRosterRequest]);

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
        : resolvedView === 'FINAL_REVIEW'
          ? 'roster'
          : resolvedView === 'THANKS'
            ? 'thanks'
            : ['AUTH', 'VOTE', 'TEAM_REVIEW'].includes(resolvedView)
          ? 'vote'
          : null;
    if (publicView) url.searchParams.set('view', publicView);
    else url.searchParams.delete('view');
    if (resolvedView !== 'FINAL_REVIEW' || (rosterReceiptChecked && !sharedRosterActive)) {
      url.searchParams.delete('share');
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [division, resolvedView, rosterReceiptChecked, sharedRosterActive]);

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
    let inFlight = false;
    if (resolvedView !== 'RESULTS' || division !== 'ALL_STAR' || !serviceAvailable || !voteEvent?.published) {
      return () => { cancelled = true; };
    }
    const load = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const result = await allStarVoteService.getVoteResults({ eventId: EVENT_CONFIG.eventId, division });
        if (!cancelled) setVoteResults(result);
      } catch { /* keep the last successful public result during a transient failure */ }
      finally { inFlight = false; }
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    timer = window.setInterval(() => { void load(); }, 60_000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
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
    if (!ballotSource || division !== 'ALL_STAR') return;
    try {
      clearPendingSubmissionForCandidateChange(window.sessionStorage, {
        ...SUBMISSION_SCOPE,
        candidateVersion: ballotSource.version,
      });
    } catch { /* private browsing can disable storage */ }
  }, [ballotSource, division]);

  useEffect(() => {
    if (!ballotSource || !selectionStorageKey) {
      setSelections({});
      setRosterReceipt(null);
      setRosterReceiptChecked(false);
      setSharedRosterActive(false);
      return;
    }
    try {
      const prefix = `${SELECTION_STORAGE_PREFIX}:${EVENT_CONFIG.eventId}:${toBackendDivision(division)}:`;
      Object.keys(window.sessionStorage).forEach((key) => {
        if (key.startsWith(prefix) && key !== selectionStorageKey) window.sessionStorage.removeItem(key);
      });
      const params = new URLSearchParams(window.location.search);
      const requestedView = params.get('view');
      if (sharedRosterRequest) {
        const sharedSelections = parseRosterShareToken({
          token: sharedRosterRequest.token,
          candidateVersion: ballotSource.version,
          contests: ballotSource.contests,
          candidates: ballotSource.candidates,
        });
        setRosterReceipt(null);
        setRosterReceiptChecked(true);
        if (sharedSelections) {
          setSharedRosterActive(true);
          setSelections(sharedSelections);
          return;
        }
        setSharedRosterActive(false);
        setShowSharedRosterReveal(false);
        setSharedRosterRequest(null);
        setSelections({});
        setNotice('공유 링크의 로스터 정보가 만료되었거나 올바르지 않습니다.');
        setView('HUB');
        return;
      }

      setSharedRosterActive(false);
      const receipt = loadRosterReceipt({
        eventId: EVENT_CONFIG.eventId,
        candidateVersion: ballotSource.version,
        contests: ballotSource.contests,
        candidates: ballotSource.candidates,
      });
      setRosterReceipt(receipt);
      setRosterReceiptChecked(true);
      const requestedReceipt = requestedView === 'roster' || requestedView === 'thanks';
      if (receipt && requestedReceipt) {
        setSelections(receipt.selections);
        return;
      }
      setSelections(restoreSelections(window.sessionStorage.getItem(selectionStorageKey), ballotSource));
      if (requestedReceipt && !receipt) {
        setNotice('이 브라우저 세션에서 확인할 수 있는 로스터가 없습니다.');
        setView('HUB');
      }
    } catch {
      setSelections({});
      setRosterReceipt(null);
      setRosterReceiptChecked(true);
      setSharedRosterActive(false);
      if (sharedRosterRequest) {
        setShowSharedRosterReveal(false);
        setSharedRosterRequest(null);
        setNotice('공유 링크의 로스터 정보를 확인하지 못했습니다.');
        setView('HUB');
      }
    }
  }, [ballotSource, division, selectionStorageKey, sharedRosterRequest]);

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
      .then((status) => {
        if (cancelled) return;
        setBallotStatus(status);
      })
      .catch(() => { if (!cancelled) setBallotStatus({ eligibility: 'UNAVAILABLE', votedAt: null, submissionId: null, nextEligibleAt: null }); })
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

  const rosterByTeam = useMemo<Record<AllStarTeam, CardDisplayCandidate[]>>(() => ({
    TEAM_1: ALL_STAR_POSITIONS.flatMap((position) => {
      const contest = contestFor('TEAM_1', position);
      return (contest ? selections[contest.id] ?? [] : []).flatMap((candidateId) => {
        const candidate = candidateById.get(candidateId);
        return candidate ? [toCardCandidate(candidate)] : [];
      });
    }),
    TEAM_2: ALL_STAR_POSITIONS.flatMap((position) => {
      const contest = contestFor('TEAM_2', position);
      return (contest ? selections[contest.id] ?? [] : []).flatMap((candidateId) => {
        const candidate = candidateById.get(candidateId);
        return candidate ? [toCardCandidate(candidate)] : [];
      });
    }),
  }), [candidateById, contestFor, selections]);
  const rosterComplete = rosterByTeam.TEAM_1.length === 12 && rosterByTeam.TEAM_2.length === 12;
  const activeRosterCandidates = rosterByTeam[rosterReviewTeam];

  const persistCompletedRoster = useCallback((submitted: boolean) => {
    if (!ballotSource || !ballotComplete || !rosterComplete) return null;
    const receipt = saveRosterReceipt({
      eventId: EVENT_CONFIG.eventId,
      candidateVersion: ballotSource.version,
      selections,
      submitted,
    });
    setRosterReceipt(receipt);
    setRosterReceiptChecked(true);
    return receipt;
  }, [ballotComplete, ballotSource, rosterComplete, selections]);

  useEffect(() => {
    if (
      previewMode
      || ballotStatus?.eligibility !== 'ALREADY_VOTED'
      || !ballotStatus.submissionId
      || !ballotSource
      || !rosterReceiptChecked
    ) return;

    let cancelled = false;
    const reconcilePendingSubmission = async () => {
      if (!ballotComplete || !rosterComplete) {
        try { clearPendingSubmission(window.sessionStorage, SUBMISSION_SCOPE); } catch { /* continue */ }
        return;
      }
      const submissionSelections = Object.fromEntries(
        ballotSource.contests.map((contest) => [contest.id, selections[contest.id] ?? []]),
      );
      const selectionFingerprint = await createSelectionFingerprint({
        ...SUBMISSION_SCOPE,
        candidateVersion: ballotSource.version,
        selections: submissionSelections,
      });
      if (cancelled) return;

      let pendingSubmissionId: string | null = null;
      try {
        if (selectionFingerprint) {
          pendingSubmissionId = loadPendingSubmissionId(window.sessionStorage, {
            ...SUBMISSION_SCOPE,
            candidateVersion: ballotSource.version,
            selectionFingerprint,
          });
        }
      } catch { /* storage unavailable */ }

      try { clearPendingSubmission(window.sessionStorage, SUBMISSION_SCOPE); } catch { /* continue */ }
      if (pendingSubmissionId !== ballotStatus.submissionId) return;

      if (selectionStorageKey) {
        try { window.sessionStorage.removeItem(selectionStorageKey); } catch { /* continue */ }
      }
      persistCompletedRoster(true);
      setPreviewThanks(false);
      setNotice('이전 요청의 투표 접수를 서버 원장에서 확인했습니다.');
      setView('THANKS');
    };
    void reconcilePendingSubmission();
    return () => { cancelled = true; };
  }, [
    ballotComplete,
    ballotSource,
    ballotStatus?.eligibility,
    ballotStatus?.submissionId,
    persistCompletedRoster,
    previewMode,
    rosterComplete,
    rosterReceiptChecked,
    selectionStorageKey,
    selections,
  ]);

  const completeIntro = useCallback(() => {
    try { window.sessionStorage.setItem(INTRO_STORAGE_KEY, '1'); } catch { /* continue */ }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setShowIntro(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      mainRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const completeRosterPackReveal = useCallback(() => {
    try { window.sessionStorage.setItem(INTRO_STORAGE_KEY, '1'); } catch { /* continue */ }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setShowSharedRosterReveal(false);
    setShowFinalRosterReveal(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      const activeTeam = mainRef.current?.querySelector<HTMLButtonElement>(
        '.allstar-roster-team-toggle button[aria-pressed="true"]',
      );
      (activeTeam ?? mainRef.current)?.focus({ preventScroll: true });
    });
  }, []);

  const {
    pointerHandlers: introPointerHandlers,
    dismiss: dismissIntro,
    isDragging: introDragging,
    isCompleting: introCompleting,
  } = useIntroSwipeDismiss({
    active: showIntro,
    introRef,
    progressRootRef: experienceRef,
    onComplete: completeIntro,
  });

  const goTo = (next: ExperienceView) => {
    setNotice(null);
    if (next !== 'FINAL_REVIEW') setShowFinalRosterReveal(false);
    if (sharedRosterActive && next !== 'FINAL_REVIEW') {
      setSharedRosterActive(false);
      setSharedRosterRequest(null);
      setShowSharedRosterReveal(false);
      setRosterReceipt(null);
      try {
        setSelections(ballotSource && selectionStorageKey
          ? restoreSelections(window.sessionStorage.getItem(selectionStorageKey), ballotSource)
          : {});
      } catch {
        setSelections({});
      }
    }
    setView(next);
    window.scrollTo({
      top: 0,
      behavior: viewportLocked || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const performExit = (target: ExitTarget) => {
    setPendingExitTarget(null);
    if (target === 'MAIN') {
      window.location.assign('/');
      return;
    }
    goTo('HUB');
  };

  const requestExit = (target: ExitTarget) => {
    if (isUnsubmittedVotingFlow) {
      setPendingExitTarget(target);
      return;
    }
    performExit(target);
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

  const startVoteFromSharedRoster = () => {
    if (!canEnterVote || !ballotSource) return;
    setRosterDetail(null);
    setRosterReviewTeam('TEAM_1');
    setRosterShareFeedback('IDLE');
    setRosterShareFallback(false);
    startVote();
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
      try { clearPendingSubmission(window.sessionStorage, SUBMISSION_SCOPE); } catch { /* continue */ }
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
    requestExit('HUB');
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
    if (wizardTeamIndex === 0) {
      setView('TEAM_REVIEW');
    } else {
      setRosterReviewTeam('TEAM_1');
      persistCompletedRoster(false);
      setShowFinalRosterReveal(true);
      setView('FINAL_REVIEW');
    }
    window.requestAnimationFrame(() => {
      advanceLockRef.current = false;
      mainRef.current?.focus({ preventScroll: true });
    });
  };

  const continueAfterTeamReview = () => {
    setWizardTeamIndex(1);
    setWizardPositionIndex(0);
    goTo('VOTE');
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
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        // In-app browsers can expose Clipboard API while denying its permission.
      }
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
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
      persistCompletedRoster(false);
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
    const submissionSelections = Object.fromEntries(
      ballotSource.contests.map((contest) => [contest.id, selections[contest.id] ?? []]),
    );
    const selectionFingerprint = await createSelectionFingerprint({
      ...SUBMISSION_SCOPE,
      candidateVersion: ballotSource.version,
      selections: submissionSelections,
    });
    let submissionId = createSubmissionId();
    try {
      if (selectionFingerprint) {
        submissionId = loadPendingSubmissionId(window.sessionStorage, {
          ...SUBMISSION_SCOPE,
          candidateVersion: ballotSource.version,
          selectionFingerprint,
        }) ?? submissionId;
        // Persist before the network call so a committed request whose response
        // is lost can be retried with the exact same idempotency key.
        savePendingSubmission(window.sessionStorage, {
          ...SUBMISSION_SCOPE,
          candidateVersion: ballotSource.version,
          selectionFingerprint,
        }, submissionId);
      } else {
        // Never store the canonical selection payload as a hash fallback. Voting
        // still works, but cross-reload retry recovery is unavailable without WebCrypto.
        clearPendingSubmission(window.sessionStorage, SUBMISSION_SCOPE);
      }
    } catch {
      // Submission remains available when sessionStorage is unavailable; only
      // cross-reload/retry idempotency recovery is reduced in that browser.
    }
    try {
      const result = await allStarVoteService.submitBallot({
        eventId: EVENT_CONFIG.eventId,
        division: 'ALL_STAR',
        candidateVersion: ballotSource.version,
        submissionId,
        selections: submissionSelections,
      });
      try { clearPendingSubmission(window.sessionStorage, SUBMISSION_SCOPE); } catch { /* continue */ }
      if (selectionStorageKey) window.sessionStorage.removeItem(selectionStorageKey);
      persistCompletedRoster(true);
      setPreviewThanks(false);
      setBallotStatus({ eligibility: 'ALREADY_VOTED', votedAt: result.submittedAt, submissionId: result.submissionId, nextEligibleAt: result.nextEligibleAt });
      goTo('THANKS');
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : '투표 제출에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      try {
        // The transaction may have committed even when the response was lost.
        // Re-read the server ledger before telling the voter to submit again.
        const recoveredStatus = await allStarVoteService.getBallotStatus({
          eventId: EVENT_CONFIG.eventId,
          division: 'ALL_STAR',
        });
        if (recoveredStatus.eligibility === 'ALREADY_VOTED' && recoveredStatus.submissionId === submissionId) {
          try { clearPendingSubmission(window.sessionStorage, SUBMISSION_SCOPE); } catch { /* continue */ }
          if (selectionStorageKey) window.sessionStorage.removeItem(selectionStorageKey);
          persistCompletedRoster(true);
          setPreviewThanks(false);
          setBallotStatus(recoveredStatus);
          setNotice('응답은 중간에 끊겼지만 서버에서 투표 접수를 확인했습니다.');
          goTo('THANKS');
          return;
        }
        if (recoveredStatus.eligibility === 'ALREADY_VOTED') {
          try { clearPendingSubmission(window.sessionStorage, SUBMISSION_SCOPE); } catch { /* continue */ }
          setBallotStatus(recoveredStatus);
          setNotice('이 계정의 다른 제출이 먼저 접수되었습니다. 현재 화면의 선택은 접수된 로스터로 저장하지 않았습니다.');
          return;
        }
      } catch {
        // Preserve the original submission error when status recovery is unavailable.
      }
      setNotice(failureMessage);
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
      try {
        await copyText(data.url);
        setShareFeedback('COPIED');
      } catch {
        setShareFeedback('ERROR');
      }
    }
    window.setTimeout(() => setShareFeedback('IDLE'), 2200);
  };

  const fileShareSupported = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function'
      || typeof navigator.canShare !== 'function' || typeof File === 'undefined') return false;
    try {
      return navigator.canShare({ files: [new File([''], 'aubl-roster.png', { type: 'image/png' })] });
    } catch {
      return false;
    }
  }, []);

  const renderRosterImage = useCallback(async () => {
    const sheet = rosterShareSheetRef.current;
    if (!sheet || !rosterComplete) throw new Error('roster not ready');
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...sheet.querySelectorAll('img')].map((image) => (
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        })
    )));
    const canvas = await html2canvas(sheet, {
      backgroundColor: '#07101f',
      width: 1080,
      height: 1920,
      windowWidth: 1080,
      windowHeight: 1920,
      scale: 1,
      useCORS: true,
      logging: false,
    });
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('image render failed'));
      }, 'image/png');
    });
  }, [rosterComplete]);

  const rosterShareToken = useMemo(() => (
    ballotSource && rosterComplete
      ? createRosterShareToken({
        candidateVersion: ballotSource.version,
        contests: ballotSource.contests,
        selections,
      })
      : null
  ), [ballotSource, rosterComplete, selections]);
  const rosterShareUrl = useMemo(() => {
    const url = new URL('/allstar', window.location.origin);
    url.searchParams.set('division', 'allstar');
    url.searchParams.set('view', 'roster');
    if (rosterShareToken) url.searchParams.set('share', rosterShareToken);
    return url.toString();
  }, [rosterShareToken]);
  const rosterShareText = '내가 선택한 2026 AUBL 올스타 로스터를 확인해 보세요.';
  const finishRosterFeedback = (feedback: RosterShareFeedback) => {
    setRosterShareFeedback(feedback);
    window.setTimeout(() => setRosterShareFeedback('IDLE'), 2600);
  };

  const handleRosterNativeShare = async () => {
    if (!fileShareSupported || !navigator.share) return;
    setRosterShareFeedback('RENDERING');
    try {
      const blob = await renderRosterImage();
      const file = new File([blob], '2026_AUBL_올스타_내로스터.png', { type: 'image/png' });
      await navigator.share({
        title: '2026 AUBL MY ALL-STAR ROSTER',
        text: rosterShareText,
        url: rosterShareUrl,
        files: [file],
      });
      finishRosterFeedback('SHARED');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setRosterShareFeedback('IDLE');
        return;
      }
      setRosterShareFallback(true);
      finishRosterFeedback('ERROR');
    }
  };

  const handleRosterDownload = async () => {
    setRosterShareFeedback('RENDERING');
    try {
      const blob = await renderRosterImage();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = '2026_AUBL_올스타_내로스터.png';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
      finishRosterFeedback('DOWNLOADED');
    } catch {
      finishRosterFeedback('ERROR');
    }
  };

  const handleRosterLinkCopy = async () => {
    try {
      if (!rosterShareToken) throw new Error('roster share link unavailable');
      await copyText(rosterShareUrl);
      finishRosterFeedback('COPIED');
    } catch {
      finishRosterFeedback('ERROR');
    }
  };

  const rosterShareLabel = rosterShareFeedback === 'RENDERING'
    ? '로스터 이미지 만드는 중…'
    : rosterShareFeedback === 'SHARED'
      ? '로스터를 공유했습니다.'
      : rosterShareFeedback === 'DOWNLOADED'
        ? '로스터 이미지를 저장했습니다.'
        : rosterShareFeedback === 'COPIED'
          ? '선택한 로스터 결과 링크를 복사했습니다.'
          : rosterShareFeedback === 'ERROR'
            ? '공유 준비에 실패했습니다. 다시 시도해 주세요.'
            : '';
  const thankYouIsPreview = previewThanks || (previewMode && rosterReceipt?.submitted === false);

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
    <div ref={experienceRef} className={`allstar-experience${showIntro ? ' has-intro' : ''}${chromelessView ? ' is-chromeless' : ''}${voteView ? ' is-vote-view' : ''}${candidateView ? ' is-candidate-view' : ''}${viewportLocked ? ' is-viewport-locked' : ''}`}>
      {rosterPackRevealActive ? (
        <SharedRosterPackReveal
          key={showSharedRosterReveal ? sharedRosterRequest?.requestKey ?? 'shared-roster' : 'completed-vote'}
          candidates={rosterByTeam.TEAM_1}
          ready={rosterComplete && (sharedRosterActive || showFinalRosterReveal)}
          mode={showSharedRosterReveal ? 'shared' : 'completed'}
          onComplete={completeRosterPackReveal}
        />
      ) : showIntro ? (
        <section
          className={`allstar-intro${introDragging ? ' is-dragging' : ''}${introCompleting ? ' is-completing' : ''}`}
          ref={introRef}
          {...introPointerHandlers}
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
            <span className="allstar-intro__swipe-indicator" aria-hidden="true">
              <span className="allstar-intro__swipe-track">
                <i className="allstar-intro__swipe-trail is-one" />
                <i className="allstar-intro__swipe-trail is-two" />
                <span className="allstar-intro__swipe-thumb">
                  <svg viewBox="0 0 24 24"><path d="M12 18V6m0 0-5 5m5-5 5 5" /></svg>
                </span>
              </span>
            </span>
            <button type="button" onClick={dismissIntro}>위로 밀어 시작하기</button>
            <span>화면을 위로 쓸어올려도 시작할 수 있어요</span>
          </div>
        </section>
      ) : null}

      <div className="allstar-shell" ref={shellRef} aria-hidden={interactionOverlayActive ? true : undefined}>
      {!chromelessView ? <header className="allstar-shell__header">
        <div className="allstar-shell__header-inner">
          <button type="button" className="allstar-shell__brand" onClick={() => requestExit('HUB')}>
            <span className="allstar-shell__logo"><img src="/assets/aubl_clean.png" alt="" /></span>
            <span><strong>AUBL</strong><small>2026 ALL-STAR</small></span>
          </button>
          <div className="allstar-shell__actions">
            <button type="button" onClick={() => requestExit('HUB')}>메인</button>
            <button type="button" onClick={handleShare}>
              {shareFeedback === 'SHARED' ? '공유됨' : shareFeedback === 'COPIED' ? '복사됨' : shareFeedback === 'ERROR' ? '다시 시도' : '공유'}
            </button>
          </div>
        </div>
      </header> : null}

      <main className={`allstar-shell__main${chromelessView ? ' is-chromeless' : ''}${voteView ? ' is-vote-view' : ''}`} ref={mainRef} tabIndex={-1}>
        {resolvedView !== 'HUB' && resolvedView !== 'TEAM_REVIEW' && !sharedRosterActive && !chromelessView ? <button type="button" className="allstar-back" onClick={() => requestExit('HUB')}>← 올스타전 홈</button> : null}
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
                {TEAMS.map((team) => <button type="button" key={team} className={`${reviewTeam === team ? 'is-active ' : ''}is-${TEAM_META[team].tone}`} aria-pressed={reviewTeam === team} onClick={() => setReviewTeam(team)}>{TEAM_META[team].label}<br /><small>{TEAM_META[team].groups}</small></button>)}
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
              <button type="button" className="allstar-card-screen__home" onClick={() => requestExit('HUB')} aria-label="올스타전 홈으로 돌아가기">←</button>
              <h1>{POSITION_LABELS[currentPosition]} 선택</h1>
              <button
                type="button"
                className="allstar-card-screen__complete"
                disabled={!currentComplete}
                onClick={confirmCurrentStep}
                aria-label="현재 포지션 선택 완료"
              >
                완료
              </button>
              <span>{TEAM_META[currentTeam].groups} · {currentPosition === 'OF' ? '15명 중 6명을 선택해 주세요.' : '5명 중 1명을 선택해 주세요.'}</span>
            </header>
            <div className="allstar-wizard-progress">
              <div className="allstar-wizard-progress__bar"><span style={{ width: `${(((wizardTeamIndex * ALL_STAR_POSITIONS.length) + wizardPositionIndex) / (TEAMS.length * ALL_STAR_POSITIONS.length)) * 100}%` }} /></div>
              <p>{TEAM_META[currentTeam].label} · 전체 {(wizardTeamIndex * ALL_STAR_POSITIONS.length) + wizardPositionIndex + 1}/14단계</p>
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
            <p>선택한 12장의 카드를 확인한 뒤 2팀 투표로 넘어가세요. 카드를 누르면 크게 볼 수 있습니다.</p>
            <RosterReviewGrid
              candidates={rosterByTeam[currentTeam]}
              team={currentTeam}
              onOpen={(index) => setRosterDetail({ team: currentTeam, index })}
            />
            <div className="allstar-summary-actions">
              <button type="button" onClick={() => { setWizardPositionIndex(0); goTo('VOTE'); }}>선택 수정</button>
              <button type="button" className="is-primary" onClick={continueAfterTeamReview}>2팀 투표 시작 →</button>
            </div>
          </section>
        ) : null}

        {(resolvedView === 'FINAL_REVIEW' || resolvedView === 'THANKS') && !rosterReceiptChecked && !rosterComplete ? (
          <CandidateUnavailable loading />
        ) : null}

        {resolvedView === 'FINAL_REVIEW' && (rosterReceiptChecked || rosterComplete) ? (
          <section className="allstar-review-summary">
            {!sharedRosterActive ? (
              <>
                <h1>{rosterReceipt?.submitted ? '내 올스타 로스터' : '최종 선택 확인'}</h1>
                <p>{rosterReceipt?.submitted
                  ? '이 브라우저 세션에서 선택한 양 팀 로스터입니다.'
                  : '양 팀 합계 24명을 확인해 주세요. 실제 제출 후에는 변경할 수 없습니다.'}</p>
              </>
            ) : null}
            <div className="allstar-roster-team-toggle" role="group" aria-label="확인할 로스터 팀 선택">
              {TEAMS.map((team) => (
                <button
                  type="button"
                  key={team}
                  className={`${rosterReviewTeam === team ? 'is-active ' : ''}is-${TEAM_META[team].tone}`}
                  aria-pressed={rosterReviewTeam === team}
                  onClick={() => { setRosterDetail(null); setRosterReviewTeam(team); }}
                >
                  <strong>{TEAM_META[team].label}</strong>
                  <small>{TEAM_META[team].groups} · 12명</small>
                </button>
              ))}
            </div>
            <RosterReviewGrid
              candidates={activeRosterCandidates}
              team={rosterReviewTeam}
              onOpen={(index) => setRosterDetail({ team: rosterReviewTeam, index })}
            />
            {sharedRosterActive ? (
              <button
                type="button"
                className="allstar-shared-roster-cta is-primary"
                disabled={!canEnterVote || !ballotSource}
                onClick={startVoteFromSharedRoster}
              >
                투표 참여하기
              </button>
            ) : (
              <>
                <div className="allstar-roster-share-actions">
                  {fileShareSupported && !rosterShareFallback ? (
                    <>
                      <button type="button" className="is-primary is-wide" disabled={!rosterComplete || rosterShareFeedback === 'RENDERING'} onClick={handleRosterNativeShare}>이미지와 링크 공유</button>
                      <button type="button" disabled={!rosterComplete || rosterShareFeedback === 'RENDERING'} onClick={handleRosterDownload}>이미지 저장</button>
                      <button type="button" disabled={!rosterShareToken} onClick={handleRosterLinkCopy}>결과 링크 복사</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="is-primary" disabled={!rosterComplete || rosterShareFeedback === 'RENDERING'} onClick={handleRosterDownload}>이미지 저장</button>
                      <button type="button" disabled={!rosterShareToken} onClick={handleRosterLinkCopy}>결과 링크 복사</button>
                    </>
                  )}
                  {rosterShareLabel ? <p role="status" aria-live="polite">{rosterShareLabel}</p> : null}
                </div>
                {!rosterReceipt?.submitted ? (
                  <div className="allstar-summary-actions">
                    <button type="button" onClick={() => { setWizardTeamIndex(rosterReviewTeam === 'TEAM_1' ? 0 : 1); setWizardPositionIndex(0); setRosterDetail(null); goTo('VOTE'); }}>선택 수정</button>
                    <button type="button" className="is-primary" disabled={!ballotComplete || submitting} onClick={submitBallot}>{submitting ? '제출 중…' : previewMode ? '검수 흐름 완료' : '투표 제출'}</button>
                  </div>
                ) : (
                  <div className="allstar-summary-actions">
                    <button type="button" onClick={() => goTo('HUB')}>올스타전 홈</button>
                    <button type="button" className="is-primary" onClick={() => goTo('RESULTS')}>투표 현황 보기</button>
                  </div>
                )}
              </>
            )}
          </section>
        ) : null}

        {resolvedView === 'THANKS' && (rosterReceiptChecked || rosterComplete) ? (
          <section className="allstar-thank-you">
            <h1>{thankYouIsPreview ? '검수 흐름을 완료했습니다' : '투표해 주셔서 감사합니다'}</h1>
            <p>{thankYouIsPreview ? '현재는 검수용 화면이라 실제 득표는 저장되지 않았습니다.' : '선택한 양 팀의 로스터를 확인하고 공유할 수 있습니다.'}</p>
            <div className="allstar-roster-team-toggle" role="group" aria-label="완료한 로스터 팀 선택">
              {TEAMS.map((team) => (
                <button
                  type="button"
                  key={team}
                  className={`${rosterReviewTeam === team ? 'is-active ' : ''}is-${TEAM_META[team].tone}`}
                  aria-pressed={rosterReviewTeam === team}
                  onClick={() => { setRosterDetail(null); setRosterReviewTeam(team); }}
                >
                  <strong>{TEAM_META[team].label}</strong>
                  <small>{TEAM_META[team].groups} · 12명</small>
                </button>
              ))}
            </div>
            <RosterReviewGrid
              candidates={activeRosterCandidates}
              team={rosterReviewTeam}
              onOpen={(index) => setRosterDetail({ team: rosterReviewTeam, index })}
            />
            <div className="allstar-roster-share-actions">
              {fileShareSupported && !rosterShareFallback ? (
                <>
                  <button type="button" className="is-primary is-wide" disabled={!rosterComplete || rosterShareFeedback === 'RENDERING'} onClick={handleRosterNativeShare}>이미지와 링크 공유</button>
                  <button type="button" disabled={!rosterComplete || rosterShareFeedback === 'RENDERING'} onClick={handleRosterDownload}>이미지 저장</button>
                  <button type="button" disabled={!rosterShareToken} onClick={handleRosterLinkCopy}>결과 링크 복사</button>
                </>
              ) : (
                <>
                  <button type="button" className="is-primary" disabled={!rosterComplete || rosterShareFeedback === 'RENDERING'} onClick={handleRosterDownload}>이미지 저장</button>
                  <button type="button" disabled={!rosterShareToken} onClick={handleRosterLinkCopy}>결과 링크 복사</button>
                </>
              )}
              {rosterShareLabel ? <p role="status" aria-live="polite">{rosterShareLabel}</p> : null}
            </div>
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

        {rosterComplete
          && !rosterPackRevealActive
          && !sharedRosterActive
          && (resolvedView === 'FINAL_REVIEW' || resolvedView === 'THANKS') ? (
          <RosterShareSheet
            ref={rosterShareSheetRef}
            team1Candidates={rosterByTeam.TEAM_1}
            team2Candidates={rosterByTeam.TEAM_2}
          />
        ) : null}

        {rosterDetail ? (
          <PlayerCardDetailDialog
            key={`${rosterDetail.team}:${rosterDetail.index}`}
            candidates={rosterByTeam[rosterDetail.team]}
            initialIndex={rosterDetail.index}
            readOnly
            readOnlyMessage={`${TEAM_META[rosterDetail.team].label}에서 선택한 선수 카드입니다.`}
            onClose={() => setRosterDetail(null)}
          />
        ) : null}

      </main>
      </div>
      {pendingExitTarget ? (
        <div className="allstar-exit-confirm" role="presentation" onClick={() => setPendingExitTarget(null)}>
          <section
            className="allstar-exit-confirm__dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="allstar-exit-confirm-title"
            aria-describedby="allstar-exit-confirm-description"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="allstar-exit-confirm__eyebrow">VOTE IN PROGRESS</span>
            <h2 id="allstar-exit-confirm-title">투표를 중단하고 나갈까요?</h2>
            <p id="allstar-exit-confirm-description">
              아직 최종 제출되지 않았습니다. 현재 선택은 이 브라우저 세션에 임시 저장되지만 득표에는 반영되지 않습니다.
            </p>
            <div className="allstar-exit-confirm__actions">
              <button type="button" ref={exitStayButtonRef} onClick={() => setPendingExitTarget(null)}>계속 투표하기</button>
              <button type="button" className="is-danger" onClick={() => performExit(pendingExitTarget)}>
                {pendingExitTarget === 'MAIN' ? '메인으로 나가기' : '올스타전 홈으로 나가기'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
