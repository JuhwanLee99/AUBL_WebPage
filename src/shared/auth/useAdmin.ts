import { useMemo } from 'react';
import { useAuth } from './AuthProvider';

const adminList = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function useAdmin() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? null;

  const isAdmin = useMemo(() => {
    if (!email) return false;
    return adminList.includes(email);
  }, [email]);

  return { isAdmin, adminEmails: adminList };
}
