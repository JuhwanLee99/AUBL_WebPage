import { Fragment, useId, useState } from 'react';
import type {
  ResolveUniquePlaySyncItemRequest,
  UniquePlaySyncDiffItem,
  UniquePlaySyncResolution,
} from '@core/contracts/uniquePlaySync';
import {
  formatSyncDiffValue,
  syncActionLabel,
  syncEntityLabel,
} from '../model';
import {
  buildGameRecordReview,
  type GameRecordTeamReview,
} from '../gameRecordReview';
import './UniquePlaySync.css';
import { normalizeOfficialGameDetail } from '@core/api/backendClient';
import OfficialGameAuditTables from './OfficialGameAuditTables';

interface Props {
  items: UniquePlaySyncDiffItem[];
  resolvingItemId: string | null;
  onResolve: (itemId: string, request: ResolveUniquePlaySyncItemRequest) => Promise<void>;
}

type ActionTone = 'positive' | 'progress' | 'negative' | 'neutral';

function actionTone(action: UniquePlaySyncDiffItem['action']): ActionTone {
  if (action === 'CREATE') return 'positive';
  if (action === 'UPDATE') return 'progress';
  if (action === 'DELETE' || action === 'CONFLICT') return 'negative';
  return 'neutral';
}

function ActionBadge({ item }: { item: UniquePlaySyncDiffItem }) {
  return (
    <span className="sync-action-badge" data-tone={actionTone(item.action)}>
      {syncActionLabel(item.action)}
    </span>
  );
}

