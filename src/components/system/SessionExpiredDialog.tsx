'use client';

import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * "Your session expired — sign in again."
 *
 * Deliberately blocking, unlike `HydrationFailureBanner`. A failed *read* still
 * leaves a usable app; a dead session does not — every write from this point on
 * is discarded, and the previous behaviour was to keep accepting them silently
 * so the user lost everything typed since expiry on the next reload.
 *
 * Rendered inside the app shell, so the user can still see their unsaved work
 * behind the dialog and copy anything out before signing in again.
 */
export function SessionExpiredDialog() {
  const expired = useSessionStore((s) => s.expired);
  const router = useRouter();

  if (!expired) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-body"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-card">
        <h2 id="session-expired-title" className="font-display text-lg font-medium tracking-[-0.02em]">
          Your session expired
        </h2>
        <p id="session-expired-body" className="mt-2 text-sm text-muted-foreground leading-relaxed">
          You&rsquo;ve been signed out, so changes made from now on can&rsquo;t be saved.
          Nothing already saved has been lost &mdash; sign in again to pick up where
          you left off.
        </p>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => {
              const next = `${window.location.pathname}${window.location.search}`;
              router.push(`/auth/signin?next=${encodeURIComponent(next)}`);
            }}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
