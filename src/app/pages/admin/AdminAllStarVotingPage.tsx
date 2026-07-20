import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ALL_STAR_EVENT_CONFIG } from '@features/allstar/data/eventConfig';
import {
  allStarAdminVotingService,
  type AdminVoteLog,
  type AdminVoteOverview,
  type AdminVotingDivision,
} from '@features/allstar/services/adminVotingService';
import { useAdmin } from '@shared/auth/useAdmin';

const cardStyle: CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.26)',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.88), rgba(30,41,59,0.78))',
  padding: '16px',
  boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
};

const buttonStyle: CSSProperties = {
  border: '1px solid rgba(96,165,250,0.5)',
  borderRadius: '11px',
  background: 'rgba(37,99,235,0.2)',
  color: '#dbeafe',
  padding: '10px 14px',
  fontWeight: 900,
  cursor: 'pointer',
};

const warningLabels: Record<string, string> = {
  BALLOT_ELIGIBILITY_COUNT_MISMATCH: '접수 원장과 중복 방지 원장의 문서 수가 다릅니다.',
  BALLOT_ELIGIBILITY_LINK_MISMATCH: '접수 원장과 중복 방지 원장의 상호 연결 정보가 일치하지 않습니다.',
  BALLOT_INTEGRITY_REVIEW_REQUIRED: '후보 버전·해시·선택 수 검증이 필요한 접수가 있습니다.',
  PUBLIC_RESULT_RECONCILIATION_REQUIRED: '공개 집계와 원본 접수 수 또는 후보 버전이 일치하지 않습니다.',
  FULL_AUDIT_REQUIRES_CLOSED_EVENT: '투표 진행 중 전체 검사는 서로 다른 읽기 시점이 섞일 수 있습니다. 종료 후 다시 검사하세요.',
  MIXED_VOTING_POLICIES: '한 이벤트에 서로 다른 투표 정책으로 저장된 접수가 함께 있습니다.',
  RESULT_DRAFT_RECONCILIATION_REQUIRED: '결과 초안과 원본 투표 또는 활성 후보 정보가 일치하지 않습니다.',
};

const warningActions: Record<string, string> = {
  BALLOT_ELIGIBILITY_COUNT_MISMATCH: '새 제출을 닫고 전체 검사를 다시 실행한 뒤 원장 수와 정책 기간을 대조하세요.',
  BALLOT_ELIGIBILITY_LINK_MISMATCH: '결과를 공개하지 말고 pointer·submission fingerprint 연결을 원본 감사 절차로 대조하세요.',
  BALLOT_INTEGRITY_REVIEW_REQUIRED: '결과를 공개하지 말고 후보 버전·해시·선택 수 오류 분포와 해당 접수 코드를 보존하세요.',
  PUBLIC_RESULT_RECONCILIATION_REQUIRED: '공개 결과를 숨긴 뒤 닫힌 상태에서 원본 기반 결과 초안을 다시 생성하세요.',
  FULL_AUDIT_REQUIRES_CLOSED_EVENT: '진행 중 결과는 참고용으로만 보고, 종료 후 전체 검사를 다시 실행하세요.',
  MIXED_VOTING_POLICIES: '결과를 공개하지 마세요. 혼합 정책 원장은 자동 집계할 수 없으므로 기존 라운드 처리 결정을 기록하고 새 event 전체 재투표를 검토하세요.',
  RESULT_DRAFT_RECONCILIATION_REQUIRED: '현재 초안을 공개하지 말고 원본 전체 검사 후 새 초안을 생성하세요.',
};

const issueLabels: Record<string, string> = {
  SCHEMA_VERSION: '스키마 버전',
  DIVISION_MISMATCH: '부문 불일치',
  POLICY_INVALID: '정책 오류',
  SUBMITTED_AT_MISSING: '접수 시각 없음',
  CANDIDATE_IDENTITY_MISSING: '후보 식별정보 없음',
  CANDIDATE_SET_MISSING: '후보 세트 없음',
  CANDIDATE_HASH_MISMATCH: '후보 해시 불일치',
  CONTEST_SET_MISMATCH: '포지션 구성 불일치',
  SELECTION_LIMIT: '선택 수 오류',
  DUPLICATE_CANDIDATE: '중복 후보',
  CANDIDATE_NOT_ALLOWED: '허용되지 않은 후보',
  VALIDATION_ERROR: '검증 오류',
  CONFIG_INVALID: '설정 오류',
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

const csvCell = (value: string | number | null) => {
  const raw = String(value ?? '');
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
};

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const cloudLogUrl = (eventName: string, eventId: string, division: string) => {
  const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim();
  if (!projectId) return null;
  const query = encodeURIComponent(
    `jsonPayload.event="${eventName}" AND jsonPayload.eventId="${eventId}" AND jsonPayload.division="${division}"`,
  );
  return `https://console.cloud.google.com/logs/query;query=${query}?project=${encodeURIComponent(projectId)}`;
};

const logsToCsv = (logs: AdminVoteLog[]) => {
  const header = ['접수코드', '접수시각(KST)', '부문', '후보버전', '후보해시', '정책', '기간', '선택수', '무결성', '확인사항'];
  const rows = logs.map((log) => [
    log.receiptCode,
    formatDateTime(log.submittedAt),
    log.division,
    log.candidateVersion,
    log.candidateSetHashPrefix,
    log.policy,
    log.periodKey,
    log.selectedCount,
    log.integrity,
    log.issues.map((issue) => issueLabels[issue] ?? issue).join(' · '),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
};

const friendlyErrorMessage = (cause: unknown, fallback: string) => {
  const message = cause instanceof Error ? cause.message : fallback;
  if (message.includes('permission-denied')) return '관리자 권한이 없거나 토큰 갱신이 필요합니다. 다시 로그인해 주세요.';
  if (message.includes('unauthenticated')) return '로그인 세션이 만료되었습니다. 다시 로그인한 뒤 재시도해 주세요.';
  if (message.includes('resource-exhausted')) return '전체 검사 한도를 초과했습니다. 투표를 닫고 배치 감사 절차로 전환하세요.';
  if (message.includes('deadline-exceeded')) return '요청 시간이 초과되었습니다. 기존 결과는 변경되지 않았습니다. 잠시 후 상태를 다시 조회하세요.';
  if (message.includes('unavailable') || message.includes('internal')) return '투표 관리 API가 일시적으로 불안정합니다. 마지막 정상 조회값을 유지하고 Cloud Logging을 확인하세요.';
  if (message.includes('failed-precondition')) return '현재 이벤트 상태나 후보 버전이 작업 조건과 맞지 않습니다. 새로고침 후 상태를 확인하세요.';
  return message;
};

const sha256 = async (value: string) => {
  if (!globalThis.crypto?.subtle) throw new Error('이 브라우저에서는 증적 해시를 생성할 수 없습니다. 최신 Chrome 또는 Safari에서 다시 시도해 주세요.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const copyText = async (value: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('클립보드 복사에 실패했습니다. HTTPS 환경에서 다시 시도해 주세요.');
};

type ResultAction = 'rebuild' | 'publish' | 'hide';
type LogIntegrityFilter = 'ALL' | AdminVoteLog['integrity'];

type ActionConfirmation = {
  action: ResultAction;
  title: string;
  description: string;
  phrase: string;
};

type StatusTone = 'good' | 'warning' | 'danger' | 'neutral';

const statusColors: Record<StatusTone, { foreground: string; background: string; border: string }> = {
  good: { foreground: '#bbf7d0', background: 'rgba(22,101,52,0.2)', border: 'rgba(74,222,128,0.42)' },
  warning: { foreground: '#fde68a', background: 'rgba(120,53,15,0.2)', border: 'rgba(245,158,11,0.42)' },
  danger: { foreground: '#fecaca', background: 'rgba(127,29,29,0.22)', border: 'rgba(248,113,113,0.48)' },
  neutral: { foreground: '#cbd5e1', background: 'rgba(30,41,59,0.48)', border: 'rgba(148,163,184,0.28)' },
};

function StatusItem({ label, value, note, tone }: { label: string; value: string; note: string; tone: StatusTone }) {
  const colors = statusColors[tone];
  return (
    <article style={{ border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '12px', background: colors.background }}>
      <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 900 }}>{label}</div>
      <div style={{ color: colors.foreground, fontWeight: 950, marginTop: '5px' }}>{value}</div>
      <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.5, marginTop: '5px' }}>{note}</div>
    </article>
  );
}

