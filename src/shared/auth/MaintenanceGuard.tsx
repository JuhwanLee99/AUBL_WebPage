import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { useAdmin } from './useAdmin';
import MaintenancePage from '../../app/pages/MaintenancePage';

// ========================================
// 유지보수 모드 설정
// ========================================

// 유지보수 모드 활성화 여부 (true: 활성화, false: 비활성화)
export const MAINTENANCE_MODE_ENABLED = true;

// 서비스 재개 예정일
export const MAINTENANCE_RESUME_DATE = '2026년 2월 7일';

// 유지보수 메시지
export const MAINTENANCE_MESSAGE = '더 나은 서비스를 위해 시스템 개선 작업을 진행하고 있습니다.\n잠시만 기다려 주세요.\n\n문의: aublcau@gmail.com';

// 유지보수 모드에서도 접근 가능한 경로 (로그인 페이지 등)
const ALLOWED_PATHS = ['/login', '/access-denied'];

// ========================================

interface MaintenanceGuardProps {
  children: ReactNode;
}

export function MaintenanceGuard({ children }: MaintenanceGuardProps) {
  const location = useLocation();
  const { initializing } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();

  // 유지보수 모드가 비활성화된 경우 바로 children 렌더링
  if (!MAINTENANCE_MODE_ENABLED) {
    return <>{children}</>;
  }

  // 로그인/관리자 권한 확인 중일 때 로딩 표시
  if (initializing || adminLoading) {
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

  // 허용된 경로인 경우 바로 접근 허용
  if (ALLOWED_PATHS.some((path) => location.pathname.startsWith(path))) {
    return <>{children}</>;
  }

  // 관리자인 경우 정상 접근 허용
  if (isAdmin) {
    return <>{children}</>;
  }

  // 그 외의 경우 유지보수 페이지 표시
  return (
    <MaintenancePage
      expectedResumeDate={MAINTENANCE_RESUME_DATE}
      message={MAINTENANCE_MESSAGE}
    />
  );
}
