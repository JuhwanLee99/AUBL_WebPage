import { Navigate } from 'react-router-dom';

export default function PitcherRecordPageRedirect() {
  return <Navigate to="/records?tab=pitchers" replace />;
}
