import 'server-only';

import { ProviderError } from './providerError';

/**
 * The only thing an integration route may tell the client about a provider
 * failure.
 *
 * ## P3-3 — provider error strings were forwarded verbatim
 *
 * `sync/all`, `sync/google`, `sync/outlook`, `external-events/*` and
 * `integrations/[provider]/calendars` returned `err.message` straight through.
 * Those strings read like
 *
 *     [microsoft/client] Graph API 403 at <url>: <full response body>
 *
 * leaking internal paths and provider diagnostics. Most other routes in the app
 * correctly log the detail and return a fixed string.
 *
 * These codes are deliberately actionable rather than merely safe: the client
 * needs to distinguish "reconnect your calendar" from "try again in a minute",
 * which is the same distinction P1-12 introduced server-side.
 */
export type IntegrationErrorCode =
  /** No integration row, or it was never connected. */
  | 'not_connected'
  /** Credentials are dead — the user must reconnect. */
  | 'reconnect_required'
  /** Provider rate limit. Healthy; retry later. */
  | 'rate_limited'
  /** Provider-side fault. Healthy; retry later. */
  | 'provider_unavailable'
  /** Anything else. */
  | 'provider_error';

/**
 * Classify a thrown error into a client-safe code.
 *
 * Prefers the structured `ProviderError` kind; falls back to matching the
 * message only for the internally-thrown "not connected" strings, which are our
 * own text rather than a provider's.
 */
export function integrationErrorCode(err: unknown, message = ''): IntegrationErrorCode {
  if (err instanceof ProviderError) {
    switch (err.kind) {
      case 'reconnect_required':
        return 'reconnect_required';
      case 'rate_limited':
        return 'rate_limited';
      case 'provider_unavailable':
        return 'provider_unavailable';
      default:
        return 'provider_error';
    }
  }

  // Our own strings, thrown by the token helpers before any request is made.
  const text = message || (err instanceof Error ? err.message : String(err ?? ''));
  if (
    text.includes('No Google integration') ||
    text.includes('No Microsoft integration') ||
    text.includes('No Google account linked') ||
    text.includes('not connected')
  ) {
    return 'not_connected';
  }
  if (
    text.includes('not active') ||
    text.includes('refresh token missing') ||
    text.includes('tokens are missing') ||
    text.includes('invalid_grant')
  ) {
    return 'reconnect_required';
  }

  return 'provider_error';
}
