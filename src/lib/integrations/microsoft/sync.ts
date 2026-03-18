import 'server-only';
import {
  importMicrosoftCalendars,
  getMicrosoftCalendarsFromDb,
} from './calendars';
import { syncAllMicrosoftCalendarEvents } from './events';
import {
  markMicrosoftIntegrationError,
  markMicrosoftIntegrationSynced,
} from './token';

export interface MicrosoftSyncResult {
  calendarsImported: number;
  eventsInserted: number;
  eventsUpdated: number;
  eventsSkipped: number;
  calendarResults: Array<{
    name: string;
    inserted: number;
    updated: number;
    skipped: number;
  }>;
}

/**
 * Full sync: imports calendars from Microsoft Graph then syncs events for all
 * of them into the DB. Safe to call repeatedly (idempotent).
 */
export async function runFullMicrosoftSync(
  userId: string,
): Promise<MicrosoftSyncResult> {
  try {
    const upsertedCalendars = await importMicrosoftCalendars(userId);

    if (upsertedCalendars.length === 0) {
      await markMicrosoftIntegrationSynced(userId);
      return {
        calendarsImported: 0,
        eventsInserted: 0,
        eventsUpdated: 0,
        eventsSkipped: 0,
        calendarResults: [],
      };
    }

    const calendarRefs = upsertedCalendars.map(({ id, externalId }) => ({
      id,
      externalId,
    }));
    const eventResults = await syncAllMicrosoftCalendarEvents(
      userId,
      calendarRefs,
    );

    const nameMap = new Map(upsertedCalendars.map((c) => [c.externalId, c.name]));
    const calendarResults = eventResults.map((r) => ({
      name:     nameMap.get(r.msCalendarId) ?? r.msCalendarId,
      inserted: r.inserted,
      updated:  r.updated,
      skipped:  r.skipped,
    }));

    const eventsInserted = calendarResults.reduce((s, r) => s + r.inserted, 0);
    const eventsUpdated  = calendarResults.reduce((s, r) => s + r.updated, 0);
    const eventsSkipped  = calendarResults.reduce((s, r) => s + r.skipped, 0);

    await markMicrosoftIntegrationSynced(userId);

    return {
      calendarsImported: upsertedCalendars.length,
      eventsInserted,
      eventsUpdated,
      eventsSkipped,
      calendarResults,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markMicrosoftIntegrationError(userId, message);
    throw err;
  }
}

/**
 * Events-only sync: skips calendar import, uses already-stored calendars.
 * Faster for periodic refresh when calendars haven't changed.
 */
export async function runMicrosoftEventsSync(
  userId: string,
): Promise<MicrosoftSyncResult> {
  try {
    const dbCalendars = await getMicrosoftCalendarsFromDb(userId);

    if (dbCalendars.length === 0) {
      throw new Error(
        'No Outlook calendars found. Run a full sync first.',
      );
    }

    const eventResults = await syncAllMicrosoftCalendarEvents(
      userId,
      dbCalendars,
    );
    const calendarResults = eventResults.map((r) => ({
      name:     dbCalendars.find((c) => c.externalId === r.msCalendarId)?.name ?? r.msCalendarId,
      inserted: r.inserted,
      updated:  r.updated,
      skipped:  r.skipped,
    }));

    const eventsInserted = calendarResults.reduce((s, r) => s + r.inserted, 0);
    const eventsUpdated  = calendarResults.reduce((s, r) => s + r.updated, 0);
    const eventsSkipped  = calendarResults.reduce((s, r) => s + r.skipped, 0);

    await markMicrosoftIntegrationSynced(userId);

    return {
      calendarsImported: 0,
      eventsInserted,
      eventsUpdated,
      eventsSkipped,
      calendarResults,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markMicrosoftIntegrationError(userId, message);
    throw err;
  }
}
