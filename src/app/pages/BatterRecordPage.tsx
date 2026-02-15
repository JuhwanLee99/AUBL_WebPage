import { Navigate } from 'react-router-dom';

export default function BatterRecordPageRedirect() {
  return <Navigate to="/records?tab=batters" replace />;
}
