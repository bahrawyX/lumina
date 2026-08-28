import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import {
  achievements,
  calendars,
  coinTransactions,
  contactSubmissions,
  docs,
  eventRecurrence,
  events,
  focusSessions,
  goalTargets,
  goals,
  integrations,
  moodLogs,
  plannerItems,
  pushSubscriptions,
  tasks,
  users,
} from '@/db/schema';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { apiError } from '@/lib/logger';

/**
 * GET /api/users/me/export — everything this account holds, as one JSON file.
 *
 * P2-14: there was no export of any kind. For a product storing calendar
 * contents, document bodies and mood logs that is a GDPR Article 20
 * (portability) gap.
 *
 * ── What is deliberately NOT in the bundle ────────────────────────────────
 *
 * Portability means the user's *own* data, not the credentials that guard it.
 * A downloadable file is copied, mailed and left in Downloads folders, so
 * anything that grants access is worse than useless in it:
 *
 *   - `accounts.password` (the hash) and the OAuth `access_token` /
 *     `refresh_token` columns — a leaked bundle would otherwise hand over the
 *     user's Google and Microsoft calendars.
 *   - `sessions.token` — live session tokens.
 *   - `push_subscriptions.p256dh` / `auth` — the keys that let anyone push to
 *     that device. The endpoint URL is included so the user can see WHICH
 *     devices are registered, which is the part that is actually about them.
 *
 * Connected integrations appear as provider + status + timestamps, so the
 * export answers "what was linked to my account" without being a key ring.
 */

// One export is a full read of every table this user touches. Rate-limited
// separately from ordinary reads because it is the most expensive thing an
// authenticated caller can ask for.
const exportLimiter = createRateLimiter('userExport', { windowMs: 60 * 60 * 1000, max: 5 });

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = await exportLimiter.check(userId);
  if (limit.limited) {
    return rateLimitedResponse(
      limit.retryAfterMs,
      'You can export your data a few times an hour.',
    );
  }

  try {
    const db = getDatabase();
    const mine = <T extends { userId: unknown }>(table: T) =>
      eq(table.userId as never, userId);

    const [
      profile,
      taskRows,
      eventRows,
      recurrenceRows,
      calendarRows,
      docRows,
      goalRows,
      plannerRows,
      focusRows,
      achievementRows,
      coinRows,
      moodRows,
      pushRows,
      integrationRows,
      contactRows,
    ] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          emailVerified: users.emailVerified,
          image: users.image,
          timezone: users.timezone,
          userRole: users.userRole,
          coins: users.coins,
          dailyStreak: users.dailyStreak,
          bestDailyStreak: users.bestDailyStreak,
          sessionStreak: users.sessionStreak,
          bestSessionStreak: users.bestSessionStreak,
          consumables: users.consumables,
          ownedItems: users.ownedItems,
          notificationPreferences: users.notificationPreferences,
          customCategories: users.customCategories,
          onboardingCompletedAt: users.onboardingCompletedAt,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      db.select().from(tasks).where(mine(tasks)),
      db.select().from(events).where(mine(events)),
      db.select().from(eventRecurrence).where(mine(eventRecurrence)),
      db.select().from(calendars).where(mine(calendars)),
      db.select().from(docs).where(mine(docs)),
      db.select().from(goals).where(mine(goals)),
      db.select().from(plannerItems).where(mine(plannerItems)),
      db.select().from(focusSessions).where(mine(focusSessions)),
      db.select().from(achievements).where(mine(achievements)),
      db.select().from(coinTransactions).where(mine(coinTransactions)),
      db.select().from(moodLogs).where(mine(moodLogs)),
      // Endpoint only — never the keys that let a holder push to the device.
      db
        .select({
          id: pushSubscriptions.id,
          endpoint: pushSubscriptions.endpoint,
          userAgent: pushSubscriptions.userAgent,
          createdAt: pushSubscriptions.createdAt,
          lastUsedAt: pushSubscriptions.lastUsedAt,
        })
        .from(pushSubscriptions)
        .where(mine(pushSubscriptions)),
      // Provider + status only — never access/refresh tokens.
      db
        .select({
          id: integrations.id,
          provider: integrations.provider,
          status: integrations.status,
          scope: integrations.scope,
          tokenType: integrations.tokenType,
          lastSyncAt: integrations.lastSyncAt,
          createdAt: integrations.createdAt,
          updatedAt: integrations.updatedAt,
        })
        .from(integrations)
        .where(mine(integrations)),
      db.select().from(contactSubmissions).where(mine(contactSubmissions)),
    ]);

    // Goal targets hang off `goals`, not `users` — they are the one table here
    // with no `user_id` of its own. Scoped by the caller's goal ids IN THE
    // QUERY, not filtered afterwards: reading every user's targets and throwing
    // most away would be a cross-user read whatever the response ended up
    // containing.
    const goalIds = goalRows.map((g) => g.id);
    const targetRows = goalIds.length
      ? await db.select().from(goalTargets).where(inArray(goalTargets.goalId, goalIds))
      : [];

    const bundle = {
      exportedAt: new Date().toISOString(),
      format: 'lumina.export.v1',
      // Say what was withheld and why, in the file itself — otherwise the
      // absence reads as an incomplete export rather than a deliberate one.
      omitted: {
        credentials:
          'Password hashes, OAuth access/refresh tokens, session tokens and web-push ' +
          'encryption keys are excluded. They grant access to this account and to ' +
          'connected Google/Microsoft calendars, and are not portable data.',
      },
      profile: profile[0] ?? null,
      tasks: taskRows,
      events: eventRows,
      eventRecurrence: recurrenceRows,
      calendars: calendarRows,
      docs: docRows,
      goals: goalRows,
      goalTargets: targetRows,
      plannerItems: plannerRows,
      focusSessions: focusRows,
      achievements: achievementRows,
      coinTransactions: coinRows,
      moodLogs: moodRows,
      pushSubscriptions: pushRows,
      integrations: integrationRows,
      contactSubmissions: contactRows,
    };

    const filename = `lumina-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Belt and braces over the proxy's own header: this body is the single
        // most sensitive response the app produces.
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (err) {
    return apiError('GET /api/users/me/export', err, { userId });
  }
}
