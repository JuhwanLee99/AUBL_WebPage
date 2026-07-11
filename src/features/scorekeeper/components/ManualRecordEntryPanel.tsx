import type React from 'react';
import type {
  PostGameBatterLine,
  PostGamePitcherLine,
  PostGameRecord,
} from '@shared/state/demoStore';

type Side = 'home' | 'away';
type ManualSubstitutionType = '' | '선발' | '타자교체' | '투수교체' | '대타' | '대주자' | '대수비';

type Props = {
  draft: PostGameRecord;
  homeTeamName: string;
  awayTeamName: string;
  notice?: string | null;
  saving?: boolean;
  applying?: boolean;
  disabled?: boolean;
  onDraftChange: (next: PostGameRecord) => void;
  onSaveDraft: () => void;
  onApply: () => void;
};

const cardStyle: React.CSSProperties = {
  border: '1px solid rgba(148,163,184,0.24)',
  borderRadius: '14px',
  background: 'rgba(15,23,42,0.55)',
  padding: '12px',
  display: 'grid',
  gap: '12px',
};

const inputStyle: React.CSSProperties = {
  borderRadius: '8px',
  border: '1px solid rgba(148,163,184,0.35)',
  padding: '6px 8px',
  background: 'rgba(15,23,42,0.78)',
  color: '#e2e8f0',
  fontSize: '12px',
};

const thStyle: React.CSSProperties = {
  borderBottom: '1px solid rgba(148,163,184,0.25)',
  color: '#94a3b8',
  fontSize: '11px',
  fontWeight: 800,
  textAlign: 'left',
  padding: '6px 4px',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '4px',
  verticalAlign: 'middle',
};

const ABBR_LABEL_KO: Record<string, string> = {
  POS: '포지션',
  PA: '타석',
  AB: '타수',
  H: '안타',
  '1B': '단타',
  '2B': '2루타',
  '3B': '3루타',
  HR: '홈런',
  BB: '볼넷',
  HBP: '사구',
  SO: '삼진',
  SAC: '희생타',
  FC: '야수선택',
  R: '득점',
  RBI: '타점',
  SB: '도루',
  IP: '이닝',
  ER: '자책',
  E: '실책',
  LOB: '잔루',
};

const renderAbbrLabel = (label: string) => {
  const koLabel = ABBR_LABEL_KO[label];
  if (!koLabel) return label;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3px' }}>
      <span>{label}</span>
      <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>({koLabel})</span>
    </span>
  );
};

const BATTER_COLUMNS: Array<{ key: keyof PostGameBatterLine; label: string; width?: string }> = [
  { key: 'order', label: '#', width: '36px' },
  { key: 'name', label: '이름', width: '95px' },
  { key: 'pos', label: 'POS', width: '54px' },
  { key: 'slot', label: '교체구분', width: '96px' },
  { key: 'pa', label: 'PA', width: '48px' },
  { key: 'ab', label: 'AB', width: '48px' },
  { key: 'h', label: 'H', width: '48px' },
  { key: 'singles', label: '1B', width: '48px' },
  { key: 'doubles', label: '2B', width: '48px' },
  { key: 'triples', label: '3B', width: '48px' },
  { key: 'hr', label: 'HR', width: '48px' },
  { key: 'bb', label: 'BB', width: '48px' },
  { key: 'hbp', label: 'HBP', width: '48px' },
  { key: 'so', label: 'SO', width: '48px' },
  { key: 'sac', label: 'SAC', width: '48px' },
  { key: 'fc', label: 'FC', width: '48px' },
  { key: 'r', label: 'R', width: '48px' },
  { key: 'rbi', label: 'RBI', width: '48px' },
  { key: 'sb', label: 'SB', width: '48px' },
];

