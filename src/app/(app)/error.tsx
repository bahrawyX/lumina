'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary for the authenticated app.
 *
 * This used to render "Something went wrong" and report **nowhere** — the
 * `error` prop and its `digest` were never read, so a client crash in
 * production left no trace anywhere. `digest` is the hash Next assigns to a
 * server error, and it is the only way to correlate what the user saw with the
 * server-side stack.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured so a log drain can pick it up, and so the digest is present
    // when someone asks "what happened at 14:02?".
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'client route error',
        scope: 'app',
        digest: error.digest,
        name: error.name,
        message: error.message,
        stack: error.stack,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        ts: new Date().toISOString(),
      }),
    );
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">Something went wrong</p>
      {error.digest && (
        // Surfaced deliberately: it is an opaque hash, not error detail, and it
        // is the one thing that makes a support report actionable.
        <p className="font-mono text-[10px] text-muted-foreground/60">
          Reference: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.assign('/calendar')}
          className="rounded-lg border border-border px-4 py-2 text-sm"
        >
          Back to calendar
        </button>
      </div>
    </div>
  );
}
