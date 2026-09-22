import TournamentBoard from './TournamentBoard';
import { usePublicTournament } from './store';

export default function TournamentPage() {
  const { config, loading, error } = usePublicTournament();
  return <main className="t26 t26-page"><header><p>2026 AUBL POSTSEASON</p><h1>토너먼트 대진 · 일정</h1></header>
    {loading ? <p role="status">공개 대진표를 확인하고 있습니다. 연결이 없으면 표시하지 않습니다.</p>
      : error ? <p role="alert">{error}</p> : config ? <TournamentBoard config={config} /> : <p>아직 공개된 토너먼트 대진표가 없습니다.</p>}
  </main>;
}