const PITCHER_COLUMNS: Array<{ key: keyof PostGamePitcherLine; label: string; width?: string }> = [
  { key: 'name', label: '이름', width: '95px' },
  { key: 'slot', label: '교체구분', width: '96px' },
  { key: 'result', label: '결과', width: '62px' },
  { key: 'ip', label: 'IP', width: '48px' },
  { key: 'h', label: 'H', width: '48px' },
  { key: 'hr', label: 'HR', width: '48px' },
  { key: 'bb', label: 'BB', width: '48px' },
  { key: 'hbp', label: 'HBP', width: '48px' },
  { key: 'so', label: 'SO', width: '48px' },
  { key: 'r', label: 'R', width: '48px' },
  { key: 'er', label: 'ER', width: '48px' },
];

const toNumber = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const batterSubstitutionOptions: ManualSubstitutionType[] = ['', '선발', '타자교체', '대타', '대주자', '대수비'];
const pitcherSubstitutionOptions: ManualSubstitutionType[] = ['', '선발', '투수교체', '대수비', '대주자'];

const defaultBatter = (): PostGameBatterLine => ({
  name: '',
  pos: '',
  slot: '',
  order: undefined,
  pa: 0,
  ab: 0,
  h: 0,
  singles: 0,
  doubles: 0,
  triples: 0,
  hr: 0,
  bb: 0,
  hbp: 0,
  so: 0,
  sac: 0,
  fc: 0,
  r: 0,
  rbi: 0,
  sb: 0,
});

const defaultPitcher = (): PostGamePitcherLine => ({
  name: '',
  slot: '',
  result: '',
  ip: 0,
  h: 0,
  hr: 0,
  bb: 0,
  hbp: 0,
  so: 0,
  r: 0,
  er: 0,
});

