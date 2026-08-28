/**
 * F6.1 — six of ten persistence domains had no guest path at all.
 *
 * `coins`, `focus`, `goals`, `link`, `mood` and `streak` went straight to the
 * API. For a guest that is a 401, swallowed — so the work existed in memory
 * only and was gone on reload, while the banner promised it was kept on the
 * device.
 *
 * Two of those six are NOT fixed by persisting locally, and this file pins that
 * distinction: coins and streaks are server-authoritative, so the honest guest
 * behaviour is a gate, not a local ledger.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Goal } from '@/types/goal';
import {
  beginGuestSession,
  clearGuestData,
  hasGuestData,
  readGuest,
  writeGuest,
  GUEST_COLLECTIONS,
} from '@/lib/persistence/guestStorage';
import * as goalsPersistence from '@/lib/persistence/goalsPersistence';
import * as focusPersistence from '@/lib/persistence/focusPersistence';
import * as moodPersistence from '@/lib/persistence/moodPersistence';
import * as coinsPersistence from '@/lib/persistence/coinsPersistence';
import * as streakPersistence from '@/lib/persistence/streakPersistence';
import * as linkPersistence from '@/lib/persistence/linkPersistence';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(async () => new Response('{}', { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/**
 * Enter guest mode the same way the UI does.
 *
 * `beginGuestSession()` only mints the namespace id; `isGuestUser()` reads the
 * zustand-persisted `lumina-guest` flag, which the store writes. Both are
 * needed, and setting only the first is why an earlier version of this file
 * had every guest branch silently fall through to the API.
 */
function asGuest(): string {
  const id = beginGuestSession();
  localStorage.setItem(
    'lumina-guest',
    JSON.stringify({ state: { isGuest: true, bannerDismissed: false }, version: 1 }),
  );
  return id;
}

describe('F6.1 — goals survive a reload in guest mode', () => {
  it('creates, reads back, updates and deletes without touching the API', async () => {
    asGuest();

    const created = await goalsPersistence.createOne({ title: 'Ship it' });
    expect(created?.goalId).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    const read = await goalsPersistence.fetchAllForCurrentUser();
    expect(read.kind).toBe('ok');
    expect(read.kind === 'ok' && read.data).toHaveLength(1);

    await goalsPersistence.updateOne(created!.goalId!, { title: 'Shipped' } as Partial<Goal>);
    const afterUpdate = await goalsPersistence.fetchAllForCurrentUser();
    expect(afterUpdate.kind === 'ok' && afterUpdate.data[0].title).toBe('Shipped');

    await goalsPersistence.deleteOne(created!.goalId!);
    const afterDelete = await goalsPersistence.fetchAllForCurrentUser();
    expect(afterDelete.kind === 'ok' && afterDelete.data).toHaveLength(0);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updating a goal that is not there reports failure', async () => {
    asGuest();
    expect(await goalsPersistence.updateOne('nope', {})).toBe(false);
  });
});

