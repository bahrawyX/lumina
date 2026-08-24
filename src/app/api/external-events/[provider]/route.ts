import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { fetchGoogleExternalEvents } from '@/lib/integrations/google/fetchExternalEvents';
import { fetchMicrosoftExternalEvents } from '@/lib/integrations/microsoft/fetchExternalEvents';
import { getEnabledCalendarIds } from '@/lib/integrations/enabledCalendars';
import { logger } from '@/lib/logger';
import { MAX_PROVIDER_RANGE_DAYS, parseRange } from '@/lib/dateRange';
import { integrationErrorCode } from '@/lib/integrations/clientError';

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

  // P1-10: `?start=1970-01-01&end=2100-01-01` triggered a fully paginated fetch
  // of every connected calendar. The OAuth client is shared, so one account
  // could exhaust the provider quota for everyone.
  const range = parseRange(searchParams.get('start'), searchParams.get('end'), {
    defaultStart: new Date(now - DEFAULT_RANGE_DAYS_PAST * 86_400_000),
    defaultEnd: new Date(now + DEFAULT_RANGE_DAYS_FUTURE * 86_400_000),
    maxDays: MAX_PROVIDER_RANGE_DAYS,
  });
  if (range.kind === 'error') {
    return NextResponse.json({ error: range.message }, { status: 400 });
  }
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

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

    // P3-3: the raw provider message never reaches the client.
    const code = integrationErrorCode(err, message);
    if (code === 'not_connected' || code === 'reconnect_required') {
      return NextResponse.json({ error: code, provider }, { status: 403 });
    }
    if (code === 'rate_limited' || code === 'provider_unavailable') {
      return NextResponse.json({ error: code, provider }, { status: 503 });
    }

    return NextResponse.json({ error: 'provider_error', provider }, { status: 500 });
  }
}
