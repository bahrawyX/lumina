import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchMicrosoftExternalEvents } from '@/lib/integrations/microsoft/fetchExternalEvents';
import { getEnabledCalendarIds } from '@/lib/integrations/enabledCalendars';

const DEFAULT_RANGE_DAYS_PAST   = 30;
const DEFAULT_RANGE_DAYS_FUTURE = 90;

/**
 * GET /api/external-events/microsoft?start=ISO&end=ISO&calendarId=<db-calendar-id>
 *
 * Returns normalized Microsoft/Outlook Calendar events for the authenticated user.
 * - Resolves tokens from the `integrations` table (never trusts client).
 * - Fetches live from the Microsoft Graph API.
 * - NEVER writes event rows to the database.
 * - Client is responsible for caching the response.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
console.log("MICROSOFT ROUTE HIT")
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
    console.log("ABOUT TO RETURN EMPTY")
    const selectedCalendarIds = requestedCalendarIds.length > 0
      ? requestedCalendarIds
      : await getEnabledCalendarIds(session.user.id, 'microsoft');

    const events = await fetchMicrosoftExternalEvents(
      session.user.id,
      startIso,
      endIso,
      selectedCalendarIds,
    );
    console.log("ABOUT TO RETURN EMPTY")
    console.log(events)
    return NextResponse.json({ ok: true, events });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Microsoft fetch failed';
    console.error('[GET /api/external-events/microsoft]', message);

    if (
      message.includes('No Microsoft integration found') ||
      message.includes('not active') ||
      message.includes('refresh token missing')
    ) {
      console.log("ABOUT TO RETURN EMPTY")
      return NextResponse.json({ error: message }, { status: 403 });
    }
console.log("ABOUT TO RETURN EMPTY")
    return NextResponse.json({ error: 'Failed to fetch Outlook events' }, { status: 500 });
  }
}
