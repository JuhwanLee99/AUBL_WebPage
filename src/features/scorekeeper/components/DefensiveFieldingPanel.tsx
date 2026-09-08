import { useMemo } from 'react';
import type { PlayEvent } from '../../../shared/state/demoStore';
import { buildDefensiveFieldingLedger, DEFENSIVE_STATS } from '../../../shared/lib/defensiveFielding.ts';
import './DefensiveFieldingPanel.css';

export default function DefensiveFieldingPanel({ events, matchId }: { events: PlayEvent[]; matchId: string | null | undefined }) {
  const ledger = useMemo(() => buildDefensiveFieldingLedger(events, matchId), [events, matchId]);
  return <section className="defensive-fielding" data-testid="defensive-fielding" aria-label="선수별 수비 기록">
    <h3>선수별 수비 기록 <small>잠정 · 모달 복합 사건</small></h3>
    <p>플레이 당시 라인업 기준입니다. 현재 선수에게 과거 기록을 옮기지 않습니다.</p>
    <p data-testid="defensive-coverage">복합 사건 {ledger.compositeEvents}건 · 선수 귀속 완료 {ledger.attributedEvents}건 · 확인 필요 {ledger.issues.length}건</p>
    {ledger.players.length ? <div className="defensive-fielding__scroll"><table>
      <caption>PO 자살 · A 보살 · E 실책 · PB 포일 · DP 병살 참여 · TP 삼중살 참여</caption>
      <thead><tr><th>팀</th><th>선수</th><th>위치</th><th>PO</th><th>A</th><th>E</th><th>PB</th><th>DP</th><th>TP</th></tr></thead>
      <tbody>{ledger.players.map(row => <tr key={row.key} data-testid="defensive-player-row" data-player-name={row.name} data-player-number={row.number} data-side={row.side}>
        <td>{row.side === 'home' ? '홈' : '원정'}</td><th scope="row">{row.name} ({row.number})</th><td>{row.positions.join(', ')}</td>
        {DEFENSIVE_STATS.map(key => <td key={key} data-stat={key}>{row.stats[key]}{(key === 'dp' || key === 'tp') && row.unconfirmedMultiOut > 0 ? ' + 미확정' : ''}</td>)}
      </tr>)}</tbody>
    </table></div> : <p>선수에게 귀속할 수 있는 수비 기록이 아직 없습니다.</p>}
    {ledger.issues.length > 0 && <details className="defensive-fielding__issues"><summary>확인 필요 {ledger.issues.length}건</summary>
      <p>미확정 수비 통계는 선수 합계에서 제외하며, 사건 자체의 위치별 기록은 보존합니다.</p>
      <ul>{ledger.issues.map((issue, index) => <li key={`${issue.eventId}:${index}`}><code>{issue.eventId}</code>{issue.position ? ` · 수비 ${issue.position}번` : ''}: {issue.message}</li>)}</ul>
    </details>}
    <details><summary>사건별 수비 귀속 근거</summary><ul>{ledger.credits.map(credit => <li key={`${credit.playId}:${credit.position}`}>
      <code>{credit.eventId}</code> · 수비 {credit.position}번 · {credit.player ? `${credit.player.name} (${credit.player.number})` : '선수 미확정'}
      {' · '}{DEFENSIVE_STATS.filter(key => credit.stats[key]).map(key => `${key} ${credit.stats[key]}`).join(', ')}
    </li>)}</ul></details>
    <p className="defensive-fielding__note">등번호 누락·중복 포지션·과거 라인업 미보존 사건은 추정하지 않습니다. 공식 기록 및 전체 선수 수비 원장과는 구분됩니다.</p>
  </section>;
}