function ResolutionEditor({
  item,
  saving,
  onResolve,
}: {
  item: UniquePlaySyncDiffItem;
  saving: boolean;
  onResolve: Props['onResolve'];
}) {
  const candidateListId = useId();
  const [resolution, setResolution] = useState<UniquePlaySyncResolution | ''>(item.resolution ?? '');
  const [localEntityId, setLocalEntityId] = useState(item.localEntityId ?? '');
  const [note, setNote] = useState(item.resolutionNote ?? '');

  const invalidMapping = resolution === 'MAP_ENTITY' && !localEntityId.trim();
  const disabled = saving || !item.itemId || !resolution || invalidMapping;

  return (
    <fieldset className="sync-resolution">
      <legend>매핑·충돌 처리 {item.resolved ? '(처리됨)' : '(필수)'}</legend>
      {item.conflictReason && <p className="sync-message is-danger">{item.conflictReason}</p>}
      <div className="sync-resolution__fields">
        <label>
          처리 방식
          <select
            value={resolution}
            onChange={(event) => setResolution(event.target.value as UniquePlaySyncResolution | '')}
            className="sync-control"
            disabled={saving}
          >
            <option value="">선택하세요</option>
            <option value="USE_SOURCE">UniquePlay 값 사용</option>
            <option value="KEEP_AUBL" disabled={item.entityType === 'GAME_RECORD' && (item.action === 'CREATE' || item.action === 'DELETE')}>
              {item.entityType === 'GAME_RECORD' ? '이전 공식 상세 유지' : 'AUBL 값 유지'}
            </option>
            {item.entityType !== 'GAME_RECORD' && <option value="MAP_ENTITY">AUBL 항목에 연결</option>}
          </select>
        </label>

        {item.entityType !== 'GAME_RECORD' && <label>
          AUBL 항목 ID
          <input
            value={localEntityId}
            onChange={(event) => setLocalEntityId(event.target.value)}
            list={candidateListId}
            placeholder={resolution === 'MAP_ENTITY' ? '필수 입력' : '매핑할 때만 입력'}
            disabled={saving || resolution !== 'MAP_ENTITY'}
            className="sync-control"
          />
          <datalist id={candidateListId}>
            {item.mappingCandidates.map((candidate) => (
              <option key={candidate.localEntityId} value={candidate.localEntityId}>
                {candidate.label}{candidate.description ? ` · ${candidate.description}` : ''}
              </option>
            ))}
          </datalist>
        </label>}

        <label>
          처리 메모
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="선택 근거를 남겨 주세요"
            maxLength={500}
            disabled={saving}
            className="sync-control"
          />
        </label>

        <button
          type="button"
          disabled={disabled}
          className="sync-button sync-button--primary"
          onClick={() => {
            if (!resolution) return;
            void onResolve(item.itemId, {
              resolution,
              ...(resolution === 'MAP_ENTITY' ? { localEntityId: localEntityId.trim() } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            });
          }}
        >
          {saving ? '저장 중…' : item.resolved ? '결정 변경' : '결정 저장'}
        </button>
      </div>
      {invalidMapping && (
        <p role="alert" className="sync-message is-danger">
          AUBL 항목에 연결하려면 실제 항목 ID가 필요합니다.
        </p>
      )}
      {item.mappingCandidates.length > 0 && (
        <p className="sync-message">
          서버가 제안한 후보 {item.mappingCandidates.length}개가 입력 목록에 포함되어 있습니다. 이름만으로 확정하지 말고 팀·등번호를 함께 확인하세요.
        </p>
      )}
      {item.entityType === 'GAME_RECORD' && (
        <p className="sync-message">
          ‘이전 공식 상세 유지’는 직전에 게시된 UniquePlay 공식 스냅샷을 유지합니다. AUBL 수기 기록을 선택하는 동작이 아닙니다.
        </p>
      )}
      {!item.itemId && (
        <p role="alert" className="sync-message is-danger">
          서버 응답에 itemId가 없어 이 항목은 처리할 수 없습니다.
        </p>
      )}
    </fieldset>
  );
}

function ChangeList({ item }: { item: UniquePlaySyncDiffItem }) {
  if (item.changes.length === 0) {
    return <span className="sync-muted">세부 필드 변경 없음</span>;
  }
  return (
    <div className="sync-change-list">
      {item.changes.map((change, index) => (
        <div key={`${change.field}-${index}`} className="sync-change-list__row">
          <strong>{change.label ?? change.field}</strong>
          <span title={item.entityType === 'GAME_RECORD' ? '이전에 게시된 공식 상세' : '현재 AUBL 값'}>
            {formatSyncDiffValue(change.aublValue, change.field)}
          </span>
          <span aria-hidden="true" className="sync-change-list__arrow">→</span>
          <span title="UniquePlay 원본 값" className="sync-change-list__source">
            {formatSyncDiffValue(change.sourceValue, change.field)}
          </span>
        </div>
      ))}
    </div>
  );
}

function reviewValue(value: number | null) {
  return value === null ? '—' : value.toLocaleString('ko-KR');
}

function InningTotal({ team }: { team: GameRecordTeamReview }) {
  return (
    <span className="game-record-review__value-stack">
      <strong>{reviewValue(team.inningRuns)}</strong>
      {team.unknownInningCount > 0 && <small>원천 빈칸 {team.unknownInningCount}이닝</small>}
      {team.notPlayedInningCount > 0 && <small>미진행(X) {team.notPlayedInningCount}이닝</small>}
    </span>
  );
}

function GameRecordTeamSummary({ team }: { team: GameRecordTeamReview }) {
  return (
    <section className="game-record-review__team" aria-label={`${team.teamName} 상세 기록 합계`}>
      <div className="game-record-review__team-heading">
        <h4>{team.teamName}</h4>
        <span>{team.inningCount}이닝 기록</span>
      </div>
      <div className="game-record-review__comparison-scroll" tabIndex={0} aria-label={`${team.teamName} 합계 비교, 가로로 스크롤할 수 있습니다`}>
        <table className="game-record-review__comparison">
          <caption className="sr-only">{team.teamName} 팀 기록, 개인 기록 합계, 이닝 합계 비교</caption>
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">팀 기록</th>
              <th scope="col">개인 기록 합계</th>
              <th scope="col">이닝 합계</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">R</th>
              <td>{reviewValue(team.teamRuns)}</td>
              <td>
                <span className="game-record-review__value-stack">
                  <strong>{reviewValue(team.batterRuns)}</strong>
                  {team.batterRuns === null && <small>일부 값이 비어 합산 보류</small>}
                </span>
              </td>
              <td><InningTotal team={team} /></td>
            </tr>
            <tr>
              <th scope="row">H</th>
              <td>{reviewValue(team.teamHits)}</td>
              <td>
                <span className="game-record-review__value-stack">
                  <strong>{reviewValue(team.batterHits)}</strong>
                  {team.batterHits === null && <small>일부 값이 비어 합산 보류</small>}
                </span>
              </td>
              <td aria-label="이닝별 안타 합계는 수집하지 않음">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      {team.mismatches.length > 0 ? (
        <ul className="game-record-review__mismatches" aria-label={`${team.teamName} 불일치 항목`}>
          {team.mismatches.map((mismatch, index) => (
            <li key={`${mismatch.code}-${mismatch.metric ?? 'STRUCTURE'}-${index}`}>
              <code>{mismatch.code}</code>
              <span>{mismatch.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="game-record-review__match">비교 가능한 공개 합계에서 불일치가 발견되지 않았습니다.</p>
      )}
    </section>
  );
}

function GameRecordReviewPanel({ item }: { item: UniquePlaySyncDiffItem }) {
  const review = buildGameRecordReview(item.changes);
  const candidateDetail = review.status === 'AVAILABLE' && review.comparisonAvailable && !review.structureUnavailable
    ? normalizeOfficialGameDetail(Object.fromEntries(item.changes.filter(change => ['schemaVersion', 'sourceGameId', 'providerGameId', 'status', 'teams'].includes(change.field)).map(change => [change.field, change.sourceValue])))
    : null;
  const [expanded, setExpanded] = useState(review.structureUnavailable || review.mismatchCount > 0);
  const noComparison = !review.comparisonAvailable;
  const notPublished = !noComparison && review.status === 'NOT_PUBLISHED' && !review.structureUnavailable;
  const statusText = noComparison
    ? '비교할 합계 변경 없음'
    : notPublished
      ? '원천 상세 미게시'
      : review.structureUnavailable
        ? '공개 상세 구조 확인 필요'
        : review.mismatchCount > 0
          ? `불일치 ${review.mismatchCount}건`
          : '확인된 합계 이상 없음';
  const statusTone = noComparison || notPublished
    ? 'neutral'
    : review.structureUnavailable || review.mismatchCount > 0
      ? 'danger'
      : 'success';

  return (
    <details
      className="game-record-review"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span className="game-record-review__summary-title">경기 상세 검수 요약</span>
        <span
          className="game-record-review__status"
          data-tone={statusTone}
        >
          {statusText}
        </span>
        <span className="game-record-review__disclosure" aria-hidden="true">펼치기</span>
      </summary>
      <div className="game-record-review__body">
        <div className="game-record-review__header">
          <div>
            <strong>UniquePlay 경기 ID</strong>
            <span>{review.providerGameId ?? '확인 불가'}</span>
          </div>
          {review.providerUrl && (
            <a href={review.providerUrl} target="_blank" rel="noreferrer">
              UniquePlay 박스스코어 열기
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
        {review.structureUnavailable && (
          <p role="alert" className="game-record-review__structure-warning">
            허용된 공개 필드에서 양 팀 상세 구조를 확인할 수 없습니다. 원본 박스스코어와 수집 상태를 확인해 주세요.
          </p>
        )}
        {notPublished && (
          <p className="game-record-review__not-published">
            UniquePlay에 선수별 경기 상세가 게시되지 않아 합계 검사를 생략했습니다.
          </p>
        )}
        {noComparison && (
          <p className="game-record-review__not-published">
            이 변경 항목에는 새 팀 합계가 포함되지 않아 합계 비교를 생략했습니다.
          </p>
        )}
        {review.teams.length > 0 && (
          <div className="game-record-review__teams">
            {review.teams.map((team, index) => (
              <GameRecordTeamSummary key={`${item.itemId || item.externalId}-team-${index}`} team={team} />
            ))}
          </div>
        )}
        <p className="game-record-review__footnote">
          위 요약은 R/H와 이닝 합계 비교입니다. 아래 타점·투수 기록도 함께 대조하세요. 전체 오류 판정은 ‘경기별 오류 검수·수정’과 서버 검증을 기준으로 합니다.
        </p>
        {candidateDetail && <OfficialGameAuditTables detail={candidateDetail} />}
      </div>
    </details>
  );
}

export default function UniquePlayDiffTable({ items, resolvingItemId, onResolve }: Props) {
  if (items.length === 0) {
    return (
      <div role="status" className="unique-play-diff__empty">
        이 조건에 해당하는 변경 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="unique-play-diff" tabIndex={0} aria-label="UniquePlay 데이터 변경 비교 표, 가로로 스크롤할 수 있습니다">
      <table className="unique-play-diff__table">
        <caption className="sr-only">UniquePlay와 AUBL 데이터 변경 비교</caption>
        <thead>
          <tr>
            <th scope="col">구분</th>
            <th scope="col">대상</th>
            <th scope="col">식별 정보</th>
            <th scope="col" className="unique-play-diff__changes-heading">현재 게시값 → UniquePlay 값</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const needsResolution = item.action === 'CONFLICT'
              || item.mappingCandidates.length > 0
              || item.conflictReason !== null;
            const rowKey = item.itemId || `${item.entityType}-${item.externalId ?? item.displayName}-${index}`;
            return (
              <Fragment key={rowKey}>
                <tr>
                  <td>
                    <div className="unique-play-diff__kind">
                      <ActionBadge item={item} />
                      <span>{syncEntityLabel(item.entityType)}</span>
                    </div>
                  </td>
                  <th scope="row">
                    <div className="unique-play-diff__name">{item.displayName}</div>
                    {item.groupCode && <div className="unique-play-diff__meta">{item.groupCode}</div>}
                  </th>
                  <td>
                    <div className="unique-play-diff__meta-list">
                      <span>외부 ID: {item.externalId ?? '—'}</span>
                      <span>AUBL ID: {item.localEntityId ?? '—'}</span>
                      {item.resolved && <strong className="is-success">처리 결정 저장됨</strong>}
                    </div>
                  </td>
                  <td><ChangeList item={item} /></td>
                </tr>
                {item.entityType === 'GAME_RECORD' && (
                  <tr className="unique-play-diff__game-record-row">
                    <td colSpan={4}>
                      <GameRecordReviewPanel item={item} />
                    </td>
                  </tr>
                )}
                {needsResolution && (
                  <tr className="unique-play-diff__resolution-row">
                    <td colSpan={4}>
                      <ResolutionEditor
                        key={`${item.itemId}-${item.resolution ?? 'unresolved'}-${item.localEntityId ?? ''}`}
                        item={item}
                        saving={resolvingItemId === item.itemId}
                        onResolve={onResolve}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
