import { Link, useSearchParams } from 'react-router-dom';
import type { HomeGroupView } from './types';
import { bucketTransitions } from './bucketTransitions';
import { projectionBucketLabel, projectionStatus, rankCaseExplanation } from './projectionStatus';
import QualificationOdds from './QualificationOddsPanel';

export default function StandingsScenariosView({ groups, checkedAt, loading, error, onRetry }: {
  groups: HomeGroupView[]; checkedAt?: number; loading?: boolean; error?: string; onRetry?: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('group') ?? 'A';
  const group = groups.find(item => item.group === requested) ?? groups[0];
  const team = params.get('team');
  const rankedRows = [...(group?.rows ?? [])].sort((a, b) => a.rank - b.rank);
  const selectedRows = rankedRows.filter(row => !team || String(row.teamId) === team);
  const transitions = bucketTransitions(group?.rows ?? []);
  const sample = group?.rows.find(row => row.projection)?.projection;
  return <main className="s26-home s26-scenarios">
    <header className="s26-scenarios__hero">
      <Link to="/">홈으로</Link>
      <p className="s26-eyebrow">2026 GROUP STAGE</p>
      <h1>순위별 경우의 수</h1>
      <p>5팀 · 상대별 2경기 · 팀당 8경기. 일정 미정 대진까지 포함한 예선 순위 전망입니다.</p>
      {checkedAt ? <small>기록 확인: {new Date(checkedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small> : null}
    </header>
    {loading ? <div className="s26-empty" role="status">순위와 경기 기록을 불러오고 있습니다.</div> : error ? <div className="s26-empty" role="alert">{error} {onRetry ? <button type="button" onClick={onRetry}>다시 불러오기</button> : null}</div> : <>
      <nav className="s26-group-tabs" aria-label="분석할 조">
        {groups.map(item => <Link key={item.group} aria-current={item === group ? 'page' : undefined} to={`?group=${item.group}`}>{item.group}조</Link>)}
      </nav>
      {group ? <>
        <nav className="s26-team-buttons" aria-label="팀 선택">
          <button type="button" aria-pressed={!team} onClick={() => setParams({ group: group.group })}>전체 팀</button>
          {rankedRows.map(row => <button key={row.teamId} type="button" aria-pressed={team === String(row.teamId)} onClick={() => setParams({ group: group.group, team: String(row.teamId) })}>
            <span>{row.tied ? '공동 ' : ''}{row.rank}위</span><strong>{row.teamName}</strong>
          </button>)}
        </nav>
        <section className="s26-scenarios__overview">
          <div><p className="s26-eyebrow">{group.group}조 예선</p><h2>{group.completedGames} / {group.expectedGames}경기 완료</h2></div>
          <p>으뜸권 1·2위 / 버금권 3·4위 / 탈락권 5위</p>
        </section>
        {group.scenarioWarnings?.length ? <div className="s26-scenarios__notice" role="status"><strong>경기 기록 확인이 필요합니다</strong><ul>{group.scenarioWarnings.map(w => <li key={w}>{w}</li>)}</ul></div> : null}
        {sample?.exhausted ? <div className="s26-scenarios__notice">아직 계산 중인 경우의 수가 있습니다. 아래 결과만으로 최종 순위나 탈락 여부를 확정할 수 없습니다.</div> : null}
        <div className="s26-scenarios__teams">
          {selectedRows.map(row => {
            const status = projectionStatus(row), p = row.projection;
            const officiallyConfirmed = row.qualification.startsWith('confirmed-');
            const movement = transitions.find(item => item.row.teamId === row.teamId);
            return <article key={row.teamId} className="s26-scenarios__team" id={`team-${row.teamId}`}>
              <header><div><p className="s26-eyebrow">현재 {row.rank}{row.tied ? '위 공동 순위' : '위'} · {row.wins}승 {row.losses}패 {row.ties}무</p><h2>{row.teamName}</h2></div><span className={`s26-scenarios__status is-${status.kind}`}>{status.label}</span></header>
              <p>{status.detail}</p>
              <QualificationOdds row={row} />
              <div className="s26-scenarios__movement">
                {officiallyConfirmed ? '공식 진출 결과가 확정되었습니다.' : movement?.currentUnresolved ? '현재 동률로 진출 구간이 정해지지 않았습니다.' : movement?.destinations.length ? movement.destinations.map(to => <span key={to}>{projectionBucketLabel(movement.from)} → {projectionBucketLabel(to)}</span>) : p?.exhausted ? '지금까지 계산한 결과에서는 구간 변화가 없습니다.' : p ? '구간 이동 없음' : '경기 기록 확인 후 이동 가능성을 안내합니다.'}
              </div>
              {p && !officiallyConfirmed ? <>
                <h3>{p.exhausted ? '현재까지 확인된 순위별 경우의 수' : '최종 순위별 경우의 수'}</h3>
                <p className="s26-scenarios__hint">순위별 대표 조건을 하나씩 보여드립니다. 다른 경기 결과도 함께 충족해야 하며, 이 외의 조건에서도 같은 순위가 나올 수 있습니다.</p>
                {(p.rankCases ?? []).map(example => <details key={example.rank} className="s26-scenarios__case">
                  <summary>{example.rank}위 경우의 수 <span>{rankCaseExplanation(example).label}</span></summary>
                  {example.conditional ? <p className="s26-scenarios__notice">{rankCaseExplanation(example).detail}</p> : null}
                  {example.conditions.length ? <ul>{example.conditions.map((c, index) => <li key={index}><strong>{c.teamA} vs {c.teamB}</strong><span>{c.teamA} 기준 {c.wins}승 {c.losses}패 {c.ties}무</span></li>)}</ul> : <p>예선 경기가 모두 끝났습니다. 최종 기록과 동률 판정에 따라 순위가 정해집니다.</p>}
                </details>)}
              </> : null}
            </article>;
          })}
          {!selectedRows.length ? <div className="s26-empty">해당 팀 정보가 없습니다. 다른 팀을 선택하세요.</div> : null}
        </div>
        <section className="s26-scenarios__schedule"><h2>남은 대진</h2><p>상대별 2경기 중 아직 치르지 않은 경기입니다. 날짜가 정해지지 않은 대진도 포함합니다.</p>
          <div className="s26-table-wrap"><table className="s26-standings-table"><caption className="s26-visually-hidden">{group.group}조 상대별 경기 수</caption><thead><tr><th>대진</th><th>완료</th><th>남음</th><th>등록</th><th>일정 미정</th></tr></thead><tbody>
            {group.matchups?.map(pair => <tr key={JSON.stringify([pair.teamA, pair.teamB])}><th>{pair.teamA} / {pair.teamB}</th><td>{pair.completed}</td><td>{pair.remaining}</td><td>{pair.scheduled}</td><td>{pair.unscheduled}</td></tr>)}
          </tbody></table></div>
        </section>
        <details className="s26-scenarios__method"><summary>계산 기준 안내</summary>
          <p>승률은 승 ÷ (승 + 패)이며 무승부를 분모에서 제외합니다. 같은 승률은 승패무 개수가 달라도 동률입니다.</p>
          <p>2팀 동률: 승자승 → 팀 간 득실차 → 결정경기. 3팀 동률: 승자승 → 팀 간 득실차·다득점·최소실점 → 조 전체 득실차·다득점·최소실점 순으로 대조합니다.</p>
          <p>미래 점수가 필요한 판정, 4팀 이상 동률, 몰수·징계에 따른 별도 불이익은 운영진 확인 대상입니다. 이 계산은 통상적인 경기 결과를 가정하며 공식 진출 확정을 대체하지 않습니다. <Link to="/rules">리그 회칙</Link></p>
          <p>같은 상대와 승패무 결과가 같으면 경기 순서와 관계없이 하나로 묶습니다. 모든 경우를 계산하지 못한 경우에는 계산 미완료로 표시합니다.</p>
          {sample ? <p>중복을 묶은 경우의 수: {sample.evaluatedStates?.toLocaleString()}개. 전체 경기 결과 {sample.expectedScenarios}가지 중 {sample.scenarioCount}가지를 반영했습니다. 경우의 수는 발생 확률을 뜻하지 않습니다.</p> : null}
        </details>
      </> : <div className="s26-empty">분석할 조별 자료가 없습니다.</div>}
    </>}
  </main>;
}
