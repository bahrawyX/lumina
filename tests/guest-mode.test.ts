/**
 * F6.1 / F6.2 / F6.3 — guest mode lost everything except documents, shared one
 * namespace across guests, and promised an import that did not exist.
 *
 * Guest references across the ten persistence modules, before this change:
 *
 *     docsPersistence.ts     30      every other module      0
 *
 * So a guest's tasks, events and daily plan went to the API, got 401, and were
 * swallowed — in-memory only, destroyed by any reload, with no error shown,
 * while the banner promised they survived until sign-out.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Task } from '@/types/task';
import * as tasksPersistence from '@/lib/persistence/tasksPersistence';
import * as eventsPersistence from '@/lib/persistence/eventsPersistence';
import {
  beginGuestSession,
  clearGuestData,
  guestSessionId,
  hasGuestData,
  readGuest,
  writeGuest,
  GUEST_COLLECTIONS,
} from '@/lib/persistence/guestStorage';
import { migrateGuestData } from '@/lib/persistence/guestMigration';

const realFetch = globalThis.fetch;

function setGuestFlag(on: boolean) {
  localStorage.setItem('lumina-guest', JSON.stringify({ state: { isGuest: on } }));
}

function makeTask(id: string, title: string): Task {
  return {
    id,
    title,
    status: 'todo',
    priority: 'medium',
    difficulty: 'medium',
    createdAt: new Date().toISOString(),
  } as unknown as Task;
}

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = vi.fn(async () => {
    throw new Error('guest mode must not hit the network');
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('F6.1 — guest tasks survive a reload', () => {
  beforeEach(() => {
    setGuestFlag(true);
    beginGuestSession();
  });

  it('create then fetch returns the task, without any network call', async () => {
    const created = await tasksPersistence.createOne(makeTask('t1', 'Write the thing'));
    expect(created).toBe('t1');

    const result = await tasksPersistence.fetchAllForCurrentUser();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Write the thing');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('update persists', async () => {
    await tasksPersistence.createOne(makeTask('t1', 'Original'));
    await tasksPersistence.updateOne('t1', { title: 'Renamed' } as Partial<Task>);

    const result = await tasksPersistence.fetchAllForCurrentUser();
    if (result.kind === 'ok') expect(result.data[0].title).toBe('Renamed');
  });

  it('delete persists', async () => {
    await tasksPersistence.createOne(makeTask('t1', 'Doomed'));
    await tasksPersistence.deleteOne('t1');

    const result = await tasksPersistence.fetchAllForCurrentUser();
    if (result.kind === 'ok') expect(result.data).toEqual([]);
  });

  it('events do the same', async () => {
    const okResult = await eventsPersistence.createOne({
      id: 'e1',
      title: 'Standup',
      date: '2026-08-24',
      startTime: '09:00',
      endTime: '09:15',
    } as never);
    expect(okResult).toBe(true);

    const result = await eventsPersistence.fetchAllForCurrentUser();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.data).toHaveLength(1);
  });
});

describe('F6.2 — two guests on one device do not share a namespace', () => {
  it('a new guest session cannot read the previous guest data', () => {
    setGuestFlag(true);
    beginGuestSession();
    writeGuest(GUEST_COLLECTIONS.docs, { d1: { id: 'd1', title: 'Private notes' } });
    expect(Object.keys(readGuest(GUEST_COLLECTIONS.docs, {}))).toHaveLength(1);

    // Guest A walks away; guest B starts.
    const previous = guestSessionId();
    beginGuestSession();
    expect(guestSessionId()).not.toBe(previous);

    // Guest B must see nothing. Previously both used the flat key
    // `lumina-guest-docs` and B read A's full document text.
    expect(readGuest(GUEST_COLLECTIONS.docs, {})).toEqual({});
  });

  it('keys are namespaced by session id', () => {
    setGuestFlag(true);
    const id = beginGuestSession();
    writeGuest(GUEST_COLLECTIONS.tasks, [makeTask('t1', 'x')]);
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k === `lumina-guest:${id}:tasks`)).toBe(true);
    expect(keys).not.toContain('lumina-guest-docs');
  });
});

describe('F6.3 — the promised import actually happens', () => {
  beforeEach(() => {
    setGuestFlag(true);
    beginGuestSession();
    writeGuest(GUEST_COLLECTIONS.tasks, [makeTask('t1', 'Guest task')]);
    writeGuest(GUEST_COLLECTIONS.docs, { d1: { id: 'd1', title: 'Guest doc' } });
  });

  it('POSTs each record and clears the namespace on full success', async () => {
    const posted: string[] = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      posted.push(String(url));
      return new Response('{"id":"server-id"}', { status: 201 });
    }) as unknown as typeof fetch;

    const result = await migrateGuestData();

    expect(result.migrated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.cleared).toBe(true);
    expect(posted.some((u) => u.includes('/api/tasks'))).toBe(true);
    expect(posted.some((u) => u.includes('/api/docs'))).toBe(true);
    expect(hasGuestData()).toBe(false);
  });

  it('does NOT delete local data when a record fails to import', async () => {
    globalThis.fetch = vi.fn(async (url: unknown) =>
      String(url).includes('/api/docs')
        ? new Response('{"error":"nope"}', { status: 500 })
        : new Response('{"id":"server-id"}', { status: 201 }),
    ) as unknown as typeof fetch;

    const result = await migrateGuestData();

    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(1);
    // Deleting the source on a partial migration would lose exactly the records
    // that could not be saved.
    expect(result.cleared).toBe(false);
    expect(hasGuestData()).toBe(true);
  });

  it('does not send the guest-local id', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response('{"id":"server-id"}', { status: 201 });
    }) as unknown as typeof fetch;

    await migrateGuestData();
    expect(body.id).toBeUndefined();
  });

  it('is a no-op when there is nothing to migrate', async () => {
    clearGuestData();
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await migrateGuestData();
    expect(result).toEqual({ migrated: 0, failed: 0, cleared: false });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('F6.1 — signed-in users are unaffected', () => {
  it('a non-guest still goes to the network', async () => {
    setGuestFlag(false);
    globalThis.fetch = vi.fn(async () =>
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ) as unknown as typeof fetch;

    await tasksPersistence.fetchAllForCurrentUser();
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});
