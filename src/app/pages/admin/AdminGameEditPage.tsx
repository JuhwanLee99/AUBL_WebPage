import { useEffect, useState, useCallback, type CSSProperties, type ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '../../../shared/firebase/client';
import { triggerMatchImport } from '../../../core/api/backendClient';
import { useAdmin } from '../../../shared/auth/useAdmin';
import type {
  MatchSchedule,
  PlayerSlot,
  PostGameRecord,
  PostGameBatterLine,
  PostGamePitcherLine,
} from '../../../shared/state/demoStore';

// ─── 스타일 상수 ──────────────────────────────────────────────────────────────

const cardStyle: CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(30,41,59,0.78))',
  padding: '20px',
  boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
};

const inputStyle: CSSProperties = {
  padding: '6px 8px',
  borderRadius: '8px',
  border: '1px solid rgba(148,163,184,0.3)',
  background: 'rgba(15,23,42,0.6)',
  color: '#e2e8f0',
  fontSize: '13px',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: CSSProperties = {
  color: '#cbd5e1',
  fontWeight: 800,
  fontSize: '13px',
  marginBottom: '6px',
  display: 'block',
};

const thStyle: CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  fontWeight: 800,
  padding: '6px 4px',
  textAlign: 'left',
  borderBottom: '1px solid rgba(148,163,184,0.2)',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '4px',
  verticalAlign: 'middle',
};

const btnPrimary: CSSProperties = {
  padding: '10px 20px',
  borderRadius: '10px',
  border: 'none',
  background: '#3b82f6',
  color: '#fff',
  fontWeight: 800,
  fontSize: '14px',
  cursor: 'pointer',
};

const btnSecondary: CSSProperties = {
  padding: '10px 20px',
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.35)',
  background: 'rgba(15,23,42,0.65)',
  color: '#cbd5e1',
  fontWeight: 800,
  fontSize: '14px',
  cursor: 'pointer',
};

