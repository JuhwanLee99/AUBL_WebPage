import { useMemo, useRef } from 'react';
import {
  ROOKIE_CANDIDATES,
  ROOKIE_SCHOOL_COUNT,
  ROOKIE_TEAM_COUNTS,
} from '../data/rookieCandidates';
import { TEAM_META } from '../data/eventConfig';
import type { AllStarTeam, RookieCandidate } from '../types';

type RookieCandidateReviewProps = {
  selectedTeam: AllStarTeam;
  onTeamChange: (team: AllStarTeam) => void;
  onBack: () => void;
};

const TEAMS: readonly AllStarTeam[] = ['TEAM_1', 'TEAM_2'];

const POSITION_LABELS: Record<string, string> = {
  P: '투수',
  C: '포수',
  '1B': '1루',
  '2B': '2루',
  '3B': '3루',
  SS: '유격',
  LF: '좌익',
  CF: '중견',
  RF: '우익',
  IF: '내야',
  OF: '외야',
};

const positionLabel = (position: string) => POSITION_LABELS[position] ?? position;

function RookieCandidateCard({ candidate, index }: { candidate: RookieCandidate; index: number }) {
  return (
    <article className="rookie-candidate" role="listitem">
      <div className="rookie-candidate__meta">
        <span>#{String(index + 1).padStart(2, '0')}</span>
        <span>{candidate.group}조</span>
      </div>

      <div className="rookie-candidate__positions" aria-label="추천 가능 포지션">
        {candidate.positions.length ? (
          candidate.positions.map((position) => (
            <span key={position}>{positionLabel(position)}</span>
          ))
        ) : (
          <span className="is-pending">포지션 확인 중</span>
        )}
      </div>

      <div className="rookie-candidate__identity">
        <h3>{candidate.name}</h3>
        <p>{candidate.school}</p>
      </div>

      {candidate.note ? <p className="rookie-candidate__note">비고 · {candidate.note}</p> : null}
    </article>
  );
}

export function RookieCandidateReview({ selectedTeam, onTeamChange, onBack }: RookieCandidateReviewProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const topTeamButtonRefs = useRef<Partial<Record<AllStarTeam, HTMLButtonElement | null>>>({});
  const candidates = useMemo(
    () => ROOKIE_CANDIDATES.filter((candidate) => candidate.team === selectedTeam),
    [selectedTeam],
  );

  const handleBottomTeamChange = (nextTeam: AllStarTeam) => {
    onTeamChange(nextTeam);
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      sectionRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      topTeamButtonRefs.current[nextTeam]?.focus({ preventScroll: true });
    });
  };

  return (
    <section className="rookie-review" ref={sectionRef} aria-labelledby="rookie-review-title">
      <header className="rookie-review__hero">
        <div className="rookie-review__titlebar">
          <button type="button" className="allstar-card-screen__home" onClick={onBack} aria-label="올스타전 홈으로 돌아가기">←</button>
          <div>
            <p className="allstar-eyebrow">2026 AUBL ROOKIE NOMINEES</p>
            <h1 id="rookie-review-title">루키 후보 명단</h1>
          </div>
        </div>
        <p>
          {ROOKIE_SCHOOL_COUNT}개 학교가 추천한 {ROOKIE_CANDIDATES.length}명의 후보를 확인해 주세요. 후보 구성과 투표 단위는 회의 결과에 따라
          조정될 수 있습니다.
        </p>
        <dl className="rookie-review__summary">
          <div><dt>전체 후보</dt><dd>{ROOKIE_CANDIDATES.length}명</dd></div>
          <div><dt>1팀</dt><dd>{ROOKIE_TEAM_COUNTS.TEAM_1}명</dd></div>
          <div><dt>2팀</dt><dd>{ROOKIE_TEAM_COUNTS.TEAM_2}명</dd></div>
        </dl>
      </header>

      <aside className="rookie-review__notice" aria-label="루키 투표 운영 안내">
        <span>운영 안내</span>
        <div>
          <strong>투표 방식 협의 중</strong>
          <p>현재는 후보 확인만 가능합니다. 로그인·선택·제출 기능은 투표 기준 확정 후 열립니다.</p>
        </div>
      </aside>

      <div className="rookie-review__heading">
        <div>
          <p className="allstar-eyebrow">TEAM NOMINEES</p>
          <h2>{TEAM_META[selectedTeam].label} 후보</h2>
        </div>
        <strong>{candidates.length}명</strong>
      </div>

      <div className="allstar-team-switch rookie-review__team-switch" role="group" aria-label="루키 상단 팀 선택">
        {TEAMS.map((team) => (
          <button
            type="button"
            key={team}
            ref={(element) => {
              topTeamButtonRefs.current[team] = element;
            }}
            aria-pressed={selectedTeam === team}
            className={`${selectedTeam === team ? 'is-active ' : ''}is-${TEAM_META[team].tone}`}
            onClick={() => onTeamChange(team)}
          >
            <span>{TEAM_META[team].label} · {ROOKIE_TEAM_COUNTS[team]}명</span>
            <small>{TEAM_META[team].groups}</small>
          </button>
        ))}
      </div>

      <div className="rookie-candidate-grid" role="list" aria-label={`${TEAM_META[selectedTeam].label} 루키 후보 ${candidates.length}명`}>
        {candidates.map((candidate, index) => (
          <RookieCandidateCard key={candidate.id} candidate={candidate} index={index} />
        ))}
      </div>

      <footer className="rookie-review__footer">
        {selectedTeam === 'TEAM_2' ? (
          <p>한국공학대는 이번 루키 추천 명단이 없습니다.</p>
        ) : (
          <p>후보의 포지션과 비고는 각 학교가 제출한 추천 명단을 그대로 표시합니다.</p>
        )}
        <div className="allstar-team-switch rookie-review__team-switch" role="group" aria-label="루키 하단 팀 선택">
          {TEAMS.map((team) => (
            <button
              type="button"
              key={team}
              aria-pressed={selectedTeam === team}
              className={`${selectedTeam === team ? 'is-active ' : ''}is-${TEAM_META[team].tone}`}
              onClick={() => handleBottomTeamChange(team)}
            >
              <span>{TEAM_META[team].label} · {ROOKIE_TEAM_COUNTS[team]}명</span>
              <small>{TEAM_META[team].groups}</small>
            </button>
          ))}
        </div>
      </footer>
    </section>
  );
}
