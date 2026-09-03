import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { PlayerCardSurface, type CardDisplayCandidate } from './PlayerCardSurface';

export type PlayerCardDetailDialogProps = {
  candidates: readonly CardDisplayCandidate[];
  initialIndex: number;
  selectedIds?: readonly string[];
  selectionLimit?: number;
  selectionComplete?: boolean;
  readOnly?: boolean;
  readOnlyMessage?: string;
  onToggle?: (candidate: CardDisplayCandidate) => void;
  onConfirm?: () => void;
  onClose: () => void;
  onIndexChange?: (index: number, direction: 1 | -1, reducedMotion: boolean) => void;
  onAnnouncement?: (message: string) => void;
  onLimitNotice?: (message: string | null) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeIndex = (index: number, length: number) => {
  if (!length) return 0;
  return ((index % length) + length) % length;
};

export function PlayerCardDetailDialog({
  candidates,
  initialIndex,
  selectedIds = [],
  selectionLimit = 1,
  selectionComplete = false,
  readOnly,
  readOnlyMessage = '선수 카드 확인 화면입니다. 좌우로 넘겨 다른 선수를 볼 수 있습니다.',
  onToggle,
  onConfirm,
  onClose,
  onIndexChange,
  onAnnouncement,
  onLimitNotice,
}: PlayerCardDetailDialogProps) {
  const normalizedInitialIndex = normalizeIndex(initialIndex, candidates.length);
  const [detailIndex, setDetailIndex] = useState(normalizedInitialIndex);
  const [detailDirection, setDetailDirection] = useState<1 | -1>(1);
  const [detailAnimating, setDetailAnimating] = useState(false);
  const [actionAnnouncement, setActionAnnouncement] = useState('');
  const detailRef = useRef<HTMLDivElement | null>(null);
  const detailDeckRef = useRef<HTMLDivElement | null>(null);
  const detailCardRef = useRef<HTMLDivElement | null>(null);
  const detailIndexRef = useRef(normalizedInitialIndex);
  const detailAnimatingRef = useRef(false);
  const pendingDetailEntryRef = useRef<{ direction: 1 | -1 } | null>(null);
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    mode: 'pending' | 'swipe' | 'tilt';
  } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isReadOnly = readOnly ?? !onToggle;

  const wrapIndex = useCallback(
    (index: number) => normalizeIndex(index, candidates.length),
    [candidates.length],
  );

  const closeDetail = useCallback(() => {
    if (detailCardRef.current) gsap.killTweensOf(detailCardRef.current);
    pointerStartRef.current = null;
    pendingDetailEntryRef.current = null;
    detailAnimatingRef.current = false;
    setDetailAnimating(false);
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus({ preventScroll: true }));
  }, [onClose]);

  const animateDetailTo = useCallback((direction: 1 | -1) => {
    if (detailAnimatingRef.current || candidates.length < 2) return;

    const nextIndex = wrapIndex(detailIndexRef.current + direction);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const card = detailCardRef.current;

    detailAnimatingRef.current = true;
    setDetailAnimating(true);
    setDetailDirection(direction);
    const message = `${candidates[nextIndex]?.name ?? ''}, ${nextIndex + 1}/${candidates.length}`;
    setActionAnnouncement(message);
    onAnnouncement?.(message);

    const finishIndexChange = () => {
      detailIndexRef.current = nextIndex;
      onIndexChange?.(nextIndex, direction, reducedMotion);

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
  }, [candidates, onAnnouncement, onIndexChange, wrapIndex]);

  useLayoutEffect(() => {
    const pending = pendingDetailEntryRef.current;
    const card = detailCardRef.current;
    if (!pending || !card) return;
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
  }, [detailIndex]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

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
  }, [animateDetailTo, closeDetail]);

  const resetDetailSwipe = useCallback(() => {
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
  }, []);

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

  if (!candidates.length) return null;

  const detailCandidate = candidates[detailIndex];
  const detailSelected = selectedSet.has(detailCandidate.id);
  const isMultiSelect = selectionLimit > 1;
  const remainingSelections = Math.max(selectionLimit - selectedIds.length, 0);
  const firstStackIndex = wrapIndex(detailIndex + detailDirection);
  const secondStackIndex = wrapIndex(detailIndex + (detailDirection * 2));
  const firstStackCandidate = candidates[firstStackIndex];
  const secondStackCandidate = candidates[secondStackIndex];

  const toggleDetailCandidate = () => {
    if (isReadOnly || !onToggle) return;
    const alreadySelected = selectedSet.has(detailCandidate.id);
    if (!alreadySelected && selectionLimit > 1 && selectedIds.length >= selectionLimit) {
      const message = `최대 ${selectionLimit}명까지 선택할 수 있습니다.`;
      setActionAnnouncement(message);
      onAnnouncement?.(message);
      onLimitNotice?.(message);
      return;
    }
    onLimitNotice?.(null);
    onToggle(detailCandidate);
    const message = alreadySelected ? `${detailCandidate.name} 선택을 취소했습니다.` : `${detailCandidate.name} 선수를 선택했습니다.`;
    setActionAnnouncement(message);
    onAnnouncement?.(message);
  };

  const confirmDetailSelection = () => {
    if (!detailSelected || !selectionComplete || !onConfirm) return;
    detailAnimatingRef.current = false;
    setDetailAnimating(false);
    onConfirm();
  };

  return (
    <div className="allstar-card-detail" role="presentation" onClick={closeDetail}>
      <div
        className="allstar-card-detail__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${detailCandidate.name} 선수 카드 상세`}
        tabIndex={-1}
        ref={detailRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="allstar-card-detail__topbar">
          <div>
            <span>좌우로 넘겨 다른 후보 보기</span>
            {isReadOnly ? (
              <span className="sr-only" aria-live="polite">{actionAnnouncement || detailCandidate.name}</span>
            ) : (
              <strong className="allstar-card-detail__selection-count" aria-live="polite">
                선택 {selectedIds.length} / {selectionLimit}명
                <span className="sr-only">, {actionAnnouncement || detailCandidate.name}</span>
              </strong>
            )}
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
        <div className="allstar-card-detail__swipe-status">
          <span aria-hidden="true">‹</span>
          <strong>{detailIndex + 1} / {candidates.length}</strong>
          <span aria-hidden="true">›</span>
        </div>
        {isReadOnly ? (
          <p className="allstar-card-detail__readonly">{readOnlyMessage}</p>
        ) : detailSelected ? (
          <div className="allstar-card-detail__selection-actions">
            <button type="button" onClick={toggleDetailCandidate}>선택 취소</button>
            <button type="button" disabled={!selectionComplete || !onConfirm} onClick={confirmDetailSelection}>
              {isMultiSelect && !selectionComplete ? `${remainingSelections}명 더 선택 필요` : '선택 확인'}
            </button>
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
  );
}
