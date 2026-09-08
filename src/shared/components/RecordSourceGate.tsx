import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../auth/useAdmin';
import { useRecordSource } from '../state/useRecordSource';

export default function RecordSourceGate({ matchId, children }: { matchId?: string | null; children: ReactNode }) {
  const source = useRecordSource(matchId);
  const { isAdmin } = useAdmin();
  if (source.status === 'live') return children;
  if (source.status !== 'official') return <p role="status">{source.status === 'loading'
    ? '기록 공개 상태를 확인하고 있습니다.' : '기록 공개 상태를 확인하지 못했습니다. 잠시 후 다시 접속해 주세요.'}</p>;
  const game = source.source.official.game;
  return <section aria-label="공식 기록 안내">
    <h2>유니크플레이 공식 기록</h2>
    <p>{game.awayTeamName} {game.awayScore} : {game.homeScore} {game.homeTeamName}</p>
    <p>자체 문자중계와 모달 기록은 관리자 검수용으로 보관되어 공개 및 수정이 중단되었습니다.</p>
    <Link to={`/scoreboard-text/${encodeURIComponent(matchId ?? '')}`}>공식 기록 보기</Link>
    {isAdmin && <p><Link to={`/admin/record-comparison?matchId=${encodeURIComponent(matchId ?? '')}`}>자체 기록 비교·검수</Link></p>}
  </section>;
}
