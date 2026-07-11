import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { useAuth } from './AuthProvider';
import { useAdmin } from './useAdmin';
import MaintenancePage from '@features/auth/pages/MaintenancePage';

// ========================================
// 유지보수 모드 기본값 (코드 레벨 비상용 override)
// 실제 운영은 Firestore config/maintenance 문서로 제어합니다.
// ========================================

// 코드 레벨 강제 활성화 (Firestore 장애 시 비상용 — 평소에는 false)
// 로컬 개발에서 점검 모드 테스트: .env.local에 VITE_MAINTENANCE_ENABLED=true 설정
export const MAINTENANCE_MODE_ENABLED = import.meta.env.VITE_MAINTENANCE_ENABLED === 'true';

// 기본 서비스 재개 예정일 (Firestore 미등록 시 사용)
export const MAINTENANCE_RESUME_DATE = '2026년 2월 21일';

// 기본 유지보수 메시지 (Firestore 미등록 시 사용)
export const MAINTENANCE_MESSAGE =
  '더 나은 서비스를 위해 시스템 개선 작업을 진행하고 있습니다.\n잠시만 기다려 주세요.\n\n문의: aublcau@gmail.com';

// 유지보수 모드에서도 접근 가능한 경로
const ALLOWED_PATHS = ['/login', '/access-denied'];

// ========================================

interface MaintenanceConfig {
  enabled: boolean;
  resumeDate: string;
  message: string;
}

function useMaintenanceConfig(): { config: MaintenanceConfig; loading: boolean } {
  const [config, setConfig] = useState<MaintenanceConfig>({
    enabled: MAINTENANCE_MODE_ENABLED,
    resumeDate: MAINTENANCE_RESUME_DATE,
    message: MAINTENANCE_MESSAGE,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firestore가 오프라인이거나 CORS 차단 시 콜백이 호출되지 않을 수 있으므로
    // 일정 시간 후 응답이 없으면 기본값(비활성)으로 통과시킨다.
    // DEV(localhost): Firestore CORS 차단 환경이므로 즉시 기본값 사용
    // PROD: 3초 대기 후 Firestore 응답 없으면 통과
    const timeoutMs = import.meta.env.DEV ? 0 : 3000;
    const timer = setTimeout(() => setLoading(false), timeoutMs);

    const unsub = onSnapshot(
      doc(firestore, 'config', 'maintenance'),
      (snap) => {
        clearTimeout(timer);
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            enabled: MAINTENANCE_MODE_ENABLED || (data.enabled ?? false),
            resumeDate: data.resumeDate ?? MAINTENANCE_RESUME_DATE,
            message: data.message ?? MAINTENANCE_MESSAGE,
          });
        } else {
          setConfig({
            enabled: MAINTENANCE_MODE_ENABLED,
            resumeDate: MAINTENANCE_RESUME_DATE,
            message: MAINTENANCE_MESSAGE,
          });
        }
        setLoading(false);
      },
      () => {
        clearTimeout(timer);
        setLoading(false);
      },
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  return { config, loading };
}

interface MaintenanceGuardProps {
  children: ReactNode;
}

export function MaintenanceGuard({ children }: MaintenanceGuardProps) {
  const location = useLocation();
  const { initializing, user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { config: maintenance, loading: maintenanceLoading } = useMaintenanceConfig();

  // 로딩 중
  // 점검 모드가 꺼져 있으면 관리자 확인을 기다리지 않음 (불필요한 네트워크 요청 방지)
  if (maintenanceLoading || initializing || (maintenance.enabled && user !== null && adminLoading)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(249,115,22,0.3)',
              borderTopColor: '#f97316',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ color: '#94a3b8', fontSize: '14px' }}>로딩 중...</span>
          <style>
            {`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      </div>
    );
  }

  // 점검 모드 비활성화
  if (!maintenance.enabled) {
    return <>{children}</>;
  }

  // 허용된 경로는 통과
  if (ALLOWED_PATHS.some((path) => location.pathname.startsWith(path))) {
    return <>{children}</>;
  }

  // 관리자는 통과
  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <MaintenancePage
      expectedResumeDate={maintenance.resumeDate}
      message={maintenance.message}
    />
  );
}
