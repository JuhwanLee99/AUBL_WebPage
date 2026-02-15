import { Navigate } from 'react-router-dom';

export default function StandingsPageRedirect() {
  return <Navigate to="/records?tab=standings" replace />;
}
