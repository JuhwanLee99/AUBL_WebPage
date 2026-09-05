import type { CSSProperties, ReactNode } from 'react';

export type ScoreboardDisplayProps = {
  style?: CSSProperties;
  showFootnote?: boolean;
  hideBases?: boolean;
  header?: ReactNode;
  teamNames: { home: string; away: string };
  displayScore: { home: number | string; away: number | string };
  currentPitcher: string;
  currentBatter: string;
  pitcherDescription: string;
  batterDescription: string;
  inningLabel: ReactNode;
  ball: number | null;
  strike: number | null;
  out: number | null;
  bases: (string | null)[];
  lastPlay: string;
  boxScore: Parameters<typeof BoxScoreTable>[0]['data'];
};

const countLights = (filled: number, total: number, color: string) =>
  Array.from({ length: total }, (_, idx) => ({ active: idx < filled, color }));

// The live and published-record routes render this exact same scoreboard markup.
export default function ScoreboardPanelDisplay({
  style, showFootnote = true, hideBases = false, header,
  teamNames, displayScore, currentPitcher, currentBatter,
  pitcherDescription, batterDescription, inningLabel, ball, strike, out, bases, lastPlay, boxScore,
}: ScoreboardDisplayProps) {
  return (
    <div
      className="scoreboard-panel"
      style={{
        aspectRatio: '16 / 9',
        background: '#000',
        color: '#f8fafc',
        borderRadius: '18px',
        border: '2px solid #1f2937',
        padding: 'clamp(16px, 2.6vw, 28px)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        gap: 'clamp(14px, 2.2vw, 24px)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ display: 'grid', gap: 'clamp(8px, 1.3vw, 12px)' }}>
        {header}

        <div
          className="scoreboard-panel__score-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 'clamp(4px, 1.4vw, 16px)',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <ScoreCell label={teamNames.away} value={displayScore.away} />
          <div
            style={{
              display: 'grid',
              gap: '6px',
              justifyItems: 'center',
              width: '100%',
              maxWidth: '320px',
              margin: '0 auto',
            }}
          >
            <PlayerInfoChip
              label="현재 투수"
              value={currentPitcher}
              subLabel={pitcherDescription}
              color="#60a5fa"
            />
            <div
              style={{
                background: '#0b1220',
                border: '2px solid #111827',
                borderRadius: '12px',
                padding: 'clamp(12px, 1.8vw, 18px) clamp(10px, 1.6vw, 18px)',
                fontWeight: 900,
                fontSize: 'clamp(22px, 3.2vw, 38px)',
                color: '#facc15',
                textShadow: '0 0 14px rgba(250, 204, 21, 0.4)',
                lineHeight: 1.05,
                width: '100%',
              }}
            >
              {inningLabel}
            </div>
            <PlayerInfoChip
              label="현재 타자"
              value={currentBatter}
              subLabel={batterDescription}
              color="#f97316"
            />
          </div>
          <ScoreCell label={teamNames.home} value={displayScore.home} />
        </div>
      </div>

      <div
        className="scoreboard-panel__game-grid"
        style={{
          background: '#0b1220',
          borderRadius: '14px',
          border: '1px solid #1f2937',
          padding: 'clamp(8px, 1.4vw, 14px)',
          display: 'grid',
          gap: 'clamp(10px, 1.6vw, 14px)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hideBases
              ? 'minmax(0, 0.55fr) minmax(0, 1.8fr)'
              : 'minmax(0, 0.9fr) minmax(0, 1.35fr)',
            gap: 'clamp(10px, 1.6vw, 14px)',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: hideBases ? 'auto' : 'auto auto',
              gap: '8px',
              alignItems: 'center',
              justifyContent: hideBases ? 'center' : 'start',
            }}
          >
            <div style={{ display: 'grid', gap: 'clamp(6px, 1.2vw, 10px)' }}>
              <CountBlock label="B" lights={ball == null ? null : countLights(ball, 3, '#22c55e')} />
              <CountBlock label="S" lights={strike == null ? null : countLights(strike, 2, '#facc15')} />
              <CountBlock label="O" lights={out == null ? null : countLights(out, 3, '#ef4444')} />
            </div>
            {hideBases ? null : <BasePaths bases={bases} />}
          </div>

          <BoxScoreTable data={boxScore} />
        </div>
      </div>

      <div
        className="scoreboard-panel__last-play"
        style={{
          borderRadius: '12px',
          border: '2px solid #1f2937',
          background: '#0b1220',
          padding: 'clamp(10px, 1.6vw, 16px)',
          fontFamily: 'monospace',
          color: '#7dd3fc',
          fontWeight: 800,
          fontSize: 'clamp(14px, 2vw, 20px)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span style={{ color: '#67e8f9', flexShrink: 0 }}>LAST PLAY</span>
        <span style={{ color: '#e2e8f0', textTransform: 'none', letterSpacing: '0.02em', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {lastPlay}
        </span>
      </div>

      {showFootnote ? (
        <div
          style={{
            position: 'absolute',
            right: 'clamp(10px, 1.6vw, 16px)',
            bottom: 'clamp(10px, 1.6vw, 16px)',
            display: 'grid',
            gap: '4px',
            color: '#64748b',
            fontWeight: 700,
            fontSize: 'clamp(9px, 1.2vw, 12px)',
            textAlign: 'right',
          }}
        >
          <span>
            AWAY: {teamNames.away} · HOME: {teamNames.home}
          </span>
          <span>Mock data demo · No live connection</span>
        </div>
      ) : null}
    </div>
  );
}

function ScoreCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      className="scoreboard-panel__score-cell"
      style={{
        background: '#0b1220',
        border: '2px solid #111827',
        borderRadius: '12px',
        padding: 'clamp(8px, 3vw, 16px) clamp(4px, 2vw, 12px)',
        display: 'grid',
        gap: 'clamp(2px, 1vw, 6px)',
        alignItems: 'center',
        justifyItems: 'center',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: 'clamp(11px, 2vw, 20px)',
          fontWeight: 900,
          letterSpacing: '0.06em',
          color: '#f8fafc',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 'clamp(44px, 8vw, 96px)',
          fontWeight: 900,
          color: '#facc15',
          textShadow: '0 0 18px rgba(250, 204, 21, 0.45)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CountBlock({ label, lights }: { label: string; lights: { active: boolean; color: string }[] | null }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'clamp(20px, 5vw, 40px) 1fr',
        alignItems: 'center',
        gap: 'clamp(2px, 1vw, 8px)',
        color: '#f8fafc',
        fontWeight: 900,
      }}
    >
      <span style={{ fontSize: 'clamp(16px, 2.2vw, 22px)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 'clamp(6px, 1.2vw, 12px)' }}>
        {lights == null ? <span aria-label="미제공">—</span> : lights.map((light, idx) => (
          <span
            key={idx}
            style={{
              width: 'clamp(14px, 2vw, 24px)',
              height: 'clamp(14px, 2vw, 24px)',
              borderRadius: '50%',
              background: light.active ? light.color : '#1f2937',
              boxShadow: light.active ? `0 0 12px ${light.color}` : 'inset 0 0 0 1px #111827',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function BasePaths({ bases }: { bases: (string | null)[] }) {
  const [first, second, third] = bases.map(Boolean);
  const baseSize = 'clamp(18px, 2.6vw, 30px)';
  return (
    <div style={{ display: 'grid', gap: '0px', justifyItems: 'center', transform: 'translate(-18px, 10px)' }}>
      <span
        style={{
          fontWeight: 900,
          color: '#cbd5e1',
          transform: 'translate(-12px, 10px)',
        }}
      >
        BASES
      </span>
      <div
        style={{
          position: 'relative',
          width: 'clamp(90px, 13vw, 150px)',
          height: 'clamp(90px, 13vw, 150px)',
          margin: '0 auto',
          transform: 'translateY(14px)',
        }}
      >
        <DiamondBase active={second} top="24%" left="44%" size={baseSize} />
        <DiamondBase active={first} top="50%" left="68%" size={baseSize} />
        <DiamondBase active={third} top="50%" left="18%" size={baseSize} />
      </div>
    </div>
  );
}

export function BoxScoreTable({
  data,
}: {
  data: {
    innings: (number | string)[];
    rows: {
      name: string;
      runs: number | string;
      hits: number | string;
      errors: number | string;
      innings: (number | string)[];
      color: string;
    }[];
  };
}) {
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;

  // ── 모바일: sticky 이니셜 + R/H/E 고정 ──
  if (isMobile) {
    const getInitial = (name: string) => name.trim().slice(0, 2) || '?';
    const rhe = 26;
    const teamW = 34;
    const innings = data.innings;
    const rows = data.rows;
    const inningGridCols = innings.map(() => 'minmax(20px, 26px)').join(' ');
    const gridCols = `${teamW}px ${inningGridCols} ${rhe}px ${rhe}px ${rhe}px`;
    const stickyBg = '#0b1220';
    const headerBg = '#0f172a';
    const divider = '1px solid rgba(148,163,184,0.2)';
    const cell: CSSProperties = { padding: '2px 1px', textAlign: 'center', fontWeight: 800, fontSize: '12px' };
    const stickyTeam: CSSProperties = { ...cell, position: 'sticky', left: 0, background: stickyBg, zIndex: 2, borderRight: divider };
    const stickyR: CSSProperties = { ...cell, position: 'sticky', right: `${rhe * 2}px`, background: stickyBg, zIndex: 2, borderLeft: divider };
    const stickyH: CSSProperties = { ...cell, position: 'sticky', right: `${rhe}px`, background: stickyBg, zIndex: 2 };
    const stickyE: CSSProperties = { ...cell, position: 'sticky', right: '0px', background: stickyBg, zIndex: 2 };

    return (
      <div
        style={{
          border: divider,
          borderRadius: '12px',
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.02)',
          height: 'fit-content',
          minHeight: '0',
          alignSelf: 'center',
          width: '100%',
          minWidth: 0,
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          {/* 헤더 행 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              background: headerBg,
              borderBottom: divider,
              minWidth: 'max-content',
            }}
          >
            <div style={{ ...stickyTeam, background: headerBg, color: '#e2e8f0' }}>팀</div>
            {innings.map((inn) => (
              <div key={inn} style={{ ...cell, color: '#e2e8f0' }}>{String(inn)}</div>
            ))}
            <div style={{ ...stickyR, background: headerBg, color: '#e2e8f0' }}>R</div>
            <div style={{ ...stickyH, background: headerBg, color: '#e2e8f0' }}>H</div>
            <div style={{ ...stickyE, background: headerBg, color: '#e2e8f0' }}>E</div>
          </div>
          {/* 데이터 행 */}
          {rows.map((row, idx) => (
            <div
              key={row.name}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                borderTop: idx === 0 ? 'none' : divider,
                minWidth: 'max-content',
              }}
            >
              <div style={{ ...stickyTeam, color: row.color, fontWeight: 900 }}>{getInitial(row.name)}</div>
              {row.innings.map((val, vIdx) => (
                <div key={`${row.name}-inn-${vIdx}`} style={{ ...cell, color: '#cbd5e1', fontSize: '13px' }}>{val}</div>
              ))}
              <div style={{ ...stickyR, color: '#cbd5e1', fontSize: '13px' }}>{row.runs}</div>
              <div style={{ ...stickyH, color: '#cbd5e1', fontSize: '13px' }}>{row.hits}</div>
              <div style={{ ...stickyE, color: '#cbd5e1', fontSize: '13px' }}>{row.errors}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── PC: 전체 팀명 + direction:rtl 스크롤 ──
  const headers = ['팀', ...data.innings.map(String), 'R', 'H', 'E'];
  const rows = data.rows;
  const gridColumns = `minmax(96px, 1.6fr) repeat(${Math.max(1, headers.length - 1)}, minmax(24px, 0.7fr))`;
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.2)',
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.02)',
        height: 'fit-content',
        minHeight: '0',
        alignSelf: 'center',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ overflowX: 'auto', direction: 'rtl' }}>
      <div style={{ direction: 'ltr' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridColumns,
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(148,163,184,0.2)',
          minWidth: 'max-content',
        }}
      >
        {headers.map((h) => (
          <div
            key={h}
            style={{
              padding: '2px 1px',
              textAlign: 'center',
              fontWeight: 800,
              fontSize: '12px',
              color: '#e2e8f0',
              letterSpacing: '0.04em',
            }}
          >
            {h}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridAutoRows: 'auto', minWidth: 'max-content' }}>
        {rows.map((row, idx) => (
          <div
            key={row.name}
            style={{
              display: 'grid',
              gridTemplateColumns: gridColumns,
              borderTop: idx === 0 ? 'none' : '1px solid rgba(148,163,184,0.2)',
            }}
          >
            <div
              style={{
                padding: '3px 2px',
                fontWeight: 900,
                color: row.color,
                fontSize: '12px',
                textAlign: 'center',
                whiteSpace: 'normal',
                wordBreak: 'keep-all',
                lineHeight: 1.15,
              }}
            >
              {row.name}
            </div>
            {[...row.innings, row.runs, row.hits, row.errors].map((val, vIdx) => (
              <div
                key={`${row.name}-${vIdx}`}
                style={{
                  padding: '3px 1px',
                  textAlign: 'center',
                  color: '#cbd5e1',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              >
                {val}
              </div>
            ))}
          </div>
        ))}
      </div>
      </div>
      </div>
    </div>
  );
}

function PlayerInfoChip({
  label,
  value,
  subLabel,
  color,
}: {
  label: string;
  value: string;
  subLabel?: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '2px',
        padding: 'clamp(4px, 1.2vw, 8px) clamp(6px, 1.8vw, 12px)',
        background: 'rgba(15,23,42,0.9)',
        border: `1px solid ${color}33`,
        borderRadius: '12px',
        width: '100%',
        maxWidth: '320px',
        minWidth: 0,
        overflow: 'hidden',
        justifyItems: 'center',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          gap: 'clamp(4px, 1vw, 8px)',
          alignItems: 'center',
          fontWeight: 900,
          fontSize: 'clamp(11px, 1.8vw, 13px)',
          color: '#e2e8f0',
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 'clamp(10px, 1.6vw, 12px)',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            color,
            flexShrink: 0,
          }}
        >
          {label}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </span>
      {subLabel ? (
        <span
          style={{
            fontWeight: 700,
            fontSize: 'clamp(10px, 1.6vw, 12px)',
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
        >
          {subLabel}
        </span>
      ) : null}
    </div>
  );
}
function DiamondBase({
  active,
  top,
  left,
  size,
}: {
  active: boolean;
  top?: string;
  left?: string;
  size?: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: size ?? '28px',
        height: size ?? '28px',
        transform: 'translate(-50%, -50%) rotate(45deg)',
        borderRadius: '4px',
        background: active ? '#facc15' : '#1f2937',
        boxShadow: active ? '0 0 12px #facc15' : 'inset 0 0 0 1px #111827',
      }}
    />
  );
}
