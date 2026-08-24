/**
 * P1-17 — update and delete failures were swallowed; users lost edits silently.
 *
 * `createOne` returning `null` left the optimistic task on the board with a
 * client-side `uid()`, **no toast**, and every subsequent PATCH against that
 * fake id 404'ing — so the user kept working on a task that did not exist and
 * lost it on refresh. `updateOne` returned `void`. `deleteOne` never read
 * `res.ok` at all.
 *
 * Plus a defect the audit did not reach: **`order` was never persisted.** The
 * API synthesised `order: index` from a `createdAt` sort on every read, `tasks`
 * had no order column, and PATCH ignored the field — so the drag-reorder
 * fan-out was N requests that each wrote nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Task } from '@/types/task';
import * as tasksPersistence from '@/lib/persistence/tasksPersistence';

const realFetch = globalThis.fetch;

function respond(status: number, body: unknown = {}) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

function makeTask(id: string): Task {
  return { id, title: 'T', status: 'todo', priority: 'medium' } as unknown as Task;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('P1-17 — write outcomes are reported, not swallowed', () => {
  it('updateOne returns false on a rejected PATCH', async () => {
    // Previously returned `void`: a 400/403/500 on the PATCH itself was
    // discarded entirely.
    respond(500, { error: 'nope' });
    await expect(tasksPersistence.updateOne('t1', { title: 'x' })).resolves.toBe(false);
  });

  it('updateOne returns true on success', async () => {
    respond(200, { ok: true });
    await expect(tasksPersistence.updateOne('t1', { title: 'x' })).resolves.toBe(true);
  });

  it('updateOne returns false when the request rejects outright', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await expect(tasksPersistence.updateOne('t1', { title: 'x' })).resolves.toBe(false);
  });

  it('deleteOne returns false on a rejected DELETE', async () => {
    // Previously never read `res.ok`, so a failed delete looked identical to a
    // successful one and the task reappeared on reload.
    respond(403);
    await expect(tasksPersistence.deleteOne('t1')).resolves.toBe(false);
  });

  it('deleteOne returns true on success', async () => {
    respond(200, { ok: true });
    await expect(tasksPersistence.deleteOne('t1')).resolves.toBe(true);
  });

  it('createOne returns null on failure so the caller can roll back', async () => {
    respond(500);
    await expect(tasksPersistence.createOne(makeTask('t1'))).resolves.toBeNull();
  });
});

describe('P1-17 — a reorder is ONE request, not N', () => {
  it('sends a single PATCH carrying every item', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;

    const items = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, order: i }));
    await expect(tasksPersistence.reorderMany(items)).resolves.toBe(true);

    // Was 40 independent requests, any subset of which could fail.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/api/tasks/reorder');
    expect((calls[0].body as { items: unknown[] }).items).toHaveLength(40);
  });

  it('reports failure so the board can tell the user', async () => {
    respond(500);
    await expect(
      tasksPersistence.reorderMany([{ id: 't1', order: 0 }]),
    ).resolves.toBe(false);
  });

  it('is a no-op for an empty list, with no request at all', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    await expect(tasksPersistence.reorderMany([])).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('order is now a real column, not a synthesised index', () => {
  it('the schema declares tasks.position', async () => {
    const { tasks } = await import('@/db/schema');
    expect(tasks.position).toBeDefined();
  });

  it('the API orders by it rather than by createdAt alone', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'tasks', 'route.ts'),
      'utf8',
    );
    // Was `.orderBy(tasks.createdAt)` with `order: index` — the field was
    // regenerated on every read, so a manual reorder could not survive.
    expect(src).toContain('.orderBy(tasks.position, tasks.createdAt)');
    expect(src).toContain('order: row.position');
    expect(src).not.toContain('order: index,');
  });

  it('the PATCH handler no longer ignores order', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'tasks', '[id]', 'route.ts'),
      'utf8',
    );
    expect(src).toContain('patch.position');
  });
});

describe('guest mode keeps working through all of it', () => {
  beforeEach(() => {
    localStorage.setItem('lumina-guest', JSON.stringify({ state: { isGuest: true } }));
    globalThis.fetch = vi.fn(async () => {
      throw new Error('guest mode must not hit the network');
    }) as unknown as typeof fetch;
  });

  it('reorderMany persists locally without a request', async () => {
    await tasksPersistence.createOne(makeTask('t1'));
    await tasksPersistence.createOne(makeTask('t2'));

    await expect(
      tasksPersistence.reorderMany([{ id: 't2', order: 0 }, { id: 't1', order: 1 }]),
    ).resolves.toBe(true);

    const result = await tasksPersistence.fetchAllForCurrentUser();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const byId = Object.fromEntries(result.data.map((t) => [t.id, t.order]));
      expect(byId.t2).toBe(0);
      expect(byId.t1).toBe(1);
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('deleteOne reports success locally', async () => {
    await tasksPersistence.createOne(makeTask('t1'));
    await expect(tasksPersistence.deleteOne('t1')).resolves.toBe(true);
  });
});
