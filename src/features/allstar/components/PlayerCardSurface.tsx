import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { POSITION_LABELS, TEAM_META } from '../data/eventConfig';
import type { AllStarPosition, AllStarTeam } from '../types';

export type CardDisplayCandidate = {
  id: string;
  name: string;
  school: string;
  group: string;
  position: string;
  team: AllStarTeam;
  number?: string;
  note?: string;
};

type PlayerCardSurfaceProps = {
  candidate: CardDisplayCandidate;
  index: number;
  active: boolean;
  selected: boolean;
  expanded?: boolean;
  onOpen?: () => void;
};

const positionLabel = (position: string) =>
  POSITION_LABELS[position as AllStarPosition] ?? position;

export function PlayerCardSurface({
  candidate,
  index,
  active,
  selected,
  expanded = false,
  onOpen,
}: PlayerCardSurfaceProps) {
  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    event.currentTarget.style.setProperty('--foil-x', `${x.toFixed(2)}%`);
    event.currentTarget.style.setProperty('--foil-y', `${y.toFixed(2)}%`);
    event.currentTarget.style.setProperty('--glare-opacity', active ? '0.38' : '0.12');
  };

  const resetPointerLight = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty('--foil-x', '50%');
    event.currentTarget.style.setProperty('--foil-y', '38%');
    event.currentTarget.style.setProperty('--glare-opacity', active ? '0.2' : '0.06');
  };

  const style = {
    '--card-accent': candidate.team === 'TEAM_1' ? '#ff7048' : '#6b8dff',
  } as CSSProperties;

  const className = `player-card-surface is-${TEAM_META[candidate.team].tone}${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}`;
  const label = `${candidate.name}, ${candidate.school}, ${positionLabel(candidate.position)}${selected ? ', 선택됨' : ''}`;
  const content: ReactNode = (
    <>
      <span className="player-card-surface__texture" aria-hidden="true" />
      <span className="player-card-surface__foil" aria-hidden="true" />
      <span className="player-card-surface__glare" aria-hidden="true" />

      <span className="player-card-surface__frame" aria-hidden="true">
        <span />
      </span>

      <span className="player-card-surface__topline">
        <span className="player-card-surface__serial">AUBL {String(index + 1).padStart(2, '0')}</span>
        <span className="player-card-surface__position">{positionLabel(candidate.position)}</span>
      </span>

      <span className="player-card-surface__portrait" aria-hidden="true">
        <span className="player-card-surface__monogram">{candidate.name.slice(0, 1)}</span>
        <span className="player-card-surface__diamond" />
      </span>

      <span className="player-card-surface__identity">
        <span className="player-card-surface__team">{TEAM_META[candidate.team].label} · {candidate.group ? `${candidate.group}조` : 'AUBL'}</span>
        <strong>{candidate.name}</strong>
        <span className="player-card-surface__school">{candidate.school}</span>
        {candidate.note ? <span className="player-card-surface__note">{candidate.note}</span> : null}
      </span>

      <span className="player-card-surface__selection" aria-hidden={!selected}>
        <span>{selected ? '✓' : ''}</span>
        {selected ? '선택됨' : 'AUBL ALL-STAR'}
      </span>
    </>
  );

  if (!onOpen) {
    return (
      <div
        className={className}
        style={style}
        role="group"
        aria-label={label}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetPointerLight}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      tabIndex={active ? 0 : -1}
      aria-label={`${label}, 자세히 보기`}
      aria-pressed={selected}
      aria-haspopup="dialog"
      onClick={onOpen}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointerLight}
    >
      {content}
    </button>
  );
}
