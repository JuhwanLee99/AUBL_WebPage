import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useKeenSlider, type KeenSliderPlugin } from 'keen-slider/react';
import 'keen-slider/keen-slider.min.css';
import { PlayerCardDetailDialog } from './PlayerCardDetailDialog';
import { PlayerCardSurface, type CardDisplayCandidate } from './PlayerCardSurface';

type CylinderCardCarouselProps = {
  candidates: readonly CardDisplayCandidate[];
  selectedIds: readonly string[];
  selectionLimit: number;
  selectionComplete?: boolean;
  readOnly?: boolean;
  onToggle?: (candidate: CardDisplayCandidate) => void;
  onConfirm?: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const cylinder: KeenSliderPlugin = (slider) => {
  let radius = 260;
  let reducedMotion = false;

  const updateGeometry = () => {
    const count = Math.max(slider.slides.length, 1);
    const width = slider.container.offsetWidth || slider.container.getBoundingClientRect().width || 260;
    const gap = Math.max(38, Math.min(58, width * 0.19));
    radius = Math.max(width * 0.82, (width + gap) / (2 * Math.tan(Math.PI / count)));
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    slider.container.style.setProperty('--cylinder-radius', `${radius.toFixed(2)}px`);

    slider.slides.forEach((element, index) => {
      if (reducedMotion) return;
      element.style.transform = `rotateY(${(360 / count) * index}deg) translateZ(${radius}px)`;
    });
  };

  const rotate = () => {
    const details = slider.track.details;
    if (!details) return;
    if (reducedMotion) {
      details.slides.forEach((slide, index) => {
        const element = slider.slides[index];
        if (!element) return;
        const distance = slide.distance;
        element.style.transform = `translate3d(${(distance * 108).toFixed(2)}%, 0, 0) scale(${Math.max(0.84, 1 - Math.abs(distance) * 0.14).toFixed(3)})`;
        element.style.opacity = Math.abs(distance) > 1.25 ? '0' : '1';
      });
      slider.container.style.transform = 'translate3d(0,0,0)';
      return;
    }

    const degrees = 360 * details.progress;
    slider.container.style.transform = `translateZ(-${radius}px) rotateY(${-degrees}deg)`;
    slider.container.style.setProperty('--cylinder-turn', String(details.progress));
  };

  slider.on('created', () => {
    updateGeometry();
    rotate();
  });
  slider.on('updated', () => {
    updateGeometry();
    rotate();
  });
  slider.on('detailsChanged', rotate);
};

const controlledFlick: KeenSliderPlugin = (slider) => {
  let startAbs = 0;
  let startPosition = 0;

  slider.on('dragStarted', () => {
    const details = slider.track.details;
    if (!details) return;
    startAbs = details.abs;
    startPosition = details.position;
  });

  slider.on('dragEnded', () => {
    const details = slider.track.details;
    if (!details) return;

    const delta = details.position - startPosition;
    const velocity = slider.track.velocity();
    const travel = Math.abs(delta);
    const speed = Math.abs(velocity);
    slider.animator.stop();

    if (travel < 0.075 && speed < 0.001) {
      slider.moveToIdx(startAbs, true, {
        duration: 240,
        easing: (time) => 1 - Math.pow(1 - time, 3),
      });
      return;
    }

    const direction = Math.sign(Math.abs(delta) > 0.015 ? delta : velocity) || 1;
    const isStrongFlick = travel >= 1.05 || (travel >= 0.56 && speed >= 0.0032);
    const steps = isStrongFlick ? 2 : 1;
    slider.moveToIdx(startAbs + (direction * steps), true, {
      duration: steps === 2 ? 420 : 330,
      easing: (time) => 1 - Math.pow(1 - time, 4),
    });
  });
};

export function CylinderCardCarousel({
  candidates,
  selectedIds,
  selectionLimit,
  selectionComplete = false,
  readOnly = false,
  onToggle,
  onConfirm,
}: CylinderCardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const carouselGestureRef = useRef<{
    x: number;
    y: number;
    mode: 'pending' | 'swipe' | 'tilt';
  } | null>(null);
  const carouselTiltTargetRef = useRef<HTMLElement | null>(null);
  const suppressOpenRef = useRef(false);

  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>(
    {
      loop: true,
      mode: 'snap',
      renderMode: 'custom',
      selector: '.cylinder-card-carousel__cell',
      dragSpeed: 0.72,
      slideChanged(slider) {
        const next = slider.track.details.rel % Math.max(candidates.length, 1);
        setActiveIndex(next);
      },
    },
    [cylinder, controlledFlick],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches || !stageRef.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        '.cylinder-card-carousel__deal-shell',
        { autoAlpha: 0, scale: 0.82, y: 24 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.52, stagger: 0.045, ease: 'power3.out' },
      );
    }, stageRef);
    return () => context.revert();
  }, [candidates]);

  const showDetail = useCallback(() => {
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => setDetailOpen(false), []);

  const confirmDetailSelection = useCallback(() => {
    setDetailOpen(false);
    onConfirm?.();
  }, [onConfirm]);

  const syncDetailIndex = useCallback((index: number, direction: 1 | -1, reducedMotion: boolean) => {
    const slider = instanceRef.current;
    const currentAbs = slider?.track.details.abs ?? (index - direction);
    slider?.moveToIdx(currentAbs + direction, true, {
      duration: reducedMotion ? 0 : 300,
      easing: (time) => 1 - Math.pow(1 - time, 4),
    });
  }, [instanceRef]);

  const restoreCarouselTilt = useCallback((suppressClick = false) => {
    const target = carouselTiltTargetRef.current;
    if (target) {
      gsap.to(target, {
        rotationX: 0,
        rotationY: 0,
        scale: 1,
        duration: 0.46,
        ease: 'elastic.out(1, 0.58)',
        overwrite: true,
      });
    }
    carouselGestureRef.current = null;
    carouselTiltTargetRef.current = null;
    if (suppressClick) {
      suppressOpenRef.current = true;
      window.requestAnimationFrame(() => { suppressOpenRef.current = false; });
    }
  }, []);

  const startCarouselGesture = (target: EventTarget | null, clientX: number, clientY: number) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const element = target instanceof Element
      ? target.closest<HTMLElement>('.cylinder-card-carousel__tilt-shell')
      : null;
    if (!element) return;
    carouselGestureRef.current = { x: clientX, y: clientY, mode: 'pending' };
    carouselTiltTargetRef.current = element;
  };

  const moveCarouselGesture = (clientX: number, clientY: number) => {
    const gesture = carouselGestureRef.current;
    const target = carouselTiltTargetRef.current;
    if (!gesture || !target) return;
    const deltaX = clientX - gesture.x;
    const deltaY = clientY - gesture.y;
    if (gesture.mode === 'pending') {
      if (Math.hypot(deltaX, deltaY) < 9) return;
      gesture.mode = Math.abs(deltaY) > Math.abs(deltaX) * 1.12 ? 'tilt' : 'swipe';
    }
    if (gesture.mode !== 'tilt') return;

    suppressOpenRef.current = true;
    gsap.set(target, {
      transformPerspective: 850,
      rotationX: clamp(-deltaY / 19, -7, 7),
      rotationY: clamp(deltaX / 25, -4.5, 4.5),
      scale: 0.988,
      transformOrigin: '50% 50%',
    });
  };

  const openCard = useCallback((index: number) => {
    if (suppressOpenRef.current) {
      suppressOpenRef.current = false;
      return;
    }
    if (index !== activeIndex) {
      instanceRef.current?.moveToIdx(index);
      return;
    }
    showDetail();
  }, [activeIndex, instanceRef, showDetail]);

  if (!candidates.length) {
    return <p className="cylinder-card-carousel__empty">공개된 후보가 없습니다.</p>;
  }

  return (
    <div className={`cylinder-card-carousel${readOnly ? ' is-read-only' : ''}`} ref={stageRef}>
      {readOnly ? (
        <span className="sr-only" aria-live={detailOpen ? 'off' : 'polite'}>{candidates[activeIndex]?.name}</span>
      ) : (
        <div className="cylinder-card-carousel__status" aria-live={detailOpen ? 'off' : 'polite'}>
          <span className="sr-only">{candidates[activeIndex]?.name}, </span>
          <strong>선택 {selectedIds.length} / {selectionLimit}명</strong>
        </div>
      )}

      <div
        className="cylinder-card-carousel__scene"
        onPointerDown={(event) => {
          if (!event.isPrimary) return;
          startCarouselGesture(event.target, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => moveCarouselGesture(event.clientX, event.clientY)}
        onPointerUp={() => restoreCarouselTilt(carouselGestureRef.current?.mode === 'tilt')}
        onPointerCancel={() => restoreCarouselTilt(carouselGestureRef.current?.mode === 'tilt')}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') instanceRef.current?.prev();
          if (event.key === 'ArrowRight') instanceRef.current?.next();
        }}
      >
        <div className="cylinder-card-carousel__ring keen-slider" ref={sliderRef}>
          {candidates.map((candidate, index) => (
            <div
              className="cylinder-card-carousel__cell"
              key={candidate.id}
              aria-hidden={index !== activeIndex}
            >
              <div className="cylinder-card-carousel__deal-shell">
                <div className="cylinder-card-carousel__tilt-shell">
                  <PlayerCardSurface
                    candidate={candidate}
                    index={index}
                    active={index === activeIndex}
                    selected={selectedSet.has(candidate.id)}
                    onOpen={() => openCard(index)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="cylinder-card-carousel__gesture" aria-hidden="true">
        <span className="cylinder-card-carousel__swipe-hint"><i>‹</i><span>좌우로 밀기</span><i>›</i></span>
        <span className="cylinder-card-carousel__tap-hint">카드를 눌러 확대</span>
      </div>
      {limitNotice ? <p className="cylinder-card-carousel__limit" role="status">{limitNotice}</p> : null}

      {detailOpen ? (
        <PlayerCardDetailDialog
          candidates={candidates}
          initialIndex={activeIndex}
          selectedIds={selectedIds}
          selectionLimit={selectionLimit}
          selectionComplete={selectionComplete}
          readOnly={readOnly}
          onToggle={onToggle}
          onConfirm={onConfirm ? confirmDetailSelection : undefined}
          onClose={closeDetail}
          onIndexChange={syncDetailIndex}
          onLimitNotice={setLimitNotice}
        />
      ) : null}
    </div>
  );
}
