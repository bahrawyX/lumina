import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importGoogleCalendars, getGoogleCalendarsFromDb } from '@/lib/integrations/google/calendars';

/**
 * GET /api/integrations/google/calendars
 * Returns the Google calendars already stored in DB for this user.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const calendars = await getGoogleCalendarsFromDb(session.user.id);
    return NextResponse.json({ calendars });
  } catch (err) {
    console.error('[GET /api/integrations/google/calendars]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/integrations/google/calendars
 * Fetch the user's Google calendar list and upsert them into the DB.
 * Returns the list of imported calendar records.
 *
 * Requires an active Google integration with tokens in the integrations table.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const calendars = await importGoogleCalendars(userId);
    return NextResponse.json({ calendars, count: calendars.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[POST /api/integrations/google/calendars]', message);

    // Surface token/auth errors distinctly
    if (
      message.includes('No Google integration found') ||
      message.includes('Google integration is not active') ||
      message.includes('Google refresh token missing')
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: 'Failed to import Google calendars' }, { status: 500 });
  }
}
