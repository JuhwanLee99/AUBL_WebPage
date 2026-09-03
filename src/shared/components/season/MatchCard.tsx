import type { ReactNode } from 'react';
import SeasonBadge, { type SeasonBadgeTone } from './SeasonBadge';

interface MatchCardProps {
  dateLabel: string;
  statusLabel: string;
  statusTone?: SeasonBadgeTone;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number | null;
  awayScore?: number | null;
  venue?: string | null;
  meta?: ReactNode;
}

export default function MatchCard({
  dateLabel,
  statusLabel,
  statusTone = 'navy',
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  venue,
  meta,
}: MatchCardProps) {
  const hasScore = Number.isFinite(homeScore) && Number.isFinite(awayScore);
  return (
    <article className="season-match-card">
      <header>
        <time>{dateLabel}</time>
        <SeasonBadge tone={statusTone}>{statusLabel}</SeasonBadge>
      </header>
      <div className="season-match-card__teams">
        <strong>{homeTeam}</strong>
        <span aria-label={hasScore ? `${homeScore} 대 ${awayScore}` : '경기 전'}>
          {hasScore ? `${homeScore} : ${awayScore}` : 'VS'}
        </span>
        <strong>{awayTeam}</strong>
      </div>
      {venue || meta ? <footer>{venue ? <span>{venue}</span> : null}{meta}</footer> : null}
    </article>
  );
}
