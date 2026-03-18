import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runFullGoogleSync, runEventsSyncOnly } from '@/lib/integrations/google/sync';

/**
 * POST /api/integrations/google/events/sync
 *
 * Triggers a Google Calendar event sync for the authenticated user.
 *
 * Body (optional):
 *   { mode?: 'full' | 'events-only' }
 *
 *   full (default) — re-imports calendar list then syncs all events.
 *   events-only    — skips calendar import, syncs events for already-known calendars.
 *
 * Idempotent: safe to call multiple times. Duplicate events are upserted, not duplicated.
 * No polling: must be explicitly triggered by the user.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let mode: 'full' | 'events-only' = 'full';
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mode === 'events-only') mode = 'events-only';
  } catch {
    // No body — use default
  }

  try {
    const result =
      mode === 'events-only'
        ? await runEventsSyncOnly(userId)
        : await runFullGoogleSync(userId);

    return NextResponse.json({
      ok: true,
      mode,
      calendarsImported: result.calendarsImported,
      eventsInserted: result.eventsInserted,
      eventsUpdated: result.eventsUpdated,
      eventsSkipped: result.eventsSkipped,
      calendarResults: result.calendarResults,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[POST /api/integrations/google/events/sync]', message);

    if (
      message.includes('No Google account linked') ||
      message.includes('tokens are missing')
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (message.includes('No Google calendars found')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Google Calendar sync failed' }, { status: 500 });
  }
}