describe('F6.1 — focus sessions and mood logs persist', () => {
  it('records a focus session locally and reads it back', async () => {
    asGuest();
    const session = { id: 's1', durationMinutes: 25 } as never;

    const result = await focusPersistence.createOne(session);
    expect(result).not.toBeNull();
    // Zeros, not invented rewards — a guest has no ledger and no streak row.
    expect(result!.coinsEarned).toBe(0);
    expect(result!.dailyStreak).toBe(0);

    const read = await focusPersistence.fetchAllForCurrentUser();
    expect(read.kind === 'ok' && read.data).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records a mood log locally and reads it back newest-first', async () => {
    asGuest();
    await moodPersistence.logMood({ mood: 'good' });
    await moodPersistence.logMood({ mood: 'bad' });

    const logs = await moodPersistence.fetchMoodLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].mood).toBe('bad');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('F6.1 — coins and streaks are gated, not faked', () => {
  it('a guest wallet is empty and no request is made', async () => {
    asGuest();
    const result = await coinsPersistence.fetchCoinsData();
    expect(result.kind).toBe('ok');
    expect(result.kind === 'ok' && result.data.balance).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a purchase is refused with a reason, not a silent failure', async () => {
    asGuest();
    const result = await coinsPersistence.purchaseItem('item-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sign up/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streaks read as zero rather than as a number that will not survive sign-up', async () => {
    asGuest();
    const data = await streakPersistence.fetchStreakData();
    expect(data).toEqual({
      coins: 0,
      dailyStreak: 0,
      bestDailyStreak: 0,
      sessionStreak: 0,
      bestSessionStreak: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streak recovery says why it cannot run', async () => {
    asGuest();
    const result = await streakPersistence.requestStreakRecovery();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/account/i);
  });

  it('nothing about the economy is written to the guest namespace', async () => {
    // The whole point: importing a self-reported balance on sign-up would be a
    // client-side mint straight through the daily caps P1-3 added.
    asGuest();
    await coinsPersistence.fetchCoinsData();
    await streakPersistence.fetchStreakData();
    expect(Object.values(GUEST_COLLECTIONS)).not.toContain('coins');
    expect(Object.values(GUEST_COLLECTIONS)).not.toContain('streak');
    expect(hasGuestData()).toBe(false);
  });
});

describe('F6.1 — a guest can link a task to an event', () => {
  beforeEach(() => {
    asGuest();
    writeGuest(GUEST_COLLECTIONS.tasks, [{ id: 't1', title: 'Task' }]);
    writeGuest(GUEST_COLLECTIONS.events, [{ id: 'e1', title: 'Event' }]);
  });

  it('writes both sides of the link', async () => {
    expect(await linkPersistence.linkTaskEvent('t1', 'e1')).toBe(true);

    const tasks = readGuest<Array<{ id: string; linkedEventId?: string | null }>>(
      GUEST_COLLECTIONS.tasks, [],
    );
    const events = readGuest<Array<{ id: string; linkedTaskId?: string | null }>>(
      GUEST_COLLECTIONS.events, [],
    );
    expect(tasks[0].linkedEventId).toBe('e1');
    expect(events[0].linkedTaskId).toBe('t1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to link something that does not exist', async () => {
    expect(await linkPersistence.linkTaskEvent('t1', 'missing')).toBe(false);
    expect(await linkPersistence.linkTaskEvent('missing', 'e1')).toBe(false);
  });

  it('clears the old partner when a task is re-pointed', async () => {
    // Server-side `events_linked_task_uniq` (P2-5) makes this impossible to get
    // wrong; locally it has to be done by hand.
    writeGuest(GUEST_COLLECTIONS.events, [{ id: 'e1' }, { id: 'e2' }]);
    await linkPersistence.linkTaskEvent('t1', 'e1');
    await linkPersistence.linkTaskEvent('t1', 'e2');

    const events = readGuest<Array<{ id: string; linkedTaskId?: string | null }>>(
      GUEST_COLLECTIONS.events, [],
    );
    expect(events.find((e) => e.id === 'e1')?.linkedTaskId).toBeNull();
    expect(events.find((e) => e.id === 'e2')?.linkedTaskId).toBe('t1');
  });

  it('unlink only fires for the pair that is actually linked', async () => {
    await linkPersistence.linkTaskEvent('t1', 'e1');
    expect(await linkPersistence.unlinkTaskEvent('t1', 'stale')).toBe(false);
    expect(await linkPersistence.unlinkTaskEvent('t1', 'e1')).toBe(true);

    const tasks = readGuest<Array<{ linkedEventId?: string | null }>>(GUEST_COLLECTIONS.tasks, []);
    expect(tasks[0].linkedEventId).toBeNull();
  });

  it('createLinkedEvent creates the event and links it in one go', async () => {
    const result = await linkPersistence.createLinkedEvent({
      title: 'Deep work',
      date: '2026-06-15',
      taskId: 't1',
    });

    expect(result?.eventId).toBeTruthy();
    const events = readGuest<Array<{ id: string; title: string; linkedTaskId?: string | null }>>(
      GUEST_COLLECTIONS.events, [],
    );
    const created = events.find((e) => e.id === result!.eventId);
    expect(created?.title).toBe('Deep work');
    expect(created?.linkedTaskId).toBe('t1');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('F6.1 — the new domains are migratable, not just savable', () => {
  it('hasGuestData sees them, so the import actually runs', () => {
    // The F6.3 gate keys on this. A domain that saves locally and is invisible
    // here would never be imported — the same broken promise, one step later.
    asGuest();
    expect(hasGuestData()).toBe(false);

    writeGuest(GUEST_COLLECTIONS.goals, [{ id: 'g1' }]);
    expect(hasGuestData()).toBe(true);

    clearGuestData();
    asGuest();
    writeGuest(GUEST_COLLECTIONS.mood, [{ id: 'm1' }]);
    expect(hasGuestData()).toBe(true);
  });

  it('the migration posts each of them', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(
      resolve(process.cwd(), 'src/lib/persistence/guestMigration.ts'),
      'utf8',
    );
    expect(src).toContain("post('/api/goals'");
    expect(src).toContain("post('/api/focus-sessions'");
    expect(src).toContain("post('/api/mood-logs'");
  });
});

describe('P0-2 — the three private HTTP clients are gone', () => {
  it('every persistence module goes through apiClient', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { resolve, join } = await import('node:path');
    const dir = resolve(process.cwd(), 'src/lib/persistence');

    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && f !== 'apiClient.ts')
      .filter((f) => /function apiBase\(\)/.test(readFileSync(join(dir, f), 'utf8')));

    // coins, link and mood each carried their own copy, so their 401s never
    // reached `onUnauthorized` and the F5.2 expiry guard could not see them.
    expect(offenders).toEqual([]);
  });
});
