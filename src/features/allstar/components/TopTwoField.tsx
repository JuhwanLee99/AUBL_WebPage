import { ALL_STAR_POSITIONS, POSITION_LABELS, TEAM_META } from '../data/eventConfig';
import type { AllStarPosition, AllStarTeam, VotingCandidate, VotingContest } from '../types';

export type RankedCandidate = {
  candidate: VotingCandidate;
  votes: number;
  rank: number;
};

export type PositionRanking = {
  position: AllStarPosition;
  candidates: RankedCandidate[];
};

const FIELD_POSITIONS: ReadonlyArray<{
  position: AllStarPosition;
  className: string;
}> = [
  { position: 'OF', className: 'is-of' },
  { position: 'SS', className: 'is-ss' },
  { position: '2B', className: 'is-2b' },
  { position: '3B', className: 'is-3b' },
  { position: '1B', className: 'is-1b' },
  { position: 'P', className: 'is-p' },
  { position: 'C', className: 'is-c' },
];

export function buildPreviewCounts(contests: readonly VotingContest[]): Record<string, number> {
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

export function buildTeamRankings(
  candidates: readonly VotingCandidate[],
  contests: readonly VotingContest[],
  counts: Record<string, number> | null,
  selectedTeam: AllStarTeam,
): PositionRanking[] {
  if (!counts) {
    return ALL_STAR_POSITIONS.map((position) => ({ position, candidates: [] }));
  }

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return ALL_STAR_POSITIONS.map((position) => {
    const candidateIds = contests
      .filter((contest) => contest.team === selectedTeam && contest.position === position)
      .flatMap((contest) => contest.candidateIds);
    const uniqueCandidateIds = [...new Set(candidateIds)];
    const sortedCandidates = uniqueCandidateIds
      .flatMap((candidateId, stableOrder) => {
        const candidate = candidateById.get(candidateId);

        return candidate
          ? [{ candidate, votes: counts[candidate.id] ?? 0, stableOrder }]
          : [];
      })
      .sort((a, b) => b.votes - a.votes || a.stableOrder - b.stableOrder);

    let previousVotes: number | null = null;
    let previousRank = 0;
    const rankedCandidates = sortedCandidates.map(({ candidate, votes }, index) => {
      const rank = previousVotes === votes ? previousRank : index + 1;
      previousVotes = votes;
      previousRank = rank;

      return { candidate, votes, rank };
    });

    return { position, candidates: rankedCandidates };
  });
}

type TopTwoFieldProps = {
  rankings: readonly PositionRanking[];
  selectedTeam: AllStarTeam;
  hero?: boolean;
};

export function TopTwoField({ rankings, selectedTeam, hero = false }: TopTwoFieldProps) {
  return (
    <div
      className={`allstar-results__field${hero ? ' allstar-results__field--hero' : ''}`}
      aria-label={`${TEAM_META[selectedTeam].label} 내야와 배터리 상위 2명, 외야 상위 6명`}
    >
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
        const cutoff = position === 'OF' ? 6 : 2;
        const leaders =
          rankings
            .find((ranking) => ranking.position === position)
            ?.candidates.filter(({ rank }) => rank <= cutoff) ?? [];

        return (
          <section
            className={`allstar-results__field-position ${className}`}
            aria-label={`${POSITION_LABELS[position]} 상위 ${cutoff}명`}
            key={position}
          >
            <span>{position}</span>
            <strong>
              {POSITION_LABELS[position]} <em>TOP {cutoff}</em>
            </strong>
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
  );
}
