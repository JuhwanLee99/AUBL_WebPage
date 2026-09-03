import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { gsap } from 'gsap';
import { PlayerCardSurface, type CardDisplayCandidate } from './PlayerCardSurface';
import './SharedRosterPackReveal.css';

type SharedRosterPackRevealProps = {
  candidates: readonly CardDisplayCandidate[];
  ready: boolean;
  mode?: 'shared' | 'completed';
  onComplete: () => void;
};

const REVEAL_CARD_COUNT = 12;

export function SharedRosterPackReveal({
  candidates,
  ready,
  mode = 'shared',
  onComplete,
}: SharedRosterPackRevealProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const packRef = useRef<HTMLDivElement | null>(null);
  const packBodyRef = useRef<HTMLDivElement | null>(null);
  const tearStripRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const completedRef = useRef(false);
  const revealCandidates = useMemo(
    () => candidates.slice(0, REVEAL_CARD_COUNT),
    [candidates],
  );
  const accessibleLabel = mode === 'shared'
    ? '공유받은 AUBL 올스타 카드팩'
    : '선택을 완료한 AUBL 올스타 카드팩';
  const liveMessage = ready
    ? mode === 'shared'
      ? '공유받은 올스타 카드팩을 개봉하고 있습니다.'
      : '선택을 완료한 올스타 카드팩을 개봉하고 있습니다.'
    : '올스타 로스터 카드를 준비하고 있습니다.';

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    timelineRef.current?.kill();
    onComplete();
  }, [onComplete]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const pack = packRef.current;
    const packBody = packBodyRef.current;
    const tearStrip = tearStripRef.current;
    const copy = copyRef.current;
    if (!ready || revealCandidates.length !== REVEAL_CARD_COUNT || !root || !pack || !packBody || !tearStrip || !copy) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frame = window.requestAnimationFrame(finish);
      return () => window.cancelAnimationFrame(frame);
    }

    const context = gsap.context(() => {
      const cards = [...root.querySelectorAll<HTMLElement>('[data-pack-card]')];
      const packRect = pack.getBoundingClientRect();
      const packSettleY = Math.min(168, Math.max(92, root.clientHeight * 0.18));
      const originX = packRect.left + (packRect.width / 2);
      const originY = packRect.top + (packRect.height * 0.32) + packSettleY;

      const cardStarts = cards.map((card, index) => {
        const cardRect = card.getBoundingClientRect();
        const startX = originX - (cardRect.left + (cardRect.width / 2));
        const startY = originY - (cardRect.top + (cardRect.height / 2));
        gsap.set(card, {
          autoAlpha: 0,
          x: startX,
          y: startY,
          scale: 0.72,
          rotation: ((index % 3) - 1) * 1.4,
          rotationY: 0,
          transformPerspective: 900,
          transformOrigin: '50% 50%',
          force3D: true,
        });
        return { startX, startY };
      });
      gsap.set(copy, { autoAlpha: 0, y: 12 });
      gsap.set(pack, {
        autoAlpha: 0,
        scale: 0.84,
        xPercent: -50,
        yPercent: -47,
        y: 0,
        rotation: 0,
      });

      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
      timelineRef.current = timeline;
      timeline
        .to(pack, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.42,
          ease: 'back.out(1.35)',
        }, 0.06)
        .to(pack, {
          y: packSettleY,
          duration: 0.5,
          ease: 'power3.inOut',
        }, 0.72)
        .to(pack, {
          scale: 1.025,
          duration: 0.15,
          ease: 'power2.inOut',
          yoyo: true,
          repeat: 1,
        }, 1.26)
        .to(tearStrip, {
          xPercent: 118,
          rotation: 4,
          autoAlpha: 0,
          duration: 0.38,
          ease: 'power3.in',
        }, 1.5)
        .to(pack, {
          rotation: -1.4,
          duration: 0.18,
          ease: 'power2.out',
        }, 1.52);

      cards.forEach((card, index) => {
        const releaseAt = 1.7 + (index * 0.115);
        const { startX, startY } = cardStarts[index];
        timeline
          .set(card, { autoAlpha: 1 }, releaseAt)
          .to(card, {
            x: startX + (((index % 3) - 1) * 8),
            y: startY - Math.min(88, packRect.height * 0.29),
            scale: 0.8,
            rotation: ((index % 3) - 1) * 2.2,
            duration: 0.22,
            ease: 'power2.out',
          }, releaseAt)
          .to(card, {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            duration: 0.42,
            ease: 'power2.inOut',
          }, releaseAt + 0.18);
      });

      timeline
        .to(packBody, {
          y: 92,
          scaleY: 0.88,
          autoAlpha: 0,
          duration: 0.46,
          ease: 'power2.in',
        }, 3.06);

      cards.forEach((card, index) => {
        const flipAt = 3.5 + (index * 0.025);
        timeline
          .to(card, {
            rotationY: 88,
            scale: 0.97,
            duration: 0.16,
            ease: 'power2.in',
          }, flipAt)
          .call(() => {
            card.classList.remove('is-showing-back');
            gsap.set(card, { rotationY: -88 });
          }, [], flipAt + 0.16)
          .to(card, {
            rotationY: 0,
            scale: 1,
            duration: 0.22,
            ease: 'power2.out',
          }, flipAt + 0.16);
      });

      timeline
        .to(copy, {
          autoAlpha: 1,
          y: 0,
          duration: 0.28,
          ease: 'power2.out',
        }, 3.96)
        .to(root, {
          autoAlpha: 0,
          duration: 0.38,
          ease: 'power2.inOut',
          onComplete: finish,
        }, 4.52);
    }, root);

    return () => {
      timelineRef.current?.kill();
      timelineRef.current = null;
      context.revert();
    };
  }, [finish, ready, revealCandidates]);

  useEffect(() => {
    if (!ready) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish();
    };
    const handleOrientationChange = () => finish();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('orientationchange', handleOrientationChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [finish, ready]);

  return (
    <section
      className={`shared-roster-pack-reveal${ready ? ' is-ready' : ' is-loading'}`}
      ref={rootRef}
      aria-label={accessibleLabel}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>
      <button
        type="button"
        className="shared-roster-pack-reveal__skip"
        disabled={!ready}
        onClick={finish}
      >
        건너뛰기
      </button>

      <div className="shared-roster-pack-reveal__halo" aria-hidden="true" />
      <div className="shared-roster-pack-reveal__stage" aria-hidden="true">
        <div className="shared-roster-pack-reveal__cards allstar-roster-grid">
          {revealCandidates.map((candidate, index) => (
            <div
              className="shared-roster-pack-reveal__card is-showing-back"
              data-pack-card
              key={candidate.id}
            >
              <PlayerCardSurface
                candidate={candidate}
                index={index}
                active={false}
                selected
                variant="thumbnail"
              />
            </div>
          ))}
        </div>

        <div className="shared-roster-pack-reveal__pack" ref={packRef}>
          <div className="shared-roster-pack-reveal__pack-body" ref={packBodyRef}>
            <span className="shared-roster-pack-reveal__pack-shine" />
            <span className="shared-roster-pack-reveal__pack-kicker">OFFICIAL PLAYER CARDS</span>
            <span className="shared-roster-pack-reveal__pack-logo">
              <img src="/assets/aubl_clean.png" alt="" />
            </span>
            <strong>ALL-STAR</strong>
            <span className="shared-roster-pack-reveal__pack-year">2026 · MY ROSTER</span>
            <span className="shared-roster-pack-reveal__pack-count">12 CARDS</span>
          </div>
          <div className="shared-roster-pack-reveal__tear-strip" ref={tearStripRef}>
            <span>OPEN</span><i /><span>OPEN</span>
          </div>
        </div>
      </div>

      <div className="shared-roster-pack-reveal__copy" ref={copyRef} aria-hidden="true">
        <span>PACK OPENED</span>
        <strong>{mode === 'shared' ? 'SHARED ALL-STAR ROSTER' : 'MY ALL-STAR ROSTER'}</strong>
      </div>
      {!ready ? <span className="shared-roster-pack-reveal__loading">로스터 카드 확인 중</span> : null}
    </section>
  );
}
