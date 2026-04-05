import 'server-only';
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { pushSubscriptions } from '@/db/schema';

// ── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'daily_brief'
  | 'event_reminder'
  | 'streak_risk'
  | 'task_due'
  | 'focus_complete';

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  notificationType: NotificationType;
  actions?: { action: string; title: string }[];
  requireInteraction?: boolean;
  renotify?: boolean;
}

// ── VAPID setup ──────────────────────────────────────────────────────────────

const vapidSubject = process.env.VAPID_SUBJECT;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    console.warn('[Push] VAPID keys not configured — skipping push notifications');
    return false;
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  vapidConfigured = true;
  return true;
}

// ── Send to a single user ────────────────────────────────────────────────────

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapid()) return;

  const db = getDatabase();
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        // Update last_used_at
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired — remove from DB
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          console.log(`[Push] Removed expired subscription ${sub.id}`);
        } else if (statusCode === 429) {
          console.warn(`[Push] Rate limited for subscription ${sub.id}`);
        } else {
          console.error(`[Push] Failed to send to ${sub.id}:`, err);
        }
      }
    }),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[Push] ${failed}/${subs.length} sends failed for user ${userId}`);
  }
}
