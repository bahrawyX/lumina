import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { calendars } from '@/db/schema';

type ExternalCalendarProvider = 'google' | 'microsoft';

export async function getEnabledCalendarIds(
  userId: string,
  provider: ExternalCalendarProvider,
): Promise<string[]> {
  const db = getDatabase();

  const rows = await db
    .select({ id: calendars.id })
    .from(calendars)
    .where(
      and(
        eq(calendars.userId, userId),
        eq(calendars.provider, provider),
        // P2-10: this clause was missing, so `calendars.enabled` was written by
        // PATCH /api/integrations/calendars/[id], surfaced by the GET, and read
        // by NOTHING. Every consumer fetched from all connected calendars — so
        // a user who disabled their partner's shared calendar still had its
        // events pulled into /api/external-events/*, /api/intelligence and the
        // daily brief. That is a privacy defect, not just wasted quota.
        eq(calendars.enabled, true),
      ),
    );

  return rows.map((row) => row.id);
}
