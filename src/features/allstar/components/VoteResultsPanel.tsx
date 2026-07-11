import { useMemo, useState } from 'react';

import { ALL_STAR_POSITIONS, POSITION_LABELS, TEAM_META } from '../data/eventConfig';
import type { AllStarPosition, AllStarTeam, VotingCandidate, VotingContest } from '../types';

import './VoteResultsPanel.css';

type VoteResultsPanelProps = {
  candidates: readonly VotingCandidate[];
  contests: readonly VotingContest[];
  resultCounts?: Record<string, number> | null;
  preview: boolean;
  updatedAt: string | null;
};

type ResultView = 'RANKING' | 'FIELD';

type RankedCandidate = {
  candidate: VotingCandidate;
  votes: number;
  rank: number;
};

type PositionRanking = {
  position: AllStarPosition;
  candidates: RankedCandidate[];
};

const FIELD_POSITIONS: ReadonlyArray<{
  position: AllStarPosition;
  className: string;
}> = [
  { position: 'CF', className: 'is-cf' },
  { position: 'LF', className: 'is-lf' },
  { position: 'RF', className: 'is-rf' },
  { position: 'SS', className: 'is-ss' },
  { position: '2B', className: 'is-2b' },
  { position: '3B', className: 'is-3b' },
  { position: '1B', className: 'is-1b' },
  { position: 'P', className: 'is-p' },
  { position: 'C', className: 'is-c' },
];

function buildPreviewCounts(contests: readonly VotingContest[]): Record<string, number> {
  const counts: Record<string, number> = {};

  contests.forEach((contest, contestIndex) => {
    contest.candidateIds.forEach((candidateId, candidateIndex) => {
      const orderWeight = Math.max(0, contest.candidateIds.length - candidateIndex) * 91;
      const stableOffset = ((contestIndex + 1) * 43 + (candidateIndex + 1) * 29) % 73;
      counts[candidateId] = 310 + orderWeight + stableOffset;
    });
  });

  return counts;
}

