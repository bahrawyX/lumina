'use client';

import { useEffect, useState } from 'react';

/**
 * The pending state for a lazily-loaded dialog or sheet.
 *
 * P3-9: every `Suspense` around a lazy dialog used `fallback={null}`. On a fast
 * connection that is invisible and fine. On a slow one, clicking "New goal" or
 * "Edit task" does nothing at all until the chunk arrives — the user clicks
 * again, and again, because the app has given them no signal that anything
 * happened.
 *
 * Two deliberate details:
 *
 * - **It waits 150ms before showing anything.** A chunk that is already cached
 *   resolves in a handful of milliseconds, and flashing a spinner for one frame
 *   is worse than showing nothing. Only a load slow enough to feel broken gets
 *   a spinner.
 * - **`role="status"` with a label**, so a screen reader announces that
 *   something is loading rather than leaving the user in the same silence as
 *   before.
 *
 * The spinner honours `prefers-reduced-motion` through the global rule in
 * `globals.css`, which clamps its animation duration rather than spinning
 * forever at full speed.
 */
export function LazyDialogFallback({ label = 'Loading…' }: { label?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-[1px]"
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary"
      />
    </div>
  );
}
