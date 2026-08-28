/**
 * Local storage for guest-mode data.
 *
 * ## What was wrong
 *
 * Guest references across the ten persistence modules:
 *
 *     docsPersistence.ts     30      every other module      0
 *
 * `docsPersistence` claimed guest docs work "exactly the same way tasks/events
 * do for guests". **The reverse was true.** `tasksPersistence` and
 * `eventsPersistence` had no guest branch at all — guest writes went to
 * `/api/tasks` and `/api/events`, got 401, and were swallowed by the
 * `if (!res.ok) return null` pattern. The stores' local caches had been
 * deliberately removed:
 *
 *     // have been removed. saveTasks is intentionally a no-op so call sites stay
 *     // unchanged; loadTasks is gone — hydrateFromDbFailed now leaves the board empty.
 *
 * So for a guest, tasks, events and the daily plan were **in-memory only,
 * destroyed by any reload or tab close, with no error shown** — while
 * `GuestBanner` told them their data "will be lost on sign-out or device
 * change". It was lost on *refresh*. The `beforeunload` guard in `AppShell` was
 * a band-aid over exactly this.
 *
 * ## Namespacing
 *
 * `docsPersistence` used one flat key, `lumina-guest-docs`, shared by every
 * guest on the device: guest A wrote a document, walked away, and guest B
 * opened /docs and read A's full text. Guests have no user id, so the
 * cross-user guard could not help.
 *
 * Every guest key is now suffixed with a per-browser-session guest id, minted
 * when guest mode is entered and dropped when it ends. Two guests on one device
 * never share a namespace.
 */

const GUEST_ID_KEY = 'lumina-guest-id';
const GUEST_STATE_KEY = 'lumina-guest';

function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

/** True when the user deliberately chose guest mode. */
export function isGuestUser(): boolean {
  if (!canUseStorage()) return false;
  try {
    const raw = localStorage.getItem(GUEST_STATE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { isGuest?: boolean } };
    return parsed?.state?.isGuest === true;
  } catch {
    return false;
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The current guest namespace, created on first use.
 *
 * Deliberately NOT derived from anything stable about the device: a fresh guest
 * session must not inherit the previous guest's data.
 */
export function guestSessionId(): string {
  if (!canUseStorage()) return 'ssr';
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const id = randomId();
    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    return 'ephemeral';
  }
}

/** Start a fresh guest namespace, abandoning any previous guest's data. */
export function beginGuestSession(): string {
  if (!canUseStorage()) return 'ssr';
  const id = randomId();
  try {
    localStorage.setItem(GUEST_ID_KEY, id);
  } catch {
    /* private mode — fall through to an ephemeral session */
  }
  return id;
}

function keyFor(collection: string): string {
  return `lumina-guest:${guestSessionId()}:${collection}`;
}

/** Read a guest collection. Returns `fallback` on any parse or quota error. */
export function readGuest<T>(collection: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = localStorage.getItem(keyFor(collection));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Write a guest collection. Silently no-ops on quota / private-mode failure. */
export function writeGuest<T>(collection: string, value: T): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(keyFor(collection), JSON.stringify(value));
  } catch {
    // Quota or private mode. The UI stays optimistic; the alternative is
    // failing a keystroke, which is worse.
  }
}

/** Every guest key belonging to the CURRENT guest session. */
export function guestKeys(): string[] {
  if (!canUseStorage()) return [];
  const prefix = `lumina-guest:${guestSessionId()}:`;
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

/** Drop the current guest session's data and its namespace. */
export function clearGuestData(): void {
  if (!canUseStorage()) return;
  for (const key of guestKeys()) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(GUEST_ID_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Collection names, centralised so the migration knows what to look for.
 *
 * F6.1: this listed four collections while the banner promised a guest that
 * everything they did was kept on the device. Goals, focus sessions and mood
 * logs went to the API, 401'd, and were swallowed — in-memory only, gone on
 * reload, with no error shown.
 *
 * `coins` and `streak` are deliberately NOT here, and that is not an
 * oversight. Both are server-authoritative: the balance comes from
 * `awardCoins`' ledger with its dedupe keys and daily caps, and the streak
 * from server-side date arithmetic. Letting a guest accrue either locally
 * would mean importing a self-reported balance on sign-up — a client-side mint
 * — or discarding it and breaking the promise a second time. They are gated
 * with an honest message instead. See `guestGate.ts`.
 */
export const GUEST_COLLECTIONS = {
  tasks: 'tasks',
  events: 'events',
  planner: 'planner',
  docs: 'docs',
  goals: 'goals',
  focus: 'focus',
  mood: 'mood',
} as const;

export type GuestCollection = (typeof GUEST_COLLECTIONS)[keyof typeof GUEST_COLLECTIONS];

/** True when this guest session has anything worth migrating. */
export function hasGuestData(): boolean {
  return Object.values(GUEST_COLLECTIONS).some((c) => {
    const value = readGuest<unknown[] | Record<string, unknown>>(c, []);
    return Array.isArray(value) ? value.length > 0 : Object.keys(value ?? {}).length > 0;
  });
}
