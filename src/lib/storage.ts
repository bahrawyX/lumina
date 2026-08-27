/**
 * storage.ts
 *
 * Shared, SSR-safe localStorage helpers used across all Zustand stores.
 * Every function is:
 *  - Null-key-safe (nullable keys treated as "no-op" gracefully).
 *  - SSR-safe (guards on `typeof window`).
 *  - Quota-error-safe (storage failures are swallowed; they must never crash the UI).
 */

export const canUseStorage = typeof window !== 'undefined';

export function getStorageItem(key: string | null): string | null {
  if (!key || !canUseStorage) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStorageItem(key: string | null, value: string): void {
  if (!key || !canUseStorage) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota / private-mode write failures — UI stays optimistic.
  }
}

export function removeStorageItem(key: string | null): void {
  if (!key || !canUseStorage) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage remove failures.
  }
}

/**
 * Read and JSON-parse a localStorage value, returning `fallback` on any error.
 * Generic so callers get a typed value without casting.
 */
export function readStorageJSON<T>(key: string, fallback: T): T {
  const raw = getStorageItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Keys that survive logout/clear — purely browser-level UX preferences with
// no relation to user data or identity.
const PRESERVE_ON_CLEAR = new Set<string>([
  'lumina-theme',         // next-themes
  'lumina_theme',
  'lumina-pwa-installed', // PWA install banner
  // The key actually written by InstallPrompt is 'lumina-pwa-snoozed'. The
  // singular spelling here matched nothing, so the snooze was cleared on every
  // sign-out and the install prompt re-nagged. (F7.5)
  'lumina-pwa-snoozed',
  // The cross-user wipe's own bookkeeping: which account's data is in this
  // browser. Sweeping it would make the next load look like a first run, so the
  // wipe could never record that it had happened. It holds an opaque id and no
  // user data.
  'lumina-user-id',
]);

/**
 * Clear every Lumina-owned key from localStorage and sessionStorage.
 *
 * Used on signout and on cross-user-id detection so no per-user data leaks
 * across sessions. Theme + PWA install flags are intentionally preserved.
 */
/**
 * F7.4: `clearLuminaStorage()` + `location.reload()` is not atomic. `reload()`
 * does not unload synchronously — the page keeps running until the navigation
 * commits, and every persisted Zustand store is still hydrated in memory. Any
 * `set()` in that window (a resize handler, an intelligence recalc, the guest
 * effect) re-writes its key with the PREVIOUS account's data, which then
 * survives the reload and defeats the whole wipe.
 *
 * So the clear can also SEAL storage — `clearLuminaStorage({ seal: true })` —
 * after which writes to Lumina-owned keys are dropped. The caller is declaring
 * that this document is about to be replaced, so nothing legitimate is lost,
 * and a store writing during teardown cannot resurrect the data just deleted.
 *
 * Opt-in, because two paths clear storage WITHOUT replacing the document
 * (`SessionExpiryWatcher`'s soft refresh, and the onboarding sign-out), and
 * sealing those would stop the app persisting anything for the rest of the
 * page's life. And time-limited, because even an opted-in navigation can be
 * cancelled — see `SEAL_RELEASE_MS`.
 */
let storageSealed = false;

/**
 * How long a seal survives without the promised navigation. Long enough that
 * no real reload loses the protection, short enough that a cancelled one does
 * not leave the app unable to save.
 */
const SEAL_RELEASE_MS = 5_000;

/** Captured before any patching, so the release always restores the real one. */
const pristineSetItem = typeof window !== 'undefined' ? Storage.prototype.setItem : null;

function isLuminaKey(key: string): boolean {
  return key.startsWith('lumina-') || key.startsWith('lumina_') || key.startsWith('lumina:');
}

function sealLuminaWrites(): void {
  if (storageSealed) return;
  storageSealed = true;
  try {
    // Patched on `Storage.prototype`, not on the two instances. `localStorage`
    // and `sessionStorage` are exotic Proxy-backed objects in some engines
    // (jsdom among them), where an own-property definition does not shadow the
    // prototype method and the seal would silently do nothing. One prototype
    // patch covers both stores and every engine.
    const proto = Storage.prototype;
    const original = proto.setItem;
    proto.setItem = function sealedSetItem(this: Storage, key: string, value: string): void {
      // `PRESERVE_ON_CLEAR` keys are exactly the ones meant to outlive a wipe —
      // the theme, the PWA flags, and the id recording whose data this is — so
      // the seal lets them through. Everything else Lumina owns is dropped.
      if (isLuminaKey(String(key)) && !PRESERVE_ON_CLEAR.has(String(key))) return;
      original.call(this, key, value);
    };
  } catch {
    // An engine that refuses to patch the prototype still gets the sweep above;
    // this is defence in depth, not the mechanism itself.
    return;
  }

  // A seal is a bet that this document is about to be replaced. The bet can
  // lose: `AppShell` arms a `beforeunload` guard while in guest mode, and if
  // the browser prompts and the user picks "Stay", the navigation never
  // commits. A permanently sealed document silently persists nothing for the
  // rest of its life — the exact failure the opt-in was introduced to avoid.
  //
  // Every real navigation or reload commits in far less than this, so
  // releasing here costs nothing when the bet wins and restores a working app
  // when it loses.
  window.setTimeout(() => {
    if (!storageSealed || !pristineSetItem) return;
    storageSealed = false;
    Storage.prototype.setItem = pristineSetItem;
  }, SEAL_RELEASE_MS);
}

/**
 * Test seam — the seal patches a global prototype, so it would leak between
 * cases. Never called by application code; the production exits from a sealed
 * document are the navigation that follows, or the timed release above.
 */
export function __unsealLuminaWritesForTests(): void {
  storageSealed = false;
  if (pristineSetItem) Storage.prototype.setItem = pristineSetItem;
}

export interface ClearOptions {
  /**
   * Seal Lumina-owned writes after sweeping.
   *
   * ONLY pass this when the document is about to be destroyed by a hard
   * navigation or reload. A sealed document that keeps living silently stops
   * persisting anything for the rest of its life — which is exactly what
   * happens on the two paths that clear storage WITHOUT replacing the page:
   * `SessionExpiryWatcher` (a soft `router.refresh()`) and
   * `signOutEverywhere({ navigate: false })`. Both must leave storage writable
   * so the next sign-in can persist normally.
   */
  seal?: boolean;
}

export function clearLuminaStorage(options: ClearOptions = {}): void {
  if (!canUseStorage) return;
  try {
    const lsKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith('lumina-') || key.startsWith('lumina_') || key.startsWith('lumina:')) &&
        !PRESERVE_ON_CLEAR.has(key)
      ) {
        lsKeys.push(key);
      }
    }
    lsKeys.forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
  try {
    const ssKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('lumina-') || key.startsWith('lumina_') || key.startsWith('lumina:'))) {
        ssKeys.push(key);
      }
    }
    ssKeys.forEach((k) => {
      try { sessionStorage.removeItem(k); } catch { /* ignore */ }
    });
  } catch { /* ignore */ }

  // Sealed AFTER the sweep, so the sweep's own removals are unaffected — and
  // only when the caller is about to destroy the document.
  if (options.seal) sealLuminaWrites();
}
