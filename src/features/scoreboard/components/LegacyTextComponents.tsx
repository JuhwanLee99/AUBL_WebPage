import { useState, useMemo, useEffect, useRef } from 'react';
type Half = 'top' | 'bottom' | null;

export type BatterLine = {
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  doubles: number;
  triples: number;
  bb: number;
  hbp: number;
  so: number;
  sac: number;
};

export type PitcherLine = {
  bf: number;
  outs: number;
  hits: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  pitches: number;
  strikes: number;
  balls: number;
};

type CsvPreviewSection = {
  title: string;
  rows: string[][];
};

export type EventDetail = { label: string; value: string };

export type DisplayItem =
  | { type: 'marker'; text: string; color: string; key: string; inning: number; half: Half }
  | {
      type: 'batter';
      text: string;
      key: string;
      inning: number;
      half: Half;
      order: number | null;
      jersey?: string;
      status?: 'out' | '대수비' | '대타' | '대주자';
      isSubstitute?: boolean;
      reconstructedPlateAppearance?: boolean;
    }
  | { type: 'log'; text: string; key: string; chip: string; inning: number; half: Half; details?: EventDetail[] };

function parseCsvRows(csvText: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(cell);
        cell = '';
      } else if (char === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (char !== '\r') {
        cell += char;
      }
    }
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function isBlankCsvRow(row: string[]) {
  if (!row.length) return true;
  return row.every((cell) => cell.trim() === '');
}

function splitCsvSections(rows: string[][]): CsvPreviewSection[] {
  const sections: CsvPreviewSection[] = [];
  let current: CsvPreviewSection | null = null;

  rows.forEach((row) => {
    if (isBlankCsvRow(row)) {
      if (current && (current.title || current.rows.length)) {
        sections.push(current);
      }
      current = null;
      return;
    }

    if (row.length === 1 && row[0].trim()) {
      if (current && (current.title || current.rows.length)) {
        sections.push(current);
      }
      current = { title: row[0].trim(), rows: [] };
      return;
    }

    if (!current) {
      current = { title: '', rows: [] };
    }
    current.rows.push(row);
  });

  const finalized = current as CsvPreviewSection | null;
  if (finalized && (finalized.title || finalized.rows.length)) {
    sections.push(finalized);
  }

  return sections;
}

function extractKboSections(sections: CsvPreviewSection[]) {
  const result: Partial<Record<'away' | 'home', CsvPreviewSection>> = {};
  sections.forEach((section) => {
    const title = section.title.trim();
    if (!title || !title.includes('기록지')) return;
    if (title.includes('초공') || title.includes('원정')) {
      result.away = section;
      return;
    }
    if (title.includes('말공') || title.includes('홈')) {
      result.home = section;
    }
  });
  return result;
}

