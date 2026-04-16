'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import type { DotLottieInstance } from '@/components/landing/LottieAnimation';

/**
 * Play a Lottie once when its container scrolls into view.
 *
 * Returns a `containerRef` to attach to the wrapping div and a `setRef`
 * callback to pass to `LottieAnimation`'s `dotLottieRefCallback`.
 */
export function useLottieInView(options?: {
  once?: boolean;
  margin?: string;
  /** Optional delay (ms) before .play() fires — used for stagger cascades */
  delay?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotLottieRef = useRef<DotLottieInstance | null>(null);
  const hasPlayed = useRef(false);
  const prefersReduced = useReducedMotion();

  const isInView = useInView(containerRef, {
    once: options?.once ?? true,
    margin: (options?.margin as `${number}px`) ?? '-80px',
  });

  useEffect(() => {
    if (!isInView || hasPlayed.current || !dotLottieRef.current) return;
    if (prefersReduced) {
      // Snap to last frame so user sees the "complete" state immediately
      const d = dotLottieRef.current;
      if (d.totalFrames > 0) d.setFrame(d.totalFrames - 1);
      hasPlayed.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      dotLottieRef.current?.play();
      if (options?.once !== false) hasPlayed.current = true;
    }, options?.delay ?? 0);
    return () => window.clearTimeout(timer);
  }, [isInView, options?.delay, options?.once, prefersReduced]);

  const setDotLottieRef = useCallback((instance: DotLottieInstance | null) => {
    dotLottieRef.current = instance;
  }, []);

  return { containerRef, setDotLottieRef, isInView, dotLottieRef };
}

/**
 * Speed up a Lottie on hover, return to normal on leave.
 * No-ops when user has reduced motion preference.
 */
export function useLottieHover(normalSpeed = 1, hoverSpeed = 1.5) {
  const dotLottieRef = useRef<DotLottieInstance | null>(null);
  const prefersReduced = useReducedMotion();

  const setRef = useCallback((instance: DotLottieInstance | null) => {
    dotLottieRef.current = instance;
  }, []);

  const onMouseEnter = useCallback(() => {
    if (prefersReduced) return;
    dotLottieRef.current?.setSpeed(hoverSpeed);
  }, [hoverSpeed, prefersReduced]);

  const onMouseLeave = useCallback(() => {
    if (prefersReduced) return;
    dotLottieRef.current?.setSpeed(normalSpeed);
  }, [normalSpeed, prefersReduced]);

  return { setRef, onMouseEnter, onMouseLeave };
}

/**
 * Replay a Lottie from the start on each call. Used for feature cards and
 * CTA button clicks — the caller decides when to trigger replay.
 */
export function useLottieHoverReplay() {
  const dotLottieRef = useRef<DotLottieInstance | null>(null);
  const prefersReduced = useReducedMotion();

  const setRef = useCallback((instance: DotLottieInstance | null) => {
    dotLottieRef.current = instance;
  }, []);

  const replay = useCallback(() => {
    if (prefersReduced) return;
    if (!dotLottieRef.current) return;
    dotLottieRef.current.stop();
    dotLottieRef.current.play();
  }, [prefersReduced]);

  return { setRef, replay };
}

/**
 * Play-on-hover, stop-on-leave. Used for the Pomodoro card where we want
 * the timer ring to fill up while the user is hovering, then reset.
 */
export function useLottiePlayOnHover() {
  const dotLottieRef = useRef<DotLottieInstance | null>(null);
  const prefersReduced = useReducedMotion();

  const setRef = useCallback((instance: DotLottieInstance | null) => {
    dotLottieRef.current = instance;
  }, []);

  const onMouseEnter = useCallback(() => {
    if (prefersReduced || !dotLottieRef.current) return;
    dotLottieRef.current.stop();
    dotLottieRef.current.play();
  }, [prefersReduced]);

  const onMouseLeave = useCallback(() => {
    if (prefersReduced || !dotLottieRef.current) return;
    dotLottieRef.current.stop();
  }, [prefersReduced]);

  return { setRef, onMouseEnter, onMouseLeave };
}