function ResultSummaryCard({ title, result }: { title: string; result: AdminVoteOverview['draftResult'] }) {
  const validationRows = result.exists
    ? [
        ['스키마', result.schemaValid === true],
        ['활성 후보', result.matchesActiveCandidate],
        ['원장 수', result.matchesBallotCount],
        ['후보별 득표', result.countsMatchBallots],
      ] as const
    : [];
  return (
    <article style={{ border: '1px solid rgba(148,163,184,0.24)', borderRadius: '12px', padding: '13px', color: '#cbd5e1', fontSize: '12px', lineHeight: 1.65, minWidth: 0 }}>
      <strong style={{ color: '#f8fafc', fontSize: '14px' }}>{title}</strong><br />
      {result.exists ? (
        <>
          <span>{result.totalBallots ?? 0}표 · {result.published ? '공개 중' : '비공개'} · {formatDateTime(result.updatedAt)}</span><br />
          <span>원본 {result.sourceBallotCount ?? '—'}표 · writer {result.writerVersion ?? '—'}</span><br />
          <span style={{ overflowWrap: 'anywhere' }}>generation <code>{result.generationId ?? '—'}</code></span><br />
          <span style={{ overflowWrap: 'anywhere' }}>source digest <code>{result.sourceDigest ?? '—'}</code></span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '9px' }}>
            {validationRows.map(([label, passed]) => (
              <span
                key={label}
                style={{
                  border: `1px solid ${passed === true ? 'rgba(74,222,128,0.42)' : passed === false ? 'rgba(248,113,113,0.5)' : 'rgba(148,163,184,0.3)'}`,
                  borderRadius: '999px',
                  padding: '4px 7px',
                  color: passed === true ? '#bbf7d0' : passed === false ? '#fecaca' : '#94a3b8',
                }}
              >
                {label} {passed === true ? '일치' : passed === false ? '불일치' : '전체 검사 필요'}
              </span>
            ))}
          </div>
          {result.validationIssue && <div style={{ color: '#fca5a5', marginTop: '8px' }}>{issueLabels[result.validationIssue] ?? result.validationIssue}</div>}
        </>
      ) : '아직 생성되지 않음'}
    </article>
  );
}

function MetricCard({ label, value, note, tone = 'blue' }: { label: string; value: string | number; note: string; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const colors = {
    blue: ['#dbeafe', 'rgba(59,130,246,0.18)'],
    green: ['#bbf7d0', 'rgba(34,197,94,0.16)'],
    amber: ['#fde68a', 'rgba(245,158,11,0.16)'],
    red: ['#fecaca', 'rgba(239,68,68,0.16)'],
  }[tone];
  return (
    <article style={{ ...cardStyle, minHeight: '124px', background: colors[1] }}>
      <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 900 }}>{label}</div>
      <div style={{ color: colors[0], fontSize: '30px', lineHeight: 1.1, fontWeight: 950, marginTop: '8px' }}>{value}</div>
      <div style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '8px', lineHeight: 1.45 }}>{note}</div>
    </article>
  );
}

