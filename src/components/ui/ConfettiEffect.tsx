'use client';

import confetti from 'canvas-confetti';

/**
 * Fire a celebratory confetti burst.
 * Respects prefers-reduced-motion — skips if user prefers reduced motion.
 * Call this directly (no component needed — canvas-confetti manages its own canvas).
 */
export function triggerConfetti() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors: [
      'hsl(249, 66%, 61%)', // primary
      'hsl(38, 92%, 50%)',  // amber
      'hsl(142, 71%, 45%)', // emerald
      'hsl(262, 83%, 58%)', // violet
      'hsl(346, 77%, 49%)', // rose
    ],
    disableForReducedMotion: true,
    ticks: 150,
    gravity: 1.2,
    scalar: 0.9,
  });
}
