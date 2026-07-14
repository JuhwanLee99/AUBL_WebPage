import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useKeenSlider, type KeenSliderPlugin } from 'keen-slider/react';
import 'keen-slider/keen-slider.min.css';
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
  const [detailIndex, setDetailIndex] = useState(0);
  const [detailDirection, setDetailDirection] = useState<1 | -1>(1);
  const [detailAnimating, setDetailAnimating] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const detailDeckRef = useRef<HTMLDivElement | null>(null);
  const detailCardRef = useRef<HTMLDivElement | null>(null);
  const detailIndexRef = useRef(0);
  const detailAnimatingRef = useRef(false);
  const pendingDetailEntryRef = useRef<{ direction: 1 | -1 } | null>(null);
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    mode: 'pending' | 'swipe' | 'tilt';
  } | null>(null);
  const carouselGestureRef = useRef<{
    x: number;
    y: number;
    mode: 'pending' | 'swipe' | 'tilt';
  } | null>(null);
  const carouselTiltTargetRef = useRef<HTMLElement | null>(null);
  const suppressOpenRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

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
        setAnnouncement(`${candidates[next]?.name ?? ''}, ${next + 1}/${candidates.length}`);
      },
    },
    [cylinder, controlledFlick],
  );

  const activeCandidate = candidates[activeIndex] ?? candidates[0];
  const detailCandidate = candidates[detailIndex] ?? activeCandidate;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const detailSelected = Boolean(detailCandidate && selectedSet.has(detailCandidate.id));
  const wrapIndex = useCallback((index: number) => (
    ((index % candidates.length) + candidates.length) % candidates.length
  ), [candidates.length]);

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

  const closeDetail = useCallback(() => {
    if (detailCardRef.current) gsap.killTweensOf(detailCardRef.current);
    pointerStartRef.current = null;
    pendingDetailEntryRef.current = null;
    detailAnimatingRef.current = false;
    setDetailAnimating(false);
    setDetailOpen(false);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus({ preventScroll: true }));
  }, []);

  const showDetail = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    detailIndexRef.current = activeIndex;
    setDetailIndex(activeIndex);
    setDetailDirection(1);
    setDetailOpen(true);
  }, [activeIndex]);

  const animateDetailTo = useCallback((direction: 1 | -1) => {
    if (!detailOpen || detailAnimatingRef.current || candidates.length < 2) return;

    const nextIndex = wrapIndex(detailIndexRef.current + direction);
    const slider = instanceRef.current;
    const currentAbs = slider?.track.details.abs ?? detailIndexRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const card = detailCardRef.current;

    detailAnimatingRef.current = true;
    setDetailAnimating(true);
    setDetailDirection(direction);
    setAnnouncement(`${candidates[nextIndex]?.name ?? ''}, ${nextIndex + 1}/${candidates.length}`);

    const finishIndexChange = () => {
      detailIndexRef.current = nextIndex;
      slider?.moveToIdx(currentAbs + direction, true, {
        duration: reducedMotion ? 0 : 300,
        easing: (time) => 1 - Math.pow(1 - time, 4),
      });

      if (reducedMotion) {
        setDetailIndex(nextIndex);
        detailAnimatingRef.current = false;
        setDetailAnimating(false);
        return;
      }

      pendingDetailEntryRef.current = { direction };
      setDetailIndex(nextIndex);
    };

    if (!card || reducedMotion) {
      finishIndexChange();
      return;
    }

    const exitDistance = Math.max(window.innerWidth * 0.78, 300);
    gsap.to(card, {
      x: direction > 0 ? -exitDistance : exitDistance,
      y: -12,
      rotation: direction > 0 ? -12 : 12,
      scale: 0.97,
      opacity: 0,
      duration: 0.27,
      ease: 'power2.in',
      overwrite: true,
      onComplete: finishIndexChange,
    });
  }, [candidates, detailOpen, instanceRef, wrapIndex]);

  useLayoutEffect(() => {
    const pending = pendingDetailEntryRef.current;
    const card = detailCardRef.current;
    if (!pending || !detailOpen || !card) return;
    pendingDetailEntryRef.current = null;
    gsap.fromTo(
      card,
      {
        x: pending.direction * 15,
        y: 12,
        rotation: pending.direction * 2.5,
        scale: 0.94,
        opacity: 0.52,
      },
      {
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        opacity: 1,
        duration: 0.34,
        ease: 'power3.out',
        overwrite: true,
        onComplete: () => {
          detailAnimatingRef.current = false;
          setDetailAnimating(false);
        },
      },
    );
  }, [detailIndex, detailOpen]);

  useEffect(() => {
    if (!detailOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        animateDetailTo(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        animateDetailTo(1);
      }
      if (event.key === 'Tab' && detailRef.current) {
        const focusable = [...detailRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        )];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.body.classList.add('allstar-detail-open');
    window.addEventListener('keydown', onKeyDown);
    window.requestAnimationFrame(() => detailRef.current?.focus({ preventScroll: true }));
    return () => {
      document.body.classList.remove('allstar-detail-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [animateDetailTo, closeDetail, detailOpen]);

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

  const toggleDetailCandidate = () => {
    if (!detailCandidate || readOnly || !onToggle) return;
    const alreadySelected = selectedSet.has(detailCandidate.id);
    if (!alreadySelected && selectionLimit > 1 && selectedIds.length >= selectionLimit) {
      const message = `최대 ${selectionLimit}명까지 선택할 수 있습니다.`;
      setAnnouncement(message);
      setLimitNotice(message);
      return;
    }
    setLimitNotice(null);
    onToggle(detailCandidate);
    setAnnouncement(alreadySelected ? `${detailCandidate.name} 선택을 취소했습니다.` : `${detailCandidate.name} 선수를 선택했습니다.`);
  };

  const resetDetailSwipe = () => {
    const card = detailCardRef.current;
    if (card) {
      gsap.to(card, {
        x: 0,
        y: 0,
        rotation: 0,
        rotationX: 0,
        rotationY: 0,
        scale: 1,
        opacity: 1,
        duration: 0.42,
        ease: 'elastic.out(1, 0.62)',
        overwrite: true,
      });
    }
    detailDeckRef.current?.style.setProperty('--detail-drag', '0');
  };

  const finishDetailSwipe = (clientX: number) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (start === null) return;
    if (start.mode !== 'swipe') {
      resetDetailSwipe();
      return;
    }
    const distance = clientX - start.x;
    const velocity = distance / Math.max(performance.now() - start.time, 1);
    if (Math.abs(distance) < 46 && Math.abs(velocity) < 0.42) {
      resetDetailSwipe();
      return;
    }
    detailDeckRef.current?.style.setProperty('--detail-drag', '0');
    animateDetailTo(distance > 0 ? -1 : 1);
  };

  const cancelDetailSwipe = () => {
    pointerStartRef.current = null;
    resetDetailSwipe();
  };

  const moveDetailSwipe = (clientX: number, clientY: number) => {
    const start = pointerStartRef.current;
    if (start === null || !detailCardRef.current || detailAnimatingRef.current) return;
    const deltaX = clientX - start.x;
    const deltaY = clientY - start.y;
    if (start.mode === 'pending') {
      if (Math.hypot(deltaX, deltaY) < 9) return;
      start.mode = Math.abs(deltaY) > Math.abs(deltaX) * 1.12 ? 'tilt' : 'swipe';
    }
    if (start.mode === 'tilt') {
      gsap.set(detailCardRef.current, {
        x: 0,
        y: 0,
        rotation: 0,
        transformPerspective: 900,
        rotationX: clamp(-deltaY / 18, -8, 8),
        rotationY: clamp(deltaX / 24, -5, 5),
        scale: 0.986,
        opacity: 1,
        transformOrigin: '50% 50%',
      });
      detailDeckRef.current?.style.setProperty('--detail-drag', String(Math.min(0.7, Math.hypot(deltaX, deltaY) / 160)));
      return;
    }

    const distance = clamp(deltaX, -118, 118);
    gsap.set(detailCardRef.current, {
      x: distance,
      rotation: distance / 27,
      rotationX: 0,
      rotationY: 0,
      opacity: Math.max(0.68, 1 - Math.abs(distance) / 330),
    });
    detailDeckRef.current?.style.setProperty('--detail-drag', String(Math.min(1, Math.abs(distance) / 118)));
  };

  const confirmDetailSelection = () => {
    if (!detailSelected || !selectionComplete || !onConfirm) return;
    detailAnimatingRef.current = false;
    setDetailAnimating(false);
    setDetailOpen(false);
    onConfirm();
  };

  if (!candidates.length) {
    return <p className="cylinder-card-carousel__empty">공개된 후보가 없습니다.</p>;
  }

  const firstStackIndex = wrapIndex(detailIndex + detailDirection);
  const secondStackIndex = wrapIndex(detailIndex + (detailDirection * 2));
  const firstStackCandidate = candidates[firstStackIndex];
  const secondStackCandidate = candidates[secondStackIndex];

  return (
    <div className="cylinder-card-carousel" ref={stageRef}>
      <div className="cylinder-card-carousel__status" aria-live="polite">
        <strong>{activeIndex + 1}</strong><span>/ {candidates.length}</span>
      </div>

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
        <span className="cylinder-card-carousel__swipe-hint"><i>‹</i><span>좌우로 밀어 후보 보기</span><i>›</i></span>
        <span className="cylinder-card-carousel__tap-hint">카드를 눌러 확대</span>
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {limitNotice ? <p className="cylinder-card-carousel__limit" role="status">{limitNotice}</p> : null}

      {detailOpen && detailCandidate ? (
        <div className="allstar-card-detail" role="presentation" onClick={closeDetail}>
          <div
            className="allstar-card-detail__dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${detailCandidate.name} 후보 상세`}
            tabIndex={-1}
            ref={detailRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="allstar-card-detail__topbar">
              <div>
                <span>좌우로 넘겨 다른 후보 보기</span>
                {!readOnly && selectionLimit > 1 ? (
                  <strong className="allstar-card-detail__selection-count" aria-live="polite">
                    선택 {selectedIds.length} / {selectionLimit}명 <i>· 후보 {candidates.length}명</i>
                  </strong>
                ) : null}
              </div>
              <button type="button" onClick={closeDetail} aria-label="후보 상세 닫기">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7L7 17" />
                </svg>
              </button>
            </div>
            <div
              className={`allstar-card-detail__deck${detailDirection > 0 ? ' is-next' : ' is-previous'}${detailAnimating ? ' is-animating' : ''}`}
              ref={detailDeckRef}
              onPointerDown={(event) => {
                if (!event.isPrimary || detailAnimatingRef.current) return;
                pointerStartRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  time: performance.now(),
                  mode: 'pending',
                };
                if (detailCardRef.current) gsap.killTweensOf(detailCardRef.current);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => moveDetailSwipe(event.clientX, event.clientY)}
              onPointerUp={(event) => finishDetailSwipe(event.clientX)}
              onPointerCancel={cancelDetailSwipe}
            >
              {secondStackCandidate ? (
                <div className="allstar-card-detail__stack-card is-back-two" aria-hidden="true">
                  <PlayerCardSurface candidate={secondStackCandidate} index={secondStackIndex} active={false} selected={selectedSet.has(secondStackCandidate.id)} />
                </div>
              ) : null}
              {firstStackCandidate ? (
                <div className="allstar-card-detail__stack-card is-back-one" aria-hidden="true">
                  <PlayerCardSurface candidate={firstStackCandidate} index={firstStackIndex} active={false} selected={selectedSet.has(firstStackCandidate.id)} />
                </div>
              ) : null}
              <div className="allstar-card-detail__card" key={detailCandidate.id} ref={detailCardRef}>
                <PlayerCardSurface
                  candidate={detailCandidate}
                  index={detailIndex}
                  active
                  expanded
                  selected={detailSelected}
                />
              </div>
            </div>
            <div className="allstar-card-detail__swipe-status" aria-live="polite">
              <span aria-hidden="true">‹</span>
              <strong>{detailIndex + 1} / {candidates.length}</strong>
              <span aria-hidden="true">›</span>
            </div>
            {readOnly ? (
              <p className="allstar-card-detail__readonly">후보 확인 화면입니다. 로그인 없이 모든 카드를 볼 수 있습니다.</p>
            ) : detailSelected ? (
              <div className="allstar-card-detail__selection-actions">
                <button type="button" onClick={toggleDetailCandidate}>선택 취소</button>
                <button type="button" disabled={!selectionComplete || !onConfirm} onClick={confirmDetailSelection}>선택 확인</button>
              </div>
            ) : (
              <button
                type="button"
                className="allstar-card-detail__select"
                onClick={toggleDetailCandidate}
              >
                이 선수 선택
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