export default function AdminAllStarVotingPage() {
  const { canAuditAllstarVotes } = useAdmin();
  const [division, setDivision] = useState<AdminVotingDivision>('allstar');
  const [overview, setOverview] = useState<AdminVoteOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [resultAction, setResultAction] = useState<ResultAction | null>(null);
  const [confirmation, setConfirmation] = useState<ActionConfirmation | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [logIntegrity, setLogIntegrity] = useState<LogIntegrityFilter>('ALL');
  const [logLimit, setLogLimit] = useState(100);
  const requestSequenceRef = useRef(0);

  const loadOverview = useCallback(async (fullAudit = false) => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    if (!allStarAdminVotingService.isAvailable) {
      if (requestSequenceRef.current === requestSequence) {
        setOverview(null);
        setError('투표 API가 비활성화된 빌드입니다. 운영 환경에서 VITE_ALLSTAR_VOTING_API_ENABLED=true로 배포해야 합니다.');
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await allStarAdminVotingService.getOverview({
        eventId: ALL_STAR_EVENT_CONFIG.eventId,
        division,
        limit: logLimit,
        fullAudit,
      });
      if (requestSequenceRef.current === requestSequence) setOverview(result);
    } catch (cause) {
      if (requestSequenceRef.current === requestSequence) {
        setError(friendlyErrorMessage(cause, '투표 관리 정보를 불러오지 못했습니다.'));
      }
    } finally {
      if (requestSequenceRef.current === requestSequence) setLoading(false);
    }
  }, [division, logLimit]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!autoRefresh || loading || !allStarAdminVotingService.isAvailable || resultAction !== null) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadOverview(false);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadOverview, loading, resultAction]);

  const changeDivision = (nextDivision: AdminVotingDivision) => {
    requestSequenceRef.current += 1;
    setOverview(null);
    setError(null);
    setNotice(null);
    setConfirmation(null);
    setConfirmationText('');
    setLogQuery('');
    setLogIntegrity('ALL');
    setDivision(nextDivision);
  };

  const runFullAudit = () => {
    if (overview?.event.state === 'OPEN' && !window.confirm('투표 진행 중 전체 검사는 읽기 시점 차이가 생길 수 있습니다. 계속할까요?')) return;
    void loadOverview(true);
  };

  const canPublishDraft = Boolean(
    overview
    && overview.event.state === 'CLOSED'
    && overview.audit.complete
    && overview.audit.stable
    && overview.metrics.ledgerConsistent
    && overview.metrics.ledgerLinksConsistent === true
    && overview.metrics.integrityIssueCount === 0
    && overview.distributions.issues.length === 0
    && !overview.warnings.includes('MIXED_VOTING_POLICIES')
    && overview.metrics.activeCandidateBallotCount === overview.metrics.ballotCount
    && overview.draftResult.exists
    && overview.draftResult.schemaValid === true
    && overview.draftResult.matchesActiveCandidate
    && overview.draftResult.matchesBallotCount
    && overview.draftResult.countsMatchBallots === true
    && overview.draftResult.generationId,
  );

  const rebuildResults = async () => {
    if (!overview || overview.event.state !== 'CLOSED') return;
    setResultAction('rebuild');
    setError(null);
    setNotice(null);
    try {
      await allStarAdminVotingService.rebuildResults({
        eventId: overview.eventId,
        division: overview.division,
        candidateVersion: overview.event.candidateVersion,
      });
      await loadOverview(true);
      setNotice('원본 전체 검사와 비공개 결과 초안 생성이 완료되었습니다. 공개 전 검증 상태를 다시 확인하세요.');
    } catch (cause) {
      setError(friendlyErrorMessage(cause, '원본 결과 집계에 실패했습니다.'));
    } finally {
      setResultAction(null);
    }
  };

  const changeResultPublication = async (published: boolean) => {
    if (!overview) return;
    if (published && !canPublishDraft) {
      setError('공개 조건이 충족되지 않았습니다. CLOSED 상태에서 전체 검사와 원장·후보·득표 검증을 모두 통과해야 합니다.');
      return;
    }
    const source = published ? overview.draftResult : overview.publicResult;
    if (!source.generationId) return;
    setResultAction(published ? 'publish' : 'hide');
    setError(null);
    setNotice(null);
    try {
      await allStarAdminVotingService.setResultsPublished({
        eventId: overview.eventId,
        division: overview.division,
        candidateVersion: overview.event.candidateVersion,
        generationId: source.generationId,
        published,
      });
      await loadOverview(true);
      setNotice(published ? '검증된 결과를 공개했습니다.' : '공개 결과를 숨겼습니다. 원본과 결과 초안은 보존됩니다.');
    } catch (cause) {
      setError(friendlyErrorMessage(cause, '결과 공개 상태를 변경하지 못했습니다.'));
    } finally {
      setResultAction(null);
    }
  };

  const openResultConfirmation = (action: ResultAction) => {
    if (!overview) return;
    const configurations: Record<ResultAction, Omit<ActionConfirmation, 'action'>> = {
      rebuild: {
        title: '원본 기반 결과 초안 재생성',
        description: '현재 공개 결과는 건드리지 않고, 닫힌 부문의 전체 원장을 검사해 비공개 초안을 새로 만듭니다.',
        phrase: '결과 재집계',
      },
      publish: {
        title: '검증된 결과 공개',
        description: '공개 즉시 사용자 투표 현황 화면에 반영됩니다. 후보·원장·득표 검증 상태를 확인하세요.',
        phrase: '결과 공개',
      },
      hide: {
        title: '공개 결과 숨기기',
        description: '사용자 화면에서 결과만 숨깁니다. 원본 접수와 비공개 결과 초안은 삭제하지 않습니다.',
        phrase: '결과 숨기기',
      },
    };
    setConfirmation({ action, ...configurations[action] });
    setConfirmationText('');
  };

  const confirmResultAction = async () => {
    if (!confirmation || confirmationText !== confirmation.phrase) return;
    const action = confirmation.action;
    setConfirmation(null);
    setConfirmationText('');
    if (action === 'rebuild') await rebuildResults();
    else await changeResultPublication(action === 'publish');
  };

  const downloadAuditJson = async () => {
    if (!overview) return;
    setError(null);
    try {
      const exportedAt = new Date().toISOString();
      const snapshot = {
        schemaVersion: 'aubl-allstar-admin-evidence-v1',
        exportedAt,
        sourceGeneratedAt: overview.generatedAt,
        eventId: overview.eventId,
        division: overview.division,
        candidateVersion: overview.event.candidateVersion,
        candidateSetHash: overview.event.candidateSetHash,
        auditMode: overview.audit.mode,
        redacted: true,
        overview,
      };
      const serializedSnapshot = JSON.stringify(snapshot);
      const snapshotSha256 = await sha256(serializedSnapshot);
      const evidence = {
        manifest: {
          schemaVersion: snapshot.schemaVersion,
          exportedAt,
          sourceGeneratedAt: overview.generatedAt,
          eventId: overview.eventId,
          division: overview.division,
          candidateVersion: overview.event.candidateVersion,
          candidateSetHash: overview.event.candidateSetHash,
          ballotCount: overview.metrics.ballotCount,
          eligibilityCount: overview.metrics.eligibilityCount,
          ledgerLinksConsistent: overview.metrics.ledgerLinksConsistent,
          latestSubmittedAt: overview.metrics.latestSubmittedAt,
          snapshotSha256,
          warning: '비식별 운영 증적이며 Firestore 원본 백업 또는 복원 파일이 아닙니다.',
        },
        snapshot,
      };
      const exportStamp = exportedAt.replaceAll(':', '-');
      downloadBlob(
        `aubl-allstar-evidence-${overview.division}-${exportStamp}.json`,
        new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json;charset=utf-8' }),
      );
      setNotice(`비식별 운영 증적을 저장했습니다. SHA-256 ${snapshotSha256.slice(0, 16)}…`);
    } catch (cause) {
      setError(friendlyErrorMessage(cause, '운영 증적을 생성하지 못했습니다.'));
    }
  };

  const visibleLogs = useMemo(() => {
    if (!overview) return [];
    const normalizedQuery = logQuery.trim().toLowerCase();
    return overview.logs.filter((log) => {
      if (logIntegrity !== 'ALL' && log.integrity !== logIntegrity) return false;
      if (!normalizedQuery) return true;
      return [
        log.receiptCode,
        log.candidateVersion,
        log.policy,
        log.periodKey,
        log.localDate,
        ...log.issues.map((issue) => issueLabels[issue] ?? issue),
      ].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery));
    });
  }, [logIntegrity, logQuery, overview]);

  const downloadLogCsv = () => {
    if (!overview) return;
    const exportStamp = new Date().toISOString().replaceAll(':', '-');
    downloadBlob(
      `aubl-allstar-receipts-${overview.division}-${exportStamp}.csv`,
      new Blob([`\uFEFF${logsToCsv(visibleLogs)}`], { type: 'text/csv;charset=utf-8' }),
    );
    setNotice(`현재 필터의 비식별 접수 로그 ${visibleLogs.length}건을 저장했습니다.`);
  };

  const copyIncidentMemo = async () => {
    if (!overview) return;
    const memo = [
      '[AUBL 올스타 투표 장애 대응 기록]',
      `기록 시각(KST): ${formatDateTime(new Date().toISOString())}`,
      `이벤트/부문: ${overview.eventId} / ${overview.division}`,
      `상태/정책: ${overview.event.state} / ${overview.event.policy}`,
      `후보 버전: ${overview.event.candidateVersion}`,
      `후보 해시: ${overview.event.candidateSetHash}`,
      `접수/중복 방지 원장: ${overview.metrics.ballotCount} / ${overview.metrics.eligibilityCount}`,
      `원장 상호 연결 검사: ${overview.metrics.ledgerLinksConsistent === true ? '일치' : overview.metrics.ledgerLinksConsistent === false ? '불일치' : '전체 검사 필요'}`,
      `마지막 정상 접수: ${formatDateTime(overview.metrics.latestSubmittedAt)}`,
      `조회 기준: ${formatDateTime(overview.generatedAt)} / ${overview.audit.mode}`,
      `경고: ${overview.warnings.length ? overview.warnings.join(', ') : '없음'}`,
      '',
      '즉시 조치: 1) 새 제출 차단(CLOSED) 2) 마지막 정상 시각·배포 버전 보존 3) Cloud Logging 보존 4) 닫힌 상태 전체 검사 5) 원본 복원은 새 DB에서만 검증',
    ].join('\n');
    try {
      await copyText(memo);
      setNotice('현재 상태가 포함된 장애 대응 기록 양식을 클립보드에 복사했습니다.');
    } catch (cause) {
      setError(friendlyErrorMessage(cause, '장애 대응 기록을 복사하지 못했습니다.'));
    }
  };

  const operationalStatus = useMemo(() => {
    if (!overview) return null;
    const activeCandidateMatches = overview.metrics.activeCandidateBallotCount === overview.metrics.ballotCount;
    const hasCriticalResultMismatch = overview.warnings.some((warning) => (
      warning === 'PUBLIC_RESULT_RECONCILIATION_REQUIRED'
      || warning === 'RESULT_DRAFT_RECONCILIATION_REQUIRED'
      || warning === 'BALLOT_INTEGRITY_REVIEW_REQUIRED'
      || warning === 'BALLOT_ELIGIBILITY_LINK_MISMATCH'
    ));
    const tone: StatusTone = hasCriticalResultMismatch
      || overview.metrics.ledgerLinksConsistent === false
      || (!overview.metrics.ledgerConsistent && overview.event.state !== 'OPEN')
      ? 'danger'
      : overview.warnings.length > 0 || !activeCandidateMatches
        ? 'warning'
        : 'good';
    return {
      tone,
      label: tone === 'good' ? '관제상 정상' : tone === 'warning' ? '재확인 필요' : '즉시 조치 필요',
      activeCandidateMatches,
    };
  }, [overview]);

  const logUrls = overview ? {
    accepted: cloudLogUrl('allstar_ballot_accepted', overview.eventId, overview.division),
    rejected: cloudLogUrl('allstar_ballot_rejected', overview.eventId, overview.division),
    failed: cloudLogUrl('allstar_ballot_failed', overview.eventId, overview.division),
    result: cloudLogUrl('allstar_result_rebuilt', overview.eventId, overview.division),
  } : null;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <section style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: '#f8fafc', margin: 0, fontSize: '24px' }}>올스타 투표 관리</h2>
          <p style={{ color: '#94a3b8', margin: '7px 0 0', fontSize: '13px', lineHeight: 1.55 }}>
            접수 원장과 중복 방지 원장을 대조하고, 개인정보 없이 최근 정상 접수 로그를 확인합니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 800 }}>
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> 30초 자동 갱신
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#cbd5e1', fontSize: '13px', fontWeight: 800 }}>
            최근 로그
            <select
              value={logLimit}
              onChange={(event) => setLogLimit(Number(event.target.value))}
              disabled={loading || resultAction !== null}
              style={{ borderRadius: '8px', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.78)', color: '#f8fafc', padding: '7px 8px' }}
            >
              <option value={50}>50건</option>
              <option value={100}>100건</option>
              <option value={200}>200건</option>
            </select>
          </label>
          <button type="button" onClick={() => void loadOverview()} disabled={loading || resultAction !== null} style={buttonStyle}>
            {loading ? '갱신 중…' : '지금 갱신'}
          </button>
          <button type="button" onClick={runFullAudit} disabled={loading || !overview || resultAction !== null} style={buttonStyle}>
            전체 무결성 검사
          </button>
        </div>
      </section>

      <div style={{ display: 'flex', gap: '8px' }} role="tablist" aria-label="투표 부문">
        {(['allstar', 'rookie'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={division === value}
            onClick={() => changeDivision(value)}
            style={{
              ...buttonStyle,
              flex: '1 1 140px',
              background: division === value ? 'rgba(37,99,235,0.42)' : 'rgba(15,23,42,0.65)',
              borderColor: division === value ? '#60a5fa' : 'rgba(148,163,184,0.3)',
            }}
          >
            {value === 'allstar' ? '올스타' : '루키'}
          </button>
        ))}
      </div>

      {error && (
        <section role="alert" style={{ ...cardStyle, borderColor: 'rgba(248,113,113,0.55)', background: 'rgba(127,29,29,0.22)', color: '#fecaca', lineHeight: 1.6 }}>
          <strong>작업을 완료하지 못했습니다.</strong><br />
          {error}
          {overview && <div style={{ color: '#fed7aa', fontSize: '12px', marginTop: '6px' }}>화면에는 {formatDateTime(overview.generatedAt)}의 마지막 정상 조회값을 유지합니다.</div>}
        </section>
      )}

      {notice && (
        <section role="status" aria-live="polite" style={{ ...cardStyle, borderColor: 'rgba(74,222,128,0.42)', background: 'rgba(22,101,52,0.2)', color: '#bbf7d0', lineHeight: 1.6 }}>
          {notice}
        </section>
      )}

      {loading && !overview && (
        <section role="status" aria-live="polite" style={{ ...cardStyle, color: '#bfdbfe', textAlign: 'center', padding: '28px' }}>
          투표 원장과 관제 상태를 안전하게 불러오는 중입니다…
        </section>
      )}

      {overview && (
        <>
          <section style={{ ...cardStyle, display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#f8fafc', fontWeight: 950, fontSize: '17px' }}>{overview.event.title} · {overview.event.divisionLabel}</div>
                <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '5px' }}>마지막 조회 {formatDateTime(overview.generatedAt)}</div>
              </div>
              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                <span style={{ color: overview.event.state === 'OPEN' ? '#bbf7d0' : '#fde68a', fontWeight: 950 }}>{overview.event.state}</span>
                <span style={{ color: '#cbd5e1' }}>· {overview.event.policy}</span>
                <span style={{ color: overview.auditor ? '#bbf7d0' : '#94a3b8' }}>
                  · 원본 감사권한 {overview.auditor ? '있음' : '없음'}
                </span>
                {canAuditAllstarVotes !== overview.auditor && <span style={{ color: '#fde68a' }}>· 권한 토큰 재로그인 필요</span>}
              </div>
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.65, overflowWrap: 'anywhere' }}>
              후보 버전 <strong>{overview.event.candidateVersion}</strong> · 해시 <code>{overview.event.candidateSetHash.slice(0, 16)}…</code><br />
              투표 기간 {formatDateTime(overview.event.opensAt)} ~ {formatDateTime(overview.event.closesAt)}<br />
              접수 설정 <strong style={{ color: overview.event.enabled ? '#bbf7d0' : '#fde68a' }}>{overview.event.enabled ? '활성' : '비활성'}</strong>
              {' · '}후보 공개 <strong style={{ color: overview.event.published ? '#bbf7d0' : '#fde68a' }}>{overview.event.published ? '공개' : '비공개'}</strong>
              {' · '}결과 공개 설정 <strong style={{ color: overview.event.resultsPublished ? '#bbf7d0' : '#94a3b8' }}>{overview.event.resultsPublished ? '활성' : '비활성'}</strong>
            </div>
            <div style={{ color: overview.audit.complete ? '#bbf7d0' : '#bfdbfe', fontSize: '12px', fontWeight: 800 }}>
              {overview.audit.complete ? '전체 무결성 검사' : '경량 관제'} · {overview.audit.scopeDescription}
            </div>
          </section>

          {operationalStatus && (
            <section style={{ ...cardStyle, display: 'grid', gap: '12px', borderColor: statusColors[operationalStatus.tone].border }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#e2e8f0' }}>운영 안전 상태</h3>
                  <p style={{ margin: '5px 0 0', color: '#94a3b8', fontSize: '12px' }}>화면 상태는 관제 판단 보조이며 실제 원본 백업·복원 검증을 대신하지 않습니다.</p>
                </div>
                <strong style={{ color: statusColors[operationalStatus.tone].foreground }}>{operationalStatus.label}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '9px' }}>
                <StatusItem
                  label="접수·중복 방지 원장"
                  value={overview.metrics.ledgerConsistent ? '정책 범위 내 일치' : overview.event.state === 'OPEN' && !overview.audit.complete ? '진행 중 재확인' : '불일치'}
                  note={`${overview.metrics.ballotCount} / ${overview.metrics.eligibilityCount} · ${overview.event.policy}`}
                  tone={overview.metrics.ledgerConsistent ? 'good' : overview.event.state === 'OPEN' && !overview.audit.complete ? 'warning' : 'danger'}
                />
                <StatusItem
                  label="원장 상호 연결"
                  value={overview.metrics.ledgerLinksConsistent === true ? 'pointer·fingerprint 일치' : overview.metrics.ledgerLinksConsistent === false ? '연결 불일치' : '전체 검사 필요'}
                  note="ballot과 eligibility가 같은 제출을 가리키는지 확인합니다."
                  tone={overview.metrics.ledgerLinksConsistent === true ? 'good' : overview.metrics.ledgerLinksConsistent === false ? 'danger' : 'neutral'}
                />
                <StatusItem
                  label="활성 후보 버전 원장"
                  value={operationalStatus.activeCandidateMatches ? '모두 활성 버전' : '이전 버전 포함'}
                  note={`${overview.metrics.activeCandidateBallotCount} / ${overview.metrics.ballotCount}표 · ${overview.event.candidateVersion}`}
                  tone={operationalStatus.activeCandidateMatches ? 'good' : 'warning'}
                />
                <StatusItem
                  label="접수 무결성"
                  value={overview.metrics.integrityIssueCount === 0 ? '검사 범위 정상' : `${overview.metrics.integrityIssueCount}건 확인 필요`}
                  note={`${overview.metrics.inspectedBallotCount}건 검사 · ${overview.audit.complete ? '전체' : '최근 표본'}`}
                  tone={overview.metrics.integrityIssueCount === 0 ? (overview.audit.complete ? 'good' : 'neutral') : 'danger'}
                />
                <StatusItem
                  label="결과 공개 게이트"
                  value={canPublishDraft ? '공개 가능' : overview.publicResult.published ? '현재 공개 중' : '공개 조건 미충족'}
                  note={overview.audit.stable ? '닫힌 상태 전체 검사 완료' : 'CLOSED → 전체 검사 → 초안 생성 순서 필요'}
                  tone={canPublishDraft ? 'good' : overview.publicResult.published && overview.warnings.length === 0 ? 'good' : 'neutral'}
                />
              </div>
            </section>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
            <MetricCard label="정상 접수 원장" value={overview.metrics.ballotCount} note={`최근 5분 ${overview.metrics.recentFiveMinutes} · 1시간 ${overview.metrics.recentHour}`} tone="blue" />
            <MetricCard
              label="중복 방지 원장"
              value={overview.metrics.eligibilityCount}
              note={overview.event.policy === 'ONCE_PER_DAY' ? '계정별 ledger 수량 관계' : overview.event.state === 'OPEN' && !overview.metrics.ledgerConsistent ? '진행 중 읽기 시점 차이일 수 있어 재확인 필요' : 'ballot과 같은 트랜잭션으로 저장'}
              tone={overview.metrics.ledgerConsistent ? 'green' : overview.event.state === 'OPEN' && !overview.audit.complete ? 'amber' : 'red'}
            />
            <MetricCard label={overview.audit.complete ? '전체 검증 통과' : '최근 로그 검증 통과'} value={overview.metrics.validBallotCount} note={`${overview.metrics.inspectedBallotCount}건 검사 · 확인 필요 ${overview.metrics.integrityIssueCount}건`} tone={overview.metrics.integrityIssueCount === 0 ? 'green' : 'red'} />
            <MetricCard
              label="공개 집계 ballot"
              value={overview.publicResult.totalBallots ?? '미생성'}
              note={overview.publicResult.countsMatchBallots === false ? '후보별 득표가 원장 재계산과 불일치' : `활성 후보 원장 ${overview.metrics.activeCandidateBallotCount} · 마지막 접수 ${formatDateTime(overview.metrics.latestSubmittedAt)}`}
              tone={overview.publicResult.schemaValid !== false && overview.publicResult.matchesBallotCount && overview.publicResult.countsMatchBallots !== false ? 'green' : 'amber'}
            />
          </section>

          <section style={{ ...cardStyle, display: 'grid', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#e2e8f0' }}>원본 기반 결과 집계</h3>
              <p style={{ margin: '7px 0 0', color: '#cbd5e1', fontSize: '13px', lineHeight: 1.65 }}>
                투표를 명시적으로 닫은 뒤 모든 원본 ballot을 엄격히 검사해 초안을 만듭니다. 초안 생성과 결과 공개를 분리해 집계 실패가 기존 공개 결과를 덮지 않게 합니다.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
              <ResultSummaryCard title="비공개 초안" result={overview.draftResult} />
              <ResultSummaryCard title="공개 결과" result={overview.publicResult} />
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openResultConfirmation('rebuild')} disabled={overview.event.state !== 'CLOSED' || resultAction !== null} style={buttonStyle}>
                {resultAction === 'rebuild' ? '원본 검사 중…' : '결과 초안 다시 만들기'}
              </button>
              <button
                type="button"
                onClick={() => openResultConfirmation('publish')}
                disabled={resultAction !== null || !canPublishDraft}
                style={{ ...buttonStyle, borderColor: 'rgba(74,222,128,0.6)', background: 'rgba(22,101,52,0.28)' }}
              >
                {resultAction === 'publish' ? '공개 처리 중…' : '검증된 초안 공개'}
              </button>
              <button
                type="button"
                onClick={() => openResultConfirmation('hide')}
                disabled={resultAction !== null || !overview.publicResult.published || !overview.publicResult.generationId}
                style={{ ...buttonStyle, borderColor: 'rgba(248,113,113,0.5)', background: 'rgba(127,29,29,0.24)' }}
              >
                {resultAction === 'hide' ? '비공개 처리 중…' : '공개 결과 숨기기'}
              </button>
            </div>
            {overview.event.state !== 'CLOSED' && <div style={{ color: '#fde68a', fontSize: '12px' }}>집계 전 관리자 설정에서 해당 부문을 명시적으로 CLOSED로 변경해야 합니다.</div>}
            {overview.draftResult.exists && !overview.audit.complete && <div style={{ color: '#bfdbfe', fontSize: '12px' }}>초안을 공개하려면 먼저 전체 무결성 검사를 실행하세요.</div>}
            {overview.audit.complete && !canPublishDraft && overview.draftResult.exists && (
              <div style={{ color: '#fca5a5', fontSize: '12px' }}>
                ballot↔eligibility 연결과 초안의 스키마·활성 후보·원장 수·후보별 득표 검증이 모두 일치해야 공개할 수 있습니다.
              </div>
            )}
          </section>

          <section style={{ ...cardStyle, display: 'grid', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#e2e8f0' }}>접수 분포 {overview.audit.complete ? '전체' : '최근 표본'}</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', color: '#cbd5e1', fontSize: '12px' }}>
              {[
                ...overview.distributions.candidateVersions.map((item) => `후보 ${item.key}: ${item.count}`),
                ...overview.distributions.policies.map((item) => `${item.key}: ${item.count}`),
                ...overview.distributions.localDates.slice(0, 7).map((item) => `${item.key}: ${item.count}`),
                ...overview.distributions.issues.map((item) => `오류 ${issueLabels[item.key] ?? item.key}: ${item.count}`),
              ].map((label) => (
                <span key={label} style={{ border: '1px solid rgba(148,163,184,0.3)', borderRadius: '999px', padding: '6px 9px', background: 'rgba(15,23,42,0.62)' }}>{label}</span>
              ))}
              {overview.metrics.inspectedBallotCount === 0 && <span>표시할 접수 분포가 없습니다.</span>}
            </div>
          </section>

          {overview.warnings.length > 0 && (
            <section style={{ ...cardStyle, borderColor: 'rgba(245,158,11,0.55)', background: 'rgba(120,53,15,0.2)' }}>
              <h3 style={{ margin: '0 0 8px', color: '#fde68a' }}>확인이 필요한 상태</h3>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#fed7aa', lineHeight: 1.75 }}>
                {overview.warnings.map((warning) => (
                  <li key={warning}>
                    <strong>{warningLabels[warning] ?? warning}</strong>
                    {warningActions[warning] && <div style={{ color: '#fdba74', fontSize: '12px' }}>권장 조치: {warningActions[warning]}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#e2e8f0' }}>최근 접수 로그</h3>
                <p style={{ margin: '5px 0 0', color: '#94a3b8', fontSize: '12px', lineHeight: 1.55 }}>
                  정상 접수 원장의 비식별 기록입니다. 계정·이메일·선택 선수·원본 HMAC ID는 표시하지 않으며, 거부·인프라 오류는 Cloud Logging의 구조화 로그에서 확인합니다.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '10px' }}>
              <label style={{ display: 'grid', gap: '5px', color: '#94a3b8', fontSize: '11px', fontWeight: 900, flex: '1 1 230px' }}>
                접수 코드·버전·정책 검색
                <input
                  type="search"
                  value={logQuery}
                  onChange={(event) => setLogQuery(event.target.value)}
                  placeholder="예: ABC123 또는 ONCE_PER_EVENT"
                  style={{ borderRadius: '9px', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.78)', color: '#f8fafc', padding: '9px 10px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '5px', color: '#94a3b8', fontSize: '11px', fontWeight: 900, flex: '1 1 150px' }}>
                무결성
                <select
                  value={logIntegrity}
                  onChange={(event) => setLogIntegrity(event.target.value as LogIntegrityFilter)}
                  style={{ borderRadius: '9px', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.78)', color: '#f8fafc', padding: '9px 10px' }}
                >
                  <option value="ALL">전체</option>
                  <option value="OK">정상</option>
                  <option value="REVIEW">확인 필요</option>
                </select>
              </label>
              <button type="button" onClick={downloadLogCsv} disabled={visibleLogs.length === 0} style={{ ...buttonStyle, alignSelf: 'end' }}>
                현재 필터 CSV ({visibleLogs.length})
              </button>
            </div>
            <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {logUrls?.accepted && <a href={logUrls.accepted} target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>정상 접수 로그</a>}
              {logUrls?.rejected && <a href={logUrls.rejected} target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>검증 거부 로그</a>}
              {logUrls?.failed && <a href={logUrls.failed} target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>인프라 오류 로그</a>}
              {logUrls?.result && <a href={logUrls.result} target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>결과 집계 로그</a>}
              {logUrls && !Object.values(logUrls).some(Boolean) && <span style={{ color: '#fde68a', fontSize: '12px' }}>Firebase 프로젝트 ID가 없어 Cloud Logging 링크를 만들 수 없습니다.</span>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '840px', borderCollapse: 'collapse', color: '#cbd5e1', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'rgba(30,41,59,0.9)', color: '#f8fafc', textAlign: 'left' }}>
                    {['접수 시각', '접수 코드', '후보 버전', '정책/기간', '선택 수', '무결성'].map((label) => (
                      <th key={label} style={{ padding: '10px', borderBottom: '1px solid rgba(148,163,184,0.3)' }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleLogs.map((log) => (
                    <tr key={`${log.receiptCode}-${log.submittedAt}`} style={{ borderBottom: '1px solid rgba(148,163,184,0.16)' }}>
                      <td style={{ padding: '10px' }}>{formatDateTime(log.submittedAt)}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace' }}>{log.receiptCode}</td>
                      <td style={{ padding: '10px' }}>{log.candidateVersion ?? '—'}</td>
                      <td style={{ padding: '10px' }}>{log.policy ?? '—'}<br /><span style={{ color: '#94a3b8' }}>{log.periodKey ?? '—'}</span></td>
                      <td style={{ padding: '10px' }}>{log.selectedCount}</td>
                      <td style={{ padding: '10px', color: log.integrity === 'OK' ? '#86efac' : '#fca5a5', fontWeight: 900 }}>
                        {log.integrity === 'OK' ? '정상' : log.issues.map((issue) => issueLabels[issue] ?? issue).join(' · ')}
                      </td>
                    </tr>
                  ))}
                  {visibleLogs.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>{overview.logs.length === 0 ? '아직 접수된 투표가 없습니다.' : '현재 필터에 해당하는 접수 로그가 없습니다.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...cardStyle, display: 'grid', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#e2e8f0' }}>백업과 복구 준비</h3>
              <p style={{ margin: '7px 0 0', color: '#cbd5e1', fontSize: '13px', lineHeight: 1.65 }}>
                아래 다운로드는 회의·장애 분석용 비식별 증적이며 재해 복구용 원본 백업이 아닙니다. 실제 복구는 관리형 예약 백업, 투표 종료 후 managed export와 별도 데이터베이스 복원 검증을 사용합니다. PITR 활성화는 실제 투표 직전 별도 오픈 게이트입니다.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void downloadAuditJson()} style={buttonStyle}>해시 포함 비식별 증적 JSON</button>
              <button type="button" onClick={() => void copyIncidentMemo()} style={buttonStyle}>장애 대응 기록 복사</button>
              <a href="https://firebase.google.com/docs/firestore/backups" target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>예약 백업 설정 문서</a>
              <a href="https://firebase.google.com/docs/firestore/manage-data/export-import" target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>Managed export 문서</a>
              <a href="https://firebase.google.com/docs/firestore/pitr" target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>PITR 설정 문서</a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '9px' }}>
              <StatusItem label="1. 제출 차단" value="부문 CLOSED" note="장애·집계 전에는 새 제출을 서버에서 먼저 차단합니다." tone={overview.event.state === 'CLOSED' ? 'good' : 'neutral'} />
              <StatusItem label="2. 원장 검사" value="전체 무결성 검사" note="닫힌 상태에서 ballot·eligibility·후보 hash를 대조합니다." tone={overview.audit.stable ? 'good' : 'neutral'} />
              <StatusItem label="3. 결과 초안" value="비공개 재집계" note="원본 검증을 통과해야만 기존 공개 결과와 분리된 초안을 만듭니다." tone={overview.draftResult.exists && overview.draftResult.schemaValid === true ? 'good' : 'neutral'} />
              <StatusItem label="4. 운영 승인" value="검증 후 공개" note="원본 백업·증적·초안 일치를 확인한 뒤 별도 확인 문구로 공개합니다." tone={overview.publicResult.published && overview.warnings.length === 0 ? 'good' : 'neutral'} />
            </div>
            <details style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.75 }}>
              <summary style={{ cursor: 'pointer', color: '#dbeafe', fontWeight: 900 }}>운영·복원 체크리스트 펼치기</summary>
              <ol style={{ marginBottom: 0, paddingLeft: '20px' }}>
                <li>Blaze 요금제와 백업·복원 IAM, Cloud Storage bucket 권한을 확인합니다.</li>
                <li>일일 예약 백업과 실패 알림을 설정하고 첫 성공 시각을 운영 기록에 남깁니다.</li>
                <li>오픈 직전 후보 버전·해시·Functions 배포 커밋과 HMAC Secret version을 기록합니다.</li>
                <li>장애 시 먼저 부문을 CLOSED로 전환하고 마지막 정상 접수 시각과 Cloud Logging을 보존합니다.</li>
                <li>HMAC Secret 원문은 Firestore 밖의 별도 보안 경계에 이중 승인으로 보관합니다.</li>
                <li>백업·export는 운영 데이터베이스에 덮어쓰지 않고 새 데이터베이스로 복원해 수량·후보 해시·index·Rules·IAM을 검증합니다.</li>
                <li>전체 검사 → 비공개 초안 → 운영 승인 → 공개 순서를 지키며, 불일치가 하나라도 있으면 공개하지 않습니다.</li>
              </ol>
            </details>
            <div style={{ color: overview.auditor ? '#bbf7d0' : '#fde68a', fontSize: '12px', lineHeight: 1.6 }}>
              {overview.auditor
                ? '현재 계정에는 allstarVoteAuditor 권한이 있습니다. 원본을 직접 다룰 때는 별도 감사 절차와 최소 권한을 적용하세요.'
                : '현재 화면은 비식별 관리자 관제만 제공합니다. 원본 ballot 직접 감사에는 admin + allstarVoteAuditor 권한을 가진 별도 감사 계정이 필요합니다.'}
            </div>
          </section>
        </>
      )}

      {confirmation && overview && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && resultAction === null) {
              setConfirmation(null);
              setConfirmationText('');
            }
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', padding: '18px', background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(8px)' }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="allstar-admin-confirm-title" style={{ ...cardStyle, width: 'min(100%, 480px)', borderColor: confirmation.action === 'publish' ? 'rgba(74,222,128,0.52)' : 'rgba(248,113,113,0.45)', display: 'grid', gap: '14px' }}>
            <div>
              <h3 id="allstar-admin-confirm-title" style={{ margin: 0, color: '#f8fafc' }}>{confirmation.title}</h3>
              <p style={{ margin: '8px 0 0', color: '#cbd5e1', lineHeight: 1.65, fontSize: '13px' }}>{confirmation.description}</p>
            </div>
            <div style={{ borderRadius: '10px', padding: '10px', background: 'rgba(15,23,42,0.7)', color: '#cbd5e1', fontSize: '12px', lineHeight: 1.65, overflowWrap: 'anywhere' }}>
              {overview.event.title} · {overview.event.divisionLabel}<br />
              상태 {overview.event.state} · 후보 {overview.event.candidateVersion}<br />
              접수 {overview.metrics.ballotCount}표 · 전체 검사 {overview.audit.complete && overview.audit.stable ? '완료' : '미완료'}
            </div>
            <label style={{ display: 'grid', gap: '6px', color: '#fde68a', fontSize: '12px', fontWeight: 900 }}>
              계속하려면 <code>{confirmation.phrase}</code>를 정확히 입력하세요.
              <input
                autoFocus
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setConfirmation(null);
                    setConfirmationText('');
                  }
                  if (event.key === 'Enter' && confirmationText === confirmation.phrase) void confirmResultAction();
                }}
                style={{ borderRadius: '10px', border: '1px solid rgba(148,163,184,0.4)', background: 'rgba(2,6,23,0.76)', color: '#f8fafc', padding: '11px 12px', fontWeight: 800 }}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setConfirmation(null); setConfirmationText(''); }} disabled={resultAction !== null} style={{ ...buttonStyle, background: 'rgba(30,41,59,0.7)', borderColor: 'rgba(148,163,184,0.4)' }}>취소</button>
              <button type="button" onClick={() => void confirmResultAction()} disabled={confirmationText !== confirmation.phrase || resultAction !== null} style={{ ...buttonStyle, borderColor: confirmation.action === 'publish' ? 'rgba(74,222,128,0.62)' : 'rgba(248,113,113,0.58)', background: confirmation.action === 'publish' ? 'rgba(22,101,52,0.35)' : 'rgba(127,29,29,0.3)' }}>
                확인하고 실행
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
