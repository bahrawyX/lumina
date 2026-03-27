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
