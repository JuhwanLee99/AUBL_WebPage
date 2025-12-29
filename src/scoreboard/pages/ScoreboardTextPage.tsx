import { useMemo } from 'react';
import ScoreboardPanel from '../components/ScoreboardPanel';
import { useDemoStore } from '../../shared/state/demoStore';

export default function ScoreboardTextPage() {
  const { state } = useDemoStore();
  const feed = useMemo(() => state.feed, [state.feed]);

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
              display: 'grid',
              gap: '10px',
              minHeight: 0,
            }}
          >
            {feed.map((entry, idx) => (
              <div
                key={`${entry}-${idx}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.65)' : 'rgba(15, 23, 42, 0.35)',
                  fontSize: '14px',
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: '#38bdf8', fontWeight: 800, marginRight: '8px' }}>#{feed.length - idx}</span>
                {entry}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
