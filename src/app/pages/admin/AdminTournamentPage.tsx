import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TournamentBoard, { matchStatusLabel } from '@features/tournament/TournamentBoard';
import { DIVISIONS, ROUNDS, allowedSeeds, divisionLabel, entrants, entrantLabel, roundLabel, swapSeed, updateMatch,
  type Division, type TournamentConfig, type TournamentMatch } from '@features/tournament/model';
import { loadTournamentAdmin, persistTournament, type TournamentVersions } from '@features/tournament/store';
import { useTournamentProjectedNames } from '@features/tournament/standings';

export default function AdminTournamentPage() {
  const projectedNames = useTournamentProjectedNames();
  const [config, setConfig] = useState<TournamentConfig | null>(null);
  const [versions, setVersions] = useState<TournamentVersions>({ draft: 0, published: 0 });
  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [divisionKey, setDivisionKey] = useState<Division>('eutteum');

  useEffect(() => {
    let active = true;
    void loadTournamentAdmin().then(data => {
      if (!active) return;
      setConfig(data.config); setVersions(data.versions); setEnabled(data.enabled);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '대진표를 불러오지 못했습니다.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  const reload = async () => {
    if (dirty && !window.confirm('저장하지 않은 변경을 버리고 최신 초안을 불러올까요?')) return;
    setBusy(true); setError('');
    try {
      const data = await loadTournamentAdmin();
      setConfig(data.config); setVersions(data.versions); setEnabled(data.enabled); setDirty(false); setMessage('최신 초안을 불러왔습니다.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '불러오기 실패'); }
    finally { setBusy(false); }
  };
  const change = (next: TournamentConfig) => { setConfig(next); setDirty(true); setMessage(''); };
  const save = async (action: 'draft' | 'publish' | 'hide') => {
    if (!config) return;
    if (action !== 'draft' && !window.confirm(action === 'publish'
      ? '현재 편집한 대진·일정·결과와 홈 설정을 모든 방문자에게 공개할까요?'
      : '공개 대진표를 내리고 홈을 조별예선 화면으로 돌릴까요? 초안은 보존됩니다.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = await persistTournament(config, versions, action);
      setVersions(next);
      if (action !== 'hide') setDirty(false);
      if (action !== 'draft') setEnabled(action === 'publish');
      setMessage(action === 'draft' ? '비공개 초안을 저장했습니다. 기존 공개본은 바뀌지 않습니다.'
        : action === 'publish' ? '현재 내용을 공개했습니다.' : '공개를 해제했습니다. 편집 중인 내용은 별도로 저장하세요.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '저장에 실패했습니다. 입력은 화면에 유지됩니다.'); }
    finally { setBusy(false); }
  };

  if (!config) return <div className="t26 t26-admin"><h2>토너먼트 관리</h2><p role={error ? 'alert' : 'status'}>{error || '초안을 불러오는 중입니다.'}</p>
    {error && <button type="button" disabled={busy} onClick={() => void reload()}>다시 불러오기</button>}</div>;
  const division = config.divisions[divisionKey];
  const changeDivision = (next: typeof division) => change({ ...config, divisions: { ...config.divisions, [divisionKey]: next } });
  const editMatch = (match: TournamentMatch, patch: Partial<TournamentMatch>) => {
    const next = { ...match, ...patch };
    const pair = entrants(division, match);
    const [a, b] = next.scores;
    next.winner = next.status === 'completed' && a !== null && b !== null && a !== b ? pair[a > b ? 0 : 1] || '' : '';
    changeDivision(updateMatch(division, match.id, next));
  };
  const hasResults = division.matches.some(match => match.scores.some(score => score !== null) || match.winner);

  return <div className="t26 t26-admin">
    <header><p>2026 AUBL POSTSEASON</p><h2>토너먼트 관리</h2>
      <p>첨부 대진을 기본 초안으로 사용합니다. 초안 저장과 공개는 별도이며, 현재 순위로 팀을 자동 확정하지 않습니다.</p>
      <p><strong>{enabled ? '현재 공개 중' : '현재 비공개'}</strong> · 초안 {versions.draft} · 공개 변경 {versions.published}{dirty ? ' · 저장하지 않은 변경 있음' : ''}</p>
      <Link to="/tournament" target="_blank" rel="noreferrer">공개 페이지 열기</Link>
    </header>
    {error && <p role="alert" className="t26-error">{error}</p>}
    {message && <p role="status" className="t26-notice">{message}</p>}
    <div className="t26-actions">
      <button type="button" disabled={busy} onClick={() => void save('draft')}>비공개 초안 저장</button>
      <button type="button" className="is-primary" disabled={busy} onClick={() => void save('publish')}>현재 내용 공개 · 갱신</button>
      <button type="button" disabled={busy || !enabled} onClick={() => void save('hide')}>공개 해제</button>
      <button type="button" disabled={busy} onClick={() => void reload()}>최신 초안 다시 불러오기</button>
    </div>
    <fieldset disabled={busy} className="t26-editor"><legend>운영 설정</legend>
      <div className="t26-fields">
        <label>운영 단계<select value={config.phase} onChange={event => {
          const phase = event.target.value as TournamentConfig['phase'];
          change({ ...config, phase, homeDefault: phase === 'preview' ? 'groups' : 'tournament' });
        }}><option value="preview">예상 대진 (변경 가능)</option><option value="active">토너먼트 시작</option><option value="finished">토너먼트 종료</option></select></label>
        <label>홈 기본 화면<select value={config.homeDefault} onChange={event => change({ ...config, homeDefault: event.target.value as TournamentConfig['homeDefault'] })}>
          <option value="groups">조별예선</option><option value="tournament">토너먼트 대진 · 일정</option></select></label>
      </div>
      <label>공개 안내 문구<textarea rows={2} maxLength={1000} value={config.note} onChange={event => change({ ...config, note: event.target.value })} /></label>
      <p className="t26-help">토너먼트 시작을 선택하면 홈 기본 화면도 토너먼트로 바뀝니다. 공개 버튼을 눌러야 방문자에게 적용됩니다.</p>
    </fieldset>
    <fieldset disabled={busy} className="t26-editor"><legend>대진 · 일정 편집</legend>
      <div className="t26-toggle" role="group" aria-label="편집할 토너먼트">{DIVISIONS.map(key => <button type="button" key={key}
        aria-pressed={key === divisionKey} onClick={() => setDivisionKey(key)}>{divisionLabel[key]}</button>)}</div>
      <h3>16강 진출 자리</h3><p className="t26-help">1~8번은 왼쪽, 9~16번은 오른쪽 위에서 아래 순서입니다. 두 자리씩 맞붙습니다. 선택을 바꾸면 두 자리가 서로 교환됩니다.</p>
      <div className="t26-seed-editor">{division.seeds.map((seed, index) => <label key={index}>{index + 1}번 자리
        <select value={seed} onChange={event => {
          if (hasResults && !window.confirm('대진 변경으로 이 토너먼트의 모든 입력 점수·승자를 초기화합니다. 일정·장소는 유지됩니다. 계속할까요?')) return;
          changeDivision(swapSeed(division, index, event.target.value));
        }}>{allowedSeeds(divisionKey).map(option => <option value={option} key={option}>{option} · {option[0]}조 {option[1]}위</option>)}</select>
        <input aria-label={`${seed} 확정 팀명`} placeholder={projectedNames[seed] ? `현재 예상: ${projectedNames[seed]}` : '확정 팀명 (선택)'} maxLength={100} value={division.teamNames[seed] || ''} disabled={hasResults}
          onChange={event => changeDivision({ ...division, teamNames: { ...division.teamNames, [seed]: event.target.value } })} />
      </label>)}</div>
      <p className="t26-help">팀명은 최종 진출 팀이 확정된 뒤 입력하세요. 결과 입력 후 팀명은 잠기며, 변경하려면 결과를 먼저 비워야 합니다.</p>
      <p className="t26-help">종료 점수로 승자가 다음 라운드에 배치됩니다. 승자를 변경하면 영향받는 후속 경기 결과는 초기화됩니다. 무승부 종료·미정 참가자의 점수 입력은 저장할 수 없습니다.</p>
      {ROUNDS.map(round => <section className="t26-round-editor" key={round}><h3>{roundLabel[round]}</h3>
        {division.matches.filter(match => match.round === round).map(match => {
          const pair = entrants(division, match);
          return <article className="t26-game-editor" key={match.id}>
            <h4>{roundLabel[round]} {match.index + 1} · {pair.map(seed => seed ? `${seed} ${entrantLabel(division, seed)}` : '이전 경기 승자').join(' / ')}</h4>
            <div className="t26-fields">
              <label>일시 (KST)<input type="datetime-local" min="2026-01-01T00:00" max="2026-12-31T23:59" value={match.startTime.slice(0, 16)} onChange={event => editMatch(match, { startTime: event.target.value ? `${event.target.value}:00+09:00` : '' })} /></label>
              <label>장소<input maxLength={150} value={match.venue} onChange={event => editMatch(match, { venue: event.target.value })} /></label>
              <label>상태<select value={match.status} onChange={event => editMatch(match, { status: event.target.value as TournamentMatch['status'] })}>
                {Object.entries(matchStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {([0, 1] as const).map(side => <label key={side}>{pair[side] || `${side + 1}번 참가자`} 점수<input type="number" min={0} max={999} step={1} value={match.scores[side] ?? ''}
                disabled={!pair[0] || !pair[1]} onChange={event => {
                  const scores: [number | null, number | null] = [...match.scores];
                  scores[side] = event.target.value === '' ? null : Number(event.target.value);
                  editMatch(match, { scores });
                }} /></label>)}
            </div>
          </article>;
        })}
      </section>)}
    </fieldset>
    <section className="t26-preview"><h3>현재 편집 내용 미리보기 (공개본과 다를 수 있음)</h3><TournamentBoard config={config} projectedNames={projectedNames} /></section>
  </div>;
}
