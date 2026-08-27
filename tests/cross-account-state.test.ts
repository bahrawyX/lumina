/**
 * F5.3  — account A's settings suppressed account B's preference fetch.
 * F5.9  — expired session rows were never deleted.
 * F5.11 — a dead GET→POST rewrite in the auth handler.
 * F7.4  — the cross-user wipe raced the persist middleware.
 * F8.3  — `setUserId` never actually fired for real users.
 *
 * These are all one failure mode: state that belongs to one account, or to one
 * moment, outliving it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearLuminaStorage, __unsealLuminaWritesForTests } from '@/lib/storage';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

describe('F7.4 — the wipe cannot be undone by a late write', () => {
  beforeEach(() => {
    __unsealLuminaWritesForTests();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    __unsealLuminaWritesForTests();
  });

  it('clears both localStorage and sessionStorage', () => {
    // The old hand-rolled sweep never touched sessionStorage, where the
    // `lumina:` external-event cache lives — so account A's Google/Outlook
    // events survived into account B.
    localStorage.setItem('lumina-tasks', '{"a":1}');
    sessionStorage.setItem('lumina:events:google', '[1,2,3]');

    clearLuminaStorage();

    expect(localStorage.getItem('lumina-tasks')).toBeNull();
    expect(sessionStorage.getItem('lumina:events:google')).toBeNull();
  });

  it('drops a Lumina write that lands AFTER the sweep', () => {
    // `location.reload()` does not unload synchronously — the page keeps
    // running with every persisted store still hydrated. A `set()` in that
    // window re-wrote its key with the previous account's data, which then
    // survived the reload.
    localStorage.setItem('lumina-tasks', '{"account":"A"}');
    clearLuminaStorage({ seal: true });

    // A store flushing during teardown.
    localStorage.setItem('lumina-tasks', '{"account":"A"}');

    expect(localStorage.getItem('lumina-tasks')).toBeNull();
  });

  it('seals sessionStorage too', () => {
    clearLuminaStorage({ seal: true });
    sessionStorage.setItem('lumina:events:google', '[1]');
    expect(sessionStorage.getItem('lumina:events:google')).toBeNull();
  });

  it('does not seal keys that are not ours', () => {
    // The seal is scoped, not a blanket storage lock — a third-party script or
    // the theme library must keep working during teardown.
    clearLuminaStorage({ seal: true });
    localStorage.setItem('some-other-app', 'value');
    expect(localStorage.getItem('some-other-app')).toBe('value');
  });

  it('preserves the theme and PWA flags through the sweep', () => {
    localStorage.setItem('lumina-theme', 'dark');
    localStorage.setItem('lumina-pwa-snoozed', '1');
    localStorage.setItem('lumina-tasks', '{}');

    clearLuminaStorage();

    expect(localStorage.getItem('lumina-theme')).toBe('dark');
    expect(localStorage.getItem('lumina-pwa-snoozed')).toBe('1');
    expect(localStorage.getItem('lumina-tasks')).toBeNull();
  });

  it('does NOT seal by default', () => {
    // Sealing a document that keeps living silently stops every store
    // persisting for the rest of its life. Two paths clear storage WITHOUT
    // replacing the page — `SessionExpiryWatcher`'s soft `router.refresh()`,
    // and `signOutEverywhere({ navigate: false })` — and both must leave
    // storage writable so the next sign-in can persist normally.
    localStorage.setItem('lumina-tasks', '{"account":"A"}');
    clearLuminaStorage();

    localStorage.setItem('lumina-tasks', '{"account":"B"}');
    expect(localStorage.getItem('lumina-tasks')).toBe('{"account":"B"}');
  });

  it('only the caller that reloads immediately opts in', () => {
    const bootstrap = read('components', 'PersistenceBootstrap.tsx');
    expect(bootstrap).toContain('clearLuminaStorage({ seal: true })');

    // The soft-refresh path must not seal.
    const watcher = read('components', 'system', 'SessionExpiryWatcher.tsx');
    expect(watcher).toContain('clearLuminaStorage()');
    expect(watcher).not.toContain('seal: true');

    // Sign-out seals only when a hard navigation follows.
    const signOut = read('lib', 'auth', 'signOut.ts');
    expect(signOut).toContain("clearLuminaStorage({ seal: navigate && typeof window !== 'undefined' })");
  });

  it('the bootstrap uses the shared sweep rather than its own loop', () => {
    const src = read('components', 'PersistenceBootstrap.tsx');
    expect(src).toContain('clearLuminaStorage({ seal: true });');
    expect(src).not.toContain("key.startsWith('lumina-') || key.startsWith('lumina_')");
  });

  it('still records who the browser now belongs to', () => {
    // USER_ID_KEY must survive the sweep, or the next mount looks like a first
    // run and the wipe can never record that it happened. Compared within the
    // wipe branch only — there is an earlier, legitimate first-run write.
    const src = read('components', 'PersistenceBootstrap.tsx');
    const wipe = src.slice(src.indexOf('clearLuminaStorage({ seal: true });'));
    expect(wipe).toContain('localStorage.setItem(USER_ID_KEY, currentId)');
    expect(wipe.indexOf('localStorage.setItem(USER_ID_KEY, currentId)')).toBeLessThan(
      wipe.indexOf('window.location.reload()'),
    );
  });

  it('the seal lets the bookkeeping key through', () => {
    // Otherwise the write above is dropped and the wipe cannot record itself.
    clearLuminaStorage({ seal: true });
    localStorage.setItem('lumina-user-id', 'user-b');
    expect(localStorage.getItem('lumina-user-id')).toBe('user-b');
  });
});

describe('F5.3 — a previous account cannot suppress the preferences fetch', () => {
  const src = read('store', 'useSettingsStore.ts');

  it('partializes, so the whole slice is no longer written', () => {
    expect(src).toContain('partialize:');
  });

  it('does not persist preferencesHydrated', () => {
    // `PersistenceBootstrap` skips the preferences fetch when this is set, so
    // persisting it made account B run on account A's work hours, timezone and
    // notification preferences.
    const block = src.slice(src.indexOf('partialize:'), src.indexOf('migrate:'));
    expect(block).not.toContain('preferencesHydrated');
  });

  it('persists the preferences that ARE preferences', () => {
    const block = src.slice(src.indexOf('partialize:'), src.indexOf('migrate:'));
    for (const field of ['focusSessionLength', 'timezone', 'notificationPreferences', 'workStart', 'workEnd']) {
      expect(block, field).toContain(field);
    }
  });

  it('migrates existing browsers rather than waiting for a write', () => {
    // Without the migrate, a browser that already has `preferencesHydrated:true`
    // in localStorage keeps suppressing the fetch until something rewrites the
    // key.
    expect(src).toContain('version: 1');
    expect(src).toContain('delete (state as { preferencesHydrated?: boolean }).preferencesHydrated');
  });
});

describe('F8.3 — setUserId fires when the session resolves', () => {
  const src = read('components', 'PersistenceBootstrap.tsx');

  it('is its own effect keyed on the user id', () => {
    // It used to sit inside the hydration effect, which runs once on mount —
    // before `useSession` resolves — so the id was always undefined.
    expect(src).toContain('const userId = session?.user?.id ?? null;');
    expect(src).toContain('}, [session?.user?.id, setEventsUserId, setTasksUserId, setFocusUserId]);');
  });

  it('sets all three stores', () => {
    expect(src).toContain('setEventsUserId(userId)');
    expect(src).toContain('setTasksUserId(userId)');
    expect(src).toContain('setFocusUserId(userId)');
  });

  it('clears the id on sign-out rather than leaving the departed user', () => {
    // An early `if (!userId) return;` left the previous account's id in the
    // stores — the same stale-identity trap, one step further along.
    expect(src).not.toContain('if (!userId) return;');
    for (const store of ['useCalendarEventsStore', 'useTaskBoardStore', 'useFocusStore']) {
      const text = readFileSync(join(process.cwd(), 'src', 'store', `${store}.ts`), 'utf8');
      expect(text, store).toContain('setUserId: (userId: string | null) => void;');
    }
  });
});

describe('F5.9 — expired sessions are swept', () => {
  const cron = read('app', 'api', 'cron', 'daily-brief', 'route.ts');

  it('deletes rows past their expiry', () => {
    // BetterAuth's only cleanup is lazy: `get-session` deletes the row when the
    // SAME client presents an expired token. A user who never returns leaves it
    // forever.
    expect(cron).toContain('DELETE FROM ${sessions}');
    expect(cron).toContain('WHERE expires_at < ${now}');
  });

  it('deletes a bounded batch rather than the whole backlog at once', () => {
    // An unbounded delete over an accumulated table takes one long row-lock
    // inside a function that has a timeout. Hourly, so a backlog still drains.
    expect(cron).toContain('MAX_SESSION_SWEEP');
    expect(cron).toContain('LIMIT ${MAX_SESSION_SWEEP}');
  });

  it('does not materialise every deleted id just to count them', () => {
    const block = cron.slice(cron.indexOf('expiredSessionsPruned: number | null'));
    expect(block).not.toContain('.returning({ id: sessions.id })');
    expect(block).toContain('rowCount');
  });

  it('has the index the sweep needs', () => {
    // Without it the hourly delete is a seq scan over one of the busiest tables
    // in the schema — while `rate_limits`, swept in the same handler, has had
    // the equivalent index since the baseline.
    const schema = readFileSync(
      join(process.cwd(), 'src', 'db', 'schema', 'sessions.ts'),
      'utf8',
    );
    expect(schema).toContain("index('sessions_expires_at_idx').on(table.expiresAt)");

    const migration = readFileSync(
      join(process.cwd(), 'drizzle', '0025_session_expiry_index.sql'),
      'utf8',
    );
    expect(migration).toContain('sessions_expires_at_idx');
  });

  it('reports what it pruned', () => {
    expect(cron).toContain('expiredSessionsPruned');
  });

  it('is best-effort — housekeeping never fails the brief', () => {
    const block = cron.slice(cron.indexOf('expiredSessionsPruned: number | null'));
    expect(block).toContain('catch (err)');
  });

  it('stays within the three-cron plan limit', () => {
    // A fourth vercel.json entry would silently never run on Hobby, which is
    // worse than no sweep because the schedule would claim otherwise.
    const vercel = JSON.parse(
      readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(3);
  });
});

describe('F5.11 — the dead auth rewrite is gone', () => {
  const src = read('app', 'api', 'auth', '[...all]', 'route.ts');

  it('no longer rewrites GET /sign-in/microsoft', () => {
    // Unreachable (both call sites use `authClient.signIn.social`) and
    // non-functional (`signInSocial` returns 200 with a Location header, which
    // browsers do not follow — the user would have seen raw JSON).
    expect(src).not.toContain('isMicrosoftSignInPath');
    expect(src).not.toContain('buildMicrosoftSocialSignInRequest');
  });

  it('keeps the session alias, which IS reachable', () => {
    expect(src).toContain('normalizeSessionAlias');
  });

  it('still exports every verb BetterAuth needs', () => {
    for (const verb of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(src, verb).toMatch(new RegExp(`export const ${verb}\\b`));
    }
  });
});

describe('the seal is not left on by accident', () => {
  it('no application code calls the test-only unseal', () => {
    // This used to be `['components','store','app'].flatMap(() => [])`, which
    // is unconditionally `[]` — it searched nothing and could never fail. It
    // now actually walks the tree.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const text = readFileSync(full, 'utf8');
          // The declaration itself lives in storage.ts; every other hit is a call.
          if (text.includes('__unsealLuminaWritesForTests') && !full.endsWith('storage.ts')) {
            offenders.push(full);
          }
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });

  it('releases itself if the promised navigation never happens', async () => {
    // `AppShell` arms a `beforeunload` guard in guest mode. If the browser
    // prompts and the user picks "Stay", a permanently sealed document would
    // silently persist nothing for the rest of its life.
    vi.useFakeTimers();
    try {
      clearLuminaStorage({ seal: true });
      localStorage.setItem('lumina-tasks', 'sealed');
      expect(localStorage.getItem('lumina-tasks')).toBeNull();

      vi.advanceTimersByTime(5_000);

      localStorage.setItem('lumina-tasks', 'released');
      expect(localStorage.getItem('lumina-tasks')).toBe('released');
    } finally {
      vi.useRealTimers();
    }
  });
});

// Keep vi referenced so the import list stays honest if this file grows.
vi.setConfig({ testTimeout: 10_000 });
