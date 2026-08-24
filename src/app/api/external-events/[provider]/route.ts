import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchGoogleExternalEvents } from '@/lib/integrations/google/fetchExternalEvents';
import { fetchMicrosoftExternalEvents } from '@/lib/integrations/microsoft/fetchExternalEvents';
import { getEnabledCalendarIds } from '@/lib/integrations/enabledCalendars';
import { logger } from '@/lib/logger';

const DEFAULT_RANGE_DAYS_PAST = 30;
const DEFAULT_RANGE_DAYS_FUTURE = 90;

interface RouteContext {
  params: Promise<{ provider: string }>;
}

function isSupportedProvider(provider: string): provider is 'google' | 'microsoft' {
  return provider === 'google' || provider === 'microsoft';
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { provider } = await context.params;
  if (!isSupportedProvider(provider)) {
    return NextResponse.json({ error: 'Provider not supported' }, { status: 404 });
  }

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
    const selectedCalendarIds =
      requestedCalendarIds.length > 0
        ? requestedCalendarIds
        : await getEnabledCalendarIds(session.user.id, provider);

    const events =
      provider === 'google'
        ? await fetchGoogleExternalEvents(
            session.user.id,
            startIso,
            endIso,
            selectedCalendarIds,
          )
        : await fetchMicrosoftExternalEvents(
            session.user.id,
            startIso,
            endIso,
            selectedCalendarIds,
          );

    return NextResponse.json({ ok: true, events });
  } catch (err) {
    const message = err instanceof Error ? err.message : `${provider} fetch failed`;
    logger.error('unhandled', { route: `GET /api/external-events/${provider}` }, message);

    if (
      message.includes('No Google account linked') ||
      message.includes('tokens are missing') ||
      message.includes('No Google integration') ||
      message.includes('No Microsoft integration found') ||
      message.includes('not active') ||
      message.includes('refresh token missing')
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json(
      { error: `Failed to fetch ${provider === 'google' ? 'Google' : 'Outlook'} events` },
      { status: 500 },
    );
  }
}
