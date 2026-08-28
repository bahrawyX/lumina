'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * One OAuth popup implementation.
 *
 * There were **four** copies of this promise pattern, in two families.
 * `Sidebar.tsx` and `OnboardingFlow.tsx`'s integration flow are byte-identical
 * modulo whitespace; the `/auth/signin` page and `OnboardingFlow`'s social flow
 * are a second, weaker pair. The divergence that mattered:
 *
 * |                    | social sign-in            | integration connect            |
 * |--------------------|---------------------------|--------------------------------|
 * | Return type        | `Promise<boolean>`        | discriminated result           |
 * | Popup blocked      | **throws** a string       | `{ reason: 'popup-blocked' }`   |
 * | User closed popup  | `false`                   | `{ reason: 'closed' }`          |
 * | Timeout            | `false`                   | `{ reason: 'timeout' }`         |
 * | Provider error     | `false` — `data.error` discarded | `{ reason: 'message-error' }` |
 * | Verifies outcome   | **no**                    | yes — polls `/api/integrations/status` |
 *
 * The integration path is the better implementation. The sign-in path is the
 * one users hit first. This is the integration shape, for both.
 *
 * ## What each finding changes
 *
 * **F4.1** — every failure collapsed into "Google sign-in was cancelled."
 * `useOAuthPopup` resolved `false` for four unrelated outcomes (provider posted
 * `success: false`, user closed the popup, the timeout expired, an error came
 * back) and the boolean discarded `data.error`. A user whose consent screen
 * errored, or who spent three minutes on a 2FA prompt, was told they cancelled
 * something they did not. The result is now discriminated.
 *
 * **F4.3** — if the `postMessage` never arrived, the opener span for the FULL
 * timeout and then reported cancellation, even though the session cookie was
 * set. `window.opener` is null whenever a popup blocker's "open in new tab"
 * fallback fires, when a provider round-trips through a `rel=noopener`
 * intermediary, or if COOP is ever added. `onPoll` lets the caller check real
 * session state on the same interval that watches `popup.closed`, so a
 * successful sign-in is detected without the message.
 *
 * **F4.4** — the popup was opened AFTER `await socialSignIn(...)`, so the user
 * gesture had already been consumed and iOS Safari blocked it essentially every
 * time. The window is now opened **synchronously** in the click handler and
 * navigated once the URL resolves, and a blocked popup is a reportable reason
 * rather than a thrown string, so the caller can fall back to a full-page
 * redirect.
 *
 * **F4.6** — the 3-minute timeout killed popups mid-2FA. Choosing an account,
 * completing an SMS or TOTP factor and granting scopes routinely exceeds it;
 * Google Calendar's consent screen alone does on mobile. Raised to 10 minutes,
 * and the popup is **left open** on timeout rather than force-closed, so the
 * user can finish in the window they are looking at.
 *
 * **F4.7** — `cleanup()` only ran when the promise settled, with no `useEffect`
 * teardown. Navigating away mid-flow left the `message` listener bound to
 * `window` and a 350 ms interval polling `popup.closed` for up to three
 * minutes; repeating the flow accumulated live listeners calling `setState` on
 * dead components. Cleanup is held in a ref and invoked on unmount.
 *
 * **F4.8** — `lumina-oauth-google` and `lumina-integration-google` are
 * different window names, so an onboarding user could have two Google popups
 * open at once with two independent listeners. One name per provider now, and
 * an in-flight flow is reused rather than duplicated.
 */

/**
 * `kind: 'ok' | 'error'` rather than `ok: boolean`, for the same reason
 * `FetchResult` uses one: `tsconfig.json` has `strict: false`, and with
 * `strictNullChecks` off TypeScript widens boolean *literal* types — so
 * `if (!result.ok)` does not narrow the union and every failure branch fails to
 * compile.
 */
export type OAuthPopupResult =
  | { kind: 'ok' }
  | {
      kind: 'error';
      reason:
        | 'popup-blocked'
        | 'closed'
        | 'timeout'
        /** The user pressed Cancel on the consent screen. Not a fault. */
        | 'cancelled'
        | 'message-error'
        | 'start-failed';
      /** The provider's own error, when it sent one. Never invented. */
      error?: string;
    };

