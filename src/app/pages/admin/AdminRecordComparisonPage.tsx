import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { addDoc, collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, serverTimestamp, startAfter, type QueryDocumentSnapshot } from 'firebase/firestore';
import { auth, firestore } from '@shared/firebase/client';
import { useAdmin } from '@shared/auth/useAdmin';
import { useDemoStore } from '@shared/state/demoStore';
import { useRecordSource } from '@shared/state/useRecordSource';
import { getOfficialGameDetails, type OfficialGameDetailsResponse } from '@core/api/backendClient';
import { compareRecordSources } from '@features/sync/recordComparison';
import ArchivedScoringReviewPanel from '@features/sync/components/ArchivedScoringReviewPanel';
import { isReviewDraftCurrent, prepareComparisonIssue, type ArchiveIssueDraft, type ReviewBinding } from '@features/sync/archivedScoringReview';
import './AdminRecordComparisonPage.css';

type Data = Record<string, unknown>;
type ArchiveData = { key: string; archive: Data; core: Data; issues: Data[] };
const categories = { MODAL: '모달 입력', ENGINE: '상태 전이', PARSER: '문자중계 파서', AGGREGATION: '집계', MAPPING: '선수·경기 매핑', SOURCE: '유니크 원천', UNKNOWN: '원인 조사' };
const statuses = { OPEN: '등록', INVESTIGATING: '조사 중', FIXED: '수정·검증 완료', WONT_FIX: '수정 불필요' };
const rowLabels = { equal: '일치', mismatch: '차이', missing: '자료 없음', unmapped: '매핑 확인' };
const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';

