export default function ScoreboardPage() {
  return (
    <div
      style={{
        display: 'grid',
        gap: '14px',
        padding: '28px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #0f172a 0%, #0b1220 100%)',
        border: '1px dashed rgba(148, 163, 184, 0.35)',
        color: '#e2e8f0',
      }}
    >
      <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em', color: '#a855f7' }}>
        SCOREBOARD
      </span>
      <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 900 }}>전광판 페이지 준비 영역</h1>
      <p style={{ margin: 0, lineHeight: 1.6, color: '#cbd5e1' }}>
        경기 현황, 이닝별 스코어, 투수/타자 정보 등을 실시간 송출할 전광판 UI 슬롯입니다. 데이터 피드 연결 후 레이아웃을
        맞춰 표시하도록 구성됩니다.
      </p>
    </div>
  );
}
