import ScoreboardFrame from '../components/ScoreboardFrame';
import { useDemoStore } from '../../shared/state/demoStore';

export default function ScoreboardPage() {
  const { state } = useDemoStore();

  if (!state.activeMatchId) {
    return (
      <div
        style={{
          borderRadius: '16px',
          border: '1px solid rgba(148,163,184,0.3)',
          padding: '32px',
          textAlign: 'center',
          color: '#cbd5e1',
          background: '#0b0f1a',
        }}
      >
        현재 선택된 경기가 없습니다. 경기 일정에서 기록할 경기를 선택해 주세요.
      </div>
    );
  }

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
