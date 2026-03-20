import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';
import { fetchGoogleExternalEvents } from '@/lib/integrations/google/fetchExternalEvents';
import { fetchMicrosoftExternalEvents } from '@/lib/integrations/microsoft/fetchExternalEvents';
import type { ApiExternalEvent } from '@/lib/calendar/externalEventTypes';

const DEFAULT_RANGE_DAYS_PAST   = 30;
const DEFAULT_RANGE_DAYS_FUTURE = 90;

/**
 * GET /api/external-events/all?start=ISO&end=ISO
 *
 * Fetches external events from all connected providers in parallel.
 * - Only queries providers with an active integration row.
 * - One provider failing does not block the other.
 * - Returns { google: ApiExternalEvent[], microsoft: ApiExternalEvent[] }.
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

  const db = getDatabase();
  const activeIntegrations = await db
    .select({ provider: integrations.provider })
    .from(integrations)
    .where(eq(integrations.userId, userId));

  const hasGoogle    = activeIntegrations.some((i) => i.provider === 'google');
  const hasMicrosoft = activeIntegrations.some(
    (i) => i.provider === 'microsoft' || i.provider === 'outlook',
  );

  const googleResult: { events: ApiExternalEvent[]; error?: string } = { events: [] };
  const msResult:     { events: ApiExternalEvent[]; error?: string } = { events: [] };

  await Promise.all([
    hasGoogle
      ? fetchGoogleExternalEvents(userId, startIso, endIso)
          .then((ev) => { googleResult.events = ev; })
          .catch((err) => {
            googleResult.error = err instanceof Error ? err.message : 'Google fetch failed';
          })
      : Promise.resolve(),

    hasMicrosoft
      ? fetchMicrosoftExternalEvents(userId, startIso, endIso)
          .then((ev) => { msResult.events = ev; })
          .catch((err) => {
            msResult.error = err instanceof Error ? err.message : 'Microsoft fetch failed';
          })
      : Promise.resolve(),
  ]);

  return NextResponse.json({
    ok: true,
    google:    googleResult,
    microsoft: msResult,
  });
}
