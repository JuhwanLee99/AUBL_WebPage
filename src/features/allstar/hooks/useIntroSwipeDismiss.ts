import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type PointerEventHandler,
  type RefObject,
} from 'react';
import { gsap } from 'gsap';

const AXIS_LOCK_DISTANCE = 8;
const DISTANCE_COMPLETION_RATIO = 0.3;
const FLICK_MIN_DISTANCE = 40;
const FLICK_MIN_VELOCITY = 0.65;
const VELOCITY_WINDOW_MS = 120;
const SNAP_BACK_DURATION = 0.32;
const MIN_COMPLETION_DURATION = 0.18;
const MAX_COMPLETION_DURATION = 0.48;

type GestureAxis = 'pending' | 'vertical' | 'horizontal';

type VelocitySample = {
  y: number;
  time: number;
};

type GestureSession = {
  pointerId: number;
  target: HTMLElement;
  startX: number;
  startY: number;
  startTranslateY: number;
  height: number;
  axis: GestureAxis;
  samples: VelocitySample[];
};

export type IntroSwipePointerHandlers = {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  onClickCapture: MouseEventHandler<HTMLElement>;
};

export type UseIntroSwipeDismissOptions = {
  active: boolean;
  introRef: RefObject<HTMLElement | null>;
  progressRootRef?: RefObject<HTMLElement | null>;
  onComplete: () => void;
  onProgress?: (progress: number) => void;
};

