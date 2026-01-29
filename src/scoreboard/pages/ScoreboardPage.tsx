import ScoreboardFrame from '../components/ScoreboardFrame';

export default function ScoreboardPage() {
  const MIN_PANEL_HEIGHT_PX = 640;
  const targetHeight = `max(${MIN_PANEL_HEIGHT_PX}px, min(74vh, calc(100vh - 320px)))`;

  return (
    <ScoreboardFrame
      variant="page"
      panelStyle={{
        width: '100%',
        maxWidth: `min(100%, calc(${targetHeight} * 16 / 9))`,
        height: targetHeight,
        minHeight: `${MIN_PANEL_HEIGHT_PX}px`,
      }}
    />
  );
}
