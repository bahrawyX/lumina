import { z } from 'zod';
import type { NotificationType } from './sendPushNotification';

/**
 * Validation for `/api/push/*`.
 *
 * ## P1-14 — `subscribe` accepted ANY string as `endpoint`
 *
 * `webpush.sendNotification` then POSTs **from our server** to whatever was
 * registered — `http://169.254.169.254/…` (the cloud metadata endpoint), an
 * internal host, an attacker's collector. That is a server-side request forgery
 * primitive, and it is triggered later, by cron, from our own infrastructure.
 *
 * The defence is an allowlist of the hosts that actually operate push services.
 * There are only four families, they are stable, and a subscription endpoint
 * outside them cannot be a real push subscription.
 *
 * ## P1-14 — `send` validated only `title` and `body` for truthiness
 *
 * `url`, `tag`, `notificationType`, `actions`, `requireInteraction` and
 * `renotify` were cast (`as PushPayload`) and passed straight through to the
 * push service with no length cap — payloads over ~4 KB are rejected by push
 * services with an unhandled error, and one account could pump unlimited
 * notifications through FCM under our VAPID identity and get the application
 * server key throttled for every user.
 *
 * `url` is restricted to a **relative path**. Combined with the service-worker
 * fix, that closes the one-click-redirect-out-of-the-PWA hazard: `sw.js` passed
 * `data.url` to `client.navigate()` / `openWindow()` with no scheme or origin
 * check at all.
 */

/** Hosts that operate real Web Push services. */
const ALLOWED_PUSH_HOST_SUFFIXES = [
  // Chrome / Chromium — FCM.
  '.googleapis.com',
  '.google.com',
  // Firefox — Mozilla autopush.
  '.mozilla.com',
  '.mozaws.net',
  '.services.mozilla.com',
  // Edge — Windows Notification Service. Real WNS endpoints look like
  // `https://wns2-by3p.notify.windows.com/w/?token=...`, so `.windows.com` is
  // the one that matters; `.windows.net` covers the older Azure-hosted form.
  '.notify.windows.com',
  '.windows.com',
  '.windows.net',
  '.microsoft.com',
  // Safari — Apple Push Notification service.
  '.apple.com',
  '.push.apple.com',
] as const;

/**
 * True when `endpoint` is a plausible push endpoint: https, a hostname under a
 * known push provider, no credentials, and a default port.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  // https only. `http://169.254.169.254/latest/meta-data/` is the shape this
  // exists to reject.
  if (url.protocol !== 'https:') return false;
  // Credentials in a URL are never legitimate here and confuse host parsing.
  if (url.username || url.password) return false;
  // A non-default port is not something a real push service uses, and is a
  // common way to reach an internal service.
  if (url.port && url.port !== '443') return false;

  const host = url.hostname.toLowerCase();
  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length,
  );
}

/** Web Push subscriptions carry base64url-encoded keys. */
const base64Url = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+=*$/, 'must be base64url');

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .min(1)
    .max(2048)
    .refine(isAllowedPushEndpoint, 'endpoint is not a recognised push service'),
  keys: z.object({
    p256dh: base64Url,
    auth: base64Url,
  }),
});

/**
 * Notification types the app actually sends. An open string here would let a
 * caller drive whatever branching the client does on this field.
 *
 * These MUST match the `NotificationType` union in `sendPushNotification.ts` —
 * the `satisfies` below is what enforces it. Getting this wrong silently
 * rejects legitimate notifications, which is a worse failure than the
 * validation gap it closes.
 */
export const NOTIFICATION_TYPES = [
  'daily_brief',
  'event_reminder',
  'streak_risk',
  'task_due',
  'focus_complete',
] as const satisfies readonly NotificationType[];

export const pushPayloadSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(300),
  /**
   * Relative paths only — `/plan`, `/tasks?new=1`. Never an absolute URL and
   * never protocol-relative (`//evil.com`), which browsers resolve to another
   * origin.
   */
  url: z
    .string()
    .max(512)
    .regex(/^\/(?!\/)/, 'url must be a relative path')
    .optional(),
  tag: z.string().max(64).optional(),
  notificationType: z.enum(NOTIFICATION_TYPES).optional(),
  actions: z
    .array(
      z.object({
        action: z.string().min(1).max(32),
        title: z.string().min(1).max(48),
      }),
    )
    // Browsers render at most two action buttons.
    .max(2)
    .optional(),
  requireInteraction: z.boolean().optional(),
  renotify: z.boolean().optional(),
});

export type ValidatedPushPayload = z.infer<typeof pushPayloadSchema>;

/**
 * Push services reject payloads over ~4 KB with an error the caller never sees.
 * Rejecting at 3 KB leaves headroom for the encryption overhead.
 */
export const MAX_PUSH_PAYLOAD_BYTES = 3 * 1024;

/** Cap on how many devices one account may register. */
export const MAX_SUBSCRIPTIONS_PER_USER = 20;
