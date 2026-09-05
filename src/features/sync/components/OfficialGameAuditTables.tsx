import type { OfficialGameDetail } from '@core/api/backendClient';
import './UniquePlayGameReview.css';

export default function OfficialGameAuditTables({ detail }: { detail: OfficialGameDetail | null }) {
  return <div className="sync-game-audit-tables">{detail?.teams.map(team => <section key={team.teamName}>
    <h4>{team.teamName} · 선수별 타점·득점 대조</h4>
    <div className="sync-game-review__scroll" tabIndex={0} aria-label={`${team.teamName} 이닝별 점수와 팀 합계`}>
      <table><thead><tr>{team.innings.map(inning => <th key={inning.inning}>{inning.inning}회</th>)}<th>R</th><th>H</th><th>E</th><th>B</th></tr></thead>
        <tbody><tr>{team.innings.map(inning => <td key={inning.inning}>{inning.notPlayed ? 'X' : inning.runs ?? '—'}</td>)}
          <td>{team.totals.runs ?? '—'}</td><td>{team.totals.hits ?? '—'}</td><td>{team.totals.errors ?? '—'}</td><td>{team.totals.walks ?? '—'}</td></tr></tbody></table>
    </div>
    <div className="sync-game-review__scroll" tabIndex={0} aria-label={`${team.teamName} 선수 기록 표, 가로 스크롤 가능`}>
      <table><thead><tr><th>선수</th><th>타수</th><th>안타</th><th>타점</th><th>득점</th><th>이닝별 타격 결과</th></tr></thead>
        <tbody>{team.batters.map(row => <tr key={row.rowKey}><th scope="row">{row.playerName} · #{row.jerseyNumber ?? '—'}</th>
          <td>{row.stats.atBats ?? '—'}</td><td>{row.stats.hits ?? '—'}</td><td>{row.stats.rbi ?? '—'}</td><td>{row.stats.runs ?? '—'}</td>
          <td>{row.plateAppearances.map(plate => `${plate.inning}회 ${plate.result ?? '—'}`).join(' / ') || '—'}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="sync-game-review__scroll" tabIndex={0} aria-label={`${team.teamName} 투수 기록 표, 가로 스크롤 가능`}>
      <table><thead><tr><th>투수</th><th>이닝</th><th>피안타</th><th>실점</th><th>자책점</th><th>4사구</th><th>삼진</th><th>방어율</th></tr></thead>
        <tbody>{team.pitchers.map(row => <tr key={row.rowKey}><th scope="row">{row.playerName} · #{row.jerseyNumber ?? '—'}</th>
          <td>{row.stats.inningsPitched ?? '—'}</td><td>{row.stats.hitsAllowed ?? '—'}</td><td>{row.stats.runsAllowed ?? '—'}</td><td>{row.stats.earnedRuns ?? '—'}</td>
          <td>{row.stats.walksAndHitByPitch ?? '—'}</td><td>{row.stats.strikeouts ?? '—'}</td><td>{row.stats.era ?? '—'}</td></tr>)}</tbody></table>
    </div>
  </section>)}</div>;
}
