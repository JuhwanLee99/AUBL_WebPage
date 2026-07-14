import { useMemo, useState } from 'react';

import { POSITION_LABELS, TEAM_META } from '../data/eventConfig';
import type { AllStarTeam, VotingCandidate, VotingContest } from '../types';
import {
  buildPreviewCounts,
  buildTeamRankings,
  TopTwoField,
  type PositionRanking,
} from './TopTwoField';

import './VoteResultsPanel.css';

type VoteResultsPanelProps = {
  candidates: readonly VotingCandidate[];
  contests: readonly VotingContest[];
  resultCounts?: Record<string, number> | null;
  preview: boolean;
  updatedAt: string | null;
  selectedTeam: AllStarTeam;
  onTeamChange: (team: AllStarTeam) => void;
};

type ResultView = 'RANKING' | 'FIELD';

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
  selectedTeam,
  onTeamChange,
}: VoteResultsPanelProps) {
  const [activeView, setActiveView] = useState<ResultView>('RANKING');

  const counts = useMemo(
    () => resultCounts ?? (preview ? buildPreviewCounts(contests) : null),
    [contests, preview, resultCounts],
  );

  const rankings = useMemo<PositionRanking[]>(
    () => buildTeamRankings(candidates, contests, counts, selectedTeam),
    [candidates, contests, counts, selectedTeam],
  );

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
              onClick={() => onTeamChange(team)}
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
                <section
                  className={`allstar-results__position${position === 'OF' ? ' is-of' : ''}`}
                  key={position}
                >
                  <header>
                    <span>{position}</span>
                    <h3>{POSITION_LABELS[position]}</h3>
                    <small>상위 {position === 'OF' ? 6 : 2}명 선발권</small>
                  </header>

                  {rankedCandidates.length ? (
                    <ol aria-label={`${TEAM_META[selectedTeam].label} ${POSITION_LABELS[position]} 득표 순위`}>
                      {rankedCandidates.map(({ candidate, votes, rank }) => {
                        const cutoff = position === 'OF' ? 6 : 2;
                        const isLeading = rank <= cutoff;

                        return (
                          <li className={isLeading ? 'is-leading' : undefined} key={candidate.id}>
                            <span className="allstar-results__rank" aria-label={`${rank}위`}>
                              {rank}
                            </span>
                            <span className="allstar-results__candidate">
                              <strong>{candidate.name}</strong>
                              <small>{candidate.school}</small>
                            </span>
                            {isLeading ? (
                              <span className="allstar-results__cut">TOP {cutoff}</span>
                            ) : null}
                            <strong className="allstar-results__votes">
                              {votes.toLocaleString('ko-KR')}
                              <small>표</small>
                            </strong>
                          </li>
                        );
                      })}
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
                <strong>현재 선두 라인업</strong>
                <small>{TEAM_META[selectedTeam].groups}</small>
              </div>
              <TopTwoField rankings={rankings} selectedTeam={selectedTeam} />
              <p className="allstar-results__field-note">
                현재 득표 기준 내야·배터리 상위 2명, 외야 상위 6명입니다.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
