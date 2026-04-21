"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Lenis smooth-scroll, scoped to the landing page only.
 *
 * Why not global: the calendar app has its own scroll containers (timeline,
 * task board, doc editor) that rely on native scroll semantics. Lenis
 * hijacks `wheel` events and drives `window.scrollTo` itself, which breaks
 * nested scroll areas and dnd-kit drag autoscroll. Mounting this component
 * only on the landing route keeps the hijack scoped to where it belongs.
 *
 * The cleanup function calls `lenis.destroy()` on unmount, which restores
 * native scrolling before the user navigates to /calendar or /onboarding.
 */
export function SmoothScroll() {
  useEffect(() => {
    // Respect reduced-motion preference — no smooth scroll, just native
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      lerp: 0.1,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      smoothWheel: true,
      syncTouch: false,
    });

    let rafId: number;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    // FeatureShowcase fires these events to pause/resume Lenis while its own
    // wheel hijack is active, preventing Lenis momentum from carrying the page
    // scroll past the showcase section (especially when scrolling back up).
    const onStop = () => lenis.stop();
    const onStart = () => lenis.start();
    window.addEventListener('lumina:lenis-stop', onStop);
    window.addEventListener('lumina:lenis-start', onStart);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      window.removeEventListener('lumina:lenis-stop', onStop);
      window.removeEventListener('lumina:lenis-start', onStart);
    };
  }, []);

  return null;
}
