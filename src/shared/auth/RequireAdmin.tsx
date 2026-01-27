import { Navigate, useLocation } from 'react-router-dom';
import { ReactElement } from 'react';
import { useAuth } from './AuthProvider';
import { useAdmin } from './useAdmin';

type Props = {
  children: ReactElement;
};

export function RequireAdmin({ children }: Props) {
  const { initializing, user } = useAuth();
  const { isAdmin } = useAdmin();
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

  if (!isAdmin) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}