function RawArchivePage({ matchId, kind, legacy, binding, onPrepare }: { matchId: string; kind: 'feed' | 'events'; legacy: unknown; binding: ReviewBinding; onPrepare: (draft: ArchiveIssueDraft) => void }) {
  const [rows, setRows] = useState<Data[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const flight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function load() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true); setError('');
    try {
      // Document-ID order includes legacy rows without createdAt; display order is not play order.
      const base = collection(firestore, 'matchStates', matchId, kind);
      const page = await getDocsFromServer(query(base, orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(100)));
      if (!alive.current) return;
      setRows(previous => [...previous, ...page.docs.map(row => ({ ...row.data(), _documentId: row.id }))]);
      setCursor(page.docs.at(-1) ?? cursor);
      setMore(page.size === 100);
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return <details data-testid={`raw-archive-${kind}`}>
    <summary>{kind === 'feed' ? '원본 문자중계' : '모달·사건 원본'} ({rows.length}건 조회)</summary>
    <p>문서 ID 순서로 100건씩 조회합니다. 플레이 순서는 원본의 이닝·order·createdAt을 함께 확인하세요.</p>
    {error && <p role="alert">{error}</p>}
    {more && <button type="button" disabled={busy} onClick={() => void load()}>{busy ? '조회 중' : '100건 더 조회'}</button>}
    {kind === 'events' && <ArchivedScoringReviewPanel allowed binding={binding} documents={rows} legacy={legacy} hasMore={more} onPrepare={onPrepare} />}
    <pre>{JSON.stringify(rows, null, 2)}</pre>
    {Array.isArray(legacy) && legacy.length > 0 && <details><summary>구형 루트 문서 배열 ({legacy.length}건, 중복 합산하지 않음)</summary><pre>{JSON.stringify(legacy, null, 2)}</pre></details>}
  </details>;
}

export default function AdminRecordComparisonPage() {
  const { state } = useDemoStore();
  const { isAdmin, loading: authLoading } = useAdmin();
  const [params, setParams] = useSearchParams();
  const matchId = params.get('matchId') ?? '';
  const match = state.matches.find(item => item.id === matchId);
  const source = useRecordSource(matchId);
  const [reload, setReload] = useState(0);
  const [archive, setArchive] = useState<ArchiveData | null>(null);
  const [candidate, setCandidate] = useState<{ key: string; payload: OfficialGameDetailsResponse | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [category, setCategory] = useState('UNKNOWN');
  const [status, setStatus] = useState('OPEN');
  const [pendingDraft, setPendingDraft] = useState<ArchiveIssueDraft | null>(null);
  const [appliedDraftBinding, setAppliedDraftBinding] = useState<ReviewBinding | null>(null);
  const revision = source.status === 'official' ? source.source.revision : '';
  const payloadHash = source.status === 'official' ? source.source.payloadHash : '';
  const reviewBinding = useMemo(() => ({ matchId, revision, payloadHash }), [matchId, revision, payloadHash]);
  const key = JSON.stringify([matchId, revision, payloadHash, reload]);
  const candidateKey = `${matchId}:${match?.sourceGameId ?? ''}:${match?.seasonId ?? ''}:${match?.syncRevision ?? ''}:${reload}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const requestInFlight = useRef(false);
  const official = source.status === 'official' ? source.source.official : null;
  const currentArchive = archive?.key === key ? archive : null;
  const preview = candidate?.key === candidateKey ? candidate.payload : null;

  useEffect(() => {
    if (!isAdmin || !matchId) return;
    let canceled = false;
    setMessage(''); setConfirmed(false); setNote(''); setEvidence(''); setPendingDraft(null); setAppliedDraftBinding(null);
    const run = async () => {
      try {
        if (revision) {
          const saved = await getDocFromServer(doc(firestore, 'recordArchives', matchId));
          if (!saved.exists()) throw new Error('보관 문서가 없습니다. 원본 보관 상태를 복구한 뒤 비교하세요.');
          const core = await getDocFromServer(doc(firestore, 'matchStates', matchId));
          const issues = await getDocsFromServer(query(collection(firestore, 'recordArchives', matchId, 'issues'), orderBy('createdAt', 'desc'), limit(100)));
          if (!canceled) setArchive({ key, archive: saved.data(), core: core.data() ?? {}, issues: issues.docs.map(row => ({ ...row.data(), id: row.id })) });
        }
        if (match?.sourceProvider === 'UNIQUE_PLAY' && match.sourceGameId) {
          const payload = await getOfficialGameDetails(match.sourceGameId, match.seasonId);
          if (!canceled) setCandidate({ key: candidateKey, payload });
        }
      } catch (error) {
        if (!canceled) setMessage(errorText(error));
      }
    };
    void run();
    return () => { canceled = true; };
  }, [isAdmin, matchId, match?.sourceProvider, match?.sourceGameId, match?.seasonId, revision, key, candidateKey]);

  const comparisons = useMemo(() => currentArchive && official
    ? compareRecordSources(currentArchive.archive.schedule, currentArchive.core, official) : [], [currentArchive, official]);
  const visibleRows = onlyProblems ? comparisons.filter(row => row.status !== 'equal') : comparisons;

  async function promote() {
    if (!isAdmin || !preview?.syncRevision || !confirmed || requestInFlight.current) return;
    requestInFlight.current = true; setBusy(true); setMessage('');
    const requested = key;
    try {
      const call = httpsCallable<{ matchId: string; expectedRevision: string }, { revision: string; replayed: boolean }>(getFunctions(getApp(), 'asia-northeast3'), 'promote_uniqueplay_record_source');
      await call({ matchId, expectedRevision: preview.syncRevision });
      if (currentKey.current === requested) { setReload(value => value + 1); setConfirmed(false); }
    } catch (error) {
      if (currentKey.current === requested) setMessage(errorText(error));
    } finally { requestInFlight.current = false; setBusy(false); }
  }

  async function saveIssue() {
    if (!isAdmin || source.status !== 'official' || !note.trim() || !auth.currentUser || requestInFlight.current) return;
    if (appliedDraftBinding && !isReviewDraftCurrent(appliedDraftBinding, reviewBinding)) {
      setMessage('초안의 경기·공식 리비전·해시가 변경되었습니다. 새 자료에서 다시 검토하세요.'); return;
    }
    requestInFlight.current = true; setBusy(true); setMessage('');
    const requested = key;
    try {
      await addDoc(collection(firestore, 'recordArchives', matchId, 'issues'), {
        matchId, revision: source.source.revision, payloadHash: source.source.payloadHash,
        category, status, note: note.trim(), evidence: evidence.trim(), actorUid: auth.currentUser.uid, createdAt: serverTimestamp(),
      });
      if (currentKey.current === requested) { setNote(''); setEvidence(''); setReload(value => value + 1); }
    } catch (error) {
      if (currentKey.current === requested) setMessage(errorText(error));
    } finally { requestInFlight.current = false; setBusy(false); }
  }

  if (authLoading) return <p>관리자 권한 확인 중</p>;
  if (!isAdmin) return <p>관리자만 비교 원본을 조회할 수 있습니다.</p>;
  return <div className="record-comparison">
    <header><h2>공식·자체 기록 비교</h2><p>실시간 기록은 참고 자료, 게시된 유니크플레이 기록은 공식 자료입니다. 차이를 발견해도 어느 원본도 자동으로 고치지 않습니다.</p></header>
    <label>경기 선택<select value={matchId} disabled={busy} onChange={event => setParams({ matchId: event.target.value })}>
      <option value="">경기를 선택하세요</option>
      {[...state.matches].filter(item => !item.deleted).sort((a, b) => b.startTime.localeCompare(a.startTime)).map(item => <option key={item.id} value={item.id}>{item.startTime.slice(0, 10)} {item.awayTeamName} vs {item.homeTeamName} [{item.recordAuthority === 'UNIQUE_PLAY' ? '공식' : '참고'}]</option>)}
    </select></label>
    {message && <p role="alert">{message}</p>}
    {matchId && <section>
      <h3>1. 공식 원천 전환</h3>
      <p>현재: {source.status === 'official' ? `공식 기록 ${revision} / 자체 기록 관리자 전용` : source.status === 'live' ? 'AUBL 실시간 참고 기록 공개' : '공개 상태 확인 중 또는 조회 실패'}</p>
      <p>원본 경기 ID: {match?.sourceGameId ?? '미매핑'} / 일정 리비전: {match?.syncRevision ?? '없음'}</p>
      {!match?.sourceGameId && <p>UniquePlay 동기화의 경기 매핑을 먼저 완료하세요. 팀 이름이나 날짜만으로 경기를 자동 연결하지 않습니다.</p>}
      {preview && <p>게시 후보: {preview.game.awayTeamName} {preview.game.awayScore} : {preview.game.homeScore} {preview.game.homeTeamName} / {preview.game.playedAt} / {preview.status} / {preview.quality ?? '검수 정보 없음'} / {preview.syncRevision}</p>}
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />경기 매핑과 자체 기록의 종료·저장을 확인했습니다. 공식 전환 후 자체 기록은 공개·수정하지 않습니다.</label>
      <div className="record-comparison__actions">
        <button type="button" disabled={busy || !confirmed || preview?.status !== 'AVAILABLE' || source.status === 'blocked' || source.status === 'loading'} onClick={() => void promote()}>게시된 공식 기록으로 전환 / 재동기화</button>
        <button type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>다시 조회</button>
      </div>
      <p>전환 실패·공식 API 장애 시 기존 공개 원천을 유지합니다. 이미 전환된 경기는 자체 기록으로 자동 복귀하지 않습니다.</p>
    </section>}
    {official && <section>
      <h3>2. 고정된 원본 비교</h3>
      <p>등번호와 이름이 유일하게 일치하는 선수만 자동 비교합니다. 미수집 값은 0이 아니며, 차이가 곧 모달 오류라는 뜻도 아닙니다.</p>
      {!currentArchive ? <p>관리자 보관 원본을 불러오고 있습니다.</p> : <>
        <p>차이 {comparisons.filter(row => row.status === 'mismatch').length} / 자료 없음 {comparisons.filter(row => row.status === 'missing').length} / 매핑 확인 {comparisons.filter(row => row.status === 'unmapped').length}</p>
        <label><input type="checkbox" checked={onlyProblems} onChange={event => setOnlyProblems(event.target.checked)} />일치 항목 숨기기</label>
        <div className="record-comparison__table"><table><thead><tr><th>항목 / 근거 키</th><th>AUBL 보관 기록</th><th>UniquePlay 공식</th><th>상태</th><th>재심</th></tr></thead>
          <tbody>{visibleRows.map(row => <tr key={row.key} data-status={row.status}><th>{row.label}<small>{row.key}</small></th><td>{row.live ?? '미수집'}</td><td>{row.official ?? '미수집'}</td><td>{rowLabels[row.status]}</td><td>{row.status !== 'equal' && <button type="button" disabled={busy} onClick={() => setPendingDraft(prepareComparisonIssue(reviewBinding, row))}>비교 이슈 초안</button>}</td></tr>)}</tbody>
        </table></div>
        <RawArchivePage key={`${key}:feed`} matchId={matchId} kind="feed" legacy={currentArchive.core.feed} binding={reviewBinding} onPrepare={setPendingDraft} />
        <RawArchivePage key={`${key}:events`} matchId={matchId} kind="events" legacy={currentArchive.core.events} binding={reviewBinding} onPrepare={setPendingDraft} />
        <div className="record-comparison__originals">
          <details><summary>자체 상태·저장 기록 원본</summary><pre>{JSON.stringify({ schedule: currentArchive.archive.schedule, core: currentArchive.core }, null, 2)}</pre></details>
          <details><summary>공식 기록 원본 (타석 결과 포함)</summary><pre>{JSON.stringify(official, null, 2)}</pre></details>
        </div>
      </>}
    </section>}
    {official && currentArchive && <section>
      <h3>3. 개선 이슈·검증 이력</h3>
      <p>이력은 추가만 가능하며 공식 리비전과 해시에 고정됩니다. 같은 이슈의 후속 상태는 근거란에 기존 이슈 ID를 남겨 연결하세요.</p>
      {pendingDraft && <section data-testid="archive-issue-draft" aria-label="재심 초안 미리보기">
        <h4>{pendingDraft.title}</h4><p>경기 {pendingDraft.matchId} · 공식 리비전 {pendingDraft.revision} · 해시 {pendingDraft.payloadHash}</p>
        <p>아직 저장되지 않았습니다. 적용하면 작성 중인 분류·상태·근거·내용을 아래 초안으로 교체합니다.</p>
        <pre>{pendingDraft.note}</pre><pre data-testid="archive-draft-evidence">{pendingDraft.evidence}</pre>
        <button type="button" disabled={busy || !isReviewDraftCurrent(pendingDraft, reviewBinding)} onClick={() => {
          if (!isAdmin || !isReviewDraftCurrent(pendingDraft, reviewBinding)) return;
          setCategory(pendingDraft.category); setStatus(pendingDraft.status); setNote(pendingDraft.note); setEvidence(pendingDraft.evidence);
          setAppliedDraftBinding({ matchId: pendingDraft.matchId, revision: pendingDraft.revision, payloadHash: pendingDraft.payloadHash }); setPendingDraft(null);
        }}>초안을 이슈 폼에 적용</button>
        <button type="button" disabled={busy} onClick={() => setPendingDraft(null)}>초안 취소</button>
      </section>}
      <label>원인 분류<select value={category} onChange={event => setCategory(event.target.value)}>{Object.entries(categories).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>처리 상태<select value={status} onChange={event => setStatus(event.target.value)}>{Object.entries(statuses).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>근거 (비교 키, 이벤트 ID, 이전 이슈 ID, 테스트 이름)<textarea value={evidence} maxLength={2000} onChange={event => setEvidence(event.target.value)} /></label>
      <label>관찰·재현·수정·검증 내용<textarea value={note} maxLength={4000} onChange={event => setNote(event.target.value)} /></label>
      <button type="button" disabled={busy || !note.trim() || Boolean(appliedDraftBinding && !isReviewDraftCurrent(appliedDraftBinding, reviewBinding))} onClick={() => void saveIssue()}>검수 이력 추가</button>
      <details><summary>최근 검수 이력 {currentArchive.issues.length}건 (최대 100건)</summary><pre>{JSON.stringify(currentArchive.issues, null, 2)}</pre></details>
    </section>}
  </div>;
}
