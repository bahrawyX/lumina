/**
 * P1-14 — `/api/push/*` accepted arbitrary payloads and arbitrary endpoints.
 *
 * `subscribe` accepted **any string** as `endpoint`, and
 * `webpush.sendNotification` then POSTs from our server to whatever was
 * registered — triggered later, by cron, from our own infrastructure. That is a
 * server-side request forgery primitive.
 *
 * `send` validated only `title` and `body` for truthiness; `url`, `tag`,
 * `notificationType`, `actions`, `requireInteraction` and `renotify` were cast
 * (`as PushPayload`) and passed straight through, with no length cap and no
 * rate limit at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_PUSH_PAYLOAD_BYTES,
  MAX_SUBSCRIPTIONS_PER_USER,
  isAllowedPushEndpoint,
  pushPayloadSchema,
  pushSubscriptionSchema,
} from '@/lib/push/validation';

describe('P1-14 — the SSRF surface: which endpoints may be registered', () => {
  it('accepts the real push services', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc123',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://wns2-by3p.notify.windows.com/w/?token=abc',
      'https://web.push.apple.com/QK9v...',
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it('rejects the cloud metadata endpoint — the canonical SSRF target', () => {
    expect(isAllowedPushEndpoint('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('rejects internal and loopback hosts', () => {
    for (const endpoint of [
      'http://localhost:3000/collect',
      'https://127.0.0.1/collect',
      'https://10.0.0.5/internal',
      'https://internal-service.svc.cluster.local/x',
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it("rejects an attacker's collector", () => {
    expect(isAllowedPushEndpoint('https://evil.example/collect')).toBe(false);
  });

  it('rejects http even on an allowed host', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
  });

  it('rejects a non-default port on an allowed host', () => {
    // A real push service never does this, and it is a common way to reach an
    // internal service that happens to share a domain.
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8080/fcm/send/abc')).toBe(false);
  });

  it('rejects credentials in the URL, which confuse host parsing', () => {
    expect(isAllowedPushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/a')).toBe(false);
  });

  it('rejects a suffix-lookalike domain', () => {
    // `evil-googleapis.com` must not pass a naive `endsWith('googleapis.com')`.
    expect(isAllowedPushEndpoint('https://evilgoogleapis.com/fcm/send/a')).toBe(false);
    // And the bare suffix itself is not a host.
    expect(isAllowedPushEndpoint('https://.googleapis.com/x')).toBe(false);
  });

  it('rejects junk that is not a URL at all', () => {
    expect(isAllowedPushEndpoint('not a url')).toBe(false);
    expect(isAllowedPushEndpoint('')).toBe(false);
  });
});

describe('P1-14 — the subscription object as a whole', () => {
  const valid = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkQ', auth: 'tBHItJI5svbpez7KI4CC' },
  };

  it('accepts a well-formed subscription', () => {
    expect(pushSubscriptionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a hostile endpoint even with valid keys', () => {
    const result = pushSubscriptionSchema.safeParse({
      ...valid,
      endpoint: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(result.success).toBe(false);
  });

  it('rejects keys that are not base64url', () => {
    expect(
      pushSubscriptionSchema.safeParse({ ...valid, keys: { ...valid.keys, auth: '../../etc' } })
        .success,
    ).toBe(false);
  });

  it('caps devices per account', () => {
    expect(MAX_SUBSCRIPTIONS_PER_USER).toBeGreaterThan(0);
    expect(MAX_SUBSCRIPTIONS_PER_USER).toBeLessThanOrEqual(50);
  });
});

describe('P1-14 — the notification payload', () => {
  const valid = { title: 'Focus complete', body: 'Nice work.' };

  it('accepts a minimal payload', () => {
    expect(pushPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an absolute url — the one-click-redirect hazard', () => {
    // `sw.js` passed `data.url` to client.navigate()/openWindow() with no
    // scheme or origin check.
    for (const url of ['https://evil.example/', 'javascript:alert(1)', '//evil.example']) {
      expect(pushPayloadSchema.safeParse({ ...valid, url }).success, url).toBe(false);
    }
  });

  it('accepts a relative path', () => {
    expect(pushPayloadSchema.safeParse({ ...valid, url: '/plan?day=today' }).success).toBe(true);
  });

  it('rejects an unknown notificationType', () => {
    expect(
      pushPayloadSchema.safeParse({ ...valid, notificationType: 'anything_i_like' }).success,
    ).toBe(false);
  });

  it('accepts EVERY type the app actually sends', () => {
    // A too-strict enum silently rejects legitimate notifications, which is a
    // worse failure than the validation gap it closes. The first draft of this
    // list invented `streak_reminder` / `task_reminder`; the real union uses
    // `streak_risk` / `task_due`.
    for (const notificationType of [
      'daily_brief',
      'event_reminder',
      'streak_risk',
      'task_due',
      'focus_complete',
    ]) {
      expect(
        pushPayloadSchema.safeParse({ ...valid, notificationType }).success,
        notificationType,
      ).toBe(true);
    }
  });

  it('bounds title and body length', () => {
    expect(pushPayloadSchema.safeParse({ ...valid, title: 'x'.repeat(500) }).success).toBe(false);
    expect(pushPayloadSchema.safeParse({ ...valid, body: 'x'.repeat(5000) }).success).toBe(false);
  });

  it('caps actions at the two a browser will render', () => {
    const action = { action: 'a', title: 'A' };
    expect(
      pushPayloadSchema.safeParse({ ...valid, actions: [action, action, action] }).success,
    ).toBe(false);
  });

  it('declares a payload ceiling below the ~4 KB push services enforce', () => {
    expect(MAX_PUSH_PAYLOAD_BYTES).toBeLessThan(4096);
  });
});

describe('P1-14 — the service worker no longer navigates anywhere', () => {
  const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

  it('resolves the target against our own origin and compares origins', () => {
    expect(sw).toContain('new URL(event.notification.data?.url');
    expect(sw).toContain('parsed.origin === self.location.origin');
  });

  it('no longer uses a substring match to decide same-origin', () => {
    // `client.url.includes(self.location.origin)` is a SUBSTRING test, so
    // `https://evil.com/?x=https://lumina.app` satisfied it — and it checked
    // the EXISTING client's URL, never the target.
    expect(sw).not.toContain('client.url.includes(self.location.origin)');
  });
});

describe('P1-14 — the routes parse bodies defensively', () => {
  for (const route of [
    ['send', join('src', 'app', 'api', 'push', 'send', 'route.ts')],
    ['subscribe', join('src', 'app', 'api', 'push', 'subscribe', 'route.ts')],
    ['notification-preferences', join('src', 'app', 'api', 'users', 'notification-preferences', 'route.ts')],
  ] as const) {
    it(`${route[0]} wraps req.json() so a malformed body is a 400, not a 500`, () => {
      const src = readFileSync(join(process.cwd(), route[1]), 'utf8');
      expect(src).toContain('Invalid JSON');
      expect(src).not.toMatch(/^\s*const body = await req\.json\(\);\s*$/m);
    });
  }

  it('send is rate limited, which it previously was not at all', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'push', 'send', 'route.ts'),
      'utf8',
    );
    expect(src).toContain('createRateLimiter');
  });
});
