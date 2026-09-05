import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { OfficialGameDetailsResponse } from '@core/api/backendClient';
import StatsTable from '@shared/components/StatsTable';
import RemovedPlayersPanel from '@shared/components/RemovedPlayersPanel';
import ScoreboardPanelDisplay from './ScoreboardPanelDisplay';
import { NowPlayingCard, PostGameSummary, LiveFeed, CsvRecordPreview } from './LegacyTextComponents';
import { buildOfficialLegacyRecord } from '../model/officialLegacyRecord';

/** The production text-scoreboard layout and components, with a read-only official data adapter. */
export default function OfficialLegacyTextView({ payload, header }: {
  payload: OfficialGameDetailsResponse;
  header?: ReactNode;
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches);
  const [showReplay, setShowReplay] = useState(true);
  const fullscreen = useRef<HTMLDialogElement>(null);
  const record = useMemo(() => buildOfficialLegacyRecord(payload), [payload]);
  const collapsedMap = useMemo(() => Object.fromEntries(record.sections.map(section => [section.inning, false])), [record.sections]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const teamNames = { away: payload.game.awayTeamName, home: payload.game.homeTeamName };
  const displayScore = { away: payload.game.awayScore ?? '—', home: payload.game.homeScore ?? '—' };
  const status = payload.game.status === 'COMPLETED' ? '경기 종료' : '게시 기록';
  const resultText = `${teamNames.away} ${displayScore.away} - ${teamNames.home} ${displayScore.home}`;
  const panel = (enlarged = false) => <ScoreboardPanelDisplay
    style={enlarged ? { width: '100%', height: 'auto', aspectRatio: 'auto' } : isMobile
      ? { width: '100%', maxWidth: '100%', height: 'auto', minHeight: '500px', overflow: 'hidden' }
      : { width: '100%', aspectRatio: '4 / 3' }}
    showFootnote={false} hideBases teamNames={teamNames} displayScore={displayScore}
    currentPitcher="미제공" currentBatter="미제공" pitcherDescription="투구별 정보 미제공" batterDescription="타석별 실시간 정보 미제공"
    inningLabel={status} ball={null} strike={null} out={null} bases={[]}
    lastPlay="UniquePlay 공식 기록 · 투구별 문자중계 미제공" boxScore={record.boxScore}
    header={enlarged ? undefined : header ?? <div className="match-selector-bar">{resultText}</div>}
  />;
  const download = () => {
    const blob = new Blob(['\uFEFF', record.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `aubl-official-${payload.sourceGameId}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="scoreboard-text-page scoreboard-text-page--official-legacy">
    <div className="main-content-grid">
      <div className={`scoreboard-section ${isMobile ? 'mobile-layout' : ''}`}>
        <div style={{ position: 'relative' }}>
          {panel()}
          <button type="button" onClick={() => fullscreen.current?.showModal()} title="전광판 크게 보기" aria-label="전광판 크게 보기"
            style={{ position: 'absolute', top: 10, right: 10, width: 44, height: 44, padding: 0, borderRadius: 10, border: '1px solid rgba(148,163,184,0.45)', background: 'rgba(15,23,42,0.82)', color: '#e2e8f0', fontSize: 16 }}>⤢</button>
        </div>
        <div style={{ marginTop: 20 }}>
          <NowPlayingCard batter="미제공" pitcher="미제공" unavailable balls={0} strikes={0}
            batterToday={{ pa: 0, ab: 0, hits: 0, hr: 0, doubles: 0, triples: 0, bb: 0, hbp: 0, so: 0, sac: 0 }}
            pitcherToday={{ bf: 0, outs: 0, hits: 0, hr: 0, bb: 0, hbp: 0, so: 0, pitches: 0, strikes: 0, balls: 0 }} />
        </div>
      </div>
      <div className="live-feed-section game-over">
        <PostGameSummary summary={record.summary} officialRecord actionSlot={<button className="official-legacy-action" type="button" onClick={download}>기록지 다운로드 (CSV)</button>} />
        <div style={{ border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', display: 'grid', alignContent: 'start', gap: 6, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 900, fontSize: 14 }}>문자중계 다시보기</span>
              <span style={{ color: 'var(--season-muted)', fontSize: 12, fontWeight: 700 }}>이전 이닝에서 이어지는 타순과 타자일순을 반영한 타석 순서입니다.</span>
            </div>
            <button className="official-legacy-action" type="button" aria-expanded={showReplay} onClick={() => setShowReplay(value => !value)}>{showReplay ? '문자중계 접기' : '문자중계 불러오기'}</button>
          </div>
          <p className="official-legacy-note">원본 결과와 타순을 연결해 재구성했습니다. 주루·교체의 정확한 발생 시점과 투구별 중계는 제공되지 않습니다. 타순이 모호하면 해당 이닝부터 원본 표기로 표시합니다. 타자 TOP3는 안타순, 투수 TOP2는 탈삼진순입니다.</p>
          {showReplay && <LiveFeed key={payload.sourceGameId} sections={record.sections} collapsedMap={collapsedMap}
            gameOverInfo={{ endText: status, resultText }} isMobile={isMobile} officialRecord />}
        </div>
      </div>
    </div>
    <div className="stats-grid">
      {record.tableRows.map(team => <div key={team.teamName} style={{ display: 'grid', gap: 8 }}>
        <StatsTable title={`${team.teamName} 타자 기록`} stats={[]} displayRows={team.batters} variant="batter" density="compact" subtitle="UniquePlay 공식 기록 · 미제공 —" />
        <StatsTable title={`${team.teamName} 투수 기록`} stats={[]} displayRows={team.pitchers} variant="pitcher" density="compact" subtitle="UniquePlay 공식 기록 · 미제공 —" />
      </div>)}
    </div>
    <div className="removed-players-grid">
      {record.tableRows.map(team => <RemovedPlayersPanel key={team.teamName} title={`교체 out (${team.teamName})`} players={[]} density="compact" unavailable />)}
    </div>
    <CsvRecordPreview csvContent={record.csv} awayTeamName={teamNames.away} homeTeamName={teamNames.home} officialRecord />
    <dialog ref={fullscreen} className="official-legacy-fullscreen" aria-label="공식 경기 전광판">
      <button type="button" onClick={() => fullscreen.current?.close()}>닫기</button>
      {panel(true)}
    </dialog>
  </div>;
}
