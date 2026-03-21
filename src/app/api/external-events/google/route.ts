import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchGoogleExternalEvents } from '@/lib/integrations/google/fetchExternalEvents';
import { getEnabledCalendarIds } from '@/lib/integrations/enabledCalendars';

const DEFAULT_RANGE_DAYS_PAST   = 30;
const DEFAULT_RANGE_DAYS_FUTURE = 90;

/**
 * GET /api/external-events/google?start=ISO&end=ISO&calendarId=<db-calendar-id>
 *
 * Returns normalized Google Calendar events for the authenticated user.
 * - Resolves tokens from the `integrations` table (never trusts client).
 * - Fetches live from the Google Calendar API.
 * - NEVER writes event rows to the database.
 * - Client is responsible for caching the response.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const now = Date.now();

  const startIso =
    searchParams.get('start') ??
    new Date(now - DEFAULT_RANGE_DAYS_PAST * 86_400_000).toISOString();
  const endIso =
    searchParams.get('end') ??
    new Date(now + DEFAULT_RANGE_DAYS_FUTURE * 86_400_000).toISOString();

  const requestedCalendarIds = searchParams
    .getAll('calendarId')
    .map((id) => id.trim())
    .filter(Boolean);

  try {
    const selectedCalendarIds = requestedCalendarIds.length > 0
      ? requestedCalendarIds
      : await getEnabledCalendarIds(session.user.id, 'google');

    const events = await fetchGoogleExternalEvents(
      session.user.id,
      startIso,
      endIso,
      selectedCalendarIds,
    );
    return NextResponse.json({ ok: true, events });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google fetch failed';
    console.error('[GET /api/external-events/google]', message);

    if (
      message.includes('No Google account linked') ||
      message.includes('tokens are missing') ||
      message.includes('No Google integration')
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: 'Failed to fetch Google events' }, { status: 500 });
  }
}
