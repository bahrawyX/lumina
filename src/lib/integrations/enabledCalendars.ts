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
      ),
    );

  return rows.map((row) => row.id);
}
