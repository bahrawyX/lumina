import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';
import { graphFetchAll } from './client';
import {
  mapMicrosoftCalendar,
  type MicrosoftCalendar,
  type MappedMicrosoftCalendar,
} from './mapper';

async function fetchMicrosoftCalendarList(
  userId: string,
): Promise<MappedMicrosoftCalendar[]> {
  const rawCals = await graphFetchAll<MicrosoftCalendar>(
    userId,
    '/me/calendars',
    {
      $select: 'id,name,color,isDefaultCalendar,canEdit',
      $top: '50',
    },
  );

  return rawCals.filter((c) => !!c.id).map(mapMicrosoftCalendar);
}

export interface UpsertedMicrosoftCalendar {
  id: string;
  externalId: string;
  name: string;
}

/**
 * Fetches all of the user's Outlook calendars from Microsoft Graph
 * and upserts them into the `calendars` table.
 *
 * Upsert key: (userId, provider='microsoft', externalId)
 * Does not touch local calendars.
 */
export async function importMicrosoftCalendars(
  userId: string,
): Promise<UpsertedMicrosoftCalendar[]> {
  const db = getDatabase();
  const msCals = await fetchMicrosoftCalendarList(userId);
  if (msCals.length === 0) return [];

  const existing = await db
    .select({ id: calendars.id, externalId: calendars.externalId })
    .from(calendars)
    .where(
      and(eq(calendars.userId, userId), eq(calendars.provider, 'microsoft')),
    );

  const existingMap = new Map(
    existing.map((r) => [r.externalId ?? '', r.id]),
  );

  const now = new Date();
  const result: UpsertedMicrosoftCalendar[] = [];

  for (const cal of msCals) {
    const existingId = existingMap.get(cal.externalId);

    if (existingId) {
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
          provider: 'microsoft',
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

export async function getMicrosoftCalendarsFromDb(
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
    .where(
      and(eq(calendars.userId, userId), eq(calendars.provider, 'microsoft')),
    );

  return rows.filter(
    (r): r is { id: string; externalId: string; name: string; enabled: boolean } =>
      r.externalId !== null,
  );
}