export default function ManualRecordEntryPanel({
  draft,
  homeTeamName,
  awayTeamName,
  notice,
  saving = false,
  applying = false,
  disabled = false,
  onDraftChange,
  onSaveDraft,
  onApply,
}: Props) {
  const setDraft = (updater: (current: PostGameRecord) => PostGameRecord) => {
    onDraftChange(updater(draft));
  };

  const updateLineScoreCell = (side: Side, index: number, raw: string) => {
    setDraft((current) => {
      const next = {
        ...current,
        lineScore: {
          ...current.lineScore,
          home: [...current.lineScore.home],
          away: [...current.lineScore.away],
        },
      };
      next.lineScore[side][index] = toNumber(raw);
      return next;
    });
  };

  const addInning = () => {
    setDraft((current) => {
      const last = current.lineScore.innings[current.lineScore.innings.length - 1] ?? 0;
      return {
        ...current,
        lineScore: {
          innings: [...current.lineScore.innings, last + 1],
          home: [...current.lineScore.home, 0],
          away: [...current.lineScore.away, 0],
        },
      };
    });
  };

  const removeInning = () => {
    if (draft.lineScore.innings.length <= 1) return;
    setDraft((current) => ({
      ...current,
      lineScore: {
        innings: current.lineScore.innings.slice(0, -1),
        home: current.lineScore.home.slice(0, -1),
        away: current.lineScore.away.slice(0, -1),
      },
    }));
  };

  const updateTotals = (side: Side, field: 'runs' | 'hits' | 'errors' | 'lob', raw: string) => {
    setDraft((current) => ({
      ...current,
      totals: {
        ...current.totals,
        [side]: {
          ...current.totals[side],
          [field]: toNumber(raw),
        },
      },
    }));
  };

  const updateBatter = (side: Side, index: number, field: keyof PostGameBatterLine, raw: string) => {
    setDraft((current) => {
      const rows = [...(current.batters?.[side] ?? [])];
      const row = { ...(rows[index] ?? defaultBatter()) };
      if (field === 'name' || field === 'pos' || field === 'slot') {
        (row as Record<string, unknown>)[field] = raw;
      } else if (field === 'order') {
        (row as Record<string, unknown>)[field] = raw.trim() === '' ? undefined : toNumber(raw);
      } else {
        (row as Record<string, unknown>)[field] = toNumber(raw);
      }
      rows[index] = row;
      return {
        ...current,
        batters: {
          home: current.batters?.home ?? [],
          away: current.batters?.away ?? [],
          [side]: rows,
        },
      };
    });
  };

  const addBatter = (side: Side) => {
    setDraft((current) => ({
      ...current,
      batters: {
        home: current.batters?.home ?? [],
        away: current.batters?.away ?? [],
        [side]: [...(current.batters?.[side] ?? []), defaultBatter()],
      },
    }));
  };

  const moveBatterRow = (side: Side, index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const rows = [...(current.batters?.[side] ?? [])];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= rows.length) return current;
      const [target] = rows.splice(index, 1);
      rows.splice(nextIndex, 0, target);
      return {
        ...current,
        batters: {
          home: current.batters?.home ?? [],
          away: current.batters?.away ?? [],
          [side]: rows,
        },
      };
    });
  };

  const insertBatterBelow = (side: Side, index: number) => {
    setDraft((current) => {
      const rows = [...(current.batters?.[side] ?? [])];
      const source = rows[index] ?? defaultBatter();
      const inserted: PostGameBatterLine = {
        ...defaultBatter(),
        order: source.order,
        pos: source.pos,
        slot: '타자교체',
      };
      rows.splice(index + 1, 0, inserted);
      return {
        ...current,
        batters: {
          home: current.batters?.home ?? [],
          away: current.batters?.away ?? [],
          [side]: rows,
        },
      };
    });
  };

  const removeBatter = (side: Side, index: number) => {
    setDraft((current) => ({
      ...current,
      batters: {
        home: current.batters?.home ?? [],
        away: current.batters?.away ?? [],
        [side]: (current.batters?.[side] ?? []).filter((_, idx) => idx !== index),
      },
    }));
  };

  const updatePitcher = (side: Side, index: number, field: keyof PostGamePitcherLine, raw: string) => {
    setDraft((current) => {
      const rows = [...(current.pitchers?.[side] ?? [])];
      const row = { ...(rows[index] ?? defaultPitcher()) };
      if (field === 'name' || field === 'result' || field === 'slot') {
        (row as Record<string, unknown>)[field] = raw;
      } else {
        (row as Record<string, unknown>)[field] = toNumber(raw);
      }
      rows[index] = row;
      return {
        ...current,
        pitchers: {
          home: current.pitchers?.home ?? [],
          away: current.pitchers?.away ?? [],
          [side]: rows,
        },
      };
    });
  };

  const addPitcher = (side: Side) => {
    setDraft((current) => ({
      ...current,
      pitchers: {
        home: current.pitchers?.home ?? [],
        away: current.pitchers?.away ?? [],
        [side]: [...(current.pitchers?.[side] ?? []), defaultPitcher()],
      },
    }));
  };

  const removePitcher = (side: Side, index: number) => {
    setDraft((current) => ({
      ...current,
      pitchers: {
        home: current.pitchers?.home ?? [],
        away: current.pitchers?.away ?? [],
        [side]: (current.pitchers?.[side] ?? []).filter((_, idx) => idx !== index),
      },
    }));
  };

  return (
    <section style={{ display: 'grid', gap: '14px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '3px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#e2e8f0' }}>수기 기록 입력</h3>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
            실시간 버튼 입력 대신 타자/투수 표를 직접 작성해 저장합니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={disabled || saving || applying}
            style={{
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(148,163,184,0.14)',
              color: '#e2e8f0',
              fontWeight: 800,
              padding: '8px 12px',
              cursor: disabled || saving || applying ? 'not-allowed' : 'pointer',
              opacity: disabled || saving || applying ? 0.6 : 1,
            }}
          >
            {saving ? '중간 저장 중...' : '중간 저장'}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={disabled || saving || applying}
            style={{
              borderRadius: '10px',
              border: '1px solid rgba(34,197,94,0.55)',
              background: 'rgba(34,197,94,0.18)',
              color: '#86efac',
              fontWeight: 900,
              padding: '8px 12px',
              cursor: disabled || saving || applying ? 'not-allowed' : 'pointer',
              opacity: disabled || saving || applying ? 0.6 : 1,
            }}
          >
            {applying ? '기록 최종 반영 중...' : '기록 최종 반영'}
          </button>
        </div>
      </header>

      {notice ? (
        <div
          style={{
            borderRadius: '10px',
            border: '1px solid rgba(56,189,248,0.35)',
            background: 'rgba(56,189,248,0.1)',
            color: '#67e8f9',
            fontSize: '12px',
            fontWeight: 700,
            padding: '8px 10px',
          }}
        >
          {notice}
        </div>
      ) : null}

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, color: '#e2e8f0' }}>라인스코어</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={addInning} disabled={disabled} style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}>
              + 이닝
            </button>
            <button type="button" onClick={removeInning} disabled={disabled} style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}>
              - 이닝
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>팀</th>
                {draft.lineScore.innings.map((inning) => (
                  <th key={inning} style={{ ...thStyle, textAlign: 'center' }}>
                    {inning}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['away', 'home'] as const).map((side) => (
                <tr key={side}>
                  <td style={{ ...tdStyle, color: '#cbd5e1', fontWeight: 700 }}>
                    {side === 'home' ? homeTeamName : awayTeamName}
                  </td>
                  {draft.lineScore[side].map((value, index) => (
                    <td key={`${side}-${index}`} style={tdStyle}>
                      <input
                        value={String(value ?? 0)}
                        onChange={(event) => updateLineScoreCell(side, index, event.target.value)}
                        disabled={disabled}
                        style={{ ...inputStyle, width: '48px', textAlign: 'center' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>팀 합계</span>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>팀</th>
                <th style={thStyle}>{renderAbbrLabel('R')}</th>
                <th style={thStyle}>{renderAbbrLabel('H')}</th>
                <th style={thStyle}>{renderAbbrLabel('E')}</th>
                <th style={thStyle}>{renderAbbrLabel('LOB')}</th>
              </tr>
            </thead>
            <tbody>
              {(['away', 'home'] as const).map((side) => (
                <tr key={`${side}-totals`}>
                  <td style={{ ...tdStyle, color: '#cbd5e1', fontWeight: 700 }}>
                    {side === 'home' ? homeTeamName : awayTeamName}
                  </td>
                  {(['runs', 'hits', 'errors', 'lob'] as const).map((field) => (
                    <td key={`${side}-${field}`} style={tdStyle}>
                      <input
                        value={String(draft.totals[side][field] ?? 0)}
                        onChange={(event) => updateTotals(side, field, event.target.value)}
                        disabled={disabled}
                        style={{ ...inputStyle, width: '64px' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(['away', 'home'] as const).map((side) => (
        <div key={`${side}-batters`} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
              {side === 'home' ? homeTeamName : awayTeamName} 타자 기록
            </span>
            <button type="button" onClick={() => addBatter(side)} disabled={disabled} style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}>
              + 행 추가
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {BATTER_COLUMNS.map((col) => (
                    <th key={`${side}-${col.key}`} style={{ ...thStyle, width: col.width }}>
                      {renderAbbrLabel(col.label)}
                    </th>
                  ))}
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {(draft.batters?.[side] ?? []).map((row, rowIndex) => (
                  <tr key={`${side}-batter-${rowIndex}`}>
                    {BATTER_COLUMNS.map((col) => (
                      <td key={`${side}-${rowIndex}-${col.key}`} style={tdStyle}>
                        {col.key === 'order' ? (
                          <input
                            value={row.order != null ? String(row.order) : ''}
                            onChange={(event) => updateBatter(side, rowIndex, 'order', event.target.value)}
                            disabled={disabled}
                            style={{ ...inputStyle, width: col.width ?? '100%', textAlign: 'center' }}
                          />
                        ) : col.key === 'slot' ? (
                          <select
                            value={row.slot ?? ''}
                            onChange={(event) => updateBatter(side, rowIndex, 'slot', event.target.value)}
                            disabled={disabled}
                            style={{ ...inputStyle, width: col.width ?? '100%' }}
                          >
                            {batterSubstitutionOptions.map((option) => (
                              <option key={`batter-slot-${option || 'none'}`} value={option}>
                                {option || '일반'}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={row[col.key] != null ? String(row[col.key]) : ''}
                            onChange={(event) => updateBatter(side, rowIndex, col.key, event.target.value)}
                            disabled={disabled}
                            style={{ ...inputStyle, width: col.width ?? '100%' }}
                          />
                        )}
                      </td>
                    ))}
                    <td style={tdStyle}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => moveBatterRow(side, rowIndex, -1)}
                          disabled={disabled || rowIndex === 0}
                          style={{
                            ...inputStyle,
                            padding: '4px 6px',
                            textAlign: 'center',
                            cursor: disabled || rowIndex === 0 ? 'not-allowed' : 'pointer',
                            opacity: disabled || rowIndex === 0 ? 0.6 : 1,
                          }}
                          title="위로 이동"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBatterRow(side, rowIndex, 1)}
                          disabled={disabled || rowIndex === (draft.batters?.[side]?.length ?? 1) - 1}
                          style={{
                            ...inputStyle,
                            padding: '4px 6px',
                            textAlign: 'center',
                            cursor:
                              disabled || rowIndex === (draft.batters?.[side]?.length ?? 1) - 1
                                ? 'not-allowed'
                                : 'pointer',
                            opacity: disabled || rowIndex === (draft.batters?.[side]?.length ?? 1) - 1 ? 0.6 : 1,
                          }}
                          title="아래로 이동"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => insertBatterBelow(side, rowIndex)}
                          disabled={disabled}
                          style={{
                            ...inputStyle,
                            gridColumn: 'span 2',
                            padding: '4px 6px',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                          title="아래 교체행 추가"
                        >
                          아래 교체행 +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBatter(side, rowIndex)}
                          disabled={disabled}
                          style={{
                            ...inputStyle,
                            gridColumn: 'span 2',
                            color: '#fca5a5',
                            border: '1px solid rgba(239,68,68,0.55)',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {(['away', 'home'] as const).map((side) => (
        <div key={`${side}-pitchers`} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
              {side === 'home' ? homeTeamName : awayTeamName} 투수 기록
            </span>
            <button type="button" onClick={() => addPitcher(side)} disabled={disabled} style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}>
              + 행 추가
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {PITCHER_COLUMNS.map((col) => (
                    <th key={`${side}-${col.key}`} style={{ ...thStyle, width: col.width }}>
                      {renderAbbrLabel(col.label)}
                    </th>
                  ))}
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {(draft.pitchers?.[side] ?? []).map((row, rowIndex) => (
                  <tr key={`${side}-pitcher-${rowIndex}`}>
                    {PITCHER_COLUMNS.map((col) => (
                      <td key={`${side}-pitcher-${rowIndex}-${col.key}`} style={tdStyle}>
                        {col.key === 'slot' ? (
                          <select
                            value={row.slot ?? ''}
                            onChange={(event) => updatePitcher(side, rowIndex, 'slot', event.target.value)}
                            disabled={disabled}
                            style={{ ...inputStyle, width: col.width ?? '100%' }}
                          >
                            {pitcherSubstitutionOptions.map((option) => (
                              <option key={`pitcher-slot-${option || 'none'}`} value={option}>
                                {option || '일반'}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={row[col.key] != null ? String(row[col.key]) : ''}
                            onChange={(event) => updatePitcher(side, rowIndex, col.key, event.target.value)}
                            disabled={disabled}
                            style={{ ...inputStyle, width: col.width ?? '100%' }}
                          />
                        )}
                      </td>
                    ))}
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => removePitcher(side, rowIndex)}
                        disabled={disabled}
                        style={{
                          ...inputStyle,
                          color: '#fca5a5',
                          border: '1px solid rgba(239,68,68,0.55)',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={cardStyle}>
        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>메모</span>
        <textarea
          value={draft.note ?? ''}
          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
          rows={3}
          disabled={disabled}
          style={{
            ...inputStyle,
            width: '100%',
            minHeight: '90px',
            resize: 'vertical',
            lineHeight: 1.45,
            fontFamily: 'inherit',
          }}
          placeholder="경기 메모"
        />
      </div>
    </section>
  );
}
