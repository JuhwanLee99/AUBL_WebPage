import { useState, type ReactNode } from 'react';
import OfficialLegacyTextView from './OfficialLegacyTextView';
import type { OfficialBatterGameRow, OfficialGameDetailTeam, OfficialGameDetailsResponse, OfficialPitcherGameRow } from '@core/api/backendClient';
import { OfficialRecordQualityNotice } from '@shared/components/season/OfficialRecordQualityNotice';

type RecordViewMode = 'detail' | 'commentary';
type OfficialGameDetailProps = {
  payload: OfficialGameDetailsResponse;
  onRetry: () => void;
  legacyHeader?: ReactNode;
};

function officialValue(value: number | string | null | undefined, digits?: number): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number' && digits != null) return value.toFixed(digits);
  return String(value);
}

function officialDateTime(value: string | null): string {
  if (!value) return '일시 미정';
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? `${value}+09:00` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function OfficialGameDetailLoading() {
  return (
    <main className="official-game-detail official-game-detail--message" aria-busy="true">
      <span className="official-game-detail__eyebrow">UNIQUEPLAY OFFICIAL RECORD</span>
      <h1>공식 경기 기록을 불러오고 있습니다</h1>
      <p role="status">게시된 리비전과 박스스코어를 확인 중입니다.</p>
    </main>
  );
}

export function OfficialGameDetailMessage({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <main className="official-game-detail official-game-detail--message">
      <span className="official-game-detail__eyebrow">UNIQUEPLAY OFFICIAL RECORD</span>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="official-game-detail__message-actions">
        <a className="official-game-detail__button official-game-detail__button--secondary" href="/schedule">경기 일정으로</a>
        <button className="official-game-detail__button" type="button" onClick={onRetry}>다시 확인</button>
      </div>
    </main>
  );
}

export function OfficialGameDetailView(props: OfficialGameDetailProps) {
  // A fresh game entry always starts with official details. Neither a previous
  // game's toggle nor the retired localStorage preference may select replay.
  return <OfficialGameDetailSession key={`${props.payload.provider}:${props.payload.sourceGameId}`} {...props} />;
}

function OfficialGameDetailSession(props: OfficialGameDetailProps) {
  const [viewMode, setViewMode] = useState<RecordViewMode>('detail');
  return <OfficialGameDetailContent {...props} viewMode={viewMode} onViewChange={setViewMode} />;
}

export function OfficialGameDetailContent({
  payload,
  onRetry,
  legacyHeader,
  viewMode,
  onViewChange,
}: OfficialGameDetailProps & {
  viewMode: RecordViewMode;
  onViewChange: (next: RecordViewMode) => void;
}) {
  const unavailable = payload.status !== 'AVAILABLE'
    || payload.detail == null
    || payload.detail.status !== 'AVAILABLE';
  const statusTitle = payload.status === 'REVIEW_REQUIRED'
    ? '경기 결과와 공식 상세 기록의 대조가 필요합니다'
    : payload.status === 'NOT_PUBLISHED' || payload.detail?.status === 'NOT_PUBLISHED'
      ? '공식 상세 기록이 아직 게시되지 않았습니다'
      : '공식 상세 기록이 아직 수집되지 않았습니다';
  const statusDescription = payload.status === 'REVIEW_REQUIRED'
    ? '공개된 경기 점수·상태와 UniquePlay 상세 기록이 달라 관리자가 확인 중입니다. 확정 전에는 기존 AUBL 수기 기록으로 대체하지 않습니다.'
    : '공식 데이터의 검수·게시가 완료되면 자동으로 표시됩니다. 기존 AUBL 수기 기록으로 자동 대체하지 않습니다.';

  if (unavailable) {
    return (
      <OfficialGameDetailMessage
        title={statusTitle}
        description={statusDescription}
        onRetry={onRetry}
      />
    );
  }

  const detail = payload.detail!;
  const teamByName = (teamName: string) => detail.teams.find((team) => team.teamName === teamName) ?? null;
  const orderedTeams = [
    teamByName(payload.game.awayTeamName),
    teamByName(payload.game.homeTeamName),
    ...detail.teams.filter((team) => team.teamName !== payload.game.awayTeamName && team.teamName !== payload.game.homeTeamName),
  ].filter((team, index, items): team is OfficialGameDetailTeam => team !== null && items.indexOf(team) === index);

  return (
    <main className={`official-game-detail official-game-detail--${viewMode}`}>
      <div className="official-game-detail__view-bar">
        <div>
          <span className="official-game-detail__eyebrow">GAME RECORD</span>
          <p>같은 공식 기록을 원하는 화면으로 확인하세요.</p>
        </div>
        <div className="official-game-detail__view-toggle" role="group" aria-label="경기 기록 화면 방식">
          <button type="button" aria-pressed={viewMode === 'detail'} onClick={() => onViewChange('detail')}>상세 기록</button>
          <button type="button" aria-pressed={viewMode === 'commentary'} onClick={() => onViewChange('commentary')}>문자중계 스타일</button>
        </div>
      </div>

      {viewMode === 'detail' && <header className="official-game-detail__hero">
        <div className="official-game-detail__hero-copy">
          <span className="official-game-detail__eyebrow">UNIQUEPLAY OFFICIAL RECORD</span>
          <h1>{payload.game.awayTeamName} <span>vs</span> {payload.game.homeTeamName}</h1>
          <p>
            {officialDateTime(payload.game.playedAt)}
            {payload.game.venue ? ` · ${payload.game.venue}` : ''}
            {payload.game.groupCode ? ` · ${payload.game.groupCode}조` : ''}
          </p>
        </div>
        <div className="official-game-detail__score" aria-label={`${payload.game.awayTeamName} ${officialValue(payload.game.awayScore)}, ${payload.game.homeTeamName} ${officialValue(payload.game.homeScore)}`}>
          <div><span>{payload.game.awayTeamName}</span><strong>{officialValue(payload.game.awayScore)}</strong></div>
          <span aria-hidden="true">—</span>
          <div><span>{payload.game.homeTeamName}</span><strong>{officialValue(payload.game.homeScore)}</strong></div>
        </div>
      </header>}

      <div className="official-game-detail__freshness" role="status">
        <span>UniquePlay 공식 기록</span>
        <span>게시 리비전 {payload.syncRevision ?? '확인 중'}</span>
        <span>{payload.publishedAt ? `${officialDateTime(payload.publishedAt)} 게시` : '게시 시각 확인 중'}</span>
      </div>

      <OfficialRecordQualityNotice quality={payload.quality} issues={payload.issues} resolutionSource={payload.resolutionSource} resolvedAt={payload.resolvedAt} />

      {viewMode === 'commentary' ? (
        <OfficialLegacyTextView key={payload.sourceGameId} payload={payload} header={legacyHeader} />
      ) : <>
      <section className="official-game-detail__section" aria-labelledby="official-line-score-title">
        <div className="official-game-detail__section-heading">
          <div>
            <span>경기 요약</span>
            <h2 id="official-line-score-title">이닝별 점수</h2>
          </div>
        </div>
        <OfficialLineScore teams={orderedTeams} />
      </section>

      {orderedTeams.map((team) => (
        <OfficialTeamRecords key={team.teamName} team={team} />
      ))}
      </>}
    </main>
  );
}


function OfficialLineScore({ teams }: { teams: OfficialGameDetailTeam[] }) {
  const innings = [...new Set(teams.flatMap((team) => team.innings.map((item) => item.inning)))].sort((a, b) => a - b);
  return (
    <div className="official-game-detail__table-scroll" tabIndex={0} aria-label="이닝별 점수표, 가로로 스크롤할 수 있습니다">
      <table className="official-game-detail__table official-game-detail__line-score">
        <thead>
          <tr>
            <th scope="col">팀</th>
            {innings.map((inning) => <th scope="col" key={inning}>{inning}</th>)}
            <th scope="col">R</th>
            <th scope="col">H</th>
            <th scope="col">E</th>
            <th scope="col">BB</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const byInning = new Map(team.innings.map((item) => [item.inning, item]));
            return (
              <tr key={team.teamName}>
                <th scope="row">{team.teamName}</th>
                {innings.map((inning) => {
                  const value = byInning.get(inning);
                  return <td key={inning}>{value?.notPlayed ? <abbr title="공격하지 않음">×</abbr> : officialValue(value?.runs)}</td>;
                })}
                <td><strong>{officialValue(team.totals.runs)}</strong></td>
                <td>{officialValue(team.totals.hits)}</td>
                <td>{officialValue(team.totals.errors)}</td>
                <td>{officialValue(team.totals.walks)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OfficialTeamRecords({ team }: { team: OfficialGameDetailTeam }) {
  return (
    <section className="official-game-detail__section" aria-labelledby={`official-team-${team.teamName}`}>
      <div className="official-game-detail__section-heading">
        <div>
          <span>TEAM BOX SCORE</span>
          <h2 id={`official-team-${team.teamName}`}>{team.teamName}</h2>
        </div>
        <dl className="official-game-detail__totals">
          <div><dt>득점</dt><dd>{officialValue(team.totals.runs)}</dd></div>
          <div><dt>안타</dt><dd>{officialValue(team.totals.hits)}</dd></div>
          <div><dt>실책</dt><dd>{officialValue(team.totals.errors)}</dd></div>
          <div><dt>사사구</dt><dd>{officialValue(team.totals.walks)}</dd></div>
        </dl>
      </div>

      <h3>타자 기록</h3>
      <div className="official-game-detail__table-scroll" tabIndex={0} aria-label={`${team.teamName} 타자 기록표, 가로로 스크롤할 수 있습니다`}>
        <table className="official-game-detail__table official-game-detail__player-table">
          <thead>
            <tr>
              <th scope="col">타순</th><th scope="col">선수</th><th scope="col">수비</th>
              <th scope="col">AB</th><th scope="col">H</th><th scope="col">R</th><th scope="col">RBI</th><th scope="col">SB</th>
              <th scope="col">AVG</th><th scope="col">시즌 AVG</th><th scope="col">타석 결과</th>
            </tr>
          </thead>
          <tbody>
            {team.batters.map((row) => <OfficialBatterRow key={row.rowKey} row={row} />)}
          </tbody>
        </table>
        {team.batters.length === 0 && <p className="official-game-detail__empty">게시된 타자 기록이 없습니다.</p>}
      </div>

      <h3>투수 기록</h3>
      <div className="official-game-detail__table-scroll" tabIndex={0} aria-label={`${team.teamName} 투수 기록표, 가로로 스크롤할 수 있습니다`}>
        <table className="official-game-detail__table official-game-detail__player-table">
          <thead>
            <tr>
              <th scope="col">선수</th><th scope="col">결과</th><th scope="col">IP</th><th scope="col">H</th>
              <th scope="col">R</th><th scope="col">ER</th><th scope="col">BB+HBP</th><th scope="col">SO</th><th scope="col">ERA</th>
            </tr>
          </thead>
          <tbody>
            {team.pitchers.map((row) => <OfficialPitcherRow key={row.rowKey} row={row} />)}
          </tbody>
        </table>
        {team.pitchers.length === 0 && <p className="official-game-detail__empty">게시된 투수 기록이 없습니다.</p>}
      </div>
    </section>
  );
}

function OfficialBatterRow({ row }: { row: OfficialBatterGameRow }) {
  return (
    <tr>
      <td>{officialValue(row.battingOrder)}</td>
      <th scope="row"><span>{row.playerName || '선수명 확인 중'}</span>{row.jerseyNumber ? <small>#{row.jerseyNumber}</small> : null}</th>
      <td>{row.position ?? '—'}</td>
      <td>{officialValue(row.stats.atBats)}</td><td>{officialValue(row.stats.hits)}</td><td>{officialValue(row.stats.runs)}</td>
      <td>{officialValue(row.stats.rbi)}</td><td>{officialValue(row.stats.stolenBases)}</td>
      <td>{officialValue(row.stats.battingAverage, 3)}</td><td>{officialValue(row.stats.seasonBattingAverage, 3)}</td>
      <td className="official-game-detail__appearances">
        {row.plateAppearances.length > 0
          ? row.plateAppearances.map((appearance, index) => (
            <span key={`${appearance.inning ?? 'inning'}-${index}`}>
              {appearance.inning != null ? `${appearance.inning}회 ` : ''}{appearance.result ?? '—'}
            </span>
          ))
          : '—'}
      </td>
    </tr>
  );
}

function OfficialPitcherRow({ row }: { row: OfficialPitcherGameRow }) {
  return (
    <tr>
      <th scope="row"><span>{row.playerName || '선수명 확인 중'}</span>{row.jerseyNumber ? <small>#{row.jerseyNumber}</small> : null}</th>
      <td>{row.decision ?? '—'}</td><td>{row.stats.inningsPitched ?? '—'}</td>
      <td>{officialValue(row.stats.hitsAllowed)}</td><td>{officialValue(row.stats.runsAllowed)}</td>
      <td>{officialValue(row.stats.earnedRuns)}</td><td>{officialValue(row.stats.walksAndHitByPitch)}</td>
      <td>{officialValue(row.stats.strikeouts)}</td><td>{officialValue(row.stats.era, 2)}</td>
    </tr>
  );
}
