import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  correctUniquePlayGameRecord, getUniquePlayGameRecordsReview, resolveUniquePlayGameCorrection,
  UniquePlaySyncApiError, type OfficialGameDetail,
} from '@core/api/backendClient';
import type { GameCorrectionSection, GameRecordReviewEntry, UniquePlayGameRecordsReview } from '@core/contracts/uniquePlayGameReview';
import { buildCorrectionChanges, correctionFields, selectedCorrectionValue, type CorrectionSelection } from '../gameCorrectionEditor';
import { formatSyncDateTime } from '../model';
import './UniquePlayGameReview.css';
import OfficialGameAuditTables from './OfficialGameAuditTables';
import { gameReviewExport } from '../gameReviewExport';

interface Props {
  runId: string;
  refreshKey: string;
  readOnly: boolean;
  busy: boolean;
  onLoaded: (review: UniquePlayGameRecordsReview | null) => void;
  onChanged: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}

function errorMessage(error: unknown) {
  if (error instanceof UniquePlaySyncApiError && error.status === 404) return '경기 수정·검수 API를 아직 사용할 수 없습니다. NAS 백엔드 업데이트 여부를 확인해 주세요.';
  if (error instanceof UniquePlaySyncApiError && error.status === 409) return '다른 수정 또는 게시가 먼저 반영되었습니다. 검수 목록을 새로고침한 뒤 값을 다시 확인해 주세요.';
  return error instanceof Error ? error.message : '경기 검수 요청에 실패했습니다.';
}

function qualityLabel(game: GameRecordReviewEntry) {
  if (game.corrections.some(row => row.status === 'CONFLICT')) return '수정값 충돌';
  if (game.quality === 'CORRECTION_PENDING') return '오류 수정 중';
  if (game.quality === 'RESOLVED') return '오류 해결';
  if (game.detail?.status === 'NOT_PUBLISHED') return '원천 상세 미게시';
  return game.quality === 'CLEAN' ? '확인된 이상 없음' : '확인 전';
}