export type OAuthPopupFailure = Extract<OAuthPopupResult, { kind: 'error' }>;

export interface OAuthPopupOptions {
  /** Namespaces the window and the message filter. */
  provider: string;
  /**
   * Resolve the URL to navigate the popup to. Called AFTER the window is
   * opened, so the user gesture is not consumed first (F4.4).
   */
  resolveUrl: () => Promise<string>;
  /**
   * Optional liveness check, run on the same interval that watches
   * `popup.closed`. Return true once the flow has demonstrably succeeded —
   * a session exists, an integration reports connected. This is what makes the
   * flow survive a missing `postMessage` (F4.3).
   */
  onPoll?: () => Promise<boolean>;
  /** Overridable for tests. */
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * The OAuth error codes that mean "the user said no", per RFC 6749 §4.1.2.1
 * and the providers' own additions. Matched exactly rather than by substring:
 * the previous check also fired on any error merely CONTAINING 'browser' or
 * 'secure', which is why an ordinary decline was reported as a compatibility
 * failure.
 */
const USER_CANCELLED_CODES = new Set([
  'access_denied',
  'consent_required',
  'user_cancelled_login',
  'user_cancelled_authorize',
  // Microsoft's code for "user cancelled at the consent prompt".
  'aadsts65004',
]);

/** True when the provider's error means the user declined. */
export function isUserCancellation(error?: string | null): boolean {
  if (!error) return false;
  const normalized = error.trim().toLowerCase();
  if (USER_CANCELLED_CODES.has(normalized)) return true;
  // Providers sometimes send `error=access_denied&error_description=…`; match
  // the code token rather than anywhere in free text.
  return [...USER_CANCELLED_CODES].some((code) =>
    new RegExp(`(^|[^a-z0-9_])${code}([^a-z0-9_]|$)`).test(normalized),
  );
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 400;

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 700;

function popupFeatures(): string {
  const left = Math.max(0, window.screenX + (window.outerWidth - POPUP_WIDTH) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2);
  return `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`;
}

export function useOAuthPopup() {
  /** Torn down on unmount, not only when the promise settles (F4.7). */
  const cleanupRef = useRef<(() => void) | null>(null);
  /** One flow per provider at a time (F4.8). */
  const inFlightRef = useRef<Map<string, Promise<OAuthPopupResult>>>(new Map());

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  return useCallback(
    (options: OAuthPopupOptions): Promise<OAuthPopupResult> => {
      const {
        provider,
        resolveUrl,
        onPoll,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        pollIntervalMs = DEFAULT_POLL_MS,
      } = options;

      const existing = inFlightRef.current.get(provider);
      if (existing) return existing;

      // F4.4: opened SYNCHRONOUSLY, inside the click handler, before any await.
      // Opening it after `await socialSignIn(...)` consumes the user gesture,
      // and iOS Safari then blocks the popup essentially every time.
      const popup = window.open('about:blank', `lumina-oauth-${provider}`, popupFeatures());

      if (!popup) {
        // A reportable reason, not a thrown string: "allow popups" is not
        // actionable on iOS, where the setting is buried in Settings > Safari.
        // The caller can fall back to a full-page redirect instead.
        return Promise.resolve({ kind: 'error', reason: 'popup-blocked' });
      }
      popup.focus();

      const run = new Promise<OAuthPopupResult>((resolve) => {
        let settled = false;
        let pollId = 0;
        let timeoutId = 0;

        const finish = (result: OAuthPopupResult) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        };

        const onMessage = (event: MessageEvent) => {
          // Origin check first, always. This is the one thing most popup
          // implementations get wrong; all four copies here got it right.
          if (event.origin !== window.location.origin) return;
          const data = event.data as
            | { type?: string; provider?: string; success?: boolean; error?: string }
            | null;
          if (!data || typeof data !== 'object') return;
          if (data.type !== 'lumina:oauth-complete') return;
          if (data.provider !== provider) return;

          if (data.success === false) {
            // F4.5: `access_denied` is exactly what an OAuth provider sends
            // when the user presses Cancel. Both integration copies matched it
            // against a list that also included the substrings 'browser' and
            // 'secure', and answered with "Google blocked browser/app context.
            // OAuth failed." — telling someone who deliberately declined that
            // their browser is broken.
            if (isUserCancellation(data.error)) {
              finish({ kind: 'error', reason: 'cancelled', error: data.error });
              return;
            }
            // F4.1: the provider's own error is CARRIED, not discarded. The
            // boolean return is what made every failure read as "cancelled".
            finish({ kind: 'error', reason: 'message-error', error: data.error });
            return;
          }
          finish({ kind: 'ok' });
        };

        function cleanup() {
          window.removeEventListener('message', onMessage);
          window.clearInterval(pollId);
          window.clearTimeout(timeoutId);
          inFlightRef.current.delete(provider);
          if (cleanupRef.current === cleanup) cleanupRef.current = null;
        }

        cleanupRef.current = cleanup;
        window.addEventListener('message', onMessage);

        pollId = window.setInterval(() => {
          if (settled) return;

          // F4.3: check real state, not just the message. `window.opener` is
          // null in several ordinary situations, and then no message ever
          // arrives even though the sign-in succeeded.
          if (onPoll) {
            void onPoll()
              .then((done) => {
                if (done) finish({ kind: 'ok' });
              })
              .catch(() => {
                /* a failed probe is not a failed sign-in */
              });
          }

          if (popup.closed) {
            // Give a just-completed flow a beat to deliver its message or for
            // `onPoll` to observe the session, so closing the window at the
            // moment of success is not reported as a cancellation.
            window.setTimeout(() => {
              if (settled) return;
              if (onPoll) {
                void onPoll()
                  .then((done) => finish(done ? { kind: 'ok' } : { kind: 'error', reason: 'closed' }))
                  .catch(() => finish({ kind: 'error', reason: 'closed' }));
              } else {
                finish({ kind: 'error', reason: 'closed' });
              }
            }, pollIntervalMs);
          }
        }, pollIntervalMs);

        timeoutId = window.setTimeout(() => {
          // F4.6: the popup is deliberately NOT closed. Three minutes was
          // already inside the normal range for choosing an account and
          // completing a second factor; killing the window the user is looking
          // at is the worst possible response to them being slow.
          finish({ kind: 'error', reason: 'timeout' });
        }, timeoutMs);

        // Now resolve the URL and point the already-open window at it.
        resolveUrl()
          .then((url) => {
            if (settled) return;
            try {
              popup.location.href = url;
            } catch {
              finish({ kind: 'error', reason: 'start-failed' });
            }
          })
          .catch((err: unknown) => {
            try {
              popup.close();
            } catch {
              /* already gone */
            }
            finish({
              kind: 'error',
              reason: 'start-failed',
              error: err instanceof Error ? err.message : undefined,
            });
          });
      });

      inFlightRef.current.set(provider, run);
      return run;
    },
    [],
  );
}

/**
 * User-facing copy for a failure.
 *
 * F4.1 / F3.13: the old strings were `'Google sign-in was cancelled.'` for all
 * four outcomes, `'Could not start OAuth sign-in.'` ("OAuth" is developer
 * vocabulary), and `` `${provider} sign-in failed.` `` which interpolated the
 * raw id to produce "google sign-in failed."
 */
export function oauthFailureMessage(
  result: OAuthPopupFailure,
  providerLabel: string,
): string {
  switch (result.reason) {
    case 'popup-blocked':
      return `Your browser blocked the ${providerLabel} sign-in window. We'll try again in this tab.`;
    case 'closed':
      return `The ${providerLabel} window closed before sign-in finished.`;
    case 'cancelled':
      // F4.5: a decline is a choice, not an error. No "try a regular browser
      // window", no "OAuth failed" — nothing went wrong.
      return `${providerLabel} sign-in was cancelled.`;
    case 'timeout':
      return `Still waiting on ${providerLabel}. Finish in the other window, or start over.`;
    case 'message-error':
      return result.error
        ? `${providerLabel} couldn't complete sign-in: ${result.error}`
        : `${providerLabel} couldn't complete sign-in.`;
    case 'start-failed':
    default:
      return `We couldn't reach ${providerLabel}. Check your connection and try again.`;
  }
}
