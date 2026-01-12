import ScoreboardFrame from '../components/ScoreboardFrame';

export default function ScoreboardPage() {
  return (
    <ScoreboardFrame
      variant="page"
      panelStyle={{
        width: '100%',
        maxWidth: 'min(100%, calc(min(74vh, calc(100vh - 320px)) * 16 / 9))',
        height: 'min(74vh, calc(100vh - 320px))',
      }}
    />
  );
}
