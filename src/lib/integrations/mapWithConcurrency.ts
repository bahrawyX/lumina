/**
 * Map `items` through `fn` with at most `limit` invocations in flight at once,
 * preserving input order in the returned array.
 *
 * Used to bound external-calendar fan-out (TD-5 / Batch 8 #7): syncing a user
 * with many calendars must not fire N simultaneous multi-page fetches. Like
 * Promise.all, the first rejection propagates (a failed calendar fails the sync).
 *
 * Pure (no server-only APIs) so it stays trivially unit-testable.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(Math.floor(limit), items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    // Each worker synchronously claims the next index (no await between read and
    // increment, so single-threaded JS makes this contention-free), then awaits.
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
