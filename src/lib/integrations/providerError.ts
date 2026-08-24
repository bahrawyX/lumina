import 'server-only';

/**
 * Classifying provider failures, so the app can tell "reconnect" from "wait".
 *
 * ## What was wrong
 *
 * Both sync paths had a catch-all that marked `status: 'error'` for **any**
 * thrown error, including a rate limit or a transient 503. Once
 * `status !== 'active'`, `getGoogleAccessToken` throws "not active" for every
 * subsequent call — live event fetch included. So **one Google rate-limit blip
 * silently killed the user's calendar** until they noticed and manually
 * reconnected.
 *
 * The mirror-image bug lived in the live-read clients: they threw a generic
 * `Error` on any non-2xx and never inspected `res.status`. When a user revoked
 * access provider-side, the app kept calling the IdP with a dead refresh token
 * forever, `integrations.status` stayed `'active'`, and the UI never prompted a
 * reconnect. `markGoogleIntegrationError` was only ever called from the sync
 * path.
 *
 * Both directions were wrong: transient failures were treated as permanent, and
 * permanent failures were treated as transient.
 */

export type ProviderErrorKind =
  /** Credentials are dead. The user must reconnect; retrying cannot help. */
  | 'reconnect_required'
  /** Rate limited. The integration is healthy; back off and retry. */
  | 'rate_limited'
  /** Provider-side fault. Healthy; retry with backoff. */
  | 'provider_unavailable'
  /** Anything else — a bug on our side, a malformed request. */
  | 'unknown';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | null;
  readonly provider: string;
  /** Seconds the provider asked us to wait, when it said. */
  readonly retryAfterSeconds: number | null;

  constructor(init: {
    provider: string;
    kind: ProviderErrorKind;
    status: number | null;
    message: string;
    retryAfterSeconds?: number | null;
  }) {
    super(init.message);
    this.name = 'ProviderError';
    this.provider = init.provider;
    this.kind = init.kind;
    this.status = init.status;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  /**
   * True when the integration should be marked `error` and the user prompted.
   * **Only** this. A 429 or a 503 must leave the integration active.
   */
  get isFatal(): boolean {
    return this.kind === 'reconnect_required';
  }

  /** True when a bounded retry is worth attempting. */
  get isRetryable(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'provider_unavailable';
  }
}

/** Map an HTTP status to a kind. */
export function classifyStatus(status: number, body = ''): ProviderErrorKind {
  // `invalid_grant` is the canonical "this refresh token is dead" signal and
  // can arrive as a 400 from the token endpoint rather than a 401.
  if (body.includes('invalid_grant')) return 'reconnect_required';
  if (status === 401 || status === 403) return 'reconnect_required';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'unknown';
}

/** Parse `Retry-After`, which may be seconds or an HTTP date. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return null;
}

/** Build a `ProviderError` from a failed `Response`. */
export function providerErrorFromResponse(
  provider: string,
  res: Response,
  body: string,
  context: string,
): ProviderError {
  return new ProviderError({
    provider,
    kind: classifyStatus(res.status, body),
    status: res.status,
    // The raw body is deliberately NOT in the message: these strings were being
    // forwarded verbatim to clients (P3-3), leaking internal paths and provider
    // diagnostics. The detail belongs in the structured log, via the `context`
    // the caller supplies.
    message: `${provider} request failed (${res.status}) at ${context}`,
    retryAfterSeconds: parseRetryAfter(res.headers.get('retry-after')),
  });
}

/**
 * A short, safe code for the client. Never a provider message.
 *
 * `sync/all`, `external-events/*` and `integrations/[provider]/calendars`
 * returned `err.message` straight through, which reads like
 * `[microsoft/client] Graph API 403 at <url>: <full response body>`.
 */
export function clientFacingCode(err: unknown): ProviderErrorKind {
  return err instanceof ProviderError ? err.kind : 'unknown';
}

/**
 * True only for failures that mean "the credentials are dead". Everything else
 * — a 429, a 503, a timeout — leaves the integration active.
 */
export function isFatalProviderError(err: unknown): boolean {
  return err instanceof ProviderError && err.isFatal;
}

const RETRYABLE_DELAYS_MS = [500, 1500, 4000];

/**
 * Run `fn`, retrying bounded times on retryable provider failures.
 *
 * `grep -rn "Retry-After|backoff" src/lib/integrations src/lib/calendar`
 * previously returned nothing: there was no retry anywhere, so a single 429
 * became a user-visible failure (and, via the catch-all above, a dead
 * integration).
 *
 * Honours `Retry-After` when the provider sends one, capped so a hostile or
 * mistaken header cannot pin a serverless function open.
 */
export async function withProviderRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; maxDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? RETRYABLE_DELAYS_MS.length + 1;
  const maxDelayMs = options.maxDelayMs ?? 8_000;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === maxAttempts - 1;
      if (isLast || !(err instanceof ProviderError) || !err.isRetryable) throw err;

      const suggested = err.retryAfterSeconds !== null ? err.retryAfterSeconds * 1000 : null;
      const backoff = RETRYABLE_DELAYS_MS[Math.min(attempt, RETRYABLE_DELAYS_MS.length - 1)];
      const delay = Math.min(suggested ?? backoff, maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
