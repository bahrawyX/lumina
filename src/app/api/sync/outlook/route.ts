import { and, desc, eq, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { integrations } from '@/db/schema';
import { getDatabase } from '@/lib/db';

/**
 * POST /api/sync/outlook
 * Triggers an Outlook calendar sync for the authenticated user.
 * Called by the client-side sync hook or by a background cron job.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const { timezone } = body as { timezone?: string };

    const db = getDatabase();
    const [integration] = await db
      .select({
        accessToken: integrations.accessToken,
        expiresAt: integrations.expiresAt,
        status: integrations.status,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, userId),
          or(eq(integrations.provider, 'outlook'), eq(integrations.provider, 'microsoft'))
        )
      )
      .orderBy(desc(integrations.updatedAt))
      .limit(1);

    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'Outlook integration not connected' }, { status: 404 });
    }

    if (integration.status !== 'active') {
      return NextResponse.json({ error: 'Outlook integration is not active' }, { status: 409 });
    }

    if (integration.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Outlook integration token expired' }, { status: 401 });
    }

    void timezone;

    // Import dynamically to keep the server bundle smaller
    const { fetchOutlookEvents } = await import(
      "@/lib/outlook/outlookEvents"
    );

    const events = await fetchOutlookEvents(integration.accessToken);

    return NextResponse.json({
      ok: true,
      eventCount: events.length,
      events,
    });
  } catch (error: unknown) {
    console.error("[API /sync/outlook]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
