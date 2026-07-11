import { POSITION_LABELS } from '../data/eventConfig';
import type { AllStarPosition, VotingCandidate } from '../types';

type CandidateCardProps = {
  candidate: VotingCandidate;
  selected: boolean;
  selectionBlocked: boolean;
  interactionLocked?: boolean;
  displayNumber: string | number;
  onToggle: (candidate: VotingCandidate) => void;
};

export function CandidateCard({
  candidate,
  selected,
  selectionBlocked,
  interactionLocked = false,
  displayNumber,
  onToggle,
}: CandidateCardProps) {
  const isDisabled = interactionLocked || (selectionBlocked && !selected);

  return (
    <button
      type="button"
      className={`allstar-candidate${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-disabled={isDisabled}
      onClick={() => {
        if (!isDisabled) onToggle(candidate);
      }}
    >
      <span className="allstar-candidate__topline">
        <span className="allstar-candidate__number" aria-hidden="true">
          {String(displayNumber).padStart(2, '0')}
        </span>
        <span className="allstar-candidate__draft">{candidate.draft ? 'DRAFT' : 'NOMINEE'}</span>
      </span>

      <span className="allstar-candidate__body">
        <span className="allstar-candidate__position">
          {POSITION_LABELS[candidate.position as AllStarPosition] ?? candidate.position}
        </span>
        <strong>{candidate.name}</strong>
        <span className="allstar-candidate__school">{candidate.school}</span>
      </span>

      <span className="allstar-candidate__footer">
        <span>{candidate.group ? `${candidate.group}조` : candidate.number ? `NO. ${candidate.number}` : 'AUBL'}</span>
        <span className="allstar-candidate__select-label">
          <span className="allstar-candidate__check" aria-hidden="true">
            {selected ? '✓' : '+'}
          </span>
          {selected ? '선택됨' : isDisabled ? '선택 완료' : '선택'}
        </span>
      </span>
    </button>
  );
}
