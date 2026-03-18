import 'server-only';
import { importGoogleCalendars, getGoogleCalendarsFromDb } from './calendars';
import { syncAllGoogleCalendarEvents } from './events';
import { markIntegrationError, markIntegrationSynced } from './token';

export interface FullSyncResult {
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
 * Run a full Google Calendar sync for the user:
 * 1. Import/update calendar list
 * 2. Sync events for each calendar
 * 3. Update integration sync state
 *
 * This is a one-shot operation — no polling, no background work.
 * Caller decides when to trigger (explicit user action only).
 */
export async function runFullGoogleSync(userId: string): Promise<FullSyncResult> {
  try {
    // Phase 1: calendars
    const upsertedCalendars = await importGoogleCalendars(userId);

    if (upsertedCalendars.length === 0) {
      await markIntegrationSynced(userId);
      return {
        calendarsImported: 0,
        eventsInserted: 0,
        eventsUpdated: 0,
        eventsSkipped: 0,
        calendarResults: [],
      };
    }

    // Phase 2: events for each calendar
    const calendarRefs = upsertedCalendars.map(({ id, externalId }) => ({ id, externalId }));
    const eventResults = await syncAllGoogleCalendarEvents(userId, calendarRefs);

    // Build name map for the result
    const nameMap = new Map(upsertedCalendars.map((c) => [c.externalId, c.name]));

    const calendarResults = eventResults.map((r) => ({
      name: nameMap.get(r.googleCalendarId) ?? r.googleCalendarId,
      inserted: r.inserted,
      updated: r.updated,
      skipped: r.skipped,
    }));

    const eventsInserted = calendarResults.reduce((s, r) => s + r.inserted, 0);
    const eventsUpdated = calendarResults.reduce((s, r) => s + r.updated, 0);
    const eventsSkipped = calendarResults.reduce((s, r) => s + r.skipped, 0);

    // Mark integration as successfully synced
    await markIntegrationSynced(userId);

    return {
      calendarsImported: upsertedCalendars.length,
      eventsInserted,
      eventsUpdated,
      eventsSkipped,
      calendarResults,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markIntegrationError(userId, message);
    throw err;
  }
}

/**
 * Sync events only (calendars already imported).
 * Useful for incremental refreshes without re-fetching the calendar list.
 */
export async function runEventsSyncOnly(userId: string): Promise<FullSyncResult> {
  try {
    const dbCalendars = await getGoogleCalendarsFromDb(userId);

    if (dbCalendars.length === 0) {
      throw new Error(
        'No Google calendars found. Run a full sync first to import your calendars.',
      );
    }

    const eventResults = await syncAllGoogleCalendarEvents(userId, dbCalendars);

    const calendarResults = eventResults.map((r) => ({
      name: dbCalendars.find((c) => c.externalId === r.googleCalendarId)?.name ?? r.googleCalendarId,
      inserted: r.inserted,
      updated: r.updated,
      skipped: r.skipped,
    }));

    const eventsInserted = calendarResults.reduce((s, r) => s + r.inserted, 0);
    const eventsUpdated = calendarResults.reduce((s, r) => s + r.updated, 0);
    const eventsSkipped = calendarResults.reduce((s, r) => s + r.skipped, 0);

    await markIntegrationSynced(userId);

    return {
      calendarsImported: 0,
      eventsInserted,
      eventsUpdated,
      eventsSkipped,
      calendarResults,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markIntegrationError(userId, message);
    throw err;
  }
}
