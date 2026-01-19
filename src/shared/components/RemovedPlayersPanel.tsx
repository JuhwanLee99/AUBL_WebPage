import type { RemovedPlayerEntry } from '../types/scoreStats';

type RemovedPlayersPanelDensity = 'compact' | 'regular';

type RemovedPlayersPanelProps = {
  title: string;
  players: RemovedPlayerEntry[];
  density?: RemovedPlayersPanelDensity;
};

const stylesByDensity = {
  compact: {
    borderRadius: '12px',
    padding: '10px',
    titleFontSize: '14px',
    subtitleFontSize: '11px',
    rowFontSize: '12px',
    rowPadding: '8px 10px',
  },
  regular: {
    borderRadius: '14px',
    padding: '12px',
    titleFontSize: '16px',
    subtitleFontSize: '12px',
    rowFontSize: '12px',
    rowPadding: '8px 10px',
  },
};

export default function RemovedPlayersPanel({ title, players, density = 'regular' }: RemovedPlayersPanelProps) {
  const styles = stylesByDensity[density];
  return (
    <div
      style={{
        background: '#0b0f1a',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: styles.borderRadius,
        padding: styles.padding,
        display: 'grid',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 900, color: '#e2e8f0', fontSize: styles.titleFontSize }}>{title}</span>
        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: styles.subtitleFontSize }}>{players.length}명</span>
      </div>
      {players.length ? (
        <div style={{ display: 'grid', gap: '6px' }}>
          {players.map((p, idx) => (
            <div
              key={`${p.name}-${idx}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: styles.rowPadding,
                borderRadius: '10px',
                background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.5)' : 'rgba(15, 23, 42, 0.35)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                color: '#e2e8f0',
                fontWeight: 800,
                fontSize: styles.rowFontSize,
              }}
            >
              <span>{p.name}</span>
              <span style={{ color: '#94a3b8', fontWeight: 700 }}>
                #{p.number || '--'} · {p.pos?.toUpperCase?.() ?? '-'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: styles.rowFontSize }}>퇴장 선수 없음</span>
      )}
    </div>
  );
}