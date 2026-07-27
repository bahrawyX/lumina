/**
 * Batch 8 #7 — bounded per-calendar fan-out (TD-5) regression tests.
 *
 * mapWithConcurrency replaces the unbounded Promise.all in
 * syncAll{Google,Microsoft}CalendarEvents. These tests prove the core guarantee:
 * never more than `limit` tasks in flight, input order preserved, and rejection
 * propagates like Promise.all did.
 */
import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '@/lib/integrations/mapWithConcurrency';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('never exceeds the concurrency limit but still runs in parallel', async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await mapWithConcurrency(items, 4, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick(5);
      inFlight--;
      return n * 10;
    });

    expect(maxInFlight).toBeLessThanOrEqual(4); // bounded
    expect(maxInFlight).toBeGreaterThan(1); // genuinely parallel, not serialized
    expect(results).toEqual(items.map((n) => n * 10)); // order preserved
  });

  it('preserves order even when later items resolve first', async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await tick(ms);
      return ms;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it('returns [] for an empty input without invoking fn', async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 4, async () => {
      calls++;
      return 1;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it('handles a limit larger than the item count', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const results = await mapWithConcurrency([1, 2], 10, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick(3);
      inFlight--;
      return n;
    });
    expect(maxInFlight).toBeLessThanOrEqual(2); // clamped to item count
    expect(results).toEqual([1, 2]);
  });

  it('serializes at limit=1', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3], 1, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick(2);
      inFlight--;
      return n;
    });
    expect(maxInFlight).toBe(1);
  });

  it('propagates a task rejection (like Promise.all)', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});
