import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { events } from '@/db/schema';
import { getMicrosoftAccessToken } from './token';
import { mapMicrosoftEvent, type MicrosoftEvent } from './mapper';

const BATCH_SIZE = 100;
const GRAPH_API = 'https://graph.microsoft.com/v1.0';

function getSyncWindow(): { startDateTime: string; endDateTime: string } {
  const now = Date.now();
  return {
    startDateTime: new Date(now - 30 * 86_400_000).toISOString(),
    endDateTime:   new Date(now + 365 * 86_400_000).toISOString(),
  };
}

/**
 * Fetches all events from a single Microsoft calendar using the calendarView
 * endpoint (handles recurring events correctly). Paginates automatically.
 *
 * Prefer: `Prefer: outlook.timezone="UTC"` so all times arrive in UTC.
 */
async function fetchMicrosoftEventsForCalendar(
  userId: string,
  msCalendarId: string,
): Promise<MicrosoftEvent[]> {
  const token = await getMicrosoftAccessToken(userId);
  const { startDateTime, endDateTime } = getSyncWindow();

  const url = new URL(
    `${GRAPH_API}/me/calendars/${encodeURIComponent(msCalendarId)}/calendarView`,
  );
  url.searchParams.set('startDateTime', startDateTime);
  url.searchParams.set('endDateTime', endDateTime);
  url.searchParams.set(
    '$select',
    'id,subject,start,end,isAllDay,isCancelled,lastModifiedDateTime,changeKey,location,organizer,onlineMeetingUrl,bodyPreview',
  );
  url.searchParams.set('$top', '250');

  const allItems: MicrosoftEvent[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        Prefer: 'outlook.timezone="UTC"',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `[microsoft/events] calendarView ${res.status} for calendar ${msCalendarId}: ${text}`,
      );
    }

    const page = (await res.json()) as {
      value?: MicrosoftEvent[];
      '@odata.nextLink'?: string;
    };

    allItems.push(...(page.value ?? []));
    nextUrl = page['@odata.nextLink'] ?? null;
  }

  return allItems;
}

async function batchUpsertMicrosoftEvents(
  userId: string,
  calendarId: string,
  mapped: ReturnType<typeof mapMicrosoftEvent>[],
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const db = getDatabase();
  const now = new Date();

  const valid = mapped.filter((e) => e !== null) as NonNullable<
    ReturnType<typeof mapMicrosoftEvent>
  >[];

  if (valid.length === 0) return { inserted: 0, updated: 0, skipped: 0 };

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    const externalIds = batch.map((e) => e.externalEventId);

    // Fetch existing rows with etag + sourceUpdatedAt for smart skip
    const existing = await db
      .select({
        externalEventId: events.externalEventId,
        externalEtag: events.externalEtag,
        sourceUpdatedAt: events.sourceUpdatedAt,
      })
      .from(events)
      .where(
        and(
          eq(events.calendarId, calendarId),
          inArray(events.externalEventId, externalIds),
        ),
      );

    const existingMap = new Map(
      existing.map((r) => [r.externalEventId ?? '', r]),
    );

    const toInsert = batch.filter((e) => !existingMap.has(e.externalEventId));
    const maybeUpdate = batch.filter((e) => existingMap.has(e.externalEventId));

    if (toInsert.length > 0) {
      await db.insert(events).values(
        toInsert.map((e) => ({
          userId,
          calendarId,
          provider:   'outlook' as const,
          source:     'microsoft' as const,
          syncStatus: 'synced' as const,
          title:           e.title,
          description:     e.description,
          location:        e.location,
          startTime:       e.startTime,
          endTime:         e.endTime,
          isAllDay:        e.isAllDay,
          timezone:        e.timezone,
          externalEventId: e.externalEventId,
          externalId:      e.externalEventId,
          externalEtag:    e.externalEtag,
          sourceUpdatedAt: e.sourceUpdatedAt,
          meetingUrl:      e.meetingUrl,
          organizerEmail:  e.organizerEmail,
          lastSyncedAt: now,
          createdAt:    now,
          updatedAt:    now,
          color:           '#0078D4',
          category:        'work',
          isCompleted:     false,
          isTaskGenerated: false,
        })),
      );
      inserted += toInsert.length;
    }

    for (const e of maybeUpdate) {
      const row = existingMap.get(e.externalEventId)!;

      // Skip if changeKey matches (most authoritative signal)
      if (e.externalEtag && e.externalEtag === row.externalEtag) {
        skipped++;
        continue;
      }

      // Skip if provider's lastModified is not newer
      if (
        e.sourceUpdatedAt &&
        row.sourceUpdatedAt &&
        e.sourceUpdatedAt <= row.sourceUpdatedAt
      ) {
        skipped++;
        continue;
      }

      await db
        .update(events)
        .set({
          title:           e.title,
          description:     e.description,
          location:        e.location,
          startTime:       e.startTime,
          endTime:         e.endTime,
          isAllDay:        e.isAllDay,
          timezone:        e.timezone,
          externalEtag:    e.externalEtag,
          sourceUpdatedAt: e.sourceUpdatedAt,
          meetingUrl:      e.meetingUrl,
          organizerEmail:  e.organizerEmail,
          syncStatus:   'synced' as const,
          lastSyncedAt: now,
          updatedAt:    now,
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

  return { inserted, updated, skipped };
}

export interface SyncMicrosoftCalendarEventsResult {
  calendarId: string;
  msCalendarId: string;
  inserted: number;
  updated: number;
  skipped: number;
}

export async function syncMicrosoftCalendarEvents(
  userId: string,
  dbCalendarId: string,
  msCalendarId: string,
): Promise<SyncMicrosoftCalendarEventsResult> {
  const rawItems = await fetchMicrosoftEventsForCalendar(userId, msCalendarId);
  const mapped = rawItems.map(mapMicrosoftEvent);
  const valid = mapped.filter((e) => e !== null);
  const invalidCount = rawItems.length - valid.length;

  const { inserted, updated, skipped } = await batchUpsertMicrosoftEvents(
    userId,
    dbCalendarId,
    mapped,
  );

  return {
    calendarId: dbCalendarId,
    msCalendarId,
    inserted,
    updated,
    skipped: skipped + invalidCount,
  };
}

export async function syncAllMicrosoftCalendarEvents(
  userId: string,
  msCalendars: Array<{ id: string; externalId: string }>,
): Promise<SyncMicrosoftCalendarEventsResult[]> {
  return Promise.all(
    msCalendars.map(({ id, externalId }) =>
      syncMicrosoftCalendarEvents(userId, id, externalId),
    ),
  );
}