const btnDanger: CSSProperties = {
  padding: '10px 20px',
  borderRadius: '10px',
  border: 'none',
  background: 'rgba(234,179,8,0.85)',
  color: '#1e1b00',
  fontWeight: 800,
  fontSize: '14px',
  cursor: 'pointer',
};

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function toNum(v: string): number | undefined {
  if (v === '' || v === '-') return undefined;
  const n = Number(v);
  return isFinite(n) ? n : undefined;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

// ─── 라인업 편집 섹션 ─────────────────────────────────────────────────────────

interface LineupEditorProps {
  title: string;
  slots: PlayerSlot[];
  onChange: (updated: PlayerSlot[]) => void;
}

function LineupEditor({ title, slots, onChange }: LineupEditorProps) {
  const update = (index: number, field: keyof PlayerSlot, value: string) => {
    const next = slots.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange(next);
  };

  return (
    <div>
      <label style={labelStyle}>{title}</label>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={thStyle}>타순</th>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>등번호</th>
              <th style={thStyle}>포지션</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, i) => (
              <tr key={i}>
                <td style={{ ...tdStyle, color: '#64748b', width: '36px', textAlign: 'center' }}>
                  {slot.order ?? i + 1}
                </td>
                <td style={tdStyle}>
                  <input
                    style={inputStyle}
                    value={slot.name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => update(i, 'name', e.target.value)}
                    placeholder="이름"
                  />
                </td>
                <td style={{ ...tdStyle, width: '70px' }}>
                  <input
                    style={inputStyle}
                    value={slot.number}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => update(i, 'number', e.target.value)}
                    placeholder="#"
                  />
                </td>
                <td style={{ ...tdStyle, width: '70px' }}>
                  <input
                    style={inputStyle}
                    value={slot.pos}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => update(i, 'pos', e.target.value)}
                    placeholder="POS"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 타자 박스스코어 편집 ────────────────────────────────────────────────────

const BATTER_COLS: { key: keyof PostGameBatterLine; label: string; width?: string }[] = [
  { key: 'name', label: '이름', width: '80px' },
  { key: 'pos', label: 'POS', width: '50px' },
  { key: 'ab', label: '타수', width: '46px' },
  { key: 'h', label: '안타', width: '46px' },
  { key: 'doubles', label: '2루', width: '46px' },
  { key: 'triples', label: '3루', width: '46px' },
  { key: 'hr', label: '홈런', width: '46px' },
  { key: 'bb', label: '볼넷', width: '46px' },
  { key: 'hbp', label: '사구', width: '46px' },
  { key: 'so', label: '삼진', width: '46px' },
  { key: 'sac', label: '희생', width: '46px' },
  { key: 'r', label: '득점', width: '46px' },
  { key: 'rbi', label: '타점', width: '46px' },
  { key: 'sb', label: '도루', width: '46px' },
];

interface BatterEditorProps {
  title: string;
  batters: PostGameBatterLine[];
  onChange: (updated: PostGameBatterLine[]) => void;
}

function BatterEditor({ title, batters, onChange }: BatterEditorProps) {
  const update = (index: number, field: keyof PostGameBatterLine, raw: string) => {
    const next = batters.map((b, i) => {
      if (i !== index) return b;
      if (field === 'name' || field === 'pos' || field === 'slot') return { ...b, [field]: raw };
      return { ...b, [field]: toNum(raw) };
    });
    onChange(next);
  };

  const addRow = () => {
    onChange([...batters, { name: '', pos: '', ab: 0, h: 0 }]);
  };

  const removeRow = (index: number) => {
    onChange(batters.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>{title}</label>
        <button type="button" onClick={addRow} style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px' }}>
          + 행 추가
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              {BATTER_COLS.map((col) => (
                <th key={col.key} style={{ ...thStyle, width: col.width }}>
                  {col.label}
                </th>
              ))}
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {batters.map((b, i) => (
              <tr key={i}>
                {BATTER_COLS.map((col) => (
                  <td key={col.key} style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: col.width ?? '100%', minWidth: '40px' }}
                      value={b[col.key] !== undefined && b[col.key] !== null ? String(b[col.key]) : ''}
                      onChange={(e) => update(i, col.key, e.target.value)}
                    />
                  </td>
                ))}
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'rgba(239,68,68,0.2)',
                      color: '#f87171',
                      fontSize: '12px',
                      cursor: 'pointer',
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
  );
}

// ─── 투수 박스스코어 편집 ────────────────────────────────────────────────────

const PITCHER_COLS: { key: keyof PostGamePitcherLine; label: string; width?: string }[] = [
  { key: 'name', label: '이름', width: '80px' },
  { key: 'result', label: '결과', width: '50px' },
  { key: 'ip', label: '이닝', width: '50px' },
  { key: 'bf', label: '타자', width: '46px' },
  { key: 'h', label: '피안타', width: '52px' },
  { key: 'hr', label: '피홈런', width: '52px' },
  { key: 'bb', label: '볼넷', width: '46px' },
  { key: 'hbp', label: '사구', width: '46px' },
  { key: 'so', label: '삼진', width: '46px' },
  { key: 'r', label: '실점', width: '46px' },
  { key: 'er', label: '자책', width: '46px' },
  { key: 'pitches', label: '투구', width: '46px' },
];

interface PitcherEditorProps {
  title: string;
  pitchers: PostGamePitcherLine[];
  onChange: (updated: PostGamePitcherLine[]) => void;
}

function PitcherEditor({ title, pitchers, onChange }: PitcherEditorProps) {
  const update = (index: number, field: keyof PostGamePitcherLine, raw: string) => {
    const next = pitchers.map((p, i) => {
      if (i !== index) return p;
      if (field === 'name' || field === 'result') return { ...p, [field]: raw };
      return { ...p, [field]: toNum(raw) };
    });
    onChange(next);
  };

  const addRow = () => {
    onChange([...pitchers, { name: '', ip: 0 }]);
  };

  const removeRow = (index: number) => {
    onChange(pitchers.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>{title}</label>
        <button type="button" onClick={addRow} style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px' }}>
          + 행 추가
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              {PITCHER_COLS.map((col) => (
                <th key={col.key} style={{ ...thStyle, width: col.width }}>
                  {col.label}
                </th>
              ))}
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {pitchers.map((p, i) => (
              <tr key={i}>
                {PITCHER_COLS.map((col) => (
                  <td key={col.key} style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: col.width ?? '100%', minWidth: '40px' }}
                      value={p[col.key] !== undefined && p[col.key] !== null ? String(p[col.key]) : ''}
                      onChange={(e) => update(i, col.key, e.target.value)}
                    />
                  </td>
                ))}
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'rgba(239,68,68,0.2)',
                      color: '#f87171',
                      fontSize: '12px',
                      cursor: 'pointer',
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
  );
}

// ─── 라인스코어 편집 ─────────────────────────────────────────────────────────

interface LineScoreEditorProps {
  innings: number[];
  home: number[];
  away: number[];
  onChange: (innings: number[], home: number[], away: number[]) => void;
}

function LineScoreEditor({ innings, home, away, onChange }: LineScoreEditorProps) {
  const updateCell = (side: 'home' | 'away', idx: number, raw: string) => {
    const arr = side === 'home' ? [...home] : [...away];
    arr[idx] = toNum(raw) ?? 0;
    if (side === 'home') onChange(innings, arr, away);
    else onChange(innings, home, arr);
  };

  const addInning = () => {
    const nextInning = innings.length > 0 ? innings[innings.length - 1] + 1 : 1;
    onChange([...innings, nextInning], [...home, 0], [...away, 0]);
  };

  const removeLastInning = () => {
    if (innings.length === 0) return;
    onChange(innings.slice(0, -1), home.slice(0, -1), away.slice(0, -1));
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>라인스코어</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" onClick={addInning} style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px' }}>
            + 이닝
          </button>
          <button type="button" onClick={removeLastInning} style={{ ...btnSecondary, padding: '4px 12px', fontSize: '12px', color: '#f87171' }}>
            - 이닝
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '60px' }}>팀</th>
              {innings.map((n) => (
                <th key={n} style={{ ...thStyle, width: '40px', textAlign: 'center' }}>
                  {n}
                </th>
              ))}
              <th style={{ ...thStyle, width: '40px', textAlign: 'center', color: '#94a3b8' }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {(['away', 'home'] as const).map((side) => {
              const arr = side === 'home' ? home : away;
              const total = arr.reduce((a, b) => a + num(b), 0);
              return (
                <tr key={side}>
                  <td style={{ ...tdStyle, color: '#94a3b8', fontWeight: 700 }}>
                    {side === 'home' ? '홈' : '원정'}
                  </td>
                  {innings.map((_, idx) => (
                    <td key={idx} style={tdStyle}>
                      <input
                        style={{ ...inputStyle, width: '38px', textAlign: 'center' }}
                        value={arr[idx] !== undefined ? String(arr[idx]) : '0'}
                        onChange={(e) => updateCell(side, idx, e.target.value)}
                      />
                    </td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#e2e8f0' }}>
                    {total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 합계(Totals) 편집 ───────────────────────────────────────────────────────

type TotalSide = { runs: number; hits: number; errors: number; lob?: number };

interface TotalsEditorProps {
  home: TotalSide;
  away: TotalSide;
  onChange: (home: TotalSide, away: TotalSide) => void;
}

function TotalsEditor({ home, away, onChange }: TotalsEditorProps) {
  const update = (side: 'home' | 'away', field: keyof TotalSide, raw: string) => {
    const val = toNum(raw) ?? 0;
    if (side === 'home') onChange({ ...home, [field]: val }, away);
    else onChange(home, { ...away, [field]: val });
  };

  const FIELDS: { key: keyof TotalSide; label: string }[] = [
    { key: 'runs', label: '득점(R)' },
    { key: 'hits', label: '안타(H)' },
    { key: 'errors', label: '실책(E)' },
    { key: 'lob', label: '잔루(LOB)' },
  ];

  return (
    <div>
      <label style={labelStyle}>합계</label>
      <table style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '60px' }}>팀</th>
            {FIELDS.map((f) => (
              <th key={f.key} style={{ ...thStyle, width: '80px' }}>{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['away', 'home'] as const).map((side) => {
            const totals = side === 'home' ? home : away;
            return (
              <tr key={side}>
                <td style={{ ...tdStyle, color: '#94a3b8', fontWeight: 700 }}>
                  {side === 'home' ? '홈' : '원정'}
                </td>
                {FIELDS.map((f) => (
                  <td key={f.key} style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: '76px' }}
                      value={totals[f.key] !== undefined ? String(totals[f.key]) : ''}
                      onChange={(e) => update(side, f.key, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function AdminGameEditPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();

  const [match, setMatch] = useState<MatchSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 라인업 draft
  const [homeLineup, setHomeLineup] = useState<PlayerSlot[]>([]);
  const [awayLineup, setAwayLineup] = useState<PlayerSlot[]>([]);
  const [homeBench, setHomeBench] = useState<PlayerSlot[]>([]);
  const [awayBench, setAwayBench] = useState<PlayerSlot[]>([]);
  const [lineupSaving, setLineupSaving] = useState(false);
  const [lineupSavedAt, setLineupSavedAt] = useState<Date | null>(null);

  // 박스스코어 draft
  const [homeBatters, setHomeBatters] = useState<PostGameBatterLine[]>([]);
  const [awayBatters, setAwayBatters] = useState<PostGameBatterLine[]>([]);
  const [homePitchers, setHomePitchers] = useState<PostGamePitcherLine[]>([]);
  const [awayPitchers, setAwayPitchers] = useState<PostGamePitcherLine[]>([]);
  const [lineScoreInnings, setLineScoreInnings] = useState<number[]>([]);
  const [lineScoreHome, setLineScoreHome] = useState<number[]>([]);
  const [lineScoreAway, setLineScoreAway] = useState<number[]>([]);
  const [totalsHome, setTotalsHome] = useState<{ runs: number; hits: number; errors: number; lob?: number }>({ runs: 0, hits: 0, errors: 0 });
  const [totalsAway, setTotalsAway] = useState<{ runs: number; hits: number; errors: number; lob?: number }>({ runs: 0, hits: 0, errors: 0 });
  const [postGameNote, setPostGameNote] = useState('');
  const [boxSaving, setBoxSaving] = useState(false);
  const [boxSavedAt, setBoxSavedAt] = useState<Date | null>(null);

  // 백엔드 임포트
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // 데이터 로드
  useEffect(() => {
    if (!matchId) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(firestore, 'matches', matchId));
        if (!snap.exists()) {
          setError('경기 데이터를 찾을 수 없습니다.');
          return;
        }
        const data = { id: snap.id, ...(snap.data() as Omit<MatchSchedule, 'id'>) };
        setMatch(data);

        // 라인업 초기화
        setHomeLineup(data.lineups?.home ?? []);
        setAwayLineup(data.lineups?.away ?? []);
        setHomeBench(data.benches?.home ?? []);
        setAwayBench(data.benches?.away ?? []);

        // 박스스코어 초기화
        const pg = data.postGame;
        setHomeBatters(pg?.batters?.home ?? []);
        setAwayBatters(pg?.batters?.away ?? []);
        setHomePitchers(pg?.pitchers?.home ?? []);
        setAwayPitchers(pg?.pitchers?.away ?? []);
        setLineScoreInnings(pg?.lineScore?.innings ?? []);
        setLineScoreHome(pg?.lineScore?.home ?? []);
        setLineScoreAway(pg?.lineScore?.away ?? []);
        setTotalsHome(pg?.totals?.home ?? { runs: 0, hits: 0, errors: 0 });
        setTotalsAway(pg?.totals?.away ?? { runs: 0, hits: 0, errors: 0 });
        setPostGameNote(pg?.note ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [matchId]);

  // 라인업 저장
  const saveLineup = useCallback(async () => {
    if (!matchId) return;
    setLineupSaving(true);
    try {
      await setDoc(
        doc(firestore, 'matches', matchId),
        {
          lineups: { home: homeLineup, away: awayLineup },
          benches: { home: homeBench, away: awayBench },
        },
        { merge: true },
      );
      setLineupSavedAt(new Date());
    } finally {
      setLineupSaving(false);
    }
  }, [matchId, homeLineup, awayLineup, homeBench, awayBench]);

  // 박스스코어 저장
  const saveBoxScore = useCallback(async () => {
    if (!matchId) return;
    setBoxSaving(true);
    try {
      const postGame: PostGameRecord = {
        lineScore: {
          innings: lineScoreInnings,
          home: lineScoreHome,
          away: lineScoreAway,
        },
        totals: {
          home: totalsHome,
          away: totalsAway,
        },
        batters: { home: homeBatters, away: awayBatters },
        pitchers: { home: homePitchers, away: awayPitchers },
        note: postGameNote || undefined,
      };
      await setDoc(doc(firestore, 'matches', matchId), { postGame }, { merge: true });
      setBoxSavedAt(new Date());
    } finally {
      setBoxSaving(false);
    }
  }, [
    matchId,
    lineScoreInnings,
    lineScoreHome,
    lineScoreAway,
    totalsHome,
    totalsAway,
    homeBatters,
    awayBatters,
    homePitchers,
    awayPitchers,
    postGameNote,
  ]);

  // 백엔드 재임포트
  const handleImport = async () => {
    if (!matchId) return;
    setImporting(true);
    setImportResult(null);
    try {
      await triggerMatchImport(matchId);
      setImportResult({ ok: true, msg: '백엔드 재임포트 요청이 완료되었습니다.' });
    } catch (err) {
      setImportResult({ ok: false, msg: err instanceof Error ? err.message : '재임포트 요청 실패' });
    } finally {
      setImporting(false);
    }
  };

  // 라인스코어 변경 핸들러
  const handleLineScoreChange = (innings: number[], home: number[], away: number[]) => {
    setLineScoreInnings(innings);
    setLineScoreHome(home);
    setLineScoreAway(away);
  };

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '20px' }}>불러오는 중...</div>;
  }

  if (error || !match) {
    return (
      <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}>
        {error ?? '경기 데이터를 찾을 수 없습니다.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* 뒤로 가기 */}
      <button
        type="button"
        onClick={() => navigate('/admin/games')}
        style={{ ...btnSecondary, width: 'fit-content', fontSize: '13px', padding: '7px 14px' }}
      >
        ← 목록으로
      </button>

      {/* 경기 기본 정보 */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>경기 정보</h3>
        <div style={{ display: 'grid', gap: '6px' }}>
          <div style={{ color: '#94a3b8', fontSize: '13px' }}>{formatDate(match.startTime)} · {match.venue}</div>
          <div style={{ color: '#e2e8f0', fontSize: '18px', fontWeight: 900 }}>
            {match.awayTeamName} <span style={{ color: '#64748b' }}>@</span> {match.homeTeamName}
          </div>
          <div style={{ color: '#cbd5e1', fontSize: '16px', fontWeight: 800 }}>
            {match.awayScore ?? '-'} : {match.homeScore ?? '-'}
          </div>
          <div style={{ color: '#64748b', fontSize: '12px' }}>ID: {match.id}</div>
        </div>
      </div>

      {/* ── 라인업 수정 ── */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 4px', color: '#e2e8f0' }}>라인업 수정</h3>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '13px' }}>
          선수 이름, 등번호, 포지션을 수정합니다. 수정 후 반드시 저장하세요.
        </p>

        <div style={{ display: 'grid', gap: '24px' }}>
          <LineupEditor
            title={`홈팀 선발 라인업 — ${match.homeTeamName}`}
            slots={homeLineup}
            onChange={setHomeLineup}
          />
          <LineupEditor
            title={`원정팀 선발 라인업 — ${match.awayTeamName}`}
            slots={awayLineup}
            onChange={setAwayLineup}
          />
          {(homeBench.length > 0 || awayBench.length > 0) && (
            <>
              <LineupEditor
                title={`홈팀 벤치 — ${match.homeTeamName}`}
                slots={homeBench}
                onChange={setHomeBench}
              />
              <LineupEditor
                title={`원정팀 벤치 — ${match.awayTeamName}`}
                slots={awayBench}
                onChange={setAwayBench}
              />
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => { void saveLineup(); }}
            disabled={lineupSaving}
            style={{ ...btnPrimary, opacity: lineupSaving ? 0.6 : 1 }}
          >
            {lineupSaving ? '저장 중...' : '라인업 저장'}
          </button>
          {lineupSavedAt && (
            <span style={{ color: '#4ade80', fontSize: '13px', fontWeight: 700 }}>
              ✓ {lineupSavedAt.toLocaleTimeString()} 저장됨
            </span>
          )}
        </div>
      </div>

      {/* ── 박스스코어 수정 ── */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 4px', color: '#e2e8f0' }}>박스스코어 수정</h3>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '13px' }}>
          타자 · 투수 기록과 라인스코어를 직접 수정합니다.
        </p>

        <div style={{ display: 'grid', gap: '28px' }}>
          <LineScoreEditor
            innings={lineScoreInnings}
            home={lineScoreHome}
            away={lineScoreAway}
            onChange={handleLineScoreChange}
          />

          <TotalsEditor
            home={totalsHome}
            away={totalsAway}
            onChange={(h, a) => { setTotalsHome(h); setTotalsAway(a); }}
          />

          <BatterEditor
            title={`홈팀 타자 기록 — ${match.homeTeamName}`}
            batters={homeBatters}
            onChange={setHomeBatters}
          />
          <BatterEditor
            title={`원정팀 타자 기록 — ${match.awayTeamName}`}
            batters={awayBatters}
            onChange={setAwayBatters}
          />

          <PitcherEditor
            title={`홈팀 투수 기록 — ${match.homeTeamName}`}
            pitchers={homePitchers}
            onChange={setHomePitchers}
          />
          <PitcherEditor
            title={`원정팀 투수 기록 — ${match.awayTeamName}`}
            pitchers={awayPitchers}
            onChange={setAwayPitchers}
          />

          <div>
            <label style={labelStyle}>메모 (노트)</label>
            <textarea
              value={postGameNote}
              onChange={(e) => setPostGameNote(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.6', fontFamily: 'inherit' }}
              placeholder="경기 관련 메모 (선택)"
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => { void saveBoxScore(); }}
            disabled={boxSaving}
            style={{ ...btnPrimary, opacity: boxSaving ? 0.6 : 1 }}
          >
            {boxSaving ? '저장 중...' : '박스스코어 저장'}
          </button>
          {boxSavedAt && (
            <span style={{ color: '#4ade80', fontSize: '13px', fontWeight: 700 }}>
              ✓ {boxSavedAt.toLocaleTimeString()} 저장됨
            </span>
          )}
        </div>
      </div>

      {/* ── 백엔드 반영 ── */}
      {isAdmin && (
        <div
          style={{
            ...cardStyle,
            borderColor: 'rgba(234,179,8,0.35)',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(41,35,15,0.78))',
          }}
        >
          <h3 style={{ margin: '0 0 4px', color: '#fde68a' }}>백엔드 반영</h3>
          <p style={{ margin: '0 0 16px', color: '#92400e', fontSize: '13px' }}>
            Firestore 저장 후 아래 버튼을 눌러야 랭킹 · 기록 페이지에 수정 내용이 반영됩니다.
          </p>

          {importResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                marginBottom: '14px',
                background: importResult.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${importResult.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                color: importResult.ok ? '#4ade80' : '#f87171',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              {importResult.msg}
            </div>
          )}

          <button
            type="button"
            onClick={() => { void handleImport(); }}
            disabled={importing}
            style={{ ...btnDanger, opacity: importing ? 0.6 : 1 }}
          >
            {importing ? '처리 중...' : '백엔드 재임포트 실행'}
          </button>
        </div>
      )}
    </div>
  );
}
