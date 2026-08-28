/**
 * Reading BetterAuth's client-side error objects.
 *
 * ## Why this exists (F3.2, latent)
 *
 * `autoSignIn: false` is what closes the sign-up enumeration oracle: BetterAuth
 * returns the generic synthetic-user response for an already-registered address
 * only when auto-sign-in is off. The cost is that sign-up no longer establishes
 * a session, so the page signs in explicitly afterwards — and the sign-in page
 * mapped **every** failure of that second call to:
 *
 * > That email may already be registered.
 *
 * Which is right for the case it was written for and wrong for the other one.
 * `requireEmailVerification` is currently `isEmailConfigured()`, i.e. `false`,
 * because no `RESEND_API_KEY` is set. The moment one is, BetterAuth answers a
 * *genuine new* sign-up's follow-up sign-in with `EMAIL_NOT_VERIFIED` — and
 * every real new user would be told their address was taken, on the very step
 * that was supposed to be their first success.
 *
 * The bug is dormant, not absent: it is armed by an environment variable.
 */

/** The shape BetterAuth's client returns in `result.error`. */
export interface AuthClientError {
  code?: string;
  status?: number;
  statusText?: string;
  message?: string;
}

/**
 * True when the failure means "this account exists and is fine, but the
 * address has not been verified yet".
 *
 * Matched on `code` first, which is what BetterAuth documents. The message
 * check is a fallback for versions that omit the code, and is deliberately
 * narrow — matching loose substrings is exactly how F4.5's blocked-context
 * heuristic turned an ordinary cancellation into a browser fault.
 */
export function isEmailVerificationPending(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as AuthClientError;

  if (typeof err.code === 'string' && err.code.toUpperCase() === 'EMAIL_NOT_VERIFIED') {
    return true;
  }

  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return message === 'email not verified' || message === 'email_not_verified';
}
