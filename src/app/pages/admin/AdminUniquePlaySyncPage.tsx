import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  UniquePlaySyncApiError,
  activateUniquePlayRevision,
  finalizeSeasonQualification,
  getSeasonPublicOverview,
  getSeasons,
  getUniquePlaySyncDiff,
  getUniquePlaySyncRun,
  getUniquePlaySyncSession,
  publishUniquePlaySyncRun,
  resolveUniquePlaySyncItem,
  startUniquePlaySyncRun,
  validateUniquePlaySyncRun,
  type SeasonPublicOverview,
} from '@core/api/backendClient';
import type {
  FinalizeSeasonQualificationResult,
  ResolveUniquePlaySyncItemRequest,
  SeasonQualificationResolution,
  UniquePlayRevisionActivationResult,
  UniquePlaySyncDiffAction,
  UniquePlaySyncDiffPage,
  UniquePlaySyncEntityType,
  UniquePlaySyncPublishResult,
  UniquePlaySyncRun,
  UniquePlaySyncSession,
  UniquePlaySyncSummary,
} from '@core/contracts/uniquePlaySync';
import {
  SYNC_ACTIONS,
  SYNC_ENTITIES,
  SyncStatusBadge,
  UniquePlayDiffTable,
  formatSyncDateTime,
  isUniquePlayDiffAvailable,
  isUniquePlayRunPolling,
  safeSyncReauthUrl,
  syncActionLabel,
  syncEntityLabel,
} from '@features/sync';
import '@features/sync/components/UniquePlaySync.css';

const RUN_STORAGE_KEY = 'aubl.uniquePlaySync.currentRunId';
const PAGE_SIZE = 25;
const currentYear = new Date().getFullYear();
const qualificationGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const qualificationResolutionOptions: Array<{ value: SeasonQualificationResolution; label: string }> = [
  { value: 'CURRENT_EUTTEUM', label: '으뜸권' },
  { value: 'CURRENT_BEOGEUM', label: '버금권' },
  { value: 'CURRENT_OUT', label: '진출권 밖' },
];

const cardStyle: CSSProperties = {
  borderRadius: '4px',
  border: '1px solid var(--season-line)',
  background: 'var(--season-surface)',
  padding: '20px',
  boxShadow: 'none',
  color: 'var(--season-ink)',
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--season-navy-900)',
  fontSize: '18px',
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  minHeight: '44px',
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '4px',
  border: '1px solid var(--season-line-strong)',
  background: 'var(--season-surface)',
  color: 'var(--season-ink)',
  padding: '8px 11px',
  fontSize: '14px',
};

const primaryButtonStyle: CSSProperties = {
  minHeight: '44px',
  borderRadius: '4px',
  border: '1px solid var(--sync-primary-bg)',
  background: 'var(--sync-primary-bg)',
  color: 'var(--sync-primary-fg)',
  padding: '9px 16px',
  fontSize: '13px',
  fontWeight: 850,
};

const secondaryButtonStyle: CSSProperties = {
  minHeight: '44px',
  borderRadius: '4px',
  border: '1px solid var(--season-line-strong)',
  background: 'var(--season-surface)',
  color: 'var(--season-navy-900)',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 800,
};

const emptySummary: UniquePlaySyncSummary = {
  total: 0,
  created: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  conflicts: 0,
  unresolved: 0,
  errors: 0,
  warnings: 0,
};

