import { Fragment, useId, useState, type CSSProperties } from 'react';
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

interface Props {
  items: UniquePlaySyncDiffItem[];
  resolvingItemId: string | null;
  onResolve: (itemId: string, request: ResolveUniquePlaySyncItemRequest) => Promise<void>;
}

const headerCellStyle: CSSProperties = {
  padding: '11px 12px',
  textAlign: 'left',
  color: '#475569',
  background: '#f8fafc',
  borderBottom: '1px solid #cbd5e1',
  fontSize: '12px',
  fontWeight: 850,
  whiteSpace: 'nowrap',
};

const cellStyle: CSSProperties = {
  padding: '13px 12px',
  color: '#1e293b',
  borderBottom: '1px solid #e2e8f0',
  fontSize: '13px',
  verticalAlign: 'top',
};

const selectStyle: CSSProperties = {
  minHeight: '40px',
  width: '100%',
  borderRadius: '9px',
  border: '1px solid #94a3b8',
  background: '#fff',
  color: '#0f274f',
  padding: '7px 9px',
  fontSize: '13px',
};

function actionPalette(action: UniquePlaySyncDiffItem['action']) {
  if (action === 'CREATE') return { color: '#166534', background: '#dcfce7', border: '#86efac' };
  if (action === 'UPDATE') return { color: '#1d4ed8', background: '#dbeafe', border: '#93c5fd' };
  if (action === 'DELETE' || action === 'CONFLICT') {
    return { color: '#991b1b', background: '#fee2e2', border: '#fca5a5' };
  }
  return { color: '#475569', background: '#f1f5f9', border: '#cbd5e1' };
}

function ActionBadge({ item }: { item: UniquePlaySyncDiffItem }) {
  const palette = actionPalette(item.action);
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '3px 8px',
        borderRadius: '999px',
        border: `1px solid ${palette.border}`,
        color: palette.color,
        background: palette.background,
        fontSize: '11px',
        lineHeight: 1.4,
        fontWeight: 850,
      }}
    >
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
    <fieldset
      style={{
        margin: 0,
        padding: '14px',
        borderRadius: '11px',
        border: '1px solid #bfdbfe',
        background: '#f8fbff',
      }}
    >
      <legend style={{ padding: '0 6px', color: '#0f3b76', fontSize: '13px', fontWeight: 850 }}>
        매핑·충돌 처리 {item.resolved ? '(처리됨)' : '(필수)'}
      </legend>
      {item.conflictReason && (
        <p style={{ margin: '0 0 11px', color: '#991b1b', fontSize: '13px', fontWeight: 700 }}>
          {item.conflictReason}
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(150px, 0.7fr) minmax(180px, 1fr) minmax(180px, 1fr) auto',
          gap: '10px',
          alignItems: 'end',
        }}
      >
        <label style={{ display: 'grid', gap: '5px', color: '#334155', fontSize: '12px', fontWeight: 750 }}>
          처리 방식
          <select
            value={resolution}
            onChange={(event) => setResolution(event.target.value as UniquePlaySyncResolution | '')}
            style={selectStyle}
            disabled={saving}
          >
            <option value="">선택하세요</option>
            <option value="USE_SOURCE">UniquePlay 값 사용</option>
            <option value="KEEP_AUBL">AUBL 값 유지</option>
            <option value="MAP_ENTITY">AUBL 항목에 연결</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: '5px', color: '#334155', fontSize: '12px', fontWeight: 750 }}>
          AUBL 항목 ID
          <input
            value={localEntityId}
            onChange={(event) => setLocalEntityId(event.target.value)}
            list={candidateListId}
            placeholder={resolution === 'MAP_ENTITY' ? '필수 입력' : '매핑할 때만 입력'}
            disabled={saving || resolution !== 'MAP_ENTITY'}
            style={selectStyle}
          />
          <datalist id={candidateListId}>
            {item.mappingCandidates.map((candidate) => (
              <option key={candidate.localEntityId} value={candidate.localEntityId}>
                {candidate.label}{candidate.description ? ` · ${candidate.description}` : ''}
              </option>
            ))}
          </datalist>
        </label>

        <label style={{ display: 'grid', gap: '5px', color: '#334155', fontSize: '12px', fontWeight: 750 }}>
          처리 메모
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="선택 근거를 남겨 주세요"
            maxLength={500}
            disabled={saving}
            style={selectStyle}
          />
        </label>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!resolution) return;
            void onResolve(item.itemId, {
              resolution,
              ...(resolution === 'MAP_ENTITY' ? { localEntityId: localEntityId.trim() } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            });
          }}
          style={{
            minHeight: '40px',
            border: '1px solid #123d75',
            borderRadius: '9px',
            background: disabled ? '#cbd5e1' : '#0b3268',
            color: disabled ? '#64748b' : '#fff',
            padding: '8px 14px',
            fontWeight: 850,
            cursor: disabled ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {saving ? '저장 중…' : item.resolved ? '결정 변경' : '결정 저장'}
        </button>
      </div>
      {invalidMapping && (
        <p role="alert" style={{ margin: '8px 0 0', color: '#b91c1c', fontSize: '12px', fontWeight: 700 }}>
          AUBL 항목에 연결하려면 실제 항목 ID가 필요합니다.
        </p>
      )}
      {item.mappingCandidates.length > 0 && (
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '12px' }}>
          서버가 제안한 후보 {item.mappingCandidates.length}개가 입력 목록에 포함되어 있습니다. 이름만으로 확정하지 말고 팀·등번호를 함께 확인하세요.
        </p>
      )}
      {!item.itemId && (
        <p role="alert" style={{ margin: '8px 0 0', color: '#b91c1c', fontSize: '12px', fontWeight: 700 }}>
          서버 응답에 itemId가 없어 이 항목은 처리할 수 없습니다.
        </p>
      )}
    </fieldset>
  );
}

