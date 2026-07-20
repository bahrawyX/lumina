/**
 * Coalescing behaviour for the external-sync single-flight runner (the fix for
 * the dropped-trigger Outlook/Google sync bug): a trigger arriving mid-flight
 * must produce exactly ONE queued re-run — not zero (the old silent-drop bug),
 * and not many (an unbounded self-retriggering loop).
 */
import { describe, it, expect, vi } from 'vitest';
import { createSingleFlight } from '@/lib/calendar/singleFlight';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Let the .catch/.finally microtask chain settle.
async function flush() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

describe('createSingleFlight — bounded coalescing', () => {
  it('runs immediately when idle; no mid-flight call means no re-run', async () => {
    const d = deferred();
    const task = vi.fn(() => d.promise);
    const run = createSingleFlight(task);

    run();
    expect(task).toHaveBeenCalledTimes(1); // synchronous launch when idle

    d.resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(1); // nothing queued → no self-retrigger
  });

  it('coalesces many mid-flight calls into exactly one queued re-run', async () => {
    const ds = [deferred(), deferred()];
    let i = 0;
    const task = vi.fn(() => ds[Math.min(i++, ds.length - 1)].promise);
    const run = createSingleFlight(task);

    run(); // launch #1
    expect(task).toHaveBeenCalledTimes(1);

    run();
    run();
    run(); // three calls while #1 is in flight → queue exactly ONE
    expect(task).toHaveBeenCalledTimes(1);

    ds[0].resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(2); // the single queued re-run fired

    ds[1].resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(2); // cap held — no extra runs
  });

  it('clears the queue before the re-run, so the re-run can queue its own follow-up', async () => {
    const ds = [deferred(), deferred(), deferred()];
    let i = 0;
    const task = vi.fn(() => ds[Math.min(i++, ds.length - 1)].promise);
    const run = createSingleFlight(task);

    run(); // #1
    run(); // queued → becomes #2
    ds[0].resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(2); // #2 now in flight

    run(); // arrives during #2 → queued → becomes #3
    ds[1].resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(3);

    ds[2].resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(3); // no follow-up queued during #3
  });

  it('a perpetually-rejecting task cannot retrigger itself', async () => {
    const task = vi.fn(() => Promise.reject(new Error('boom')));
    const run = createSingleFlight(task);

    run();
    await flush();
    await flush();
    expect(task).toHaveBeenCalledTimes(1); // failed once, no loop
  });

  it('drives onBusyChange: true on idle→busy, false only after the chain drains', async () => {
    const ds = [deferred(), deferred()];
    let i = 0;
    const task = vi.fn(() => ds[Math.min(i++, ds.length - 1)].promise);
    const busy: boolean[] = [];
    const run = createSingleFlight(task, { onBusyChange: (b) => busy.push(b) });

    run(); // busy → true
    run(); // queued; must NOT toggle busy
    expect(busy).toEqual([true]);

    ds[0].resolve();
    await flush();
    expect(busy).toEqual([true]); // still busy across the queued re-run (no flicker)

    ds[1].resolve();
    await flush();
    expect(busy).toEqual([true, false]); // false only once fully drained
  });
});
