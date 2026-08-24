'use client';

import { useRouter } from 'next/navigation';
import {
  DOMAIN_LABELS,
  failedDomains,
  hasAuthFailure,
  useHydrationStatusStore,
} from '@/store/useHydrationStatusStore';

/**
 * "We couldn't load your tasks — Retry".
 *
 * The missing half of the persistence fix. `PersistenceBootstrap` used to turn
 * every hydration failure into an empty store and render on, so a 500, an
 * expired session and a dropped connection all looked identical to a brand-new
 * account: an empty calendar, an empty board, zero goals, no error, no retry.
 *
 * This is the surface that makes the difference visible. It is deliberately a
 * banner and not a blocking modal — whatever *did* load is still usable, and
 * pinning the whole app behind a dialog because the coins fetch failed would be
 * worse than the problem.
 */
function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function HydrationFailureBanner() {
  const failures = useHydrationStatusStore((s) => s.failures);
  const retrying = useHydrationStatusStore((s) => s.retrying);
  const retry = useHydrationStatusStore((s) => s.retry);
  const router = useRouter();

  const domains = failedDomains(failures);
  if (domains.length === 0) return null;

  const needsAuth = hasAuthFailure(failures);
  const what = joinLabels(domains.map((d) => DOMAIN_LABELS[d]));

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-destructive/25 bg-destructive/10 px-4 py-2 text-xs text-foreground"
    >
      <span className="font-medium">
        {needsAuth
          ? 'Your session expired, so some of your data could not be loaded.'
          : `We couldn't load your ${what}.`}
      </span>
      <span className="text-muted-foreground">
        {needsAuth
          ? 'Sign in again to get it back.'
          : "This isn't data loss — it's still on the server."}
      </span>
      {needsAuth ? (
        <button
          type="button"
          onClick={() => router.push('/auth/signin')}
          className="ml-auto rounded-md border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted"
        >
          Sign in
        </button>
      ) : (
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="ml-auto rounded-md border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-50"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
