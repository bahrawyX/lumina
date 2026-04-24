/**
 * eventsPersistence.ts
 * Thin client-side wrappers around /api/events.
 * Never calls Drizzle directly — all DB access lives in the API routes.
 */

import type { CalendarEvent } from '@/types';

type CanonicalProvider = 'local' | 'google' | 'outlook' | 'microsoft';
type CanonicalSource = 'manual' | 'google' | 'microsoft' | 'scheduler' | 'lumina' | 'outlook' | 'local';
type UiProvider = 'local' | 'google' | 'microsoft' | 'outlook';

// ── Shape that the API returns ─────────────────────────────────────────────────

export interface ApiEvent {
  id: string;
  title: string;
  date: string;        // YYYY-MM-DD
  startTime?: string;  // HH:mm
  endTime?: string;    // HH:mm
  timezone?: string;
  description?: string;
  location?: string;
  category?: string;
  completed?: boolean;
  isAllDay?: boolean;
  linkedTaskId?: string | null;
  color?: string;
  provider?: CanonicalProvider;
  source?: CanonicalSource;
  externalEventId?: string;
  externalEtag?: string;
  sourceUpdatedAt?: string;
  syncStatus?: 'local_only' | 'synced' | 'pending_update' | 'pending_delete';
  meetingUrl?: string;
  organizerEmail?: string;
  createdViaNL?: boolean;
}

function mapCanonicalToUiSource(provider: CanonicalProvider | undefined, source: CanonicalSource | undefined): 'lumina' | 'outlook' {
  if (provider === 'outlook' || provider === 'microsoft') return 'outlook';
  if (source === 'microsoft' || source === 'outlook') return 'outlook';
  return 'lumina';
}

function mapCanonicalToUiProvider(
  provider: CanonicalProvider | undefined,
  source: CanonicalSource | undefined,
): UiProvider {
  if (provider === 'microsoft' || provider === 'outlook') return 'microsoft';
  if (provider === 'google') return 'google';
  if (source === 'microsoft' || source === 'outlook') return 'microsoft';
  if (source === 'google') return 'google';
  return 'local';
}

function mapUiToCanonicalProvider(
  event: Pick<CalendarEvent, 'source' | 'provider'>,
): 'local' | 'google' | 'outlook' {
  if (event.provider === 'microsoft' || event.provider === 'outlook') return 'outlook';
  if (event.provider === 'google') return 'google';
  return event.source === 'outlook' ? 'outlook' : 'local';
}

function mapUiToCanonicalSource(
  event: Pick<CalendarEvent, 'source' | 'provider'>,
): 'manual' | 'google' | 'microsoft' {
  if (event.provider === 'microsoft' || event.provider === 'outlook') return 'microsoft';
  if (event.provider === 'google') return 'google';
  return event.source === 'outlook' ? 'microsoft' : 'manual';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function apiBase() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return res;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Fetch all events for the currently authenticated user. */
export async function fetchAllForCurrentUser(): Promise<CalendarEvent[]> {
  try {
    const res = await apiFetch('/api/events');
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const mapped = data.map((event: ApiEvent) => ({
      id: event.id,
      title: event.title,
      description: event.description ?? '',
      date: event.date,
      startTime: event.startTime ?? '00:00',
      endTime: event.endTime ?? '00:00',
      timezone: event.timezone ?? 'UTC',
      location: event.location,
      category: event.category ?? 'work',
      color: event.color ?? '#6D59E0',
      completed: event.completed,
      provider: mapCanonicalToUiProvider(event.provider, event.source),
      source: mapCanonicalToUiSource(event.provider, event.source),
      outlookId: event.externalEventId,
      linkedTaskId: event.linkedTaskId ?? null,
      createdViaNL: event.createdViaNL === true,
    }));
    return mapped;
  } catch {
    return [];
  }
}

/**
 * Persist a new event to the DB.
 * Returns true on success, false on HTTP or network failure — callers that want
 * to roll back an optimistic mutation can await this and branch on the result.
 * Fire-and-forget callers can still ignore the return value.
 */
export async function createOne(event: CalendarEvent): Promise<boolean> {
  try {
    const provider = mapUiToCanonicalProvider(event);
    const res = await apiFetch('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        ...event,
        provider,
        source: mapUiToCanonicalSource(event),
        externalEventId: event.outlookId ?? undefined,
      }),
    });
    return res.ok;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[eventsPersistence] createOne failed:', err);
    }
    return false;
  }
}

/** Update an existing event in the DB. Fire-and-forget safe. */
export async function updateOne(id: string, patch: Partial<CalendarEvent>): Promise<void> {
  try {
    const provider = patch.provider === 'microsoft' || patch.provider === 'outlook'
      ? 'outlook'
      : patch.provider === 'google'
        ? 'google'
        : patch.provider === 'local'
          ? 'local'
          : patch.source === 'outlook'
            ? 'outlook'
            : patch.source === 'lumina'
              ? 'local'
              : undefined;
    const source = patch.provider === 'microsoft' || patch.provider === 'outlook'
      ? 'microsoft'
      : patch.provider === 'google'
        ? 'google'
        : patch.provider === 'local'
          ? 'manual'
          : patch.source === 'outlook'
            ? 'microsoft'
            : patch.source === 'lumina'
              ? 'manual'
              : undefined;
    await apiFetch(`/api/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...patch,
        provider,
        source,
        externalEventId: patch.outlookId ?? undefined,
      }),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[eventsPersistence] updateOne failed:', err);
    }
  }
}

/** Delete an event from the DB. Fire-and-forget safe. */
export async function deleteOne(id: string, queryString?: string): Promise<void> {
  try {
    await apiFetch(`/api/events/${id}${queryString ?? ''}`, { method: 'DELETE' });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[eventsPersistence] deleteOne failed:', err);
    }
  }
}

/**
 * Bulk-import events to DB (future one-time localStorage migration).
 * Currently a no-op stub — deferred for safety.
 */
export async function migrateMany(_events: CalendarEvent[]): Promise<void> {
  void _events;
  // Intentionally deferred. Will be implemented as a separate migration flow.
}
