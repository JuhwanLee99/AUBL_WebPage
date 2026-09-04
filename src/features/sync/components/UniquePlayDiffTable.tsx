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
import './UniquePlaySync.css';

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
            <option value="KEEP_AUBL">AUBL 값 유지</option>
            <option value="MAP_ENTITY">AUBL 항목에 연결</option>
          </select>
        </label>

        <label>
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
        </label>

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
          <span title="현재 AUBL 값">
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
            <th scope="col" className="unique-play-diff__changes-heading">AUBL 현재값 → UniquePlay 값</th>
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
