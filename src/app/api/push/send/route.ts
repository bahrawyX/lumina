import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendPushToUser } from '@/lib/push/sendPushNotification';
import type { PushPayload } from '@/lib/push/sendPushNotification';
import { MAX_PUSH_PAYLOAD_BYTES, pushPayloadSchema } from '@/lib/push/validation';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

/**
 * P1-14: there was NO rate limit here at all, so one account could pump
 * unlimited notifications through FCM under our VAPID identity and get the
 * application server key throttled for every user of the app.
 */
const sendLimiter = createRateLimiter('pushSend', { windowMs: 60_000, max: 10 });
const sendDailyLimiter = createRateLimiter('pushSendDaily', {
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
});

/** POST — send a push notification to the caller's own devices. */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const perMinute = await sendLimiter.check(userId);
  if (perMinute.limited) return rateLimitedResponse(perMinute.retryAfterMs);
  const perDay = await sendDailyLimiter.check(userId);
  if (perDay.limited) return rateLimitedResponse(perDay.retryAfterMs);

  // P1-14: `req.json()` was not wrapped, unlike every other body-reading route,
  // so a malformed body was an unhandled 500.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = (body as { notification?: unknown } | null)?.notification;

  // Push services reject payloads over ~4 KB with an error the caller never
  // sees. Check before validating so an enormous body is cheap to refuse.
  if (raw !== undefined) {
    const size = new TextEncoder().encode(JSON.stringify(raw)).length;
    if (size > MAX_PUSH_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Notification payload too large' }, { status: 413 });
    }
  }

  // P1-14: previously only `title` and `body` were checked for truthiness;
  // `url`, `tag`, `notificationType`, `actions`, `requireInteraction` and
  // `renotify` were cast (`as PushPayload`) and passed straight through.
  const parsed = pushPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid notification payload' },
      { status: 400 },
    );
  }

  try {
    // Self-only: the caller's id, never one from the body.
    await sendPushToUser(userId, parsed.data as PushPayload);
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/push/send', userId }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
