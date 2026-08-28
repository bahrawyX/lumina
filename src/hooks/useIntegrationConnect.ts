'use client';

import { useCallback } from 'react';
import { oauthFailureMessage, useOAuthPopup } from './useOAuthPopup';

/**
 * The calendar-integration connect flow, in one place.
 *
 * `useOAuthPopup` was written to be the single OAuth popup implementation, and
 * the sign-in page adopted it — but the two *integration* copies it was
 * extracted from were never removed. `Sidebar.tsx` and `OnboardingFlow.tsx`
 * still carried byte-identical (modulo whitespace) copies of the promise
 * pattern, the failure-message switch, and the blocked-context heuristic:
 * roughly 120 duplicated lines each, and three popup implementations in the
 * repo rather than the one the hook's own docstring claims.
 *
 * Everything the hook fixed was therefore still broken on the path most users
 * actually take to connect a calendar:
 *
 * - **F4.5** — an ordinary Cancel was reported as a browser fault. Both copies
 *   matched `access_denied` (exactly what a provider sends when the user
 *   declines) against a list that also included the substrings `'browser'` and
 *   `'secure'`, and answered *"Google blocked browser/app context. OAuth
 *   failed. Connection was not completed. Try again in a regular browser
 *   window."* `timeout` and `status-false` were hard-mapped to the same string.
 * - **F4.6** — the copies kept the 3-minute timeout and still force-closed the
 *   popup, so a user mid-2FA had the window they were looking at killed.
 * - **F4.7** — the copies cleaned up only on settle, with no unmount teardown,
 *   so navigating away mid-flow leaked a `message` listener and a 350 ms
 *   interval.
 * - **F4.8** — the copies opened `lumina-integration-${provider}` while the
 *   hook opens `lumina-oauth-${provider}`, so an onboarding user could have two
 *   Google popups open at once with two independent listeners.
 *
 * All of it now comes from the hook.
 */

export type IntegrationProvider = 'google' | 'microsoft';

export function integrationLabel(provider: IntegrationProvider): string {
  return provider === 'google' ? 'Google Calendar' : 'Outlook';
}

export type IntegrationConnectResult =
  | { kind: 'ok' }
  /** `message` is ready to show. The caller never builds copy itself. */
  | { kind: 'error'; message: string };

export interface UseIntegrationConnectOptions {
  /**
   * Poll the real connection state. Used both as the popup's liveness check
   * (so a missing `postMessage` does not fail a successful connect) and for the
   * confirmation pass afterwards.
   */
  isConnected: (provider: IntegrationProvider) => Promise<boolean>;
}

/** Attempts for the post-popup confirmation, and the gap between them. */
const CONFIRM_ATTEMPTS = 3;
const CONFIRM_DELAY_MS = 500;

export function useIntegrationConnect({ isConnected }: UseIntegrationConnectOptions) {
  const openOAuthPopup = useOAuthPopup();

  return useCallback(
    async (provider: IntegrationProvider): Promise<IntegrationConnectResult> => {
      const label = integrationLabel(provider);

      const result = await openOAuthPopup({
        provider,
        resolveUrl: async () => `/api/integrations/${provider}/connect`,
        // F4.3: the token exchange finishing without a message reaching us is
        // an ordinary outcome, not a failure.
        onPoll: () => isConnected(provider),
      });

      if (result.kind === 'error') {
        return { kind: 'error', message: oauthFailureMessage(result, label) };
      }

      // The popup reported success; confirm it against the server before
      // telling the user their calendar is connected.
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
        if (await isConnected(provider)) return { kind: 'ok' };
        if (attempt < CONFIRM_ATTEMPTS - 1) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, CONFIRM_DELAY_MS);
          });
        }
      }

      // Genuinely the "OAuth finished but status stayed disconnected" case —
      // the only one of the old messages that was accurate, kept and shortened.
      return {
        kind: 'error',
        message: `${label} finished signing in, but we still can't see the connection. Please try again.`,
      };
    },
    [openOAuthPopup, isConnected],
  );
}
