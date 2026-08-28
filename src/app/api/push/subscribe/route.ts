import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { pushSubscriptions } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import {
  MAX_SUBSCRIPTIONS_PER_USER,
  pushSubscriptionSchema,
} from '@/lib/push/validation';
import { apiError } from '@/lib/logger';

/**
 * POST — register this device for push notifications.
 *
 * P1-14: this accepted **any string** as `endpoint`. `webpush.sendNotification`
 * then POSTs from our server to whatever was registered —
 * `http://169.254.169.254/…`, an internal host, an attacker's collector —
 * triggered later by cron. That is a server-side request forgery primitive.
 * `pushSubscriptionSchema` now allowlists the four real push-service host
 * families and requires https on the default port.
 */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // Was unwrapped, unlike every other body-reading route, so a malformed body
  // was an unhandled 500.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = pushSubscriptionSchema.safeParse(
    (body as { subscription?: unknown } | null)?.subscription,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid subscription object' },
      { status: 400 },
    );
  }
  const subscription = parsed.data;

  const db = getDatabase();
  const userAgent = req.headers.get('user-agent')?.slice(0, 512) ?? null;

  try {
    // P2-5: this was a select-then-insert against
    // `idx_push_subscriptions_user_endpoint` with no try/catch at all, so two
    // concurrent registrations of the same device raced into an unhandled
    // 23505. One upsert has no window to race in.
    const [existing] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, subscription.endpoint),
        ),
      )
      .limit(1);

    if (!existing) {
      // P1-14: there was no cap on subscriptions per user, so an account could
      // accumulate rows unboundedly — each one an endpoint our cron will POST
      // to on a schedule.
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));

      if (Number(count) >= MAX_SUBSCRIPTIONS_PER_USER) {
        return NextResponse.json(
          { error: 'Too many registered devices' },
          { status: 409 },
        );
      }
    }

    await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
        set: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent,
          lastUsedAt: new Date(),
        },
      });
  } catch (err) {
    return apiError('POST /api/push/subscribe', err, { userId });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE — unregister this device. */
export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, session.user.id),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
  } catch (err) {
    return apiError('DELETE /api/push/subscribe', err);
  }

  return NextResponse.json({ ok: true });
}