function formatUpdatedAt(updatedAt: string | null): string | null {
  if (!updatedAt) return null;

  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return updatedAt;

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function VoteResultsPanel({
  candidates,
  contests,
  resultCounts = null,
  preview,
  updatedAt,
}: VoteResultsPanelProps) {
  const [selectedTeam, setSelectedTeam] = useState<AllStarTeam>('TEAM_1');
  const [activeView, setActiveView] = useState<ResultView>('RANKING');

  const counts = useMemo(
    () => resultCounts ?? (preview ? buildPreviewCounts(contests) : null),
    [contests, preview, resultCounts],
  );

  const rankings = useMemo<PositionRanking[]>(() => {
    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    return ALL_STAR_POSITIONS.map((position) => {
      const candidateIds = contests
        .filter((contest) => contest.team === selectedTeam && contest.position === position)
        .flatMap((contest) => contest.candidateIds);
      const uniqueCandidateIds = [...new Set(candidateIds)];
      const rankedCandidates = uniqueCandidateIds
        .map((candidateId) => candidateById.get(candidateId))
        .filter((candidate): candidate is VotingCandidate => Boolean(candidate))
        .map((candidate) => ({
          candidate,
          votes: counts?.[candidate.id] ?? 0,
          rank: 0,
        }))
        .sort((a, b) => b.votes - a.votes || a.candidate.name.localeCompare(b.candidate.name, 'ko'))
        .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

      return { position, candidates: rankedCandidates };
    });
  }, [candidates, contests, counts, selectedTeam]);

  const formattedUpdatedAt = formatUpdatedAt(updatedAt);

  return (
    <section className="allstar-results" aria-labelledby="allstar-results-title">
      <div className="allstar-results__header">
        <div>
          <p className="allstar-results__eyebrow">LIVE VOTE BOARD</p>
          <h2 id="allstar-results-title">실시간 투표 현황</h2>
          <p>포지션별 득표 순위와 현재 선두 라인업을 확인하세요.</p>
        </div>
        {formattedUpdatedAt ? (
          <time className="allstar-results__updated" dateTime={updatedAt ?? undefined}>
            {formattedUpdatedAt} 기준
          </time>
        ) : null}
      </div>

      {preview ? (
        <div className="allstar-results__preview" role="note">
          <span aria-hidden="true">!</span>
          <strong>예시 데이터 · 실제 득표 아님</strong>
        </div>
      ) : null}

      <div className="allstar-results__controls">
        <div className="allstar-results__team-switch" role="group" aria-label="결과를 확인할 팀">
          {(['TEAM_1', 'TEAM_2'] as const).map((team) => (
            <button
              key={team}
              type="button"
              className={selectedTeam === team ? 'is-active' : undefined}
              aria-pressed={selectedTeam === team}
              onClick={() => setSelectedTeam(team)}
            >
              <strong>{TEAM_META[team].label}</strong>
              <span>{TEAM_META[team].groups}</span>
            </button>
          ))}
        </div>

        <div className="allstar-results__view-switch" role="tablist" aria-label="결과 표시 방식">
          <button
            id="allstar-results-ranking-tab"
            type="button"
            role="tab"
            aria-selected={activeView === 'RANKING'}
            aria-controls="allstar-results-view"
            className={activeView === 'RANKING' ? 'is-active' : undefined}
            onClick={() => setActiveView('RANKING')}
          >
            순위표
          </button>
          <button
            id="allstar-results-field-tab"
            type="button"
            role="tab"
            aria-selected={activeView === 'FIELD'}
            aria-controls="allstar-results-view"
            className={activeView === 'FIELD' ? 'is-active' : undefined}
            onClick={() => setActiveView('FIELD')}
          >
            그라운드
          </button>
        </div>
      </div>

      {!counts ? (
        <div className="allstar-results__preparing" role="status" aria-live="polite">
          <span aria-hidden="true">◇</span>
          <strong>투표 현황을 준비하고 있습니다</strong>
          <p>실제 투표가 시작되면 포지션별 득표 현황이 이곳에 표시됩니다.</p>
        </div>
      ) : (
        <div
          id="allstar-results-view"
          className="allstar-results__view"
          role="tabpanel"
          aria-labelledby={
            activeView === 'RANKING' ? 'allstar-results-ranking-tab' : 'allstar-results-field-tab'
          }
        >
          {activeView === 'RANKING' ? (
            <div className="allstar-results__rankings">
              {rankings.map(({ position, candidates: rankedCandidates }) => (
                <section className="allstar-results__position" key={position}>
                  <header>
                    <span>{position}</span>
                    <h3>{POSITION_LABELS[position]}</h3>
                    <small>상위 2명 선발권</small>
                  </header>

                  {rankedCandidates.length ? (
                    <ol aria-label={`${TEAM_META[selectedTeam].label} ${POSITION_LABELS[position]} 득표 순위`}>
                      {rankedCandidates.map(({ candidate, votes, rank }) => (
                        <li className={rank <= 2 ? 'is-leading' : undefined} key={candidate.id}>
                          <span className="allstar-results__rank" aria-label={`${rank}위`}>
                            {rank}
                          </span>
                          <span className="allstar-results__candidate">
                            <strong>{candidate.name}</strong>
                            <small>{candidate.school}</small>
                          </span>
                          {rank <= 2 ? <span className="allstar-results__cut">TOP 2</span> : null}
                          <strong className="allstar-results__votes">
                            {votes.toLocaleString('ko-KR')}
                            <small>표</small>
                          </strong>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="allstar-results__empty">후보 집계 전</p>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <div className="allstar-results__field-wrap">
              <div className="allstar-results__field-heading">
                <span>{TEAM_META[selectedTeam].label}</span>
                <strong>현재 TOP 2 라인업</strong>
                <small>{TEAM_META[selectedTeam].groups}</small>
              </div>
              <div className="allstar-results__field" aria-label={`${TEAM_META[selectedTeam].label} 포지션별 상위 2명`}>
                <div className="allstar-results__field-surface" aria-hidden="true">
                  <span className="allstar-results__foul-line is-left" />
                  <span className="allstar-results__foul-line is-right" />
                  <span className="allstar-results__infield-dirt"><span /></span>
                  <span className="allstar-results__mound" />
                  <span className="allstar-results__base is-second" />
                  <span className="allstar-results__base is-third" />
                  <span className="allstar-results__base is-first" />
                </div>
                <span className="allstar-results__base is-home" aria-hidden="true" />
                {FIELD_POSITIONS.map(({ position, className }) => {
                  const leaders = rankings.find((ranking) => ranking.position === position)?.candidates.slice(0, 2) ?? [];

                  return (
                    <section
                      className={`allstar-results__field-position ${className}`}
                      aria-label={`${POSITION_LABELS[position]} 상위 선수`}
                      key={position}
                    >
                      <span>{position}</span>
                      <strong>{POSITION_LABELS[position]}</strong>
                      {leaders.length ? (
                        <ol>
                          {leaders.map(({ candidate, rank }) => (
                            <li key={candidate.id}>
                              <b>{rank}</b>
                              <span>{candidate.name}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <small>집계 전</small>
                      )}
                    </section>
                  );
                })}
              </div>
              <p className="allstar-results__field-note">현재 득표 기준 포지션별 상위 2명입니다.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
