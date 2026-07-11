import { Navigate } from 'react-router-dom';

export default function PowerRankingPageRedirect() {
  return <Navigate to="/records?tab=power" replace />;
}
