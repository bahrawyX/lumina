import type { StateStorage } from 'zustand/middleware';

/**
 * A `persist` storage that buckets every key by the account this browser
 * currently holds data for.
 *
 * ## Why (F5.3)
 *
 * `useSettingsStore` persisted under the global name `lumina-settings`, so one
 * browser had exactly one settings row no matter how many people used it.
 * Account B hydrated from account A's work hours, timezone and notification
 * preferences until the cross-user wipe noticed and forced a reload.
 *
 * Two earlier fixes narrowed that a long way — `partialize` stopped
 * `preferencesHydrated` being persisted, so B no longer suppresses its own
 * preferences fetch, and F5.4 made the wipe survive a browser restart. What
 * was left is the window before the wipe's reload lands, where B's first paint
 * can still use A's values.
 *
 * ## Why this shape rather than `skipHydration`
 *
 * The obvious fix is `skipHydration: true` plus a rehydrate once the session
 * resolves. That means the store is empty until something calls `rehydrate()`,
 * which means every surface that reads it has to participate — and
 * `/onboarding`, which reads this store, does not mount
 * `PersistenceBootstrap`. A store that drives onboarding silently starting
 * empty there would be a worse bug than the one being fixed.
 *
 * Resolving the bucket inside `getItem`/`setItem` needs no new call sites and
 * no hydration ordering. `lumina-user-id` is already written by
 * `PersistenceBootstrap` for every authenticated session and deliberately
 * preserved through a wipe (`PRESERVE_ON_CLEAR`), so a returning user lands in
 * their own bucket on the very first read.
 *
 * Writes made between sign-in and that id being written go to the `anon`
 * bucket. That is self-correcting — the next authenticated load reads the
 * user's own bucket — and is strictly better than the previous behaviour,
 * where those writes landed in a bucket the next person would read.
 */

const USER_ID_KEY = 'lumina-user-id';

/** The bucket suffix: the stored account id, or `anon` before one exists. */
function bucket(): string {
  try {
    return localStorage.getItem(USER_ID_KEY) ?? 'anon';
  } catch {
    // Private mode or storage disabled — one shared ephemeral bucket is fine,
    // because nothing is persisted across sessions there anyway.
    return 'anon';
  }
}

function scopedKey(name: string): string {
  return `${name}::${bucket()}`;
}

export function createUserScopedStorage(): StateStorage {
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(scopedKey(name));
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(scopedKey(name), value);
      } catch {
        /* quota or private mode — losing a preference is not worth throwing */
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(scopedKey(name));
      } catch {
        /* ignore */
      }
    },
  };
}
