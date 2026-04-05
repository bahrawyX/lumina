import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendPushToUser } from '@/lib/push/sendPushNotification';
import type { PushPayload } from '@/lib/push/sendPushNotification';

// POST — send a push notification to a user (self-only or cron-triggered)
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const notification = body?.notification as PushPayload | undefined;

  if (!notification?.title || !notification?.body) {
    return NextResponse.json(
      { error: 'Invalid notification payload' },
      { status: 400 },
    );
  }

  // Users can only send push to themselves (focus complete, etc.)
  await sendPushToUser(session.user.id, notification);

  return NextResponse.json({ ok: true });
}
