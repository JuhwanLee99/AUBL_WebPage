import { useState, type CSSProperties } from 'react';
import { rebuildPowerRanking } from '../../../core/api/backendClient';

const cardStyle: CSSProperties = {
  borderRadius: '4px',
  border: '1px solid var(--season-line)',
  background: 'var(--season-surface)',
  padding: '20px',
};

const labelStyle: CSSProperties = {
  color: 'var(--season-ink)',
  fontWeight: 800,
  fontSize: '13px',
  marginBottom: '6px',
  display: 'block',
};

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: '44px',
  padding: '10px 12px',
  borderRadius: '2px',
  border: '1px solid var(--season-line-strong)',
  background: 'var(--season-surface)',
  color: 'var(--season-ink)',
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
          borderRadius: '4px',
          background: 'var(--season-surface)',
          border: '1px solid var(--season-line)',
          borderLeft: '4px solid var(--season-blue-600)',
        }}
      >
        <div style={{ color: 'var(--season-navy-900)', fontWeight: 800, fontSize: '15px' }}>파워랭킹 재계산</div>
        <div style={{ color: 'var(--season-muted)', fontSize: '12px', marginTop: '4px', lineHeight: '1.6' }}>
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
            borderRadius: '4px',
            background: 'var(--season-surface)',
            border: '1px solid var(--season-danger)',
            borderLeft: '4px solid var(--season-danger)',
            display: 'grid',
            gap: '12px',
          }}
        >
          <div style={{ color: 'var(--season-danger)', fontWeight: 800, fontSize: '14px' }}>
            재계산 실행 확인
          </div>
          <div style={{ color: 'var(--season-muted)', fontSize: '13px', lineHeight: '1.7' }}>
            <strong style={{ color: 'var(--season-danger)' }}>{fromYear}~{toYear}년</strong> 범위의 기존 파워랭킹 데이터가
            삭제되고 새로운 데이터로 교체됩니다.<br />
            이 작업은 되돌릴 수 없습니다.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { void handleConfirmRebuild(); }}
              style={{
                minHeight: '44px',
                padding: '9px 22px',
                borderRadius: '2px',
                border: 'none',
                background: 'var(--season-danger-fill)',
                color: 'var(--season-on-danger)',
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
                minHeight: '44px',
                padding: '9px 22px',
                borderRadius: '2px',
                border: '1px solid var(--season-line-strong)',
                background: 'var(--season-surface)',
                color: 'var(--season-ink)',
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
            minHeight: '44px',
            padding: '10px 28px',
            borderRadius: '2px',
            border: 'none',
            background: 'var(--season-primary-fill)',
            color: 'var(--season-on-primary)',
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
              color: result.ok ? 'var(--season-success)' : 'var(--season-danger)',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {result.message}
          </span>
        )}
      </div>

      {/* 주의사항 */}
      <div style={{ ...cardStyle, borderColor: 'var(--season-warning)', borderLeft: '4px solid var(--season-warning)' }}>
        <div style={{ color: 'var(--season-warning)', fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>
          주의사항
        </div>
        <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--season-muted)', fontSize: '13px', lineHeight: '1.8' }}>
          <li>재계산 시 기존 파워랭킹 데이터에 새 버전이 추가됩니다.</li>
          <li>경기 데이터(GAME)가 DB에 없으면 계산 결과가 비어있을 수 있습니다.</li>
          <li>대량 연도 범위는 처리에 시간이 걸릴 수 있습니다.</li>
        </ul>
      </div>
    </div>
  );
}
