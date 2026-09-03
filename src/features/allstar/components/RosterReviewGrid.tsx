import { POSITION_LABELS, TEAM_META } from '../data/eventConfig';
import type { AllStarPosition, AllStarTeam } from '../types';
import { PlayerCardSurface, type CardDisplayCandidate } from './PlayerCardSurface';
import './RosterReview.css';

export type RosterReviewGridProps = {
  candidates: readonly CardDisplayCandidate[];
  team: AllStarTeam;
  onOpen: (index: number) => void;
  label?: string;
  className?: string;
};

const positionLabel = (position: string) =>
  POSITION_LABELS[position as AllStarPosition] ?? position;

/**
 * Read-only roster review grid. Candidates are rendered in the order supplied
 * so the caller can preserve the ballot's position order.
 */
export function RosterReviewGrid({
  candidates,
  team,
  onOpen,
  label = `${TEAM_META[team].label} 선택 선수 ${candidates.length}명`,
  className = '',
}: RosterReviewGridProps) {
  return (
    <div
      className={`allstar-roster-grid ${className}`.trim()}
      role="list"
      aria-label={label}
    >
      {candidates.map((candidate, index) => (
        <div className="allstar-roster-grid__item" role="listitem" key={candidate.id}>
          <button
            type="button"
            className="allstar-roster-grid__button"
            aria-label={`${positionLabel(candidate.position)} ${candidate.name}, ${candidate.school} 자세히 보기`}
            aria-haspopup="dialog"
            onClick={() => onOpen(index)}
          >
            <PlayerCardSurface
              candidate={candidate}
              index={index}
              active={false}
              selected
              variant="thumbnail"
            />
          </button>
        </div>
      ))}
    </div>
  );
}
