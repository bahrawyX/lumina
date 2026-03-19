import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runFullGoogleSync } from '@/lib/integrations/google/sync';

/**
 * POST /api/sync/google
 * Convenience alias for a full Google Calendar sync.
 * Delegates to /api/integrations/google/events/sync (full mode).
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runFullGoogleSync(session.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[POST /api/sync/google]', message);

    if (
      message.includes('No Google integration found') ||
      message.includes('Google integration is not active') ||
      message.includes('Google refresh token missing')
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: 'Google Calendar sync failed' }, { status: 500 });
  }
}
