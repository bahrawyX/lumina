/**
 * F5.3 — one browser had one settings row, whoever was using it.
 *
 * `useSettingsStore` persisted under the global name `lumina-settings`, so
 * account B hydrated from account A's work hours, timezone and notification
 * preferences until the cross-user wipe noticed and forced a reload.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createUserScopedStorage } from '@/lib/persistence/userScopedStorage';
import { clearLuminaStorage } from '@/lib/storage';

const USER_ID_KEY = 'lumina-user-id';

beforeEach(() => {
  localStorage.clear();
});

describe('F5.3 — settings are bucketed per account', () => {
  it('two accounts do not read each other rows', () => {
    const storage = createUserScopedStorage();

    localStorage.setItem(USER_ID_KEY, 'user-a');
    storage.setItem('lumina-settings', '{"workStart":"07:00"}');

    localStorage.setItem(USER_ID_KEY, 'user-b');
    expect(storage.getItem('lumina-settings')).toBeNull();

    storage.setItem('lumina-settings', '{"workStart":"10:00"}');
    expect(storage.getItem('lumina-settings')).toContain('10:00');

    // A's row is untouched, so switching back restores their own values
    // rather than inheriting B's.
    localStorage.setItem(USER_ID_KEY, 'user-a');
    expect(storage.getItem('lumina-settings')).toContain('07:00');
  });

  it('falls back to an anon bucket before any account is known', () => {
    const storage = createUserScopedStorage();
    storage.setItem('lumina-settings', '{"workStart":"08:00"}');
    expect(localStorage.getItem('lumina-settings::anon')).toContain('08:00');
  });

  it('anon writes do not leak into an account bucket', () => {
    // The window between sign-in and `PersistenceBootstrap` writing the id.
    // Self-correcting, and strictly better than the old behaviour where those
    // writes landed where the next person would read them.
    const storage = createUserScopedStorage();
    storage.setItem('lumina-settings', '{"workStart":"08:00"}');

    localStorage.setItem(USER_ID_KEY, 'user-a');
    expect(storage.getItem('lumina-settings')).toBeNull();
  });

  it('removeItem clears the caller own bucket only', () => {
    const storage = createUserScopedStorage();

    localStorage.setItem(USER_ID_KEY, 'user-a');
    storage.setItem('lumina-settings', '{"a":1}');
    localStorage.setItem(USER_ID_KEY, 'user-b');
    storage.setItem('lumina-settings', '{"b":1}');

    storage.removeItem('lumina-settings');
    expect(storage.getItem('lumina-settings')).toBeNull();

    localStorage.setItem(USER_ID_KEY, 'user-a');
    expect(storage.getItem('lumina-settings')).toContain('"a":1');
  });

  it('the scoped key is still swept by clearLuminaStorage', () => {
    // `lumina-settings::<id>` must keep matching `isLuminaKey`, or the wipe
    // silently stops covering settings — trading one leak for another.
    localStorage.setItem(USER_ID_KEY, 'user-a');
    const storage = createUserScopedStorage();
    storage.setItem('lumina-settings', '{"workStart":"07:00"}');
    expect(localStorage.getItem('lumina-settings::user-a')).not.toBeNull();

    clearLuminaStorage();

    expect(localStorage.getItem('lumina-settings::user-a')).toBeNull();
    // ...while the bookkeeping key the wipe depends on survives (F5.4).
    expect(localStorage.getItem(USER_ID_KEY)).toBe('user-a');
  });

  it('the store is wired to it', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/store/useSettingsStore.ts'), 'utf8');
    expect(src).toContain('storage: createJSONStorage(createUserScopedStorage)');
    // The allowlist stays — it is what stops `preferencesHydrated` persisting.
    expect(src).toContain('partialize');
  });
});