export function CsvRecordPreview({
  csvContent,
  awayTeamName,
  homeTeamName,
  officialRecord = false,
}: {
  csvContent: string;
  awayTeamName?: string;
  homeTeamName?: string;
  officialRecord?: boolean;
}) {
  const sections = useMemo(() => splitCsvSections(parseCsvRows(csvContent)), [csvContent]);
  const kboSections = useMemo(() => extractKboSections(sections), [sections]);
  const defaultSide = kboSections.away ? 'away' : kboSections.home ? 'home' : null;
  const [selectedSide, setSelectedSide] = useState<'away' | 'home'>(defaultSide ?? 'away');
  const displaySide =
    selectedSide === 'away' && !kboSections.away
      ? defaultSide
      : selectedSide === 'home' && !kboSections.home
        ? defaultSide
        : selectedSide;

  if (!defaultSide) return null;

  const section =
    kboSections[displaySide ?? defaultSide] ??
    (defaultSide === 'away' ? kboSections.away : kboSections.home);
  if (!section) return null;

  const visibleRows = section.rows.filter((row) => !isBlankCsvRow(row));
  const header = visibleRows[0] ?? [];
  const bodyRows = visibleRows.slice(1);
  const columnCount = header.length || Math.max(0, ...visibleRows.map((row) => row.length));

  const normalizeRow = (row: string[]) => {
    if (row.length >= columnCount) return row;
    return [...row, ...Array.from({ length: columnCount - row.length }, () => '')];
  };

  const awayLabel = awayTeamName?.trim() ? `${awayTeamName} (${officialRecord ? '원정' : '초공'})` : '원정 (초공)';
  const homeLabel = homeTeamName?.trim() ? `${homeTeamName} (${officialRecord ? '홈' : '말공'})` : '홈 (말공)';

  return (
    <div className="csv-preview">
      <div className="csv-preview__header">
        <div className="csv-preview__titles">
          <div className="csv-preview__title">기록지</div>
          <div className="csv-preview__subtitle">{section.title}</div>
        </div>
        <div className="csv-preview__tabs">
          <button
            type="button"
            className={`csv-preview__tab ${displaySide === 'away' ? 'is-active' : ''}`}
            onClick={() => setSelectedSide('away')}
            disabled={!kboSections.away}
          >
            {awayLabel}
          </button>
          <button
            type="button"
            className={`csv-preview__tab ${displaySide === 'home' ? 'is-active' : ''}`}
            onClick={() => setSelectedSide('home')}
            disabled={!kboSections.home}
          >
            {homeLabel}
          </button>
        </div>
      </div>
      <div className="csv-preview__table-wrap">
        <table className="csv-preview__table">
          {header.length ? (
            <thead>
              <tr>
                {normalizeRow(header).map((cell, idx) => (
                  <th key={`csv-kbo-head-${idx}`} scope="col">
                    {cell || '-'}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {bodyRows.map((row, rowIdx) => (
              <tr key={`csv-kbo-row-${rowIdx}`}>
                {normalizeRow(row).map((cell, cellIdx) => (
                  <td key={`csv-kbo-cell-${rowIdx}-${cellIdx}`}>{cell || '-'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NowPlayingCard({
  batter,
  pitcher,
  batterToday,
  pitcherToday,
  balls,
  strikes,
  unavailable = false,
}: {
  batter: string;
  pitcher: string;
  batterToday: BatterLine;
  pitcherToday: PitcherLine;
  balls: number;
  strikes: number;
  unavailable?: boolean;
}) {
  const batterLine = `${batterToday.ab}타수 ${batterToday.hits}안타${
    batterToday.hr ? ` (${batterToday.hr}홈런)` : batterToday.doubles ? ` (${batterToday.doubles} 2루타)` : ''
  }${batterToday.bb ? ` · ${batterToday.bb}볼넷` : ''}${batterToday.so ? ` · ${batterToday.so}삼진` : ''}`;
  const pitcherIp = `${Math.floor(pitcherToday.outs / 3)}.${pitcherToday.outs % 3}`;
  const pitcherLine = `${pitcherIp}이닝 ${pitcherToday.bf}타자 상대 · 투구수 ${pitcherToday.pitches} (S:${pitcherToday.strikes} / B:${pitcherToday.balls}) · ${
    pitcherToday.hits
  }피안타${pitcherToday.hr ? ` ${pitcherToday.hr}피홈런` : ''}${pitcherToday.bb ? ` · ${pitcherToday.bb}볼넷` : ''}${
    pitcherToday.hbp ? ` · ${pitcherToday.hbp}사구` : ''
  }${pitcherToday.so ? ` · ${pitcherToday.so}탈삼진` : ''}`;

  return (
    <section className="now-playing-card" aria-label="현재 타석 정보">
      <header className="now-playing-card__header">
        <div className="now-playing-card__matchup">
          <span className="now-playing-card__eyebrow">NOW AT BAT</span>
          <strong className="now-playing-card__batter">현재 타석 · {batter}</strong>
          <span className="now-playing-card__count" aria-label={unavailable ? '볼카운트 미제공' : `볼 ${balls}, 스트라이크 ${strikes}`}>
            B {unavailable ? '—' : balls} · S {unavailable ? '—' : strikes}
          </span>
        </div>
        <span className="now-playing-card__pitcher">
          <small>현재 투수</small>
          <strong>{pitcher}</strong>
        </span>
      </header>
      <div className="now-playing-card__stats">
        <section className="now-playing-stat" aria-label={`${batter} 타자 기록`}>
          <div className="now-playing-stat__header">
            <span className="now-playing-stat__label">타자 기록</span>
            <span className="now-playing-stat__season">시즌 -</span>
          </div>
          <strong className="now-playing-stat__value">{unavailable ? '현재 타석 정보 미제공' : batterLine}</strong>
          <span className="now-playing-stat__meta">{unavailable ? '경기별 기록은 아래 표에서 확인' : '오늘 성적'}</span>
        </section>
        <section className="now-playing-stat" aria-label={`${pitcher} 투수 기록`}>
          <div className="now-playing-stat__header">
            <span className="now-playing-stat__label">투수 기록</span>
            <span className="now-playing-stat__season">시즌 -</span>
          </div>
          <strong className="now-playing-stat__value">{unavailable ? '실시간 투구 정보 미제공' : pitcherLine}</strong>
          <span className="now-playing-stat__meta">{unavailable ? '경기별 기록은 아래 표에서 확인' : '오늘 기록'}</span>
        </section>
      </div>
    </section>
  );
}

export function LiveFeed({
  sections,
  collapsedMap,
  gameOverInfo,
  isMobile,
  officialRecord = false,
}: {
  sections: Array<{ inning: number; items: DisplayItem[] }>;
  collapsedMap: Record<number, boolean>;
  gameOverInfo: { endText: string; resultText: string } | null;
  isMobile: boolean;
  officialRecord?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(collapsedMap);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const overscanPx = 200;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCollapsed((prev) => {
        let changed = false;
        const next = { ...prev };

        Object.entries(collapsedMap).forEach(([inningKey, value]) => {
          if (Object.prototype.hasOwnProperty.call(prev, inningKey)) return;
          next[Number(inningKey)] = value;
          changed = true;
        });

        return changed ? next : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [collapsedMap]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [sections, collapsed]);

  const flatItems = useMemo(() => {
    const items: { key: string; estimatedHeight: number; render: () => JSX.Element }[] = [];

    sections.forEach((section) => {
      const isCollapsed = collapsed[section.inning];
      const headerKey = `header-${section.inning}`;
      items.push({
        key: headerKey,
        estimatedHeight: 34,
        render: () => (
          <div key={headerKey} style={{ width: '100%', display: 'grid', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [section.inning]: !isCollapsed }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                color: '#e2e8f0',
                fontWeight: 900,
                cursor: 'pointer',
                padding: '2px 0',
              }}
            >
              <span style={{ color: isCollapsed ? '#94a3b8' : '#22c55e' }}>{isCollapsed ? '▶' : '▼'}</span>
              <span>{section.inning === 0 && officialRecord ? '이닝 미상' : `${section.inning}회 전체`}</span>
            </button>
          </div>
        ),
      });

      if (isCollapsed) return;

      section.items.forEach((item, idx) => {
        const estimatedHeight =
          item.type === 'marker'
            ? 22
            : item.type === 'batter'
              ? 22
              : item.type === 'log'
                ? (item.details?.length ? 120 : 52)
                : 48;
        items.push({
          key: item.key,
          estimatedHeight,
          render: () => {
            if (item.type === 'marker') {
              return (
                <div key={item.key} style={{ color: item.color, fontWeight: 900, fontSize: '14px', padding: '2px 0' }}>
                  {item.text}
                </div>
              );
            }
            if (item.type === 'batter') {
              const badgeStyles = {
                out: {
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.12)',
                  color: '#ef4444',
                  text: 'out',
                },
                대수비: {
                  border: '1px solid rgba(59,130,246,0.4)',
                  background: 'rgba(59,130,246,0.12)',
                  color: '#3b82f6',
                  text: '대수비',
                },
                대타: {
                  border: '1px solid rgba(34,197,94,0.4)',
                  background: 'rgba(34,197,94,0.12)',
                  color: '#22c55e',
                  text: '대타',
                },
                대주자: {
                  border: '1px solid rgba(251,146,60,0.4)',
                  background: 'rgba(251,146,60,0.12)',
                  color: '#fb923c',
                  text: '대주자',
                },
              };

              const badge = item.status ? badgeStyles[item.status] : null;

              return (
                <div
                  key={item.key}
                  style={{
                    color: '#e2e8f0',
                    fontWeight: 800,
                    fontSize: '13px',
                    padding: '2px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>
                    {item.order ? `${item.order}번 ` : ''}
                    {item.text} {officialRecord && !item.reconstructedPlateAppearance ? '기록' : '타석'}
                  </span>
                  {badge && (
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '999px',
                        border: badge.border,
                        background: badge.background,
                        color: badge.color,
                        fontWeight: 900,
                        fontSize: '10px',
                        lineHeight: 1.2,
                      }}
                    >
                      {badge.text}
                    </span>
                  )}
                </div>
              );
            }
            // [수정] 교체 로그 판별 조건 완화 및 렌더링
            // 기존에는 item.text.includes(...) 만 체크했으나, colorizeText에서 하이라이팅이 되면
            // 일반 로그 형태(박스)보다는 텍스트 형태(한 줄)로 보여주는 것이 깔끔할 수 있습니다.
            // 여기서는 교체 관련 키워드가 포함된 경우 텍스트 형태로 렌더링하도록 합니다.
            if (
              item.type === 'log' &&
              (item.text.includes('투수 교체') ||
                item.text.includes('타자 교체') ||
                item.text.includes('대수비') ||
                item.text.includes('대타') ||
                item.text.includes('대주자') ||
                item.text.trim().endsWith('투수'))
            ) {
              return (
                <div key={item.key} style={{ color: '#e2e8f0', fontWeight: 900, fontSize: '13px', padding: '2px 0' }}>
                  {colorizeText(item.text).map((part) => (
                    <span key={part.key} style={{ color: part.color ?? '#e2e8f0', fontWeight: part.color ? 900 : 800 }}>
                      {part.text}
                    </span>
                  ))}
                </div>
              );
            }
            // 일반 로그 (박스 형태)
            return (
              <div
                key={item.key}
                style={{
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.65)' : 'rgba(15, 23, 42, 0.35)',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  display: 'grid',
                  gap: '8px',
                  width: 'max-content',
                  maxWidth: '100%',
                  color: '#e2e8f0',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                  {colorizeText(item.text).map((part) => (
                    <span key={part.key} style={{ color: part.color ?? '#e2e8f0', fontWeight: part.color ? 900 : 800 }}>
                      {part.text}
                    </span>
                  ))}
                </div>
                {item.details?.length ? (
                  isMobile ? (
                    <details style={{ borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: '6px' }}>
                      <summary style={{ cursor: 'pointer', color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>
                        상세 이벤트 ({item.details.length})
                      </summary>
                      <div style={{ display: 'grid', gap: '4px', marginTop: '6px' }}>
                        {item.details.map((detail, detailIdx) => (
                          <div key={`${item.key}-detail-${detailIdx}`} style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.45 }}>
                            <span style={{ color: '#94a3b8', fontWeight: 800, marginRight: '6px' }}>{detail.label}</span>
                            <span>{detail.value}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <div style={{ display: 'grid', gap: '4px', borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: '6px' }}>
                      {item.details.map((detail, detailIdx) => (
                        <div key={`${item.key}-detail-${detailIdx}`} style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.45 }}>
                          <span style={{ color: '#94a3b8', fontWeight: 800, marginRight: '6px' }}>{detail.label}</span>
                          <span>{detail.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            );
          },
        });
      });
    });

    if (gameOverInfo) {
      // ... (game over info 렌더링 유지) ...
       items.push({
        key: 'game-over',
        estimatedHeight: 42,
        render: () => (
          <div key="game-over" style={{ display: 'grid', gap: '4px', padding: '4px 0' }}>
            <div style={{ color: '#f87171', fontWeight: 900, fontSize: '15px' }}>{gameOverInfo.endText}</div>
            <div style={{ color: '#f87171', fontWeight: 900, fontSize: '14px' }}>{gameOverInfo.resultText}</div>
          </div>
        ),
      });
    }

    return items;
  }, [sections, collapsed, gameOverInfo, isMobile, officialRecord]);

  const totalHeight = useMemo(() => {
    let h = 0;
    flatItems.forEach((item) => {
      h += measuredHeights[item.key] ?? item.estimatedHeight;
    });
    return h;
  }, [flatItems, measuredHeights]);

  const { startIndex, endIndex, offsetTop } = useMemo(() => {
    let y = 0;
    let start = 0;
    const viewportEnd = scrollTop + viewportHeight + overscanPx;
    const viewportStart = Math.max(0, scrollTop - overscanPx);

    for (let i = 0; i < flatItems.length; i += 1) {
      const h = measuredHeights[flatItems[i].key] ?? flatItems[i].estimatedHeight;
      const nextY = y + h;
      if (nextY >= viewportStart) {
        start = i;
        break;
      }
      y = nextY;
    }
    let end = start;
    let currentY = y;
    for (let i = start; i < flatItems.length; i += 1) {
      const h = measuredHeights[flatItems[i].key] ?? flatItems[i].estimatedHeight;
      currentY += h;
      end = i;
      if (currentY >= viewportEnd) break;
    }
    return { startIndex: start, endIndex: Math.min(end, flatItems.length - 1), offsetTop: y };
  }, [flatItems, scrollTop, viewportHeight, overscanPx, measuredHeights]);

  const visibleItems = flatItems.slice(startIndex, endIndex + 1);

  const measureRef = (key: string) => (el: HTMLDivElement | null) => {
    if (!el) return;
    const next = el.getBoundingClientRect().height;
    setMeasuredHeights((prev) => {
      if (prev[key] === next) return prev;
      return { ...prev, [key]: next };
    });
    setViewportHeight((v) => v); // trigger recalculation
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handle = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
    };
    handle();
    el.addEventListener('scroll', handle, { passive: true });
    const resizeObserver = new ResizeObserver(() => handle());
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', handle);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        overflowY: 'auto',
        maxHeight: '430px',
        height: 'min(40vh, 430px)',
        paddingRight: '6px',
        minHeight: 0,
        position: 'relative',
      }}
      ref={containerRef}
    >
      <div style={{ position: 'relative', height: totalHeight, width: '100%' }}>
        <div style={{ position: 'absolute', top: offsetTop, left: 0, right: 0, display: 'grid', gap: '10px' }}>
          {visibleItems.map((item) => (
            <div key={item.key} ref={measureRef(item.key)}>
              {item.render()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function colorizeText(text: string) {
  // 기존 패턴에 '투수 교체', '타자 교체', '대수비', '대타', '대주자' 등 추가
  const pattern =
    /(\d+\s*안타|\d+\s*아웃|득점|점수|도루\s*성공|도루\s*실패|도루|안타|2루타|3루타|루타|홈런|볼넷|몸에\s*맞는\s*공|몸에맞는공|HBP|HP|사구|아웃|삼진|낫아웃|견제사|실책|E[1-9]|WP|PB|BK|야수선택|FC|F\.C|투수\s*교체|타자\s*교체|대수비|대타|대주자)/g;
  
  const colorMap: Record<string, string> = {
    득점: '#facc15',
    점수: '#facc15',
    도루성공: '#38bdf8',
    '도루 성공': '#38bdf8',
    도루실패: '#f87171',
    '도루 실패': '#f87171',
    도루: '#38bdf8',
    안타: '#38bdf8',
    '1안타': '#38bdf8',
    '2안타': '#38bdf8',
    '3안타': '#38bdf8',
    '4안타': '#38bdf8',
    '5안타': '#38bdf8',
    '6안타': '#38bdf8',
    '7안타': '#38bdf8',
    '8안타': '#38bdf8',
    '9안타': '#38bdf8',
    '2루타': '#38bdf8',
    '3루타': '#38bdf8',
    루타: '#38bdf8',
    홈런: '#38bdf8',
    볼넷: '#38bdf8',
    몸에맞는공: '#38bdf8',
    HBP: '#38bdf8',
    HP: '#38bdf8',
    사구: '#38bdf8',
    낫아웃: '#f97316',
    실책: '#f97316',
    E1: '#f97316',
    E2: '#f97316',
    E3: '#f97316',
    E4: '#f97316',
    E5: '#f97316',
    E6: '#f97316',
    WP: '#f97316',
    PB: '#f97316',
    BK: '#f97316',
    야수선택: '#a78bfa',
    FC: '#a78bfa',
    'F.C': '#a78bfa',
    아웃: '#f87171',
    '1아웃': '#f87171',
    '2아웃': '#f87171',
    '3아웃': '#f87171',
    삼진: '#f87171',
    견제사: '#f87171',
    // [추가] 교체 관련 키워드 색상 정의 (녹색 계열)
    '투수 교체': '#4ade80',
    '투수교체': '#4ade80',
    '타자 교체': '#4ade80',
    '타자교체': '#4ade80',
    대수비: '#4ade80',
    대타: '#4ade80',
    대주자: '#4ade80',
  };

  const parts: Array<{ text: string; color?: string; key: string }> = [];
  let lastIndex = 0;
  text.replace(pattern, (match, _p1, offset) => {
    // 공백 제거하여 키 매칭
    const key = match.replace(/\s+/g, ' ').trim(); // 정규화 (공백 하나로)
    const normalizedKey = match.replace(/\s+/g, ''); // 맵 매칭용 (공백 제거)
    
    // colorMap에서 키를 찾을 때 공백 있는 버전과 없는 버전 모두 시도
    const color = colorMap[key] || colorMap[normalizedKey];

    if (lastIndex < offset) {
      parts.push({ text: text.slice(lastIndex, offset), key: `${lastIndex}-${offset}` });
    }
    parts.push({ text: match, color: color, key: `${offset}-${offset + match.length}` });
    lastIndex = offset + match.length;
    return match;
  });
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), key: `${lastIndex}-${text.length}` });
  }
  return parts;
}

export type PostGameSummary = {
  totals: { home: { runs: number | string; hits: number | string; bb: number | string; so: number | string }; away: { runs: number | string; hits: number | string; bb: number | string; so: number | string } };
  topHitters: { side: 'home' | 'away'; name: string; h: number | string; hr: number | string; bb: number | string }[];
  topPitchers: { side: 'home' | 'away'; name: string; so: number | string; outs: number | string; h: number | string; bb: number | string }[];
};

export function PostGameSummary({ summary, actionSlot, officialRecord = false }: { summary: PostGameSummary; actionSlot?: React.ReactNode; officialRecord?: boolean }) {
  const pill = (label: string, value: string, color: string) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${color}55`,
        color,
        fontWeight: 800,
        fontSize: '12px',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '999px', background: color }} />
      {label}: {value}
    </span>
  );

  const renderLeaders = (title: string, items: PostGameSummary['topHitters'] | PostGameSummary['topPitchers']) => (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: 8,
      }}
    >
      <span style={{ fontWeight: 800, color: '#e2e8f0', fontSize: 14 }}>{title}</span>
      {items.length ? (
        items.map((item) => (
          <div
            key={`${title}-${item.side}-${item.name}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#cbd5e1',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '999px',
                  background: item.side === 'home' ? '#f97316' : '#60a5fa',
                }}
              />
              {item.name}
            </span>
            {'hr' in item ? (
              <span>H {item.h} · HR {item.hr} · BB {item.bb}</span>
            ) : (
              <span>SO {item.so} · Outs {item.outs} · H {item.h} · BB {item.bb}</span>
            )}
          </div>
        ))
      ) : (
        <span style={{ color: '#94a3b8', fontSize: 12 }}>기록이 없습니다.</span>
      )}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {pill('홈 득점', String(summary.totals.home.runs), '#f97316')}
          {pill('홈 안타', String(summary.totals.home.hits), '#f97316')}
          {pill('원정 득점', String(summary.totals.away.runs), '#60a5fa')}
          {pill('원정 안타', String(summary.totals.away.hits), '#60a5fa')}
        </div>
        {actionSlot ? <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{actionSlot}</div> : null}
      </div>
      <div style={{ color: '#94a3b8', fontSize: 12 }}>
        {officialRecord ? 'UniquePlay 게시 기록 · 미제공 항목은 —로 표시합니다.' : '경기 종료 후 상세보기 · 문자중계 기록은 좌측 “문자 중계” 탭으로 이동'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {renderLeaders('타자 TOP3 (양 팀)', summary.topHitters)}
        {renderLeaders('투수 TOP2 (양 팀)', summary.topPitchers)}
      </div>
    </div>
  );
}
