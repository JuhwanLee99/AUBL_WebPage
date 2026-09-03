import { forwardRef } from 'react';
import { TEAM_META } from '../data/eventConfig';
import type { AllStarTeam } from '../types';
import { PlayerCardSurface, type CardDisplayCandidate } from './PlayerCardSurface';
import './RosterReview.css';

const SHARE_ROSTER_SIZE = 12;

export type RosterShareSheetProps = {
  team1Candidates: readonly CardDisplayCandidate[];
  team2Candidates: readonly CardDisplayCandidate[];
  className?: string;
};

type TeamRosterSectionProps = {
  team: AllStarTeam;
  candidates: readonly CardDisplayCandidate[];
};

function TeamRosterSection({ team, candidates }: TeamRosterSectionProps) {
  const slots = Array.from({ length: SHARE_ROSTER_SIZE }, (_, index) => candidates[index] ?? null);
  const tone = TEAM_META[team].tone;

  return (
    <section className={`roster-share-sheet__team is-${tone}`}>
      <header className="roster-share-sheet__team-header">
        <div className="roster-share-sheet__team-title">
          <span>ALL-STAR TEAM</span>
          <strong>{TEAM_META[team].label}</strong>
        </div>
        <div className="roster-share-sheet__team-meta">
          <span>{TEAM_META[team].groups}</span>
          <b>{Math.min(candidates.length, SHARE_ROSTER_SIZE)} PLAYER CARDS</b>
        </div>
      </header>

      <div className="roster-share-sheet__players">
        {slots.map((candidate, index) => (
          <article
            className={`roster-share-sheet__player${candidate ? '' : ' is-empty'}`}
            key={candidate?.id ?? `${team}-empty-${index}`}
          >
            {candidate ? (
              <PlayerCardSurface
                candidate={candidate}
                index={index}
                active={false}
                selected
                variant="share"
              />
            ) : (
              <>
                <span className="roster-share-sheet__empty-mark">AUBL</span>
                <span className="roster-share-sheet__empty-label">ROSTER SLOT</span>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Fixed-size, static surface intended exclusively for html2canvas capture. */
export const RosterShareSheet = forwardRef<HTMLDivElement, RosterShareSheetProps>(
  function RosterShareSheet(
    { team1Candidates, team2Candidates, className = '' },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`roster-share-sheet ${className}`.trim()}
        data-roster-share-sheet="true"
        aria-hidden="true"
      >
        <header className="roster-share-sheet__header">
          <div className="roster-share-sheet__brand-mark">
            <img src="/assets/aubl_clean.png" alt="" />
          </div>
          <div className="roster-share-sheet__headline">
            <span>2026 AUBL · OFFICIAL ALL-STAR</span>
            <h2>MY ALL-STAR ROSTER</h2>
            <p>내가 완성한 2026 AUBL 올스타 라인업</p>
          </div>
          <div className="roster-share-sheet__year-mark" aria-hidden="true">
            <span>ALL</span>
            <strong>26</strong>
            <span>STAR</span>
          </div>
        </header>

        <TeamRosterSection team="TEAM_1" candidates={team1Candidates} />
        <TeamRosterSection team="TEAM_2" candidates={team2Candidates} />

        <footer className="roster-share-sheet__footer">
          <span>YOUR PICKS. YOUR ALL-STARS.</span>
          <b>AUBL BASEBALL · 2026</b>
        </footer>
      </div>
    );
  },
);

RosterShareSheet.displayName = 'RosterShareSheet';
