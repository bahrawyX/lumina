/**
 * Seed `users.timezone` from the browser on first authenticated load.
 *
 * P2-8: the column was written ONLY when a user opened Settings, while the
 * server derived every day boundary from it — task bursts, "completed on due
 * date", the planner's `?date=` filter, the focus streak, the daily brief. For
 * an account that never opened Settings it sat at UTC, so all of that ran a day
 * out for anyone west of Greenwich.
 *
 * Two rules, both deliberate:
 *
 * 1. **Only when nothing real is stored.** A missing value, or the literal
 *    'UTC' default, is treated as "never set". Anything else is the user's
 *    choice and is left alone — otherwise this would fight someone who picked a
 *    zone in Settings and then travelled, silently rewriting it on every load.
 * 2. **Only a zone the runtime recognises.** `resolvedOptions().timeZone` is
 *    normally a real IANA id, but it can be absent or non-standard in locked-down
 *    or exotic environments, and a bad value here would corrupt every boundary
 *    computed from it.
 *
 * Fire-and-forget: nothing on screen depends on it, and a failure just leaves
 * the previous value in place for the next load to retry.
 */
export function adoptBrowserTimeZone(stored: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (stored && stored !== 'UTC') return;

  let browserZone: string | undefined;
  try {
    browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return;
  }
  if (!browserZone || browserZone === stored) return;

  // Round-trip it through the formatter: an unknown id throws here rather than
  // reaching the database.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: browserZone }).format(new Date());
  } catch {
    return;
  }

  void fetch('/api/users/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone: browserZone }),
  }).catch(() => {
    /* Next load retries. */
  });
}
