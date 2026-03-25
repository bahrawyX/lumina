import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importGoogleCalendars, getGoogleCalendarsFromDb } from '@/lib/integrations/google/calendars';

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
    } catch {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

  return NextResponse.json({ error: 'Provider not supported' }, { status: 404 });
}
