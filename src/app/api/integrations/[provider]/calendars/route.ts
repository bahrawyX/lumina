import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importGoogleCalendars, getGoogleCalendarsFromDb } from '@/lib/integrations/google/calendars';
import { integrationErrorCode } from '@/lib/integrations/clientError';
import { apiError, logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ provider: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { provider } = await context.params;

  if (provider === 'google') {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const calendars = await getGoogleCalendarsFromDb(session.user.id);
      return NextResponse.json({ calendars });
    } catch (err) {
      // P3-3/P3-4: a bare `catch {}` — the error was not bound, so it could
      // not be logged even in principle. The client still gets the opaque 500.
      return apiError('GET /api/integrations/[provider]/calendars (db)', err);
    }
  }

  return NextResponse.json({ error: 'Provider not supported' }, { status: 404 });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { provider } = await context.params;

  if (provider === 'google') {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const calendars = await importGoogleCalendars(session.user.id);
      return NextResponse.json({ calendars, count: calendars.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // P3-3: the raw provider message never reaches the client — and it is
      // recorded here rather than only computed and thrown away.
      logger.error(
        'unhandled',
        { route: 'GET /api/integrations/[provider]/calendars', provider: 'google' },
        err,
      );
      const code = integrationErrorCode(err, message);
      if (code === 'not_connected' || code === 'reconnect_required') {
        return NextResponse.json({ error: code, provider: 'google' }, { status: 403 });
      }
      return NextResponse.json({ error: 'provider_error', provider: 'google' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Provider not supported' }, { status: 404 });
}
