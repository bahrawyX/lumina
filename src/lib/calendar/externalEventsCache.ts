/**
 * Browser-side cache for mapped external calendar events (Google / Microsoft).
 *
 * Two layers:
 *   1. Module-level in-memory Map (primary, cleared on page reload)
 *   2. sessionStorage (fallback, cleared on tab/session close)
 *
 * Cache keys are user-scoped to prevent cross-user data leakage.
 * TTL: 5 minutes.
 *
 * sessionStorage key format:
 *   lumina:{userId}:external:{provider}:{startDate}_{endDate}
 */

import type { CalendarEvent } from '@/types';

const TTL_MS = 5 * 60 * 1_000;

interface CacheEntry {
  events: CalendarEvent[];
  fetchedAt: number;
}

// Primary: module-level Map, survives React re-renders but not page reloads
const memCache = new Map<string, CacheEntry>();

function mkMemKey(
  userId: string,
  provider: string,
  start: string,
  end: string,
): string {
  return `${userId}:${provider}:${start}_${end}`;
}

function mkSsKey(
  userId: string,
  provider: string,
  start: string,
  end: string,
): string {
  return `lumina:${userId}:external:${provider}:${start}_${end}`;
}

function ssRead(key: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function ssWrite(key: string, entry: CacheEntry): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore QuotaExceededError — mem cache still works
  }
}

function ssRemove(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* noop */ }
}

function ssClearPrefix(prefix: string): void {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch { /* noop */ }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getCached(
  userId: string,
  provider: string,
  start: string,
  end: string,
): CalendarEvent[] | null {
  const memKey = mkMemKey(userId, provider, start, end);
  const mem = memCache.get(memKey);

  if (mem) {
    if (Date.now() - mem.fetchedAt < TTL_MS) return mem.events;
    memCache.delete(memKey);
  }

  const ssKey = mkSsKey(userId, provider, start, end);
  const ss = ssRead(ssKey);
  if (ss) {
    if (Date.now() - ss.fetchedAt < TTL_MS) {
      memCache.set(memKey, ss); // warm the mem cache
      return ss.events;
    }
    ssRemove(ssKey);
  }

  return null;
}

export function setCache(
  userId: string,
  provider: string,
  start: string,
  end: string,
  events: CalendarEvent[],
): void {
  const entry: CacheEntry = { events, fetchedAt: Date.now() };
  memCache.set(mkMemKey(userId, provider, start, end), entry);
  ssWrite(mkSsKey(userId, provider, start, end), entry);
}

/** Force-invalidate one specific range (e.g. after manual refresh). */
export function invalidateRange(
  userId: string,
  provider: string,
  start: string,
  end: string,
): void {
  memCache.delete(mkMemKey(userId, provider, start, end));
  ssRemove(mkSsKey(userId, provider, start, end));
}

/** Clear all cached data for one provider (call on provider disconnect). */
export function clearProvider(userId: string, provider: string): void {
  for (const k of [...memCache.keys()]) {
    if (k.startsWith(`${userId}:${provider}:`)) memCache.delete(k);
  }
  ssClearPrefix(`lumina:${userId}:external:${provider}:`);
}

/** Clear ALL external event cache for a user (call on signout). */
export function clearAll(userId: string): void {
  for (const k of [...memCache.keys()]) {
    if (k.startsWith(`${userId}:`)) memCache.delete(k);
  }
  ssClearPrefix(`lumina:${userId}:external:`);
}
