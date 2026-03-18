import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { events } from '@/db/schema';
import { googleFetch } from './client';
import { mapGoogleEvent, type GoogleEventsListResponse } from './mapper';

const BATCH_SIZE = 100;

// Initial sync window: 90 days ago → 365 days ahead
function getSyncWindow(): { timeMin: string; timeMax: string } {
  const now = Date.now();
  return {
    timeMin: new Date(now - 90 * 86_400_000).toISOString(),
    timeMax: new Date(now + 365 * 86_400_000).toISOString(),
  };
}

/**
 * Fetch all events from a single Google calendar within the sync window.
 * Handles pagination automatically.
 */
async function fetchGoogleEventsForCalendar(
  userId: string,
  googleCalendarId: string,
): Promise<GoogleEventsListResponse['items']> {
  const { timeMin, timeMax } = getSyncWindow();
  const allItems: GoogleEventsListResponse['items'] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      timeMin,
      timeMax,
      singleEvents: 'true',   // expand recurring events into instances
      orderBy: 'startTime',
      maxResults: '250',
    };
    if (pageToken) params.pageToken = pageToken;

    const page = await googleFetch<GoogleEventsListResponse>(
      userId,
      `/calendars/${encodeURIComponent(googleCalendarId)}/events`,
      params,
    );

    allItems.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return allItems;
}

/**
 * Batch upsert events into the DB.
 *
 * Upsert key: (calendarId, externalEventId).
 * The unique partial index `events_calendar_external_event_unique` covers this pair
 * when externalEventId IS NOT NULL — all Google events have non-null IDs.
 *
 * On conflict: update mutable fields (title, description, times, etag, etc.).
 * Immutable fields (userId, calendarId, provider, source) are never overwritten.
 */
async function batchUpsertEvents(
  userId: string,
  calendarId: string,
  mappedEvents: ReturnType<typeof mapGoogleEvent>[],
): Promise<{ inserted: number; updated: number }> {
  const db = getDatabase();
  const now = new Date();

  const valid = mappedEvents.filter((e) => e !== null) as NonNullable<
    ReturnType<typeof mapGoogleEvent>
  >[];

  if (valid.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;

  // Process in batches to avoid parameter limits
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    const externalIds = batch.map((e) => e.externalEventId);

    // Find which externalEventIds already exist in this calendar
    const existing = await db
      .select({ id: events.id, externalEventId: events.externalEventId })
      .from(events)
      .where(
        and(
          eq(events.calendarId, calendarId),
          inArray(events.externalEventId, externalIds),
        ),
      );

    const existingSet = new Set(existing.map((r) => r.externalEventId));

    const toInsert = batch.filter((e) => !existingSet.has(e.externalEventId));
    const toUpdate = batch.filter((e) => existingSet.has(e.externalEventId));

    // INSERT new events
    if (toInsert.length > 0) {
      await db.insert(events).values(
        toInsert.map((e) => ({
          userId,
          calendarId,
          provider: 'google' as const,
          source: 'google' as const,
          syncStatus: 'synced' as const,
          title: e.title,
          description: e.description,
          location: e.location,
          startTime: e.startTime,
          endTime: e.endTime,
          isAllDay: e.isAllDay,
          timezone: e.timezone,
          externalEventId: e.externalEventId,
          externalId: e.externalEventId,
          externalEtag: e.externalEtag,
          sourceUpdatedAt: e.sourceUpdatedAt,
          meetingUrl: e.meetingUrl,
          organizerEmail: e.organizerEmail,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
          // Defaults
          color: '#6D59E0',
          category: 'work',
          isCompleted: false,
          isTaskGenerated: false,
        })),
      );
      inserted += toInsert.length;
    }

    // UPDATE existing events (mutable fields only)
    for (const e of toUpdate) {
      await db
        .update(events)
        .set({
          title: e.title,
          description: e.description,
          location: e.location,
          startTime: e.startTime,
          endTime: e.endTime,
          isAllDay: e.isAllDay,
          timezone: e.timezone,
          externalEtag: e.externalEtag,
          sourceUpdatedAt: e.sourceUpdatedAt,
          meetingUrl: e.meetingUrl,
          organizerEmail: e.organizerEmail,
          syncStatus: 'synced' as const,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(events.calendarId, calendarId),
            eq(events.externalEventId, e.externalEventId),
          ),
        );
      updated++;
    }
  }

  return { inserted, updated };
}

export interface SyncCalendarEventsResult {
  calendarId: string;
  googleCalendarId: string;
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Sync all events for a single Google calendar into the DB.
 * Returns counts for monitoring.
 */
export async function syncGoogleCalendarEvents(
  userId: string,
  dbCalendarId: string,
  googleCalendarId: string,
): Promise<SyncCalendarEventsResult> {
  const rawItems = await fetchGoogleEventsForCalendar(userId, googleCalendarId);

  const mapped = rawItems.map(mapGoogleEvent);
  const valid = mapped.filter((e) => e !== null);
  const skipped = rawItems.length - valid.length;

  const { inserted, updated } = await batchUpsertEvents(userId, dbCalendarId, mapped);

  return { calendarId: dbCalendarId, googleCalendarId, inserted, updated, skipped };
}

/**
 * Sync events for all Google calendars belonging to the user.
 */
export async function syncAllGoogleCalendarEvents(
  userId: string,
  googleCalendars: Array<{ id: string; externalId: string }>,
): Promise<SyncCalendarEventsResult[]> {
  const results = await Promise.all(
    googleCalendars.map(({ id, externalId }) =>
      syncGoogleCalendarEvents(userId, id, externalId),
    ),
  );
  return results;
}
