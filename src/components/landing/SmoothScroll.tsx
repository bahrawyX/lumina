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
    if (typeof window === "undefined") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");

    let lenis: Lenis | null = null;
    let rafId: number | null = null;

    const stop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      lenis?.destroy();
      lenis = null;
    };

    const start = () => {
      if (lenis) return;

      // F1.12: there was no pointer gate. `syncTouch: false` correctly leaves
      // native touch scrolling alone, but the requestAnimationFrame loop still
      // ran every frame, forever, on mobile — burning battery for no behaviour
      // at all. Nothing to smooth means nothing to construct.
      if (coarsePointer.matches) return;

      // Respect reduced motion — no smooth scroll, just native.
      if (reduceMotion.matches) return;

      lenis = new Lenis({
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        lerp: 0.1,
        wheelMultiplier: 1,
        touchMultiplier: 1.5,
        smoothWheel: true,
        syncTouch: false,

        // F1.12: Lenis 1.3 defaults `anchors` to false and this never passed
        // it, so the hero's "See how it works" (`<Link href="#features">`) was
        // a hard native jump — on a page whose entire premise is smoothness.
        // The offset clears the sticky nav so the section heading is not
        // hidden under it.
        anchors: { offset: -56 },

        // Without this, in-flight inertia keeps running after an anchor jump
        // and drags the viewport past the target.
        stopInertiaOnNavigate: true,
      });

      const raf = (time: number) => {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
    };

    start();

    // F1.12: the reduced-motion check was a one-shot `.matches` read at mount
    // with no `change` listener, so toggling the OS setting did nothing until a
    // full navigation — and a user turning motion OFF mid-session is exactly
    // the person who needs it to take effect immediately.
    const onPreferenceChange = () => {
      stop();
      start();
    };
    reduceMotion.addEventListener("change", onPreferenceChange);
    coarsePointer.addEventListener("change", onPreferenceChange);

    return () => {
      reduceMotion.removeEventListener("change", onPreferenceChange);
      coarsePointer.removeEventListener("change", onPreferenceChange);
      stop();
    };
  }, []);

  return null;
}
