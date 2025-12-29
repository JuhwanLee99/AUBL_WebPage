import { useMemo } from 'react';
import ScoreboardPanel from '../components/ScoreboardPanel';
import { useDemoStore } from '../../shared/state/demoStore';

export default function ScoreboardTextPage() {
  const { state } = useDemoStore();
  const feed = useMemo(() => state.feed, [state.feed]);

  const formatEntry = (entry: (typeof feed)[number]) => {
    const halfLabel = entry.half === 'top' ? '초' : '말';
    const inningLabel = `${entry.inning}회${halfLabel}`;
    const batterLabel = entry.batter ? `${entry.order}번 ${entry.batter} 타석` : '';
    const pitchLabel = entry.pitch > 0 ? `${entry.pitch}구째` : '';
    const parts = [inningLabel, batterLabel, pitchLabel].filter(Boolean).join(' ');
    return parts ? `${parts} ${entry.result}` : entry.result;
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 'clamp(16px, 2vw, 24px)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
          gap: 'clamp(16px, 2vw, 24px)',
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'grid', alignItems: 'start' }}>
          <ScoreboardPanel
            showFootnote={false}
            style={{
              width: '100%',
              aspectRatio: '3 / 4',
            }}
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto 1fr',
            gap: '12px',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: '#0b0f1a',
            color: '#e2e8f0',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <span style={{ fontWeight: 900, fontSize: '18px' }}>문자 중계</span>
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>총 {feed.length}건</span>
          </div>
          <div
            style={{
              overflowY: 'auto',
              paddingRight: '6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '10px',
              minHeight: 0,
            }}
          >
            {feed.map((entry, idx) => (
              <div
                key={`${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}-${idx}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.65)' : 'rgba(15, 23, 42, 0.35)',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  width: 'max-content',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'keep-all',
                  overflowWrap: 'anywhere',
                }}
              >
                {formatEntry(entry)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
