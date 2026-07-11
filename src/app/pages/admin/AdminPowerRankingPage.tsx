import { useState, type CSSProperties } from 'react';
import { rebuildPowerRanking } from '../../../core/api/backendClient';

const cardStyle: CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(30,41,59,0.78))',
  padding: '20px',
  boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
};

const labelStyle: CSSProperties = {
  color: '#cbd5e1',
  fontWeight: 800,
  fontSize: '13px',
  marginBottom: '6px',
  display: 'block',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.3)',
  background: 'rgba(15,23,42,0.6)',
  color: '#e2e8f0',
  fontSize: '14px',
  boxSizing: 'border-box',
};

const currentYear = new Date().getFullYear();

export default function AdminPowerRankingPage() {
  const [fromYear, setFromYear] = useState(2015);
  const [toYear, setToYear] = useState(currentYear);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleRequestRebuild = () => {
    if (fromYear > toYear) {
      setResult({ ok: false, message: 'fromYear가 toYear보다 클 수 없습니다.' });
      return;
    }
    setResult(null);
    setConfirming(true);
  };

  const handleConfirmRebuild = async () => {
    setConfirming(false);
    setRunning(true);
    try {
      const response = await rebuildPowerRanking({ fromYear, toYear });
      const status = response?.status ? `상태: ${response.status}` : '상태: 확인 불가';
      const runId = response?.runId ? `runId: ${response.runId}` : 'runId: 없음';
      const startedAt = response?.startedAt ? `시작시각: ${response.startedAt}` : '시작시각: 없음';
      setResult({
        ok: true,
        message: `${fromYear}~${toYear}년 파워랭킹 재계산 요청 완료 (${status}, ${runId}, ${startedAt})`,
      });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* 설명 */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: '12px',
          background: 'rgba(96,165,250,0.1)',
          border: '1px solid rgba(96,165,250,0.35)',
        }}
      >
        <div style={{ color: '#93c5fd', fontWeight: 800, fontSize: '15px' }}>파워랭킹 재계산</div>
        <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', lineHeight: '1.6' }}>
          DB의 경기 데이터를 기반으로 지정 연도 범위의 파워랭킹을 재계산합니다.
          <br />
          계산식: (y-2)×0.3 + (y-1)×0.6 + (y)×1.0 (3개년 가중 합산)
        </div>
      </div>

      {/* 연도 범위 설정 */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>From Year</label>
            <input
              type="number"
              value={fromYear}
              onChange={(e) => setFromYear(Number(e.target.value))}
              min={2015}
              max={currentYear}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>To Year</label>
            <input
              type="number"
              value={toYear}
              onChange={(e) => setToYear(Number(e.target.value))}
              min={2015}
              max={currentYear}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 확인 경고 */}
      {confirming && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.45)',
            display: 'grid',
            gap: '12px',
          }}
        >
          <div style={{ color: '#fca5a5', fontWeight: 800, fontSize: '14px' }}>
            ⚠ 정말 재계산을 실행하시겠습니까?
          </div>
          <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.7' }}>
            <strong style={{ color: '#f87171' }}>{fromYear}~{toYear}년</strong> 범위의 기존 파워랭킹 데이터가
            삭제되고 새로운 데이터로 교체됩니다.<br />
            이 작업은 되돌릴 수 없습니다.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { void handleConfirmRebuild(); }}
              style={{
                padding: '9px 22px',
                borderRadius: '10px',
                border: 'none',
                background: '#ef4444',
                color: '#fff',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              확인, 재계산 실행
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{
                padding: '9px 22px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 실행 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={handleRequestRebuild}
          disabled={running || confirming}
          style={{
            padding: '10px 28px',
            borderRadius: '10px',
            border: 'none',
            background: running ? 'rgba(96,165,250,0.4)' : '#3b82f6',
            color: '#fff',
            fontWeight: 800,
            fontSize: '14px',
            cursor: (running || confirming) ? 'not-allowed' : 'pointer',
            opacity: (running || confirming) ? 0.7 : 1,
          }}
        >
          {running ? '재계산 중...' : '재계산 실행'}
        </button>
        {result && (
          <span
            style={{
              color: result.ok ? '#4ade80' : '#f87171',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {result.ok ? '✓' : '✗'} {result.message}
          </span>
        )}
      </div>

      {/* 주의사항 */}
      <div style={{ ...cardStyle, borderColor: 'rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.07)' }}>
        <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>
          ⚠ 주의사항
        </div>
        <ul style={{ margin: 0, paddingLeft: '18px', color: '#94a3b8', fontSize: '13px', lineHeight: '1.8' }}>
          <li>재계산 시 기존 파워랭킹 데이터에 새 버전이 추가됩니다.</li>
          <li>경기 데이터(GAME)가 DB에 없으면 계산 결과가 비어있을 수 있습니다.</li>
          <li>대량 연도 범위는 처리에 시간이 걸릴 수 있습니다.</li>
        </ul>
      </div>
    </div>
  );
}