function storedRunId(): string {
  try {
    return window.sessionStorage.getItem(RUN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberRunId(runId: string): void {
  try {
    window.sessionStorage.setItem(RUN_STORAGE_KEY, runId);
  } catch {
    // The run remains usable in-memory when sessionStorage is unavailable.
  }
}

function syncErrorMessage(error: unknown): string {
  if (error instanceof UniquePlaySyncApiError) {
    if (error.status === 401 || error.code === 'INVALID_FIREBASE_TOKEN' || error.code === 'AUTHENTICATION_REQUIRED') {
      return 'NAS 백엔드가 AUBL 관리자 인증 토큰을 확인하지 못했습니다. AUBL에서 다시 로그인한 뒤에도 계속되면 NAS의 Firebase Admin 인증서 설정을 확인하세요.';
    }
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return '현재 AUBL 계정에 NAS 관리자 API 권한이 없습니다. Firebase 관리자 권한을 다시 확인하세요.';
    }
    const code = error.code ? ` (${error.code})` : '';
    return `${error.message}${code}`;
  }
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

function isRunOpen(run: UniquePlaySyncRun | null): boolean {
  if (!run) return false;
  return ['QUEUED', 'RUNNING', 'VALIDATING', 'PUBLISHING', 'ACTIVATING'].includes(run.status);
}

function actionCount(summary: UniquePlaySyncSummary, action: UniquePlaySyncDiffAction | 'ALL'): number {
  if (action === 'ALL') return summary.total;
  if (action === 'CREATE') return summary.created;
  if (action === 'UPDATE') return summary.updated;
  if (action === 'DELETE') return summary.deleted;
  if (action === 'CONFLICT') return summary.conflicts;
  if (action === 'UNCHANGED') return summary.unchanged;
  return 0;
}

function progressMessage(run: UniquePlaySyncRun): string {
  const phase = run.progress.phase?.trim().toUpperCase() ?? '';
  const message = run.progress.message?.trim() ?? '';
  const detailPhase = `${phase} ${message}`.toUpperCase();
  if (detailPhase.includes('GAME_DETAILS') || detailPhase.includes('GAME_RECORD') || detailPhase.includes('BOX_SCORE') || detailPhase.includes('GAME LOG')) {
    return '경기별 상세 기록(이닝·타자·투수·타석) 수집 중';
  }
  return message || run.progress.phase || '처리 중';
}

function summaryHasValues(summary: UniquePlaySyncSummary | null | undefined): summary is UniquePlaySyncSummary {
  if (!summary) return false;
  return summary.total > 0
    || summary.created > 0
    || summary.updated > 0
    || summary.deleted > 0
    || summary.unchanged > 0
    || summary.conflicts > 0
    || summary.unresolved > 0
    || summary.errors > 0
    || summary.warnings > 0;
}

function SummaryGrid({ summary }: { summary: UniquePlaySyncSummary }) {
  const items = [
    { label: '전체', value: summary.total, tone: 'neutral' },
    { label: '추가', value: summary.created, tone: 'positive' },
    { label: '변경', value: summary.updated, tone: 'progress' },
    { label: '삭제 후보', value: summary.deleted, tone: 'negative' },
    { label: '충돌', value: summary.conflicts, tone: 'warning' },
    { label: '미해결', value: summary.unresolved, tone: 'negative' },
  ];
  return (
    <div className="sync-summary-grid">
      {items.map((item) => (
        <div key={item.label} className="sync-summary-card" data-tone={item.tone}>
          <div className="sync-summary-card__label">{item.label}</div>
          <div className="sync-summary-card__value">{item.value.toLocaleString('ko-KR')}</div>
        </div>
      ))}
    </div>
  );
}

function qualificationStateLabel(stateValue: string | null | undefined): string {
  const state = stateValue?.trim().toUpperCase();
  if (state === 'CURRENT_EUTTEUM') return '현재 으뜸권';
  if (state === 'CURRENT_BEOGEUM') return '현재 버금권';
  if (state === 'CURRENT_OUT') return '현재 진출권 밖';
  if (state === 'CONFIRMED_EUTTEUM') return '으뜸권 확정';
  if (state === 'CONFIRMED_BEOGEUM') return '버금권 확정';
  if (state === 'CONFIRMED_OUT') return '탈락 확정';
  if (state === 'TIE_PENDING') return '경계 동률 · 결정 필요';
  return state || '상태 없음';
}

function qualificationStateTone(stateValue: string | null | undefined) {
  const state = stateValue?.trim().toUpperCase();
  if (state?.includes('EUTTEUM')) return 'progress';
  if (state?.includes('BEOGEUM')) return 'neutral';
  if (state === 'TIE_PENDING') return 'warning';
  return 'neutral';
}

function qualificationBucket(stateValue: string | null | undefined): 'EUTTEUM' | 'BEOGEUM' | 'OUT' | null {
  const state = stateValue?.trim().toUpperCase();
  if (state?.endsWith('_EUTTEUM')) return 'EUTTEUM';
  if (state?.endsWith('_BEOGEUM')) return 'BEOGEUM';
  if (state?.endsWith('_OUT') || state === 'OUT') return 'OUT';
  return null;
}

function qualificationOverviewSignature(overview: SeasonPublicOverview): string {
  return overview.groups
    .flatMap((group) => group.standings.map((row) => [
      group.groupCode,
      row.teamId,
      row.rank ?? '',
      row.qualificationState ?? '',
      row.syncRevision ?? '',
    ].join(':')))
    .sort()
    .join('|');
}

export default function AdminUniquePlaySyncPage() {
  const currentRunIdRef = useRef<string | null>(null);
  const runRequestSequenceRef = useRef(0);
  const diffRequestSequenceRef = useRef(0);
  const qualificationRequestSequenceRef = useRef(0);
  const [seasonYear, setSeasonYear] = useState(currentYear);
  const [session, setSession] = useState<UniquePlaySyncSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [run, setRun] = useState<UniquePlaySyncRun | null>(null);
  const [runIdInput, setRunIdInput] = useState(storedRunId);
  const [runLoading, setRunLoading] = useState(false);
  const [pollingSuspended, setPollingSuspended] = useState(false);
  const [diff, setDiff] = useState<UniquePlaySyncDiffPage | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<Exclude<UniquePlaySyncDiffAction, 'UNKNOWN'> | 'ALL'>('ALL');
  const [entityFilter, setEntityFilter] = useState<Exclude<UniquePlaySyncEntityType, 'UNKNOWN'> | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [resolvingItemId, setResolvingItemId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'start' | 'validate' | 'publish' | 'activate' | 'qualification' | null>(null);
  const [publication, setPublication] = useState<UniquePlaySyncPublishResult | null>(null);
  const [activation, setActivation] = useState<UniquePlayRevisionActivationResult | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [qualificationSeasonId, setQualificationSeasonId] = useState<number | null>(null);
  const [qualificationOverview, setQualificationOverview] = useState<SeasonPublicOverview | null>(null);
  const [qualificationLoading, setQualificationLoading] = useState(false);
  const [qualificationError, setQualificationError] = useState<string | null>(null);
  const [qualificationConfirmed, setQualificationConfirmed] = useState(false);
  const [tieResolutions, setTieResolutions] = useState<Record<string, SeasonQualificationResolution>>({});
  const [qualificationFinalization, setQualificationFinalization] = useState<FinalizeSeasonQualificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const markReauthRequired = useCallback((message: string) => {
    setSession((previous) => ({
      status: 'REAUTH_REQUIRED',
      rawStatus: 'REAUTH_REQUIRED',
      authenticated: false,
      expiresAt: previous?.expiresAt ?? null,
      checkedAt: new Date().toISOString(),
      message,
      reauthUrl: previous?.reauthUrl ?? null,
      activeRunId: previous?.activeRunId ?? null,
    }));
  }, []);

  const handleRequestError = useCallback((requestError: unknown) => {
    const message = syncErrorMessage(requestError);
    if (requestError instanceof UniquePlaySyncApiError && requestError.reauthRequired) {
      markReauthRequired(message);
    }
    setError(message);
    return message;
  }, [markReauthRequired]);

  const refreshSession = useCallback(async () => {
    setSessionLoading(true);
    setError(null);
    try {
      const nextSession = await getUniquePlaySyncSession();
      setSession(nextSession);
      if (nextSession.activeRunId) {
        setRunIdInput(nextSession.activeRunId);
      }
      return nextSession;
    } catch (requestError) {
      handleRequestError(requestError);
      return null;
    } finally {
      setSessionLoading(false);
    }
  }, [handleRequestError]);

  const refreshRun = useCallback(async (
    runId: string,
    mode: 'manual' | 'restore' | 'poll' = 'manual',
  ) => {
    const trimmedRunId = runId.trim();
    if (!trimmedRunId) return null;
    const requestSequence = ++runRequestSequenceRef.current;
    if (mode !== 'poll') {
      setRunLoading(true);
      setPollingSuspended(false);
      setError(null);
    }
    try {
      const nextRun = await getUniquePlaySyncRun(trimmedRunId);
      if (requestSequence !== runRequestSequenceRef.current) return null;
      if (currentRunIdRef.current !== nextRun.runId) {
        currentRunIdRef.current = nextRun.runId;
        diffRequestSequenceRef.current += 1;
        setDiff(null);
        setDiffLoading(false);
        setPublication(null);
        setActivation(null);
        setSelectedRevisionId(null);
        setPublishConfirmed(false);
        setActivationConfirmed(false);
        qualificationRequestSequenceRef.current += 1;
        setQualificationSeasonId(null);
        setQualificationOverview(null);
        setQualificationLoading(false);
        setQualificationError(null);
        setQualificationConfirmed(false);
        setTieResolutions({});
        setQualificationFinalization(null);
        setActionFilter('ALL');
        setEntityFilter('ALL');
        setSearchQuery('');
        setPage(0);
      }
      setRun(nextRun);
      setRunIdInput(nextRun.runId);
      rememberRunId(nextRun.runId);
      if (nextRun.sessionStatus === 'REAUTH_REQUIRED' || nextRun.status === 'REAUTH_REQUIRED') {
        markReauthRequired(nextRun.message ?? 'UniquePlay 세션 재인증이 필요합니다.');
      }
      return nextRun;
    } catch (requestError) {
      if (requestSequence !== runRequestSequenceRef.current) return null;
      handleRequestError(requestError);
      setPollingSuspended(true);
      return null;
    } finally {
      if (mode !== 'poll' && requestSequence === runRequestSequenceRef.current) setRunLoading(false);
    }
  }, [handleRequestError, markReauthRequired]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const persistedRunId = storedRunId();
    if (persistedRunId) void refreshRun(persistedRunId, 'restore');
  }, [refreshRun]);

  useEffect(() => {
    if (!session?.activeRunId || run?.runId === session.activeRunId || runLoading) return;
    void refreshRun(session.activeRunId, 'restore');
  }, [refreshRun, run?.runId, runLoading, session?.activeRunId]);

  useEffect(() => {
    if (!run || !isUniquePlayRunPolling(run.status) || pollingSuspended || runLoading) return;
    const timer = window.setTimeout(() => {
      void refreshRun(run.runId, 'poll');
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [pollingSuspended, refreshRun, run, runLoading]);

  const diffRunId = run?.runId ?? null;
  const diffAvailable = run ? isUniquePlayDiffAvailable(run.status) : false;

  const loadDiff = useCallback(async () => {
    if (!diffRunId || !diffAvailable) return;
    const requestSequence = ++diffRequestSequenceRef.current;
    setDiffLoading(true);
    setDiffError(null);
    try {
      const nextDiff = await getUniquePlaySyncDiff(diffRunId, {
        ...(entityFilter === 'ALL' ? {} : { entity: entityFilter }),
        ...(actionFilter === 'ALL' ? {} : { action: actionFilter }),
        page,
        size: PAGE_SIZE,
      });
      if (requestSequence !== diffRequestSequenceRef.current) return;
      setDiff(nextDiff);
    } catch (requestError) {
      if (requestSequence !== diffRequestSequenceRef.current) return;
      const message = syncErrorMessage(requestError);
      setDiffError(message);
      if (requestError instanceof UniquePlaySyncApiError && requestError.reauthRequired) {
        markReauthRequired(message);
      }
    } finally {
      if (requestSequence === diffRequestSequenceRef.current) setDiffLoading(false);
    }
  }, [actionFilter, diffAvailable, diffRunId, entityFilter, markReauthRequired, page]);

  useEffect(() => {
    if (diffAvailable) void loadDiff();
  }, [diffAvailable, loadDiff]);

  useEffect(() => {
    setPublishConfirmed(false);
  }, [run?.checksum, run?.expectedPublishedRevision]);

  const handleStartRun = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
      setError('시즌 연도는 2000~2100 사이의 정수로 입력해 주세요.');
      return;
    }
    if (session?.status !== 'READY') {
      setError('UniquePlay 세션이 연결된 상태에서만 수집을 시작할 수 있습니다.');
      return;
    }
    if (isRunOpen(run)) {
      setError('현재 실행의 검토·게시·활성화를 먼저 마쳐 주세요.');
      return;
    }
    setBusyAction('start');
    try {
      const nextRun = await startUniquePlaySyncRun({ seasonYear });
      currentRunIdRef.current = nextRun.runId;
      runRequestSequenceRef.current += 1;
      diffRequestSequenceRef.current += 1;
      setRun(nextRun);
      setRunIdInput(nextRun.runId);
      rememberRunId(nextRun.runId);
      setDiff(null);
      setDiffLoading(false);
      setPublication(null);
      setActivation(null);
      qualificationRequestSequenceRef.current += 1;
      setQualificationSeasonId(null);
      setQualificationOverview(null);
      setQualificationLoading(false);
      setQualificationError(null);
      setQualificationConfirmed(false);
      setTieResolutions({});
      setQualificationFinalization(null);
      setActionFilter('ALL');
      setEntityFilter('ALL');
      setSearchQuery('');
      setPage(0);
      setPollingSuspended(false);
      setNotice('수집 실행을 시작했습니다. 수집 중에만 상태를 자동 확인합니다.');
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusyAction(null);
    }
  };

  const handleLoadRun = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    await refreshRun(runIdInput, 'manual');
  };

  const handleResolve = async (itemId: string, request: ResolveUniquePlaySyncItemRequest) => {
    if (!run) return;
    setResolvingItemId(itemId);
    setError(null);
    setNotice(null);
    try {
      const updatedRun = await resolveUniquePlaySyncItem(run.runId, itemId, request);
      if (updatedRun) setRun(updatedRun);
      else await refreshRun(run.runId, 'restore');
      setPublication(null);
      setActivation(null);
      setPublishConfirmed(false);
      setActivationConfirmed(false);
      await loadDiff();
      setNotice('충돌 처리 결정을 저장했습니다. 게시 전 검증을 다시 실행하세요.');
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setResolvingItemId(null);
    }
  };

  const handleValidate = async () => {
    if (!run) return;
    setBusyAction('validate');
    setError(null);
    setNotice(null);
    try {
      const updatedRun = await validateUniquePlaySyncRun(run.runId);
      setRun(updatedRun);
      setPublication(null);
      setActivation(null);
      setPublishConfirmed(false);
      setActivationConfirmed(false);
      setPollingSuspended(false);
      setNotice(updatedRun.validation.status === 'PASSED'
        ? '검증을 통과했습니다. 체크섬과 기준 리비전을 확인한 뒤 게시할 수 있습니다.'
        : '검증 요청을 접수했습니다. 결과를 확인해 주세요.');
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePublish = async () => {
    if (!run) return;
    if (!run.checksum || run.expectedPublishedRevision === null) {
      setError('서버가 제공한 체크섬 또는 기준 리비전이 없어 게시를 중단했습니다. 새로고침 후 다시 확인하세요.');
      return;
    }
    if (!publishConfirmed) {
      setError('변경 내용과 체크섬을 확인했다는 항목에 먼저 동의해 주세요.');
      return;
    }
    setBusyAction('publish');
    setError(null);
    setNotice(null);
    try {
      const result = await publishUniquePlaySyncRun(run.runId, {
        checksum: run.checksum,
        expectedPublishedRevision: run.expectedPublishedRevision,
      });
      setPublication(result);
      setSelectedRevisionId(result.revisionId);
      if (result.run) setRun(result.run);
      else await refreshRun(run.runId, 'restore');
      setActivation(null);
      setActivationConfirmed(false);
      setNotice('검증된 스냅샷으로 불변 리비전을 생성했습니다. 아직 서비스에는 활성화되지 않았습니다.');
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusyAction(null);
    }
  };

  const runHasPublishedRevision = !!run
    && ['PUBLISHED', 'ACTIVATING', 'ACTIVE', 'REPAIR_REQUIRED'].includes(run.status)
    && !!run.revisionId;
  const revisionIdForActivation = selectedRevisionId
    ?? publication?.revisionId
    ?? (runHasPublishedRevision ? run?.revisionId : null);
  const activeRevisionId = run?.revisions.find((revision) => revision.active)?.revisionId
    ?? activation?.activeRevision
    ?? (run?.status === 'ACTIVE' ? run.publishedRevision ?? run.revisionId : null)
    ?? null;
  const activationExpectedRevision = selectedRevisionId && selectedRevisionId !== publication?.revisionId
    ? activeRevisionId
    : publication?.expectedPublishedRevision
    ?? (runHasPublishedRevision ? run?.expectedPublishedRevision : null)
    ?? null;

  const handleActivate = async () => {
    if (!revisionIdForActivation) return;
    if (activationExpectedRevision === null) {
      setError('활성화에 필요한 게시 리비전 번호가 서버 응답에 없어 중단했습니다.');
      return;
    }
    if (!activationConfirmed) {
      setError('서비스 반영 확인 항목에 먼저 동의해 주세요.');
      return;
    }
    setBusyAction('activate');
    setError(null);
    setNotice(null);
    try {
      const result = await activateUniquePlayRevision(revisionIdForActivation, {
        expectedPublishedRevision: activationExpectedRevision,
      });
      setActivation(result);
      setSelectedRevisionId(result.revisionId);
      if (result.run) setRun(result.run);
      else if (run) await refreshRun(run.runId, 'restore');
      setNotice('선택한 리비전의 활성화 요청이 완료되었습니다. 상태와 활성 리비전을 확인하세요.');
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusyAction(null);
    }
  };

  const activeQualificationRevisionId = activation?.activeRevision
    ?? (run?.status === 'ACTIVE' ? activeRevisionId : null);

  const loadQualificationOverview = useCallback(async () => {
    const targetRevision = activeQualificationRevisionId;
    const targetYear = run?.seasonYear;
    if (!targetRevision || targetYear == null) return;
    const requestSequence = ++qualificationRequestSequenceRef.current;
    setQualificationLoading(true);
    setQualificationError(null);
    setQualificationConfirmed(false);
    setQualificationFinalization(null);
    try {
      const seasons = await getSeasons();
      const season = seasons.find((entry) => entry.year === targetYear);
      if (!season) throw new Error(`${targetYear} 시즌의 AUBL seasonId를 찾지 못했습니다.`);
      const overview = await getSeasonPublicOverview(season.id);
      if (requestSequence !== qualificationRequestSequenceRef.current) return;
      if (overview.sourceFreshness.publishedRevision !== targetRevision) {
        throw new Error('활성 리비전과 시즌 현황 리비전이 일치하지 않아 확정 절차를 중단했습니다.');
      }
      setQualificationSeasonId(season.id);
      setQualificationOverview(overview);
      setTieResolutions((previous) => {
        const next: Record<string, SeasonQualificationResolution> = {};
        overview.groups.forEach((group) => group.standings.forEach((standing) => {
          if (standing.qualificationState?.toUpperCase() !== 'TIE_PENDING') return;
          const previousResolution = previous[String(standing.teamId)];
          if (previousResolution) next[String(standing.teamId)] = previousResolution;
        }));
        return next;
      });
    } catch (requestError) {
      if (requestSequence !== qualificationRequestSequenceRef.current) return;
      setQualificationSeasonId(null);
      setQualificationOverview(null);
      setQualificationError(syncErrorMessage(requestError));
    } finally {
      if (requestSequence === qualificationRequestSequenceRef.current) setQualificationLoading(false);
    }
  }, [activeQualificationRevisionId, run?.seasonYear]);

  useEffect(() => {
    if (!activeQualificationRevisionId || run?.seasonYear == null) {
      qualificationRequestSequenceRef.current += 1;
      setQualificationSeasonId(null);
      setQualificationOverview(null);
      setQualificationLoading(false);
      setQualificationError(null);
      setQualificationConfirmed(false);
      setTieResolutions({});
      setQualificationFinalization(null);
      return;
    }
    void loadQualificationOverview();
  }, [activeQualificationRevisionId, loadQualificationOverview, run?.seasonYear]);

  const displayedItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ko-KR');
    if (!diff || !normalizedQuery) return diff?.items ?? [];
    return diff.items.filter((item) => [
      item.displayName,
      item.externalId,
      item.localEntityId,
      item.groupCode,
      item.conflictReason,
    ].some((value) => value?.toLocaleLowerCase('ko-KR').includes(normalizedQuery)));
  }, [diff, searchQuery]);

  const qualificationRows = useMemo(
    () => qualificationOverview?.groups.flatMap((group) => group.standings) ?? [],
    [qualificationOverview],
  );
  const tieRows = useMemo(
    () => qualificationRows.filter((row) => row.qualificationState?.toUpperCase() === 'TIE_PENDING'),
    [qualificationRows],
  );
  const qualificationRevisionMatches = !!activeQualificationRevisionId
    && qualificationOverview?.sourceFreshness.publishedRevision === activeQualificationRevisionId;
  const qualificationAlreadyFinalized = qualificationRows.length === 40
    && qualificationRows.every((row) => row.qualificationState?.toUpperCase().startsWith('CONFIRMED_'));
  const qualificationIssues = useMemo(() => {
    if (!qualificationOverview) return ['시즌 현황을 먼저 불러와야 합니다.'];
    const issues: string[] = [];
    qualificationGroups.forEach((groupCode) => {
      const group = qualificationOverview.groups.find((entry) => entry.groupCode === groupCode);
      if (!group || group.standings.length !== 5) {
        issues.push(`${groupCode}조는 게시된 5개 팀이 필요합니다.`);
        return;
      }
      const projected = group.standings.map((row) => {
        const state = row.qualificationState?.toUpperCase();
        return state === 'TIE_PENDING' ? tieResolutions[String(row.teamId)] : state;
      });
      const unresolved = projected.filter((state) => !state).length;
      if (unresolved > 0) {
        issues.push(`${groupCode}조의 경계 동률 ${unresolved}팀을 결정해야 합니다.`);
        return;
      }
      const buckets = projected.map(qualificationBucket);
      const eutteum = buckets.filter((bucket) => bucket === 'EUTTEUM').length;
      const beogeum = buckets.filter((bucket) => bucket === 'BEOGEUM').length;
      const out = buckets.filter((bucket) => bucket === 'OUT').length;
      if (eutteum !== 2 || beogeum !== 2 || out !== 1) {
        issues.push(`${groupCode}조 배분은 으뜸 2팀 · 버금 2팀 · 탈락 1팀이어야 합니다.`);
      }
    });
    return issues;
  }, [qualificationOverview, tieResolutions]);
  const qualificationReadyToConfirm = !!qualificationSeasonId
    && qualificationRevisionMatches
    && !qualificationAlreadyFinalized
    && qualificationIssues.length === 0;

  const handleFinalizeQualification = async () => {
    if (!qualificationSeasonId || !activeQualificationRevisionId || !qualificationOverview) return;
    if (!qualificationRevisionMatches) {
      setError('활성 리비전과 확인한 시즌 현황이 일치하지 않습니다. 현황을 다시 불러와 주세요.');
      return;
    }
    if (qualificationIssues.length > 0) {
      setError('조별 배분 조건과 동률 결정을 모두 완료한 뒤 확정해 주세요.');
      return;
    }
    if (!qualificationConfirmed) {
      setError('진출권 확정 확인 항목에 먼저 동의해 주세요.');
      return;
    }
    const resolutions: Record<string, SeasonQualificationResolution> = {};
    tieRows.forEach((row) => {
      const resolution = tieResolutions[String(row.teamId)];
      if (resolution) resolutions[String(row.teamId)] = resolution;
    });
    setBusyAction('qualification');
    setError(null);
    setNotice(null);
    setQualificationError(null);
    try {
      const latestOverview = await getSeasonPublicOverview(qualificationSeasonId);
      if (latestOverview.sourceFreshness.publishedRevision !== activeQualificationRevisionId) {
        setQualificationOverview(latestOverview);
        setQualificationConfirmed(false);
        setTieResolutions({});
        throw new Error('확정 직전 활성 리비전이 변경되어 요청을 중단했습니다. 현황을 다시 검토해 주세요.');
      }
      if (qualificationOverviewSignature(latestOverview) !== qualificationOverviewSignature(qualificationOverview)) {
        setQualificationOverview(latestOverview);
        setQualificationConfirmed(false);
        setTieResolutions({});
        throw new Error('확정 직전 조별 상태가 변경되어 요청을 중단했습니다. 현황을 다시 검토해 주세요.');
      }
      const result = await finalizeSeasonQualification(qualificationSeasonId, {
        confirmed: true,
        expectedPublishedRevision: activeQualificationRevisionId,
        tieResolutions: resolutions,
      });
      setQualificationFinalization(result);
      setQualificationConfirmed(false);
      if (result.revisionId === activeQualificationRevisionId) {
        setNotice(`${run?.seasonYear ?? ''} 시즌 으뜸권·버금권을 확정했습니다.`.trim());
      } else {
        setNotice('진출권 확정 응답을 받았지만 리비전이 변경되었습니다. 결과를 다시 확인해 주세요.');
        setQualificationError('확정 결과 리비전이 요청 시점의 활성 리비전과 일치하지 않습니다. 재요청하지 말고 서버 상태를 확인하세요.');
      }
      try {
        const refreshed = await getSeasonPublicOverview(qualificationSeasonId);
        setQualificationOverview(refreshed);
      } catch (refreshError) {
        setQualificationError(`확정은 완료됐지만 현황을 다시 읽지 못했습니다: ${syncErrorMessage(refreshError)}`);
      }
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setBusyAction(null);
    }
  };

  const summary = summaryHasValues(run?.summary)
    ? run.summary
    : diff?.summary ?? run?.summary ?? emptySummary;
  const sessionReady = session?.status === 'READY';
  const runPolling = run ? isUniquePlayRunPolling(run.status) : false;
  const canValidate = !!run
    && ['REVIEW_REQUIRED', 'VALIDATION_FAILED', 'READY_TO_PUBLISH'].includes(run.status)
    && summary.unresolved === 0
    && !runPolling;
  const validationPassed = run?.validation.status === 'PASSED' || run?.status === 'READY_TO_PUBLISH';
  const canPublish = !!run
    && run.status === 'READY_TO_PUBLISH'
    && validationPassed
    && summary.unresolved === 0
    && !!run.checksum
    && run.expectedPublishedRevision !== null;
  const safeReauthUrl = safeSyncReauthUrl(session?.reauthUrl ?? null);
  const progressPercent = run?.progress.percent;
  const revisionIsActive = !!revisionIdForActivation
    && (activeRevisionId === revisionIdForActivation || activation?.activeRevision === revisionIdForActivation);
  const revisionIsActivating = run?.status === 'ACTIVATING';

  return (
    <main
      aria-labelledby="unique-play-sync-title"
      className="unique-play-sync-page"
      style={{
        display: 'grid',
        gap: '16px',
        padding: '2px',
        color: 'var(--season-ink)',
      }}
    >
      <section
        className="unique-play-sync-hero"
        style={{
          borderRadius: '18px',
          border: '1px solid var(--season-line-strong)',
          background: 'var(--season-surface)',
          padding: '22px',
          boxShadow: '0 14px 34px rgba(9, 42, 88, 0.12)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '760px' }}>
            <div style={{ color: 'var(--season-blue-700)', fontSize: '12px', fontWeight: 900, letterSpacing: '0.1em' }}>AUBL DATA OPERATIONS</div>
            <h2 id="unique-play-sync-title" style={{ margin: '5px 0 7px', color: 'var(--season-navy-900)', fontSize: '27px', fontWeight: 950 }}>
              UniquePlay 수동 동기화
            </h2>
            <p style={{ margin: 0, color: 'var(--season-muted)', fontSize: '14px', lineHeight: 1.7 }}>
              수집 결과를 바로 공개하지 않습니다. 변경 비교, 충돌 처리, 검증, 리비전 생성, 활성화를 순서대로 완료해야 서비스에 반영됩니다.
            </p>
          </div>
          <div style={{ border: '1px solid var(--season-line)', borderRadius: '12px', background: 'var(--season-surface)', padding: '10px 13px', color: 'var(--season-ink)', fontSize: '12px', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--season-blue-700)' }}>보안 원칙</strong><br />원본 사용자 정보는 이 화면에 표시하지 않습니다.
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="sync-callout is-danger" style={{ border: '1px solid color-mix(in srgb, var(--season-danger) 44%, var(--season-line))', borderRadius: '12px', background: 'color-mix(in srgb, var(--season-danger) 9%, var(--season-surface))', color: 'var(--season-danger)', padding: '12px 14px', fontSize: '13px', fontWeight: 750 }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" aria-live="polite" className="sync-callout is-success" style={{ border: '1px solid color-mix(in srgb, var(--season-success) 44%, var(--season-line))', borderRadius: '12px', background: 'color-mix(in srgb, var(--season-success) 10%, var(--season-surface))', color: 'var(--season-success)', padding: '12px 14px', fontSize: '13px', fontWeight: 750 }}>
          {notice}
        </div>
      )}

      <section style={cardStyle} aria-labelledby="unique-play-session-heading" aria-busy={sessionLoading}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h3 id="unique-play-session-heading" style={sectionTitleStyle}>1. 연결 세션 확인</h3>
            <p style={{ margin: '5px 0 0', color: 'var(--season-muted)', fontSize: '13px' }}>AUBL 관리자 인증과 서버의 UniquePlay 수집 세션을 함께 확인합니다.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            {session && <SyncStatusBadge kind="session" status={session.status} />}
            <button type="button" onClick={() => { void refreshSession(); }} disabled={sessionLoading} style={{ ...secondaryButtonStyle, cursor: sessionLoading ? 'wait' : 'pointer', opacity: sessionLoading ? 0.65 : 1 }}>
              {sessionLoading ? '확인 중…' : '세션 다시 확인'}
            </button>
          </div>
        </div>

        {sessionLoading && !session ? (
          <p role="status" style={{ margin: '16px 0 0', color: 'var(--season-muted)' }}>연결 상태를 확인하고 있습니다.</p>
        ) : session ? (
          <div style={{ marginTop: '15px', display: 'grid', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '9px', color: 'var(--season-muted)', fontSize: '13px' }}>
              <div><strong style={{ color: 'var(--season-ink)' }}>인증:</strong> {session.authenticated ? '확인됨' : '확인 필요'}</div>
              <div><strong style={{ color: 'var(--season-ink)' }}>만료:</strong> {formatSyncDateTime(session.expiresAt)}</div>
              <div><strong style={{ color: 'var(--season-ink)' }}>활성 실행:</strong> {session.activeRunId ?? '없음'}</div>
            </div>
            {session.message && <p style={{ margin: 0, color: session.status === 'REAUTH_REQUIRED' ? 'var(--season-danger)' : 'var(--season-muted)', fontSize: '13px' }}>{session.message}</p>}
            {session.status === 'REAUTH_REQUIRED' && (
              <div className="sync-callout is-warning" style={{ border: '1px solid color-mix(in srgb, var(--season-warning) 44%, var(--season-line))', background: 'color-mix(in srgb, var(--season-warning) 10%, var(--season-surface))', borderRadius: '11px', padding: '12px', color: 'var(--season-warning)', fontSize: '13px', lineHeight: 1.6 }}>
                세션이 만료되어 새 수집·검증·게시 작업을 진행할 수 없습니다. 재인증을 마친 뒤 세션 상태를 다시 확인하세요.
                {safeReauthUrl && (
                  <div style={{ marginTop: '9px' }}>
                    <a href={safeReauthUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--season-blue-700)', fontWeight: 850 }}>재인증 페이지 열기 (새 창)</a>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p role="status" style={{ margin: '16px 0 0', color: 'var(--season-muted)' }}>세션 정보를 불러오지 못했습니다. 오류를 확인한 뒤 다시 시도하세요.</p>
        )}
      </section>

      <section style={cardStyle} aria-labelledby="unique-play-start-heading">
        <h3 id="unique-play-start-heading" style={sectionTitleStyle}>2. 수집 실행</h3>
        <p style={{ margin: '5px 0 15px', color: 'var(--season-muted)', fontSize: '13px', lineHeight: 1.6 }}>
          시작 버튼은 경기·순위·선수 누적 기록과 경기별 상세 기록을 수집해 비교 스냅샷을 만듭니다. 게시나 활성화는 자동으로 수행하지 않습니다.
        </p>
        <form onSubmit={(event) => { void handleStartRun(event); }} style={{ display: 'flex', alignItems: 'end', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '5px', width: '180px', color: 'var(--season-ink)', fontSize: '12px', fontWeight: 800 }}>
            시즌 연도
            <input type="number" min={2000} max={2100} step={1} value={seasonYear} onChange={(event) => setSeasonYear(Number(event.target.value))} style={inputStyle} />
          </label>
          <button
            type="submit"
            disabled={!sessionReady || isRunOpen(run) || busyAction !== null || runLoading}
            style={{
              ...primaryButtonStyle,
              cursor: !sessionReady || isRunOpen(run) || busyAction !== null || runLoading ? 'not-allowed' : 'pointer',
              opacity: !sessionReady || isRunOpen(run) || busyAction !== null || runLoading ? 0.55 : 1,
            }}
          >
            {busyAction === 'start' ? '실행 생성 중…' : `${seasonYear} 시즌 수집 시작`}
          </button>
          {!sessionReady && <span style={{ color: 'var(--season-warning)', fontSize: '12px', fontWeight: 700 }}>세션 연결 확인이 필요합니다.</span>}
          {isRunOpen(run) && <span style={{ color: 'var(--season-warning)', fontSize: '12px', fontWeight: 700 }}>현재 실행을 먼저 완료해야 합니다.</span>}
        </form>

        <form onSubmit={(event) => { void handleLoadRun(event); }} style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--season-line)', display: 'flex', alignItems: 'end', gap: '9px', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '5px', minWidth: '260px', flex: '1 1 340px', color: 'var(--season-ink)', fontSize: '12px', fontWeight: 800 }}>
            기존 실행 ID 불러오기
            <input value={runIdInput} onChange={(event) => setRunIdInput(event.target.value)} placeholder="서버가 발급한 runId" autoComplete="off" style={inputStyle} />
          </label>
          <button type="submit" disabled={!runIdInput.trim() || runLoading || busyAction !== null} style={{ ...secondaryButtonStyle, cursor: !runIdInput.trim() || runLoading || busyAction !== null ? 'not-allowed' : 'pointer', opacity: !runIdInput.trim() || runLoading || busyAction !== null ? 0.55 : 1 }}>
            {runLoading ? '불러오는 중…' : '실행 불러오기'}
          </button>
        </form>
      </section>

      {!run ? (
        <section style={cardStyle} aria-labelledby="unique-play-empty-heading">
          <h3 id="unique-play-empty-heading" style={sectionTitleStyle}>실행 대기</h3>
          <p style={{ margin: '8px 0 0', color: 'var(--season-muted)', fontSize: '14px' }}>수집을 시작하거나 기존 실행 ID를 불러오면 진행 상태와 변경 비교가 표시됩니다.</p>
        </section>
      ) : (
        <>
          <section style={cardStyle} aria-labelledby="unique-play-run-heading" aria-busy={runPolling && !pollingSuspended}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h3 id="unique-play-run-heading" style={sectionTitleStyle}>3. 실행 상태</h3>
                <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <SyncStatusBadge kind="run" status={run.status} rawStatus={run.rawStatus} />
                  <code style={{ color: 'var(--season-muted)', background: 'var(--season-surface-muted)', borderRadius: '6px', padding: '3px 6px', fontSize: '12px' }}>{run.runId}</code>
                </div>
              </div>
              <button type="button" onClick={() => { void refreshRun(run.runId, 'manual'); }} disabled={runLoading || busyAction !== null} style={{ ...secondaryButtonStyle, cursor: runLoading || busyAction !== null ? 'wait' : 'pointer', opacity: runLoading || busyAction !== null ? 0.6 : 1 }}>
                {runLoading ? '갱신 중…' : '상태 새로고침'}
              </button>
            </div>

            {runPolling && (
              <div style={{ marginTop: '14px' }}>
                <progress
                  aria-label="동기화 실행 진행률"
                  {...(progressPercent === null || progressPercent === undefined ? {} : { value: progressPercent, max: 100 })}
                  style={{ width: '100%', height: '10px', accentColor: 'var(--season-blue-700)' }}
                />
                <div style={{ marginTop: '5px', display: 'flex', justifyContent: 'space-between', gap: '12px', color: 'var(--season-muted)', fontSize: '12px' }}>
                  <span>{progressMessage(run)}</span>
                  <span>{progressPercent == null ? '진행률 계산 중' : `${Math.round(progressPercent)}%`}</span>
                </div>
              </div>
            )}
            {pollingSuspended && (
              <p role="alert" style={{ margin: '12px 0 0', color: 'var(--season-danger)', fontSize: '13px', fontWeight: 750 }}>
                자동 상태 확인 중 오류가 발생해 폴링을 멈췄습니다. 상태 새로고침을 눌러 재개하세요.
              </p>
            )}
            {run.status === 'REPAIR_REQUIRED' && (
              <div role="alert" style={{ marginTop: '12px', border: '1px solid color-mix(in srgb, var(--season-danger) 44%, var(--season-line))', borderRadius: '10px', background: 'color-mix(in srgb, var(--season-danger) 9%, var(--season-surface))', color: 'var(--season-danger)', padding: '11px 12px', fontSize: '13px', fontWeight: 750, lineHeight: 1.6 }}>
                MariaDB와 Firestore의 게시 상태를 자동으로 되돌리지 못했습니다. 새 수집이나 확정을 진행하지 말고, 활성 리비전과 Firestore 동기화 메타데이터를 운영 절차에 따라 복구하세요.
              </div>
            )}
            {run.message && <p style={{ margin: '12px 0 0', color: run.status === 'FAILED' || run.status === 'REPAIR_REQUIRED' ? 'var(--season-danger)' : 'var(--season-muted)', fontSize: '13px' }}>{run.message}</p>}
            {run.errorCode && (
              <p style={{ margin: '8px 0 0', color: 'var(--season-muted)', fontSize: '12px', fontWeight: 750 }}>
                운영 진단 코드{' '}
                <code aria-label={`운영 진단 코드 ${run.errorCode}`} style={{ padding: '3px 6px', border: '1px solid var(--season-line)', borderRadius: '4px', background: 'var(--season-surface-muted)', color: 'var(--season-ink)', overflowWrap: 'anywhere' }}>
                  {run.errorCode}
                </code>
              </p>
            )}
            <div style={{ marginTop: '15px' }}><SummaryGrid summary={summary} /></div>
            <dl style={{ margin: '15px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '9px', color: 'var(--season-muted)', fontSize: '12px' }}>
              <div><dt style={{ fontWeight: 800 }}>시즌</dt><dd style={{ margin: '3px 0 0' }}>{run.seasonYear ?? '—'}</dd></div>
              <div><dt style={{ fontWeight: 800 }}>시작</dt><dd style={{ margin: '3px 0 0' }}>{formatSyncDateTime(run.startedAt)}</dd></div>
              <div><dt style={{ fontWeight: 800 }}>마지막 갱신</dt><dd style={{ margin: '3px 0 0' }}>{formatSyncDateTime(run.updatedAt)}</dd></div>
              <div><dt style={{ fontWeight: 800 }}>체크섬</dt><dd style={{ margin: '3px 0 0', overflowWrap: 'anywhere' }}>{run.checksum ?? '아직 생성되지 않음'}</dd></div>
              <div><dt style={{ fontWeight: 800 }}>기준 게시 리비전</dt><dd style={{ margin: '3px 0 0' }}>{run.expectedPublishedRevision ?? '—'}</dd></div>
            </dl>
          </section>

          {diffAvailable ? (
            <section style={cardStyle} aria-labelledby="unique-play-diff-heading" aria-busy={diffLoading}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h3 id="unique-play-diff-heading" style={sectionTitleStyle}>4. 변경 비교와 충돌 처리</h3>
                  <p style={{ margin: '5px 0 0', color: 'var(--season-muted)', fontSize: '13px' }}>삭제 후보와 충돌을 먼저 검토하세요. 화살표 왼쪽은 현재 게시값, 오른쪽은 UniquePlay 값입니다. ‘경기 기록’은 이닝·타자·투수·타석 상세를 의미합니다.</p>
                </div>
                <button type="button" onClick={() => { void loadDiff(); }} disabled={diffLoading} style={{ ...secondaryButtonStyle, cursor: diffLoading ? 'wait' : 'pointer', opacity: diffLoading ? 0.6 : 1 }}>
                  {diffLoading ? '목록 갱신 중…' : '변경 목록 새로고침'}
                </button>
              </div>

              <div role="group" aria-label="변경 유형 필터" style={{ marginTop: '15px', display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                {(['ALL', ...SYNC_ACTIONS] as const).map((action) => {
                  const selected = actionFilter === action;
                  return (
                    <button
                      key={action}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => { setActionFilter(action); setPage(0); }}
                      style={{
                        borderRadius: '4px',
                        border: selected ? '1px solid var(--sync-primary-bg)' : '1px solid var(--season-line)',
                        background: selected ? 'var(--sync-primary-bg)' : 'var(--season-surface)',
                        color: selected ? '#fff' : 'var(--season-ink)',
                        padding: '7px 11px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {action === 'ALL' ? '전체' : syncActionLabel(action)} {actionCount(summary, action)}
                    </button>
                  );
                })}
              </div>

              <div className="sync-filter-grid" style={{ margin: '12px 0', display: 'grid', gridTemplateColumns: 'minmax(170px, 0.45fr) minmax(220px, 1fr)', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '5px', color: 'var(--season-ink)', fontSize: '12px', fontWeight: 800 }}>
                  데이터 종류
                  <select value={entityFilter} onChange={(event) => { setEntityFilter(event.target.value as Exclude<UniquePlaySyncEntityType, 'UNKNOWN'> | 'ALL'); setPage(0); }} style={inputStyle}>
                    <option value="ALL">전체 종류</option>
                    {SYNC_ENTITIES.map((entity) => <option key={entity} value={entity}>{syncEntityLabel(entity)}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '5px', color: 'var(--season-ink)', fontSize: '12px', fontWeight: 800 }}>
                  현재 페이지에서 찾기
                  <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="이름, 외부 ID, AUBL ID, 조" style={inputStyle} />
                </label>
              </div>

              {diffError && <div role="alert" style={{ marginBottom: '12px', border: '1px solid color-mix(in srgb, var(--season-danger) 44%, var(--season-line))', borderRadius: '10px', background: 'color-mix(in srgb, var(--season-danger) 9%, var(--season-surface))', color: 'var(--season-danger)', padding: '11px 12px', fontSize: '13px' }}>{diffError}</div>}
              {diffLoading && !diff ? (
                <div role="status" style={{ padding: '30px', textAlign: 'center', color: 'var(--season-muted)' }}>변경 목록을 불러오는 중입니다.</div>
              ) : diff ? (
                <>
                  <UniquePlayDiffTable items={displayedItems} resolvingItemId={resolvingItemId} onResolve={handleResolve} />
                  {searchQuery.trim() && displayedItems.length !== diff.items.length && (
                    <p role="status" style={{ margin: '8px 0 0', color: 'var(--season-muted)', fontSize: '12px' }}>
                      현재 페이지 {diff.items.length}건 중 {displayedItems.length}건이 검색어와 일치합니다.
                    </p>
                  )}
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--season-muted)', fontSize: '12px' }}>전체 {diff.totalElements.toLocaleString('ko-KR')}건 · {diff.totalPages === 0 ? 0 : diff.page + 1}/{diff.totalPages} 페이지</span>
                    <div style={{ display: 'flex', gap: '7px' }}>
                      <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={diff.page <= 0 || diffLoading} style={{ ...secondaryButtonStyle, minHeight: '44px', cursor: diff.page <= 0 || diffLoading ? 'not-allowed' : 'pointer', opacity: diff.page <= 0 || diffLoading ? 0.5 : 1 }}>이전</button>
                      <button type="button" onClick={() => setPage((value) => value + 1)} disabled={!diff.hasNext || diffLoading} style={{ ...secondaryButtonStyle, minHeight: '44px', cursor: !diff.hasNext || diffLoading ? 'not-allowed' : 'pointer', opacity: !diff.hasNext || diffLoading ? 0.5 : 1 }}>다음</button>
                    </div>
                  </div>
                </>
              ) : (
                <div role="status" style={{ padding: '30px', textAlign: 'center', color: 'var(--season-muted)' }}>변경 목록 응답이 없습니다. 새로고침을 시도하세요.</div>
              )}
            </section>
          ) : (
            <section style={cardStyle} aria-labelledby="unique-play-diff-pending-heading">
              <h3 id="unique-play-diff-pending-heading" style={sectionTitleStyle}>4. 변경 비교 준비 중</h3>
              <p style={{ margin: '8px 0 0', color: 'var(--season-muted)', fontSize: '13px' }}>서버가 수집과 정규화를 마치면 변경 비교 화면이 열립니다.</p>
            </section>
          )}

          <section style={cardStyle} aria-labelledby="unique-play-validation-heading">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h3 id="unique-play-validation-heading" style={sectionTitleStyle}>5. 검증</h3>
                <div style={{ marginTop: '7px' }}><SyncStatusBadge kind="validation" status={run.validation.status} /></div>
              </div>
              <button
                type="button"
                onClick={() => { void handleValidate(); }}
                disabled={!canValidate || busyAction !== null || !sessionReady}
                style={{ ...primaryButtonStyle, cursor: !canValidate || busyAction !== null || !sessionReady ? 'not-allowed' : 'pointer', opacity: !canValidate || busyAction !== null || !sessionReady ? 0.55 : 1 }}
              >
                {busyAction === 'validate' ? '검증 요청 중…' : '서버 검증 실행'}
              </button>
            </div>
            {summary.unresolved > 0 && <p role="alert" style={{ margin: '12px 0 0', color: 'var(--season-danger)', fontSize: '13px', fontWeight: 750 }}>미해결 항목 {summary.unresolved}건을 모두 처리해야 검증할 수 있습니다.</p>}
            {run.validation.issues.length === 0 ? (
              <p style={{ margin: '13px 0 0', color: 'var(--season-muted)', fontSize: '13px' }}>서버가 반환한 검증 이슈가 없습니다.</p>
            ) : (
              <ul style={{ margin: '13px 0 0', paddingLeft: '20px', display: 'grid', gap: '7px', color: 'var(--season-muted)', fontSize: '13px' }}>
                {run.validation.issues.map((issue) => (
                  <li key={issue.id} style={{ color: issue.severity === 'ERROR' ? 'var(--season-danger)' : issue.severity === 'WARNING' ? 'var(--season-warning)' : 'var(--season-muted)' }}>
                    <strong>{issue.severity}</strong>{issue.code ? ` · ${issue.code}` : ''}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ ...cardStyle, borderColor: canPublish ? 'color-mix(in srgb, var(--season-blue-600) 44%, var(--season-line))' : 'var(--season-line)' }} aria-labelledby="unique-play-publish-heading">
            <h3 id="unique-play-publish-heading" style={sectionTitleStyle}>6. 검증 스냅샷 게시</h3>
            <p style={{ margin: '6px 0 13px', color: 'var(--season-muted)', fontSize: '13px', lineHeight: 1.6 }}>
              게시 시 현재 체크섬과 기준 리비전을 함께 보내 동시 변경을 차단합니다. 이 단계는 서비스 활성화와 분리되어 있습니다.
            </p>
            <div style={{ border: '1px solid var(--season-line)', borderRadius: '10px', background: 'var(--season-surface-muted)', padding: '11px 12px', display: 'grid', gap: '5px', color: 'var(--season-muted)', fontSize: '12px' }}>
              <span><strong>체크섬:</strong> {run.checksum ?? '서버 값 없음'}</span>
              <span><strong>예상 게시 리비전:</strong> {run.expectedPublishedRevision ?? '서버 값 없음'}</span>
            </div>
            <label style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--season-ink)', fontSize: '13px', lineHeight: 1.5 }}>
              <input type="checkbox" checked={publishConfirmed} onChange={(event) => setPublishConfirmed(event.target.checked)} disabled={!canPublish || busyAction !== null} style={{ marginTop: '3px' }} />
              변경 비교와 검증 결과를 확인했으며, 표시된 체크섬의 스냅샷으로 새 리비전을 생성합니다.
            </label>
            <button type="button" onClick={() => { void handlePublish(); }} disabled={!canPublish || !publishConfirmed || busyAction !== null || !sessionReady} style={{ ...primaryButtonStyle, marginTop: '12px', cursor: !canPublish || !publishConfirmed || busyAction !== null || !sessionReady ? 'not-allowed' : 'pointer', opacity: !canPublish || !publishConfirmed || busyAction !== null || !sessionReady ? 0.55 : 1 }}>
              {busyAction === 'publish' ? '리비전 생성 중…' : '검증된 리비전 생성'}
            </button>
            {!canPublish && <p style={{ margin: '9px 0 0', color: 'var(--season-muted)', fontSize: '12px' }}>검증 통과, 미해결 0건, 서버 체크섬과 기준 리비전이 모두 필요합니다.</p>}
          </section>

          <section style={{ ...cardStyle, borderColor: publication ? 'color-mix(in srgb, var(--season-success) 44%, var(--season-line))' : 'var(--season-line)' }} aria-labelledby="unique-play-activate-heading">
            <h3 id="unique-play-activate-heading" style={sectionTitleStyle}>7. 리비전 활성화</h3>
            {!revisionIdForActivation ? (
              <p style={{ margin: '8px 0 0', color: 'var(--season-muted)', fontSize: '13px' }}>게시 단계에서 리비전이 정상 생성되면 활성화 제어가 열립니다.</p>
            ) : (
              <>
                <dl style={{ margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '9px', color: 'var(--season-muted)', fontSize: '12px' }}>
                  <div><dt style={{ fontWeight: 800 }}>리비전 ID</dt><dd style={{ margin: '3px 0 0', overflowWrap: 'anywhere' }}>{revisionIdForActivation}</dd></div>
                  <div><dt style={{ fontWeight: 800 }}>게시 상태</dt><dd style={{ margin: '3px 0 0' }}>{publication?.status ?? run?.rawStatus ?? 'PUBLISHED'}</dd></div>
                  <div><dt style={{ fontWeight: 800 }}>활성화 기준 리비전</dt><dd style={{ margin: '3px 0 0' }}>{activationExpectedRevision ?? '서버 값 없음'}</dd></div>
                </dl>
                {revisionIsActive ? (
                  <div role="status" className="sync-callout is-success" style={{ marginTop: '12px', border: '1px solid color-mix(in srgb, var(--season-success) 44%, var(--season-line))', borderRadius: '10px', background: 'color-mix(in srgb, var(--season-success) 10%, var(--season-surface))', color: 'var(--season-success)', padding: '12px', fontSize: '13px', fontWeight: 750 }}>
                    활성화 상태: {revisionIsActive ? run?.rawStatus || activation?.status || 'ACTIVE' : activation?.status ?? '확인 필요'} · 활성 리비전: {activation?.activeRevision ?? activation?.publishedRevision ?? run?.publishedRevision ?? '확인 필요'} · 처리 시각: {formatSyncDateTime(activation?.activatedAt ?? run?.completedAt ?? run?.updatedAt ?? null)}
                  </div>
                ) : revisionIsActivating ? (
                  <div role="status" className="sync-callout is-info" style={{ marginTop: '12px', border: '1px solid color-mix(in srgb, var(--season-blue-600) 44%, var(--season-line))', borderRadius: '10px', background: 'color-mix(in srgb, var(--season-blue-600) 10%, var(--season-surface))', color: 'var(--season-blue-700)', padding: '12px', fontSize: '13px', fontWeight: 750 }}>
                    리비전을 활성화하고 있습니다. 완료될 때까지 상태를 자동 확인합니다.
                  </div>
                ) : (
                  <>
                    <label style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--season-ink)', fontSize: '13px', lineHeight: 1.5 }}>
                      <input type="checkbox" checked={activationConfirmed} onChange={(event) => setActivationConfirmed(event.target.checked)} disabled={activationExpectedRevision === null || busyAction !== null} style={{ marginTop: '3px' }} />
                      위 리비전을 실제 AUBL 서비스의 활성 데이터로 전환합니다.
                    </label>
                    <button type="button" onClick={() => { void handleActivate(); }} disabled={!activationConfirmed || activationExpectedRevision === null || busyAction !== null || !sessionReady} style={{ ...primaryButtonStyle, marginTop: '12px', background: 'var(--sync-primary-bg)', cursor: !activationConfirmed || activationExpectedRevision === null || busyAction !== null || !sessionReady ? 'not-allowed' : 'pointer', opacity: !activationConfirmed || activationExpectedRevision === null || busyAction !== null || !sessionReady ? 0.55 : 1 }}>
                      {busyAction === 'activate' ? '서비스 반영 중…' : '이 리비전 활성화'}
                    </button>
                  </>
                )}
              </>
            )}
            {run.revisions.length > 0 ? (
              <div style={{ marginTop: '18px', borderTop: '1px solid var(--season-line)', paddingTop: '14px' }}>
                <div style={{ color: 'var(--season-ink)', fontSize: '13px', fontWeight: 850 }}>게시 리비전 · 복구</div>
                <p style={{ margin: '5px 0 10px', color: 'var(--season-muted)', fontSize: '12px' }}>
                  이전 리비전을 선택하면 위 활성화 확인 절차로 되돌릴 수 있습니다. 현재 공개 리비전은 별도로 표시됩니다.
                </p>
                <div style={{ display: 'grid', gap: '7px' }}>
                  {run.revisions.map((revision) => (
                    <button
                      key={revision.revisionId}
                      type="button"
                      onClick={() => {
                        setSelectedRevisionId(revision.revisionId);
                        setActivation(null);
                        setActivationConfirmed(false);
                      }}
                      style={{
                        ...secondaryButtonStyle,
                        minHeight: '44px',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: '10px',
                        alignItems: 'center',
                        textAlign: 'left',
                        borderColor: selectedRevisionId === revision.revisionId ? 'var(--season-blue-600)' : 'var(--season-line)',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{revision.revisionId}</strong>
                        <small style={{ color: 'var(--season-muted)' }}>{formatSyncDateTime(revision.createdAt)} · {revision.checksum?.slice(0, 12) ?? '체크섬 없음'}</small>
                      </span>
                      <span style={{ color: revision.active ? 'var(--season-success)' : 'var(--season-muted)', fontWeight: 850 }}>{revision.active ? '현재 공개' : '복구 가능'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {activeQualificationRevisionId ? (
            <section
              style={{ ...cardStyle, borderColor: qualificationAlreadyFinalized ? 'color-mix(in srgb, var(--season-success) 44%, var(--season-line))' : 'var(--season-line)' }}
              aria-labelledby="unique-play-qualification-heading"
              aria-busy={qualificationLoading}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h3 id="unique-play-qualification-heading" style={sectionTitleStyle}>8. 으뜸권 · 버금권 확정</h3>
                  <p style={{ margin: '6px 0 0', color: 'var(--season-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                    활성 리비전의 A~H조 현황을 확인합니다. 경계 동률은 팀별로 명시한 뒤 서버 검증을 거쳐 확정합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { void loadQualificationOverview(); }}
                  disabled={qualificationLoading || busyAction !== null}
                  style={{
                    ...secondaryButtonStyle,
                    minHeight: '44px',
                    cursor: qualificationLoading || busyAction !== null ? 'wait' : 'pointer',
                    opacity: qualificationLoading || busyAction !== null ? 0.6 : 1,
                  }}
                >
                  {qualificationLoading ? '현황 확인 중…' : '조별 현황 새로고침'}
                </button>
              </div>

              <dl style={{ margin: '14px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '9px', color: 'var(--season-muted)', fontSize: '12px' }}>
                <div><dt style={{ fontWeight: 800 }}>시즌</dt><dd style={{ margin: '3px 0 0' }}>{run.seasonYear ?? '—'} · seasonId {qualificationSeasonId ?? '확인 중'}</dd></div>
                <div><dt style={{ fontWeight: 800 }}>활성 리비전</dt><dd style={{ margin: '3px 0 0', overflowWrap: 'anywhere' }}>{activeQualificationRevisionId}</dd></div>
                <div><dt style={{ fontWeight: 800 }}>현황 리비전</dt><dd style={{ margin: '3px 0 0', overflowWrap: 'anywhere' }}>{qualificationOverview?.sourceFreshness.publishedRevision ?? '확인 중'}</dd></div>
                <div><dt style={{ fontWeight: 800 }}>원천 상태</dt><dd style={{ margin: '3px 0 0' }}>{qualificationOverview?.sourceFreshness.status ?? '확인 중'}</dd></div>
              </dl>

              {qualificationError && (
                <div role="alert" style={{ marginTop: '12px', border: '1px solid color-mix(in srgb, var(--season-danger) 44%, var(--season-line))', borderRadius: '10px', background: 'color-mix(in srgb, var(--season-danger) 9%, var(--season-surface))', color: 'var(--season-danger)', padding: '11px 12px', fontSize: '13px' }}>
                  {qualificationError}
                </div>
              )}
              {qualificationLoading && !qualificationOverview ? (
                <p role="status" style={{ margin: '16px 0 0', color: 'var(--season-muted)', fontSize: '13px' }}>활성 리비전의 조별 현황을 불러오고 있습니다.</p>
              ) : qualificationOverview ? (
                <>
                  {!qualificationRevisionMatches && (
                    <div role="alert" style={{ marginTop: '12px', border: '1px solid color-mix(in srgb, var(--season-danger) 44%, var(--season-line))', borderRadius: '10px', background: 'color-mix(in srgb, var(--season-danger) 9%, var(--season-surface))', color: 'var(--season-danger)', padding: '11px 12px', fontSize: '13px', fontWeight: 750 }}>
                      활성 리비전과 현황 리비전이 다릅니다. 확정하지 말고 현황을 다시 불러와 주세요.
                    </div>
                  )}

                  <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '12px' }}>
                    {qualificationGroups.map((groupCode) => {
                      const group = qualificationOverview.groups.find((entry) => entry.groupCode === groupCode);
                      const rows = group?.standings ?? [];
                      const groupTieCount = rows.filter((row) => row.qualificationState?.toUpperCase() === 'TIE_PENDING').length;
                      return (
                        <section key={groupCode} aria-labelledby={`qualification-group-${groupCode}`} style={{ border: '1px solid var(--season-line)', borderRadius: '12px', background: 'var(--season-surface-muted)', padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                            <h4 id={`qualification-group-${groupCode}`} style={{ margin: 0, color: 'var(--season-navy-900)', fontSize: '15px', fontWeight: 900 }}>{groupCode}조</h4>
                            <span style={{ color: groupTieCount ? 'var(--season-warning)' : 'var(--season-muted)', fontSize: '11px', fontWeight: 800 }}>
                              {rows.length}/5팀{groupTieCount ? ` · 동률 ${groupTieCount}` : ''}
                            </span>
                          </div>
                          {rows.length === 0 ? (
                            <p style={{ margin: '11px 0 0', color: 'var(--season-muted)', fontSize: '12px' }}>게시된 팀 현황이 없습니다.</p>
                          ) : (
                            <ol style={{ margin: '10px 0 0', padding: 0, display: 'grid', gap: '7px', listStyle: 'none' }}>
                              {rows.map((row, index) => {
                                const state = row.qualificationState?.toUpperCase() ?? null;
                                const tone = qualificationStateTone(state);
                                const tieResolution = tieResolutions[String(row.teamId)] ?? '';
                                return (
                                  <li key={row.teamId} style={{ borderTop: index === 0 ? 'none' : '1px solid var(--season-line)', paddingTop: index === 0 ? 0 : '7px', display: 'grid', gap: '6px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', gap: '7px', alignItems: 'center' }}>
                                      <strong style={{ color: 'var(--season-muted)', fontSize: '12px', textAlign: 'center' }}>{row.rank ?? index + 1}</strong>
                                      <span style={{ minWidth: 0 }}>
                                        <strong style={{ display: 'block', color: 'var(--season-ink)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.teamName}</strong>
                                        <small style={{ color: 'var(--season-muted)' }}>{row.wins}승 {row.ties}무 {row.losses}패</small>
                                      </span>
                                      <span className="sync-status-badge" data-tone={tone}>
                                        {qualificationStateLabel(state)}
                                      </span>
                                    </div>
                                    {state === 'TIE_PENDING' && (
                                      <label style={{ display: 'grid', gap: '4px', color: 'var(--season-warning)', fontSize: '11px', fontWeight: 800 }}>
                                        {row.teamName} 동률 결정
                                        <select
                                          value={tieResolution}
                                          onChange={(event) => {
                                            const value = event.target.value as SeasonQualificationResolution | '';
                                            setQualificationConfirmed(false);
                                            setTieResolutions((previous) => {
                                              const next = { ...previous };
                                              if (value) next[String(row.teamId)] = value;
                                              else delete next[String(row.teamId)];
                                              return next;
                                            });
                                          }}
                                          disabled={busyAction !== null || qualificationAlreadyFinalized}
                                          style={{ ...inputStyle, minHeight: '44px', fontSize: '12px' }}
                                        >
                                          <option value="">결정 선택</option>
                                          {qualificationResolutionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                      </label>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          )}
                        </section>
                      );
                    })}
                  </div>

                  {qualificationFinalization || qualificationAlreadyFinalized ? (
                    <div role="status" className="sync-callout is-success" style={{ marginTop: '15px', border: '1px solid color-mix(in srgb, var(--season-success) 44%, var(--season-line))', borderRadius: '10px', background: 'color-mix(in srgb, var(--season-success) 10%, var(--season-surface))', color: 'var(--season-success)', padding: '12px', fontSize: '13px', fontWeight: 750 }}>
                      진출권 확정 완료 · 리비전 {qualificationFinalization?.revisionId ?? activeQualificationRevisionId}
                      {qualificationFinalization?.finalizedAt ? ` · ${formatSyncDateTime(qualificationFinalization.finalizedAt)}` : ''}
                    </div>
                  ) : (
                    <>
                      {qualificationIssues.length > 0 && (
                        <div role="alert" className="sync-callout is-warning" style={{ marginTop: '15px', border: '1px solid color-mix(in srgb, var(--season-warning) 44%, var(--season-line))', borderRadius: '10px', background: 'color-mix(in srgb, var(--season-warning) 10%, var(--season-surface))', color: 'var(--season-warning)', padding: '11px 12px', fontSize: '12px' }}>
                          <strong>확정 전 확인</strong>
                          <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>{qualificationIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                        </div>
                      )}
                      <label style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--season-ink)', fontSize: '13px', lineHeight: 1.5 }}>
                        <input
                          type="checkbox"
                          checked={qualificationConfirmed}
                          onChange={(event) => setQualificationConfirmed(event.target.checked)}
                          disabled={!qualificationReadyToConfirm || busyAction !== null}
                          style={{ marginTop: '3px' }}
                        />
                        A~H조가 각각 으뜸 2팀 · 버금 2팀 · 탈락 1팀이며, 확정 후 현재 리비전의 진출권 상태가 변경됨을 확인했습니다.
                      </label>
                      <button
                        type="button"
                        onClick={() => { void handleFinalizeQualification(); }}
                        disabled={!qualificationReadyToConfirm || !qualificationConfirmed || busyAction !== null}
                        style={{
                          ...primaryButtonStyle,
                          minHeight: '44px',
                          marginTop: '12px',
                          background: 'var(--sync-primary-bg)',
                          cursor: !qualificationReadyToConfirm || !qualificationConfirmed || busyAction !== null ? 'not-allowed' : 'pointer',
                          opacity: !qualificationReadyToConfirm || !qualificationConfirmed || busyAction !== null ? 0.55 : 1,
                        }}
                      >
                        {busyAction === 'qualification' ? '진출권 확정 중…' : '으뜸권 · 버금권 최종 확정'}
                      </button>
                      <p style={{ margin: '8px 0 0', color: 'var(--season-muted)', fontSize: '11px' }}>서버가 40팀 구성과 모든 예선 경기의 완료·취소 상태를 다시 검증합니다.</p>
                    </>
                  )}
                </>
              ) : !qualificationLoading && !qualificationError ? (
                <p style={{ margin: '16px 0 0', color: 'var(--season-muted)', fontSize: '13px' }}>조별 현황을 불러오지 못했습니다. 새로고침을 시도하세요.</p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
