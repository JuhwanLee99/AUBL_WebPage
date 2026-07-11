import { Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './AuthProvider';

type Props = {
  children: ReactElement;
};

export function RequireAuth({ children }: Props) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#cbd5e1' }}>
        인증 상태를 확인하고 있습니다...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
