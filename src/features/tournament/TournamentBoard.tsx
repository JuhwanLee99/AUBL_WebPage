import { useMemo, useState, type CSSProperties } from 'react';
import type { HomeGroupView } from '@features/front/components/season2026/types';
import { DIVISIONS, divisionLabel, entrants, entrantLabel, roundLabel, scheduleLabel, type Division, type TournamentConfig, type TournamentMatch } from './model';
import { projectedTournamentTeamNames } from './standings';
import './tournament.css';

export const matchStatusLabel = { scheduled: '예정', live: '진행 중', completed: '종료', postponed: '연기', canceled: '취소' };
function position(match: TournamentMatch): { x: number; y: number } {
  if (match.round === 'final') return { x: 630, y: 320 };
  const count = match.round === 'r16' ? 4 : match.round === 'qf' ? 2 : 1;
  const right = match.index >= count;
  const column = match.round === 'r16' ? 0 : match.round === 'qf' ? 1 : 2;
  return { x: (right ? 6 - column : column) * 210, y: (match.index % count + 0.5) * (640 / count) };
}

export default function TournamentBoard({ config, groups = [], projectedNames }: { config: TournamentConfig; groups?: HomeGroupView[]; projectedNames?: Record<string, string> }) {
  const [selected, setSelected] = useState<Division>('eutteum');
  const groupNames = useMemo(() => projectedTournamentTeamNames(groups), [groups]);
  const projectedTeamNames = projectedNames ?? groupNames;
  const division = config.divisions[selected];
  const final = division.matches.find(match => match.round === 'final');
  const schedule = [...division.matches].sort((a, b) => (a.startTime || '9999').localeCompare(b.startTime || '9999'));
  return <div className="t26">
    <div className="t26-toolbar">
      <div className="t26-toggle" role="group" aria-label="토너먼트 선택">
        {DIVISIONS.map(key => <button type="button" key={key} aria-pressed={key === selected}
          onClick={() => setSelected(key)}>{divisionLabel[key]} 토너먼트</button>)}
      </div>
      <span className="t26-label">{config.phase === 'preview' ? '예상 대진 · 변경 가능' : config.phase === 'active' ? '토너먼트 진행' : '토너먼트 종료'}</span>
    </div>
    {config.note && <p className="t26-note">{config.note}</p>}
    <p className="t26-help">조·순위 코드는 진출 자리이며, 괄호 안 팀명은 현재 순위 기준 예상입니다. 운영진이 확정 팀명을 입력하면 그 이름을 우선 표시합니다. 좁은 화면에서는 대진표를 좌우로 이동하세요.</p>
    <div className="t26-scroll" role="region" aria-label={`${divisionLabel[selected]} 토너먼트 대진표, 좌우 스크롤`} tabIndex={0}>
      <div className="t26-bracket">
        <svg className="t26-lines" width="1440" height="660" viewBox="0 0 1440 660" aria-hidden="true">
          {division.matches.filter(match => match.round !== 'final').map(match => {
            const nextRound = match.round === 'r16' ? 'qf' : match.round === 'qf' ? 'sf' : 'final';
            const next = division.matches.find(item => item.round === nextRound && item.index === Math.floor(match.index / 2));
            if (!next) return null;
            const from = position(match); const to = position(next);
            const right = from.x > to.x;
            const x1 = from.x + (right ? 0 : 180); const x2 = to.x + (right ? 180 : 0); const mid = (x1 + x2) / 2;
            return <path key={match.id} d={`M${x1} ${from.y} H${mid} V${to.y} H${x2}`} />;
          })}
        </svg>
        <div className="t26-title"><span>2026 AUBL</span><h3>{divisionLabel[selected]} 토너먼트</h3><p>16강 대진표</p></div>
        {division.matches.map(match => {
          const point = position(match); const pair = entrants(division, match);
          return <article className={`t26-match ${match.round === 'final' ? 'is-final' : ''}`} key={match.id}
            style={{ left: point.x, top: point.y - 57 } as CSSProperties} aria-label={`${roundLabel[match.round]} ${match.index + 1}경기`}>
            <header><b>{roundLabel[match.round]} {match.index + 1}</b><span>{matchStatusLabel[match.status]}</span></header>
            {pair.map((seed, side) => <div key={side} className={`t26-team ${seed && seed === match.winner ? 'is-winner' : ''}`}>
              <span className="t26-seed">{seed || '-'}</span><strong title={entrantLabel(division, seed, projectedTeamNames)}>{entrantLabel(division, seed, projectedTeamNames)}</strong><b>{match.scores[side] ?? ''}</b>
            </div>)}
            <footer>{scheduleLabel(match.startTime)}</footer>
          </article>;
        })}
        <div className="t26-champion"><span>우승</span><strong>{final?.winner ? entrantLabel(division, final.winner, projectedTeamNames) : '결승 승자'}</strong></div>
      </div>
    </div>
    <details className="t26-schedules" open><summary>{divisionLabel[selected]} 경기 일정 · 결과</summary>
      <div className="t26-table-scroll"><table><caption className="t26-help">시간은 한국 시간(KST) 기준입니다.</caption>
        <thead><tr><th>라운드</th><th>대진</th><th>일시</th><th>장소</th><th>상태 · 점수</th></tr></thead>
        <tbody>{schedule.map(match => { const pair = entrants(division, match); return <tr key={match.id}>
          <td>{roundLabel[match.round]} {match.index + 1}</td><td>{pair.map(seed => seed ? `${seed} ${entrantLabel(division, seed, projectedTeamNames)}` : '이전 경기 승자').join(' / ')}</td>
          <td>{scheduleLabel(match.startTime)}</td><td>{match.venue || '장소 미정'}</td><td>{matchStatusLabel[match.status]}{match.scores.some(score => score !== null) ? ` · ${match.scores[0] ?? '-'} : ${match.scores[1] ?? '-'}` : ''}</td>
        </tr>; })}</tbody>
      </table></div>
    </details>
  </div>;
}
