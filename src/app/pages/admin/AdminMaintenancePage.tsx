import { useEffect, useState, type CSSProperties } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore } from '../../../shared/firebase/client';
import {
  MAINTENANCE_RESUME_DATE,
  MAINTENANCE_MESSAGE,
} from '../../../shared/auth/MaintenanceGuard';

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

export default function AdminMaintenancePage() {
  const [enabled, setEnabled] = useState(false);
  const [resumeDate, setResumeDate] = useState(MAINTENANCE_RESUME_DATE);
  const [message, setMessage] = useState(MAINTENANCE_MESSAGE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(firestore, 'config', 'maintenance'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setEnabled(data.enabled ?? false);
          setResumeDate(data.resumeDate ?? MAINTENANCE_RESUME_DATE);
          setMessage(data.message ?? MAINTENANCE_MESSAGE);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(firestore, 'config', 'maintenance'), {
        enabled,
        resumeDate,
        message,
      });
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '20px' }}>불러오는 중...</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* 상태 배너 */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: '12px',
          background: enabled
            ? 'rgba(239,68,68,0.12)'
            : 'rgba(34,197,94,0.12)',
          border: `1px solid ${enabled ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '18px' }}>{enabled ? '🔴' : '🟢'}</span>
        <div>
          <div
            style={{
              color: enabled ? '#f87171' : '#4ade80',
              fontWeight: 800,
              fontSize: '15px',
            }}
          >
            현재 상태: {enabled ? '점검 중 (서비스 차단됨)' : '정상 운영 중'}
          </div>
          <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
            관리자 계정은 점검 중에도 정상 접속 가능합니다.
          </div>
        </div>
      </div>

      {/* 점검 모드 토글 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '15px' }}>
              서비스 점검 모드
            </div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
              활성화 시 관리자를 제외한 모든 사용자에게 점검 페이지를 표시합니다.
            </div>
          </div>
          <button
            onClick={() => setEnabled((v) => !v)}
            style={{
              padding: '8px 20px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 800,
              fontSize: '14px',
              cursor: 'pointer',
              background: enabled ? '#ef4444' : 'rgba(148,163,184,0.2)',
              color: enabled ? '#fff' : '#94a3b8',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* 재개 예정일 */}
      <div style={cardStyle}>
        <label style={labelStyle}>서비스 재개 예정일</label>
        <input
          value={resumeDate}
          onChange={(e) => setResumeDate(e.target.value)}
          placeholder="예: 2026년 2월 21일"
          style={inputStyle}
        />
      </div>

      {/* 점검 메시지 */}
      <div style={cardStyle}>
        <label style={labelStyle}>점검 메시지</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.6' }}
        />
        <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px' }}>
          \n 으로 줄바꿈이 적용됩니다.
        </div>
      </div>

      {/* 저장 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving}
          style={{
            padding: '10px 24px',
            borderRadius: '10px',
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            fontWeight: 800,
            fontSize: '14px',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        {savedAt && (
          <span style={{ color: '#4ade80', fontSize: '13px', fontWeight: 700 }}>
            ✓ {savedAt.toLocaleTimeString()} 저장됨
          </span>
        )}
      </div>
    </div>
  );
}
