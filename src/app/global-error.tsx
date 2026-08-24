'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary: catches errors thrown in the ROOT layout, which
 * `(app)/error.tsx` cannot. There was no `global-error.tsx` at all, so a
 * failure in the root layout or providers produced Next's default error screen
 * and reported nothing.
 *
 * It must render its own `<html>`/`<body>` because it replaces the root layout
 * entirely, and it cannot use any app styling or context for the same reason —
 * hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'client root error',
        scope: 'root',
        digest: error.digest,
        name: error.name,
        message: error.message,
        stack: error.stack,
        ts: new Date().toISOString(),
      }),
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#0f0f14',
          color: '#e8e8ee',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.125rem', fontWeight: 500, margin: 0 }}>
          Lumina couldn&rsquo;t load
        </h1>
        <p style={{ fontSize: '0.875rem', opacity: 0.7, margin: 0 }}>
          Something failed before the app started.
        </p>
        {error.digest && (
          <p style={{ fontFamily: 'monospace', fontSize: '0.7rem', opacity: 0.5, margin: 0 }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: 'inherit',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
