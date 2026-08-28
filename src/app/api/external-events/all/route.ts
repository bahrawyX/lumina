import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';
import { fetchGoogleExternalEvents } from '@/lib/integrations/google/fetchExternalEvents';
import { fetchMicrosoftExternalEvents } from '@/lib/integrations/microsoft/fetchExternalEvents';
import { getEnabledCalendarIds } from '@/lib/integrations/enabledCalendars';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';
import { integrationErrorCode } from '@/lib/integrations/clientError';
import { logger } from '@/lib/logger';

const DEFAULT_RANGE_DAYS_PAST   = 30;
const DEFAULT_RANGE_DAYS_FUTURE = 90;

/**
 * GET /api/external-events/all?start=ISO&end=ISO
 *
 * Fetches external events from all connected providers in parallel.
 * - Only queries providers with an active integration row.
 * - One provider failing does not block the other.
 * - Returns { google: ApiExternalEvent[], microsoft: ApiExternalEvent[] }.
 * - Supports optional repeated query params:
 *   - googleCalendarId=<db-calendar-id>
 *   - microsoftCalendarId=<db-calendar-id>
 * - NEVER writes to the database.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const now = Date.now();

  const startIso =
    searchParams.get('start') ??
    new Date(now - DEFAULT_RANGE_DAYS_PAST * 86_400_000).toISOString();
  const endIso =
    searchParams.get('end') ??
    new Date(now + DEFAULT_RANGE_DAYS_FUTURE * 86_400_000).toISOString();

  const requestedGoogleCalendarIds = searchParams
    .getAll('googleCalendarId')
    .map((id) => id.trim())
    .filter(Boolean);
  const requestedMicrosoftCalendarIds = searchParams
    .getAll('microsoftCalendarId')
    .map((id) => id.trim())
    .filter(Boolean);

  const db = getDatabase();
  const activeIntegrations = await db
    .select({ provider: integrations.provider })
    .from(integrations)
    .where(eq(integrations.userId, userId));

  const hasGoogle    = activeIntegrations.some((i) => i.provider === 'google');
  const hasMicrosoft = activeIntegrations.some(
    (i) => i.provider === 'microsoft' || i.provider === 'outlook',
  );

  type ProviderResult = {
    events: ApiExternalEvent[];
    error?: string;
    /** P1-13: calendars whose fetch failed, so a partial read is visible. */
    failedCalendarIds?: string[];
  };
  const googleResult: ProviderResult = { events: [] };
  const msResult:     ProviderResult = { events: [] };

  const [googleCalendarIds, microsoftCalendarIds] = await Promise.all([
    requestedGoogleCalendarIds.length > 0
      ? requestedGoogleCalendarIds
      : getEnabledCalendarIds(userId, 'google'),
    requestedMicrosoftCalendarIds.length > 0
      ? requestedMicrosoftCalendarIds
      : getEnabledCalendarIds(userId, 'microsoft'),
  ]);

  await Promise.all([
    // P1-13: `failedCalendarIds` is the difference between "that calendar is
    // empty" and "we could not read that calendar". Previously a single
    // calendar 401-ing dropped its events on the floor and this route still
    // answered `ok: true` with no indication anything was missing.
    hasGoogle
      ? fetchGoogleExternalEvents(userId, startIso, endIso, googleCalendarIds)
          .then((res) => {
            googleResult.events = res.events;
            googleResult.failedCalendarIds = res.failedCalendarIds;
          })
          .catch((err) => {
            // P3-3 — see `sync/all`. The enum goes to the client; the cause
            // has to go somewhere.
            logger.error(
              'unhandled',
              { route: 'GET /api/external-events/all', provider: 'google' },
              err,
            );
            googleResult.error = integrationErrorCode(err);
          })
      : Promise.resolve(),

    hasMicrosoft
      ? fetchMicrosoftExternalEvents(userId, startIso, endIso, microsoftCalendarIds)
          .then((res) => {
            msResult.events = res.events;
            msResult.failedCalendarIds = res.failedCalendarIds;
          })
          .catch((err) => {
            logger.error(
              'unhandled',
              { route: 'GET /api/external-events/all', provider: 'microsoft' },
              err,
            );
            msResult.error = integrationErrorCode(err);
          })
      : Promise.resolve(),
  ]);

  return NextResponse.json({
    ok: true,
    google:    googleResult,
    microsoft: msResult,
  });
}
