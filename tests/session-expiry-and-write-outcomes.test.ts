/**
 * F5.2, F5.4, P1-17 — three helpers that existed, were documented, and were
 * not wired to anything.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useSessionStore, isSessionExpired } from '@/store/useSessionStore';
import { apiFetch } from '@/lib/persistence/apiClient';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const codeOf = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useSessionStore.setState({ expired: false, lastKnownUserId: null });
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSessionStore.setState({ expired: false, lastKnownUserId: null });
});

describe('F5.2 — the expiry guard is actually enforced', () => {
  it('refuses a mutation once the session is known dead', async () => {
    // `isSessionExpired()` documented itself as the guard write paths call
    // before issuing a mutation, and had ZERO callers. Every optimistic update
    // went ahead, failed, and left the user working on state that would vanish.
    useSessionStore.getState().markExpired();
    expect(isSessionExpired()).toBe(true);

    const res = await apiFetch('/api/tasks', { method: 'POST', body: '{}' });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'session_expired' });
  });

  it('covers every mutating verb', async () => {
    useSessionStore.getState().markExpired();
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const res = await apiFetch('/api/tasks/1', { method });
      expect(res.status, method).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still allows reads — a refused GET turns an expiry into an empty app', async () => {
    useSessionStore.getState().markExpired();

    await apiFetch('/api/tasks');
    await apiFetch('/api/tasks', { method: 'HEAD' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lets mutations through again once a session is re-established', async () => {
    useSessionStore.getState().markExpired();
    useSessionStore.getState().markActive('user-1');

    await apiFetch('/api/tasks', { method: 'POST', body: '{}' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not gate anything while the session is healthy', async () => {
    await apiFetch('/api/tasks', { method: 'POST', body: '{}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('F5.4 — the cross-user wipe survives a browser restart', () => {
  const watcher = codeOf(read('src/components/system/SessionExpiryWatcher.tsx'));

  it('falls back to the durable user id, not just the in-memory one', () => {
    // `lastKnownUserId` lives only in memory, so the wipe ran ONLY when the
    // session died with the tab open. Close the browser after an expiry and
    // reopen it and the store starts at null — the next person saw the
    // previous user's name, work hours and preferences out of localStorage.
    expect(watcher).toContain('lastKnownUserId ?? readStoredUserId()');
    expect(watcher).toContain("localStorage.getItem(STORED_USER_ID_KEY)");
  });

  it('reads the key that the wipe deliberately preserves', () => {
    // Reading a key the wipe deletes would work exactly once.
    expect(watcher).toContain("const STORED_USER_ID_KEY = 'lumina-user-id';");
    const storage = read('src/lib/storage.ts');
    const preserve = storage.slice(
      storage.indexOf('const PRESERVE_ON_CLEAR'),
      storage.indexOf(']);', storage.indexOf('const PRESERVE_ON_CLEAR')),
    );
    expect(preserve).toContain("'lumina-user-id'");
  });

  it('and the key is the one PersistenceBootstrap writes', () => {
    expect(codeOf(read('src/components/PersistenceBootstrap.tsx'))).toContain(
      "const USER_ID_KEY = 'lumina-user-id';",
    );
  });

  it('tolerates storage being unavailable', () => {
    // Private mode throws on `getItem`. Losing the wipe is bad; throwing inside
    // an effect is worse.
    expect(watcher).toContain('try {');
    expect(watcher).toContain('return null;');
  });
});

describe('P1-17 — writes report whether they happened', () => {
  it('eventsPersistence update/delete return a boolean', () => {
    const src = read('src/lib/persistence/eventsPersistence.ts');
    expect(src).toContain(
      'export async function updateOne(id: string, patch: Partial<CalendarEvent>): Promise<boolean>',
    );
    expect(src).toContain(
      "export async function deleteOne(id: string, queryString?: string): Promise<boolean>",
    );
    expect(src).not.toContain('patch: Partial<CalendarEvent>): Promise<void>');
  });

  it('the main task edit path acts on the result instead of discarding it', () => {
    // `moveTask` reported this correctly; `updateTask` — the main edit path —
    // dropped the boolean on the floor, so a rejected PATCH left the edit on
    // the board looking saved.
    const store = codeOf(read('src/store/useTaskBoardStore.ts'));
    expect(store).not.toContain('tasksPersistence.updateOne(id, { ...patch });');
    expect(store).toContain("Couldn't save changes to");
  });
});
