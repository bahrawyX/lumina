import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { googleFetch } from './client';
import {
  mapGoogleCalendar,
  type GoogleCalendarListResponse,
  type MappedGoogleCalendar,
} from './mapper';

/**
 * Fetch the user's Google calendar list and return mapped records.
 * Paginates automatically (calendarList.list can page).
 */
async function fetchGoogleCalendarList(userId: string): Promise<MappedGoogleCalendar[]> {
  const results: MappedGoogleCalendar[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = { minAccessRole: 'reader' };
    if (pageToken) params.pageToken = pageToken;

    const page = await googleFetch<GoogleCalendarListResponse>(
      userId,
      '/users/me/calendarList',
      params,
    );

    for (const entry of page.items ?? []) {
      if (entry.id) results.push(mapGoogleCalendar(entry));
    }

    pageToken = page.nextPageToken;
  } while (pageToken);

  return results;
}

export interface UpsertedCalendar {
  id: string;         // DB uuid
  externalId: string; // Google calendar id
  name: string;
}

/**
 * Fetch Google calendars for the user, upsert them into the DB, and
 * return the list of DB calendar rows.
 *
 * Upsert key: (userId, provider='google', externalId).
 * The calendars table has no unique index on this triple, so we do a
 * manual select-then-insert/update approach.
 *
 * Local calendars are never touched.
 */
export async function importGoogleCalendars(userId: string): Promise<UpsertedCalendar[]> {
  const db = getDatabase();

  const googleCals = await fetchGoogleCalendarList(userId);
  if (googleCals.length === 0) return [];

  // Load existing Google calendars for this user
  const existing = await db
    .select({ id: calendars.id, externalId: calendars.externalId })
    .from(calendars)
    .where(and(eq(calendars.userId, userId), eq(calendars.provider, 'google')));

  const existingMap = new Map(
    existing.map((row) => [row.externalId ?? '', row.id]),
  );

  const now = new Date();
  const result: UpsertedCalendar[] = [];

  for (const cal of googleCals) {
    const existingId = existingMap.get(cal.externalId);

    if (existingId) {
      // Update metadata (name, color) but don't change isPrimary once set
      await db
        .update(calendars)
        .set({ name: cal.name, color: cal.color, updatedAt: now })
        .where(eq(calendars.id, existingId));

      result.push({ id: existingId, externalId: cal.externalId, name: cal.name });
    } else {
      const [inserted] = await db
        .insert(calendars)
        .values({
          userId,
          provider: 'google',
          externalId: cal.externalId,
          name: cal.name,
          color: cal.color,
          enabled: true,
          isPrimary: cal.isPrimary,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: calendars.id });

      result.push({ id: inserted.id, externalId: cal.externalId, name: cal.name });
    }
  }

  return result;
}

/**
 * Returns DB rows for all Google calendars belonging to this user.
 * Used by the event sync step to know which calendars to pull events from.
 */
export async function getGoogleCalendarsFromDb(
  userId: string,
): Promise<Array<{ id: string; externalId: string; name: string; enabled: boolean }>> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: calendars.id,
      externalId: calendars.externalId,
      name: calendars.name,
      enabled: calendars.enabled,
    })
    .from(calendars)
    .where(and(eq(calendars.userId, userId), eq(calendars.provider, 'google')));

  return rows
    .filter((r): r is { id: string; externalId: string; name: string; enabled: boolean } =>
      r.externalId !== null,
    );
}