export type UseIntroSwipeDismissResult = {
  pointerHandlers: IntroSwipePointerHandlers;
  dismiss: () => void;
  reset: (immediate?: boolean) => void;
  progressRef: RefObject<number>;
  isDragging: boolean;
  isCompleting: boolean;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const getNow = () =>
  typeof performance === 'undefined' ? Date.now() : performance.now();

const getTranslateY = (element: HTMLElement) => {
  const rawValue = gsap.getProperty(element, 'y');
  const value = typeof rawValue === 'number' ? rawValue : Number.parseFloat(String(rawValue));
  return Number.isFinite(value) ? value : 0;
};

const getElementHeight = (element: HTMLElement) => {
  const elementHeight = element.getBoundingClientRect().height;
  if (elementHeight > 0) return elementHeight;
  return window.visualViewport?.height ?? window.innerHeight ?? 1;
};

const releasePointer = (session: GestureSession | null) => {
  if (!session) return;
  try {
    if (session.target.hasPointerCapture(session.pointerId)) {
      session.target.releasePointerCapture(session.pointerId);
    }
  } catch {
    // The browser may have already released capture after blur or visibility loss.
  }
};

const recordVelocitySample = (session: GestureSession, y: number, time: number) => {
  session.samples.push({ y, time });
  const cutoff = time - VELOCITY_WINDOW_MS;
  while (session.samples.length > 1 && session.samples[0].time < cutoff) {
    session.samples.shift();
  }
};

const getUpwardVelocity = (samples: readonly VelocitySample[]) => {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return 0;
  const elapsed = last.time - first.time;
  if (elapsed < 8) return 0;
  return Math.max(0, (first.y - last.y) / elapsed);
};

export function useIntroSwipeDismiss({
  active,
  introRef,
  progressRootRef,
  onComplete,
  onProgress,
}: UseIntroSwipeDismissOptions): UseIntroSwipeDismissResult {
  const sessionRef = useRef<GestureSession | null>(null);
  const activeRef = useRef(active);
  const completingRef = useRef(false);
  const completedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const progressRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const setProgress = useCallback((nextProgress: number) => {
    const progress = clamp(nextProgress, 0, 1);
    progressRef.current = progress;
    const serialized = progress.toFixed(4);
    const intro = introRef.current;
    const progressRoot = progressRootRef?.current
      ?? intro?.closest<HTMLElement>('.allstar-experience')
      ?? null;
    const visualProperties: Record<string, string> = {
      '--intro-progress': serialized,
      '--intro-content-opacity': (1 - progress).toFixed(4),
      '--intro-content-y': `${(-18 * progress).toFixed(2)}px`,
      '--intro-cards-y': `${(-30 * progress).toFixed(2)}px`,
      '--intro-cards-scale': (1 + (0.08 * progress)).toFixed(4),
      '--intro-circle-scale': (1 + (0.14 * progress)).toFixed(4),
      '--intro-shell-y': `${(18 * (1 - progress)).toFixed(2)}px`,
      '--intro-shell-scale': (0.985 + (0.015 * progress)).toFixed(4),
      '--intro-shell-opacity': (0.82 + (0.18 * progress)).toFixed(4),
      '--intro-indicator-y': `${(32 * (1 - progress)).toFixed(2)}px`,
    };
    Object.entries(visualProperties).forEach(([property, value]) => {
      intro?.style.setProperty(property, value);
    });
    if (progressRoot !== intro) {
      Object.entries(visualProperties).forEach(([property, value]) => {
        progressRoot?.style.setProperty(property, value);
      });
    }
    onProgressRef.current?.(progress);
  }, [introRef, progressRootRef]);

  const finishCompletion = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    completingRef.current = false;
    setIsDragging(false);
    setIsCompleting(false);
    setProgress(1);
    onCompleteRef.current();
  }, [setProgress]);

  const animateCompletion = useCallback((upwardVelocity = 0) => {
    const intro = introRef.current;
    if (!activeRef.current || !intro || completingRef.current || completedRef.current) return;

    releasePointer(sessionRef.current);
    sessionRef.current = null;
    completingRef.current = true;
    setIsDragging(false);
    setIsCompleting(true);
    gsap.killTweensOf(intro);

    const height = Math.max(1, getElementHeight(intro));
    const currentY = clamp(getTranslateY(intro), -height, 0);
    const remainingDistance = Math.max(0, height + currentY);
    if (prefersReducedMotion() || remainingDistance < 1) {
      gsap.set(intro, { y: -height });
      setProgress(1);
      finishCompletion();
      return;
    }

    const remainingRatio = remainingDistance / height;
    const distanceDuration = MIN_COMPLETION_DURATION
      + (MAX_COMPLETION_DURATION - MIN_COMPLETION_DURATION) * remainingRatio;
    const velocityDuration = upwardVelocity > 0
      ? remainingDistance / (upwardVelocity * 1_000)
      : MAX_COMPLETION_DURATION;
    const duration = clamp(
      Math.min(distanceDuration, velocityDuration),
      MIN_COMPLETION_DURATION,
      MAX_COMPLETION_DURATION,
    );

    gsap.to(intro, {
      y: -height,
      duration,
      ease: 'power3.inOut',
      overwrite: true,
      onUpdate: () => setProgress(-getTranslateY(intro) / height),
      onComplete: finishCompletion,
    });
  }, [finishCompletion, introRef, setProgress]);

  const reset = useCallback((immediate = false) => {
    const intro = introRef.current;
    releasePointer(sessionRef.current);
    sessionRef.current = null;
    completingRef.current = false;
    completedRef.current = false;
    setIsDragging(false);
    setIsCompleting(false);

    if (!intro) {
      setProgress(0);
      return;
    }

    gsap.killTweensOf(intro);
    const height = Math.max(1, getElementHeight(intro));
    if (immediate || prefersReducedMotion()) {
      gsap.set(intro, { y: 0 });
      setProgress(0);
      return;
    }

    gsap.to(intro, {
      y: 0,
      duration: SNAP_BACK_DURATION,
      ease: 'power3.out',
      overwrite: true,
      onUpdate: () => setProgress(-getTranslateY(intro) / height),
      onComplete: () => setProgress(0),
    });
  }, [introRef, setProgress]);

  const dismiss = useCallback(() => {
    animateCompletion(0);
  }, [animateCompletion]);

  const handlePointerDown = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    if (!active || completingRef.current || completedRef.current) return;
    if (!event.isPrimary || event.button !== 0 || sessionRef.current) return;

    const intro = introRef.current;
    if (!intro) return;
    gsap.killTweensOf(intro);

    const height = Math.max(1, getElementHeight(intro));
    const startTranslateY = clamp(getTranslateY(intro), -height, 0);
    const now = getNow();
    sessionRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startTranslateY,
      height,
      axis: 'pending',
      samples: [{ y: event.clientY, time: now }],
    };
    setIsDragging(true);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; document-level pointer events still resolve safely.
    }
  }, [active, introRef]);

  const handlePointerMove = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId || !event.isPrimary) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (session.axis === 'pending' && Math.hypot(deltaX, deltaY) >= AXIS_LOCK_DISTANCE) {
      session.axis = Math.abs(deltaY) >= Math.abs(deltaX) ? 'vertical' : 'horizontal';
      suppressClickUntilRef.current = getNow() + 400;
    }
    if (session.axis !== 'vertical') return;

    event.preventDefault();
    recordVelocitySample(session, event.clientY, getNow());
    const nextY = clamp(session.startTranslateY + deltaY, -session.height, 0);
    const intro = introRef.current;
    if (!intro) return;
    gsap.set(intro, { y: nextY });
    setProgress(-nextY / session.height);
  }, [introRef, setProgress]);

  const releaseGesture = useCallback((event: Parameters<PointerEventHandler<HTMLElement>>[0]) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId || !event.isPrimary) return;

    recordVelocitySample(session, event.clientY, getNow());
    releasePointer(session);
    sessionRef.current = null;
    setIsDragging(false);

    const intro = introRef.current;
    if (!intro || session.axis !== 'vertical') {
      reset();
      return;
    }

    const distance = -clamp(getTranslateY(intro), -session.height, 0);
    const upwardVelocity = getUpwardVelocity(session.samples);
    const meetsDistance = distance >= session.height * DISTANCE_COMPLETION_RATIO;
    const meetsFlick = distance >= FLICK_MIN_DISTANCE
      && upwardVelocity >= FLICK_MIN_VELOCITY;
    if (meetsDistance || meetsFlick) {
      animateCompletion(upwardVelocity);
      return;
    }
    reset();
  }, [animateCompletion, introRef, reset]);

  const handlePointerUp = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    releaseGesture(event);
  }, [releaseGesture]);

  const handlePointerCancel = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    reset(prefersReducedMotion());
  }, [reset]);

  const handleClickCapture = useCallback<MouseEventHandler<HTMLElement>>((event) => {
    if (getNow() >= suppressClickUntilRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    releasePointer(sessionRef.current);
    sessionRef.current = null;
    completingRef.current = false;
    completedRef.current = false;
    const intro = introRef.current;
    if (intro) {
      gsap.killTweensOf(intro);
      if (active) {
        gsap.set(intro, { y: 0 });
        setProgress(0);
      }
    }
    const frame = window.requestAnimationFrame(() => {
      setIsDragging(false);
      setIsCompleting(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, introRef, setProgress]);

  useEffect(() => {
    if (!active) return;
    const cancelActiveGesture = () => {
      if (sessionRef.current) reset(prefersReducedMotion());
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelActiveGesture();
    };
    window.addEventListener('blur', cancelActiveGesture);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', cancelActiveGesture);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active, reset]);

  useEffect(() => () => {
    releasePointer(sessionRef.current);
    const intro = introRef.current;
    if (intro) gsap.killTweensOf(intro);
  }, [introRef]);

  const pointerHandlers = useMemo<IntroSwipePointerHandlers>(() => ({
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onClickCapture: handleClickCapture,
  }), [
    handleClickCapture,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  ]);

  return {
    pointerHandlers,
    dismiss,
    reset,
    progressRef,
    isDragging,
    isCompleting,
  };
}
