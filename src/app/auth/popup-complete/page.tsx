'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { sanitizeNextDestination } from '@/lib/auth/nextDestination';

/**
 * The page an OAuth callback lands on inside the popup.
 *
 * F4.3: `if (!window.opener) return;` was the whole no-opener story. The page
 * then rendered "Authentication complete" and did nothing else — a dead end.
 *
 * `window.opener` is null more often than it looks:
 *
 *  - a popup blocker's "open in a new tab instead" fallback,
 *  - a provider that round-trips through a `rel=noopener` intermediary,
 *  - `Cross-Origin-Opener-Policy: same-origin` on the callback response.
 *
 * In every one of those the sign-in genuinely succeeded and the cookie is set.
 * The user was left looking at a terminal page telling them to close a window
 * that is actually their only tab. The opener-side `onPoll` added for this
 * finding rescues the case where an opener EXISTS and no message arrives; this
 * is the other half, where there is nobody to message.
 *
 * It also rendered "Authentication complete" unconditionally, including when
 * the callback came back with `?error=true`.
 */
function PopupCompleteInner() {
  const searchParams = useSearchParams();
  const provider = searchParams.get('provider') ?? 'oauth';
  const hasError = searchParams.get('error') === 'true';
  const errorDetail = searchParams.get('detail');

  /** `null` until the effect decides; then how this window is being used. */
  const [mode, setMode] = useState<'popup' | 'standalone' | null>(null);

  useEffect(() => {
    if (!window.opener) {
      setMode('standalone');
      if (hasError) return;

      // Not a popup, and the sign-in worked: this tab IS the user's session.
      // Continue them into the app rather than stranding them. The sanitizer
      // returns null for anything that is not a rooted same-origin path, which
      // is why the fallback is a literal and not the raw param (F8.2).
      const next = sanitizeNextDestination(searchParams.get('next')) ?? '/calendar';
      window.location.replace(next);
      return;
    }

    setMode('popup');
    try {
      window.opener.postMessage(
        {
          type: 'lumina:oauth-complete',
          provider,
          success: !hasError,
          error: hasError ? errorDetail ?? 'oauth_error' : null,
        },
        window.location.origin,
      );
    } finally {
      window.close();
    }
  }, [provider, hasError, errorDetail, searchParams]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-sm text-center space-y-2">
        {hasError ? (
          <>
            <h1 className="text-lg font-semibold">Sign-in didn&apos;t finish</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'standalone'
                ? 'Something went wrong on the way back. Please try again.'
                : 'You can close this window and try again.'}
            </p>
            {mode === 'standalone' ? (
              <p className="pt-2">
                <a
                  href="/auth/signin"
                  className="text-sm underline underline-offset-4 hover:text-foreground"
                >
                  Back to sign in
                </a>
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Authentication complete</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'standalone'
                ? 'Taking you back to Lumina…'
                : 'You can close this window and continue onboarding.'}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function OAuthPopupCompletePage() {
  return (
    <Suspense>
      <PopupCompleteInner />
    </Suspense>
  );
}
