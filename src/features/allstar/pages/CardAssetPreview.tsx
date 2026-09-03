import { PlayerCardSurface, type CardDisplayCandidate } from '../components/PlayerCardSurface';
import './AllStarExperience.css';
import './CardAssetPreview.css';

type PreviewTeam = 'TEAM_1' | 'TEAM_2';
type PreviewFace = 'front' | 'back';

const EXAMPLE_CANDIDATES: Record<PreviewTeam, CardDisplayCandidate> = {
  TEAM_1: {
    id: 'card-example-team-1',
    name: '선수 예시',
    school: 'AUBL 후보 예시',
    group: 'A',
    position: 'OF',
    team: 'TEAM_1',
  },
  TEAM_2: {
    id: 'card-example-team-2',
    name: '선수 예시',
    school: 'AUBL 후보 예시',
    group: 'B',
    position: 'OF',
    team: 'TEAM_2',
  },
};

const CARD_FACES: readonly { id: string; team: PreviewTeam; face: PreviewFace }[] = [
  { id: 'team-1-front', team: 'TEAM_1', face: 'front' },
  { id: 'team-1-back', team: 'TEAM_1', face: 'back' },
  { id: 'team-2-front', team: 'TEAM_2', face: 'front' },
  { id: 'team-2-back', team: 'TEAM_2', face: 'back' },
];

function CardFace({
  id,
  team,
  face,
  single = false,
}: {
  id: string;
  team: PreviewTeam;
  face: PreviewFace;
  single?: boolean;
}) {
  const teamLabel = team === 'TEAM_1' ? '1팀' : '2팀';
  const faceLabel = face === 'front' ? '앞면' : '뒷면';

  return (
    <article className={`card-asset-preview__item is-${team === 'TEAM_1' ? 'blue' : 'coral'}${single ? ' is-single' : ''}`}>
      {!single ? (
        <header>
          <strong>{teamLabel}</strong>
          <span>{faceLabel}</span>
        </header>
      ) : null}
      <div id={id} className={`card-asset-preview__artboard is-${face}`}>
        <PlayerCardSurface
          candidate={EXAMPLE_CANDIDATES[team]}
          index={0}
          active={face === 'front'}
          selected={false}
        />
      </div>
    </article>
  );
}

const readSingleFace = () => {
  if (typeof window === 'undefined') return null;
  const faceKey = new URLSearchParams(window.location.search).get('face');
  return CARD_FACES.find((cardFace) => cardFace.id === faceKey) ?? null;
};

export default function CardAssetPreview() {
  const singleFace = readSingleFace();

  if (singleFace) {
    return (
      <main className="card-asset-preview is-single-view">
        <CardFace {...singleFace} single />
      </main>
    );
  }

  return (
    <main className="card-asset-preview">
      <div className="card-asset-preview__glow" aria-hidden="true" />
      <header className="card-asset-preview__hero">
        <img src="/assets/aubl_clean.png" alt="AUBL" />
        <p>2026 AUBL ALL-STAR</p>
        <h1>PLAYER CARD<br />FOUR FACES</h1>
        <span>1팀 블루 · 2팀 코랄</span>
      </header>

      <section className="card-asset-preview__grid" aria-label="올스타 선수 카드 앞면과 뒷면 예시">
        {CARD_FACES.map((cardFace) => <CardFace key={cardFace.id} {...cardFace} />)}
      </section>

      <footer>
        <span>DESIGN PREVIEW</span>
        <strong>AUBL · SINCE 1981</strong>
      </footer>
    </main>
  );
}