function ChangeList({ item }: { item: UniquePlaySyncDiffItem }) {
  if (item.changes.length === 0) {
    return <span style={{ color: '#64748b' }}>세부 필드 변경 없음</span>;
  }
  return (
    <div style={{ display: 'grid', gap: '7px', minWidth: '330px' }}>
      {item.changes.map((change, index) => (
        <div
          key={`${change.field}-${index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(90px, 0.65fr) minmax(100px, 1fr) 18px minmax(100px, 1fr)',
            gap: '6px',
            alignItems: 'start',
            paddingBottom: '6px',
            borderBottom: index === item.changes.length - 1 ? 'none' : '1px dashed #e2e8f0',
          }}
        >
          <strong style={{ color: '#334155', overflowWrap: 'anywhere' }}>{change.label ?? change.field}</strong>
          <span title="현재 AUBL 값" style={{ color: '#475569', overflowWrap: 'anywhere' }}>
            {formatSyncDiffValue(change.aublValue, change.field)}
          </span>
          <span aria-hidden="true" style={{ color: '#94a3b8', textAlign: 'center' }}>→</span>
          <span title="UniquePlay 원본 값" style={{ color: '#0f3b76', fontWeight: 750, overflowWrap: 'anywhere' }}>
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
      <div
        role="status"
        style={{
          padding: '32px 18px',
          textAlign: 'center',
          color: '#64748b',
          border: '1px dashed #cbd5e1',
          borderRadius: '12px',
          background: '#f8fafc',
          fontSize: '14px',
        }}
      >
        이 조건에 해당하는 변경 항목이 없습니다.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
      <table style={{ width: '100%', minWidth: '940px', borderCollapse: 'collapse', background: '#fff' }}>
        <caption style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)' }}>
          UniquePlay와 AUBL 데이터 변경 비교
        </caption>
        <thead>
          <tr>
            <th scope="col" style={headerCellStyle}>구분</th>
            <th scope="col" style={headerCellStyle}>대상</th>
            <th scope="col" style={headerCellStyle}>식별 정보</th>
            <th scope="col" style={{ ...headerCellStyle, minWidth: '390px' }}>AUBL 현재값 → UniquePlay 값</th>
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
                  <td style={cellStyle}>
                    <div style={{ display: 'grid', gap: '7px', justifyItems: 'start' }}>
                      <ActionBadge item={item} />
                      <span style={{ color: '#475569', fontWeight: 750 }}>{syncEntityLabel(item.entityType)}</span>
                    </div>
                  </td>
                  <th scope="row" style={{ ...cellStyle, textAlign: 'left' }}>
                    <div style={{ color: '#0f274f', fontSize: '14px', fontWeight: 850 }}>{item.displayName}</div>
                    {item.groupCode && <div style={{ marginTop: '4px', color: '#64748b', fontSize: '12px' }}>{item.groupCode}</div>}
                  </th>
                  <td style={cellStyle}>
                    <div style={{ display: 'grid', gap: '4px', color: '#64748b', fontSize: '12px' }}>
                      <span>외부 ID: {item.externalId ?? '—'}</span>
                      <span>AUBL ID: {item.localEntityId ?? '—'}</span>
                      {item.resolved && <strong style={{ color: '#166534' }}>처리 결정 저장됨</strong>}
                    </div>
                  </td>
                  <td style={cellStyle}><ChangeList item={item} /></td>
                </tr>
                {needsResolution && (
                  <tr>
                    <td colSpan={4} style={{ padding: '0 12px 14px', borderBottom: '1px solid #e2e8f0' }}>
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
