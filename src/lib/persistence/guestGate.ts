import { isGuestUser } from './guestStorage';

/**
 * The honest answer for features a guest genuinely cannot have.
 *
 * ## Why a gate rather than a local implementation (F6.1)
 *
 * Most guest domains are straightforward: a task, an event, a goal or a mood
 * log is the user's own content, so keeping it in the guest namespace and
 * importing it on sign-up is both possible and what the banner already
 * promises.
 *
 * Coins and streaks are not that. Both are **server-authoritative by
 * construction**:
 *
 *  - the balance is derived from `awardCoins`' ledger, whose dedupe keys and
 *    daily caps exist precisely so a client cannot decide what it has earned
 *    (P1-3 hardened exactly this);
 *  - the daily streak is computed from server-side date arithmetic against
 *    `users.last_focus_date`, in the user's stored timezone (P2-8), for the
 *    same reason a client-supplied date could not be trusted.
 *
 * So a guest "earning" coins locally leaves two options on sign-up, and both
 * are wrong: import a self-reported balance — a client-side mint, and a
 * straight bypass of the caps — or throw it away, which breaks the same
 * promise a second time and more painfully, because by then the user has
 * watched a number go up.
 *
 * Saying so up front is the only version that is true. `GuestGateResult`
 * carries the copy so no call site has to invent it, and so the wording is
 * consistent everywhere it appears.
 */

export type GuestGateResult<T> =
  | { kind: 'allowed' }
  /** `value` is what the caller should use instead of hitting the API. */
  | { kind: 'guest'; reason: string; value: T };

/** Features that need a real account, and why — in the user's words. */
export const GUEST_UNAVAILABLE = {
  coins:
    'Coins are tied to your account. Sign up to start earning — nothing you do now is lost.',
  streak:
    'Streaks are tied to your account. Sign up to start one — your work here still carries over.',
  purchase: 'Sign up to spend coins. Your tasks, events and notes come with you.',
  recovery: 'Streak recovery needs an account.',
} as const;

/**
 * Short-circuit a persistence call when the visitor is a guest.
 *
 * ```ts
 * const gate = guestGate(defaultCoinsData());
 * if (gate.kind === 'guest') return ok(gate.value);
 * ```
 */
export function guestGate<T>(
  fallback: T,
  reason: string = GUEST_UNAVAILABLE.coins,
): GuestGateResult<T> {
  if (!isGuestUser()) return { kind: 'allowed' };
  return { kind: 'guest', reason, value: fallback };
}
