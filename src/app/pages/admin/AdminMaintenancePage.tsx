import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore } from '../../../shared/firebase/client';
import {
  PageHero,
  SectionHeader,
  SeasonBadge,
  SeasonButton,
} from '../../../shared/components/season';
import {
  MAINTENANCE_RESUME_DATE,
  MAINTENANCE_MESSAGE,
} from '../../../shared/auth/MaintenanceGuard';
import './AdminMaintenancePage.css';

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
    return <div className="admin-maintenance__loading" role="status">불러오는 중...</div>;
  }

  return (
    <div className="admin-maintenance">
      <PageHero
        eyebrow="SERVICE CONTROL"
        title="서비스 점검 관리"
        description="점검 모드와 이용자 안내 문구를 확인하고 게시합니다."
        aside={(
          <div className="admin-maintenance__hero-status">
            <span>현재 운영 상태</span>
            <SeasonBadge tone={enabled ? 'danger' : 'success'}>
              {enabled ? '점검 중' : '정상 운영'}
            </SeasonBadge>
          </div>
        )}
      />

      <section className={`admin-maintenance__status${enabled ? ' is-enabled' : ''}`} aria-live="polite">
        <span className="admin-maintenance__status-mark" aria-hidden="true" />
        <div>
          <strong>현재 상태: {enabled ? '점검 중 (서비스 차단됨)' : '정상 운영 중'}</strong>
          <p>관리자 계정은 점검 중에도 정상 접속 가능합니다.</p>
        </div>
      </section>

      <section className="admin-maintenance__board" aria-labelledby="maintenance-settings-heading">
        <SectionHeader
          headingId="maintenance-settings-heading"
          eyebrow="MAINTENANCE SETTINGS"
          title="점검 안내 설정"
          description="설정을 검토한 뒤 저장하면 점검 화면에 반영됩니다."
        />

        <div className="admin-maintenance__toggle-row">
          <div>
            <strong>서비스 점검 모드</strong>
            <p>활성화 시 관리자를 제외한 모든 사용자에게 점검 페이지를 표시합니다.</p>
          </div>
          <button
            type="button"
            className={`admin-maintenance__toggle${enabled ? ' is-enabled' : ''}`}
            aria-pressed={enabled}
            onClick={() => setEnabled((v) => !v)}
          >
            <span aria-hidden="true" />
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <label className="admin-maintenance__field">
          <span>서비스 재개 예정일</span>
          <input
            value={resumeDate}
            onChange={(e) => setResumeDate(e.target.value)}
            placeholder="예: 2026년 2월 21일"
          />
        </label>

        <label className="admin-maintenance__field">
          <span>점검 메시지</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
          />
          <small>\n 으로 줄바꿈이 적용됩니다.</small>
        </label>

        <div className="admin-maintenance__actions">
          <SeasonButton onClick={() => { void handleSave(); }} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </SeasonButton>
          {savedAt && (
            <span className="admin-maintenance__saved" role="status">
              {savedAt.toLocaleTimeString()} 저장됨
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