function CorrectionForm({ detail, disabled, onSave }: {
  detail: OfficialGameDetail;
  disabled: boolean;
  onSave: (changes: ReturnType<typeof buildCorrectionChanges>, note: string) => Promise<void>;
}) {
  const [teamName, setTeamName] = useState(detail.teams[0]?.teamName ?? '');
  const [section, setSection] = useState<GameCorrectionSection>('batters');
  const [target, setTarget] = useState('');
  const [field, setField] = useState('rbi');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const team = detail.teams.find(team => team.teamName === teamName);
  const rows = section === 'batters' || section === 'pitchers' ? team?.[section] ?? [] : [];
  const fieldOptions = correctionFields[section];
  const selectedField = fieldOptions.some(option => option.key === field) ? field : fieldOptions[0].key;
  const selectedRow = rows.find(row => row.rowKey === target) ?? rows[0];
  const selectedInning = team?.innings.find(row => String(row.inning) === target) ?? team?.innings[0];
  const selection: CorrectionSelection = {
    teamName, section, field: selectedField,
    ...(selectedRow ? { rowKey: selectedRow.rowKey } : {}),
    ...(section === 'innings' && selectedInning ? { inning: selectedInning.inning } : {}),
  };
  let currentValue: number | string | boolean | null = null;
  let targetAvailable = true;
  try { currentValue = selectedCorrectionValue(detail, selection); } catch { targetAvailable = false; }
  const inputKey = JSON.stringify([selection, currentValue]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    try {
      if (!note.trim()) throw new Error('원천 대조 내용과 수정 근거를 적어 주세요.');
      const data = new FormData(event.currentTarget);
      const changes = buildCorrectionChanges(detail, selection, String(data.get('correctedValue') ?? ''));
      if (!changes.length) throw new Error('기존 값과 다른 값을 입력해 주세요.');
      await onSave(changes, note.trim());
    } catch (error) { setLocalError(errorMessage(error)); }
  };

  return <form className="sync-game-correction" onSubmit={event => { void submit(event); }}>
    <h4>관리자 기록 수정</h4>
    <p>선택한 필드만 수정합니다. 원천 기록과 수정 이력은 보존되며, 저장 후 검증·리비전 생성·활성화를 거쳐야 공개됩니다.</p>
    <fieldset disabled={disabled}>
      <legend className="sr-only">수정할 기록 선택</legend>
      <label>팀<select value={teamName} onChange={event => { setTeamName(event.target.value); setTarget(''); }}>
        {detail.teams.map(team => <option key={team.teamName}>{team.teamName}</option>)}
      </select></label>
      <label>기록 종류<select value={section} onChange={event => { setSection(event.target.value as GameCorrectionSection); setTarget(''); }}>
        <option value="batters">타자</option><option value="pitchers">투수</option><option value="innings">이닝 점수</option><option value="totals">팀 기록</option>
      </select></label>
      {(section === 'batters' || section === 'pitchers') && <label>선수<select value={selectedRow?.rowKey ?? ''} onChange={event => setTarget(event.target.value)}>
        {rows.map(row => <option key={row.rowKey} value={row.rowKey}>{row.playerName} · #{row.jerseyNumber ?? '미등록'}</option>)}
      </select></label>}
      {section === 'innings' && <label>이닝<select value={selectedInning?.inning ?? ''} onChange={event => setTarget(event.target.value)}>
        {team?.innings.map(inning => <option key={inning.inning} value={inning.inning}>{inning.inning}회</option>)}
      </select></label>}
      <label>항목<select value={selectedField} onChange={event => setField(event.target.value)}>
        {fieldOptions.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
      </select></label>
      <label>변경할 값 {selectedField !== 'notPlayed' && <small>(빈칸 = 미기재, 0과 다름)</small>}
        {selectedField === 'notPlayed'
          ? <select key={inputKey} name="correctedValue" defaultValue={String(currentValue)}><option value="false">진행 / 원천 미기재</option><option value="true">미진행(X)</option></select>
          : <input key={inputKey} name="correctedValue" inputMode="decimal" maxLength={16} defaultValue={currentValue == null ? '' : String(currentValue)} autoComplete="off" />}
      </label>
      <label className="sync-game-correction__note">수정 근거<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2} placeholder="예: 원천 타석 결과와 기록지를 대조해 타점 수정" required /></label>
      <button className="sync-button sync-button--primary" type="submit" disabled={!targetAvailable || !note.trim()}>수정안 저장</button>
    </fieldset>
    {localError && <p role="alert" className="sync-message is-danger">{localError}</p>}
  </form>;
}


export default function UniquePlayGameReviewPanel({ runId, refreshKey, readOnly, busy, onLoaded, onChanged, onBusyChange }: Props) {
  const [resource, setResource] = useState<{ key: string; review: UniquePlayGameRecordsReview } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<'REVIEW' | 'ALL' | 'RESOLVED'>('REVIEW');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const requestSequence = useRef(0);
  const key = `${runId}:${refreshKey}`;
  const review = resource?.key === key ? resource.review : null;

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError(null); onLoaded(null);
    try {
      const next = await getUniquePlayGameRecordsReview(runId);
      if (requestSequence.current !== sequence) return;
      setResource({ key, review: next }); onLoaded(next);
    } catch (error) { if (requestSequence.current === sequence) setError(errorMessage(error)); }
    finally { if (requestSequence.current === sequence) setLoading(false); }
  }, [key, onLoaded, runId]);
  useEffect(() => {
    const sequenceRef = requestSequence;
    void load();
    return () => { sequenceRef.current++; };
  }, [load]);

  const games = useMemo(() => (review?.games ?? []).filter(game => {
    const needsReview = game.quality === 'CORRECTION_PENDING' || game.corrections.some(correction => correction.status === 'CONFLICT');
    if (filter === 'REVIEW' && !needsReview) return false;
    if (filter === 'RESOLVED' && game.quality !== 'RESOLVED') return false;
    return !search.trim() || `${game.game.homeTeamName} ${game.game.awayTeamName} ${game.game.playedAt} ${game.detail?.providerGameId}`.toLocaleLowerCase('ko-KR').includes(search.trim().toLocaleLowerCase('ko-KR'));
  }), [review, filter, search]);
  const selected = games.find(game => game.sourceGameId === selectedId) ?? games[0];
  const disabled = busy || saving || loading || readOnly;
  const downloadReview = () => {
    if (!review) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(gameReviewExport(review), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `aubl-game-review-${runId}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const mutate = async (action: () => Promise<UniquePlayGameRecordsReview>) => {
    setSaving(true); onBusyChange(true); setError(null); setNotice(null);
    try {
      const next = await action();
      setResource({ key, review: next }); onLoaded(next);
      await onChanged();
      setNotice('수정 결정을 저장했습니다. 원천과 이력은 유지됩니다. 검증 후 게시·활성화해 주세요.');
    } catch (error) { setError(errorMessage(error)); throw error; }
    finally { setSaving(false); onBusyChange(false); }
  };

  return <section className="sync-game-review" aria-labelledby="sync-game-review-title">
    <header><div><h3 id="sync-game-review-title">경기별 오류 검수·수정</h3><p>오류가 남은 기록은 공개 상세에 ‘오류 수정 중’으로 표시됩니다. 원천에서 해결된 항목과 관리자 수정 이력도 여기서 확인합니다.</p></div>
      <div><button type="button" className="sync-button" disabled={loading || saving || busy} onClick={() => { void load(); }}>검수 목록 새로고침</button>
        <button type="button" className="sync-button" disabled={!review || saving || busy} onClick={downloadReview}>검수 데이터 다운로드</button></div></header>
    {loading && <p role="status">경기별 검수 결과를 불러오는 중…</p>}
    {error && <p role="alert" className="sync-message is-danger">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {review && <>
      {review.notifications.length > 0 && <aside className="sync-game-review__notifications" aria-label="원천 동기화·수정 알림"><h4>이번 검수에서 확인된 변경</h4><ul>
        {review.notifications.map((notification, index) => <li key={`${notification.code}-${notification.sourceGameId}-${index}`}>{notification.message}
          {notification.sourceGameId && <button type="button" className="sync-button" onClick={() => { setFilter('ALL'); setSearch(''); setSelectedId(notification.sourceGameId); }}>해당 경기 확인</button>}</li>)}
      </ul></aside>}
      <div className="sync-game-review__filters"><label>검수 상태<select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="REVIEW">오류·충돌 확인</option><option value="ALL">전체 경기 ({review.games.length})</option><option value="RESOLVED">오류 해결</option></select></label>
        <label>경기 검색<input value={search} onChange={event => setSearch(event.target.value)} placeholder="팀명·날짜·UniquePlay 경기 ID" /></label><span>{games.length}경기</span></div>
      <div className="sync-game-review__scroll" tabIndex={0} aria-label="경기별 검수 목록, 가로 스크롤 가능"><table><thead><tr><th>경기 일시</th><th>대진</th><th>상태</th><th>확인 항목</th><th>검수</th></tr></thead><tbody>
        {games.map(game => <tr key={game.sourceGameId} aria-selected={selected?.sourceGameId === game.sourceGameId}><td>{formatSyncDateTime(game.game.playedAt)}</td><th scope="row">{game.game.homeTeamName} {game.game.homeScore ?? '—'} : {game.game.awayScore ?? '—'} {game.game.awayTeamName}</th><td>{qualityLabel(game)}</td><td>{game.issues.length}건</td><td><button type="button" className="sync-button" onClick={() => setSelectedId(game.sourceGameId)}>상세 검수</button></td></tr>)}
      </tbody></table></div>
      {!games.length && <p role="status">이 조건에 해당하는 경기가 없습니다.</p>}
      {selected && <article className="sync-game-review__selected" key={`${review.reviewChecksum}-${selected.sourceGameId}`}>
        <header><div><h4>{selected.game.homeTeamName} vs {selected.game.awayTeamName}</h4><p>{formatSyncDateTime(selected.game.playedAt)} · {selected.game.groupCode ?? '—'}조 · {selected.game.venue ?? '구장 미기재'} · {qualityLabel(selected)}</p></div>
          {selected.detail && /^\d{1,24}$/.test(selected.detail.providerGameId) && <a href={`https://unique-play.com/game/${selected.detail.providerGameId}/boxscore`} target="_blank" rel="noreferrer">UniquePlay 원천 기록 ↗</a>}</header>
        {selected.issues.length > 0 && <ul className="sync-game-review__issues">{selected.issues.map(issue => <li key={issue.id}><strong>{issue.teamName ?? '경기 기록'}</strong> · {issue.message} <code>{issue.code}</code></li>)}</ul>}
        {selected.quality === 'RESOLVED' && <p role="status">오류 해결 · {selected.resolutionSource === 'SOURCE' ? 'UniquePlay 원천에서 해결됨' : '관리자 수정 반영'}{selected.resolvedAt ? ` · ${formatSyncDateTime(selected.resolvedAt)}` : ''}</p>}
        <OfficialGameAuditTables detail={selected.detail} />
        {selected.corrections.length > 0 && selected.originalDetail && <details><summary>보존된 원천 기록 비교</summary><OfficialGameAuditTables detail={selected.originalDetail} /></details>}
        {selected.corrections.length > 0 && <section className="sync-game-review__history"><h4>보존된 수정 이력</h4><ul>{selected.corrections.map(correction => <li key={correction.id}>
          <strong>{correction.teamName} · {correction.playerName ?? (correction.inning ? `${correction.inning}회` : '팀 기록')} · {correction.field}</strong>
          <span>{String(correction.expectedValue ?? '미기재')} → {String(correction.value ?? '미기재')} · {correction.status}</span><span>{correction.note} · {formatSyncDateTime(correction.correctedAt)}</span>
          {correction.status === 'CONFLICT' && <div><label>재검수 근거<input value={resolutionNotes[correction.id] ?? ''} maxLength={500} onChange={event => setResolutionNotes(notes => ({ ...notes, [correction.id]: event.target.value }))} disabled={disabled} /></label>
            {(['USE_SOURCE', 'KEEP_AUBL'] as const).map(resolution => <button type="button" className="sync-button" key={resolution} disabled={disabled || !resolutionNotes[correction.id]?.trim()} onClick={() => {
              void mutate(() => resolveUniquePlayGameCorrection(runId, selected.sourceGameId, correction.id, { expectedChecksum: review.reviewChecksum, expectedRevision: review.expectedRevision, note: resolutionNotes[correction.id].trim(), resolution })).catch(() => {});
            }}>{resolution === 'USE_SOURCE' ? '새 원천값 사용' : '관리자 수정값 유지'}</button>)}</div>}
        </li>)}</ul></section>}
        {readOnly ? <p>이미 게시된 실행은 직접 변경할 수 없습니다. 아래 ‘게시본 수정안 만들기’로 새 검수 실행을 만든 뒤 수정해 주세요.</p>
          : selected.detail?.status === 'AVAILABLE' && <CorrectionForm detail={selected.detail} disabled={disabled} onSave={(changes, note) => mutate(() => correctUniquePlayGameRecord(runId, selected.sourceGameId, { expectedChecksum: review.reviewChecksum, expectedRevision: review.expectedRevision, note, changes }))} />}
      </article>}
      <p className="sync-game-review__checksum">검수 체크섬: {review.reviewChecksum}</p>
    </>}
  </section>;
}
