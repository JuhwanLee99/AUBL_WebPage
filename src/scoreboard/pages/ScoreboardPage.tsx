import ScoreboardPanel from '../components/ScoreboardPanel';

export default function ScoreboardPage() {
  return (
    <div
      style={{
        width: '100%',
        background: '#050505',
        display: 'grid',
        placeItems: 'center',
        padding: '0.6vw',
        boxSizing: 'border-box',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      <ScoreboardPanel
        style={{
          width: '100%',
          maxWidth: 'min(100%, calc(min(74vh, calc(100vh - 320px)) * 16 / 9))',
          height: 'min(74vh, calc(100vh - 320px))',
        }}
      />
    </div>
  );
}
