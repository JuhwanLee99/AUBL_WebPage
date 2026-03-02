import { useAuth } from './AuthProvider';
import { useAdmin } from './useAdmin';

export function useCommunityAccess() {
  const { user } = useAuth();
  const { isAdmin, isScorer, roleLabel, loading } = useAdmin();

  const isAuthenticated = !!user;
  const isPlayerTier = roleLabel === '선수' || roleLabel === '스태프' || roleLabel === '감독';
  const isPlayerOrAbove = isAuthenticated && (isAdmin || isPlayerTier);
  const canWritePlayerRegistration = isAuthenticated && isAdmin;
  const canWriteUniformRegistration = isAuthenticated && (isAdmin || roleLabel === '감독');

  return {
    loading,
    isAuthenticated,
    isAdmin,
    isScorer,
    roleLabel,
    isPlayerOrAbove,
    canWritePlayerRegistration,
    canWriteUniformRegistration,
  };
}
