/**
 * F3.4 / F3.6 / F3.5 — account recovery.
 *
 * `/request-password-reset` threw `400 RESET_PASSWORD_DISABLED` before doing
 * anything, because `emailAndPassword.sendResetPassword` was unset. And with no
 * verification flow, `emailVerified` stayed false forever — which, given
 * BetterAuth's linker defaults `requireLocalEmailVerified: true`, permanently
 * locked password users out of Google sign-in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => ({ id: 'drizzle-stub' }),
}));

const captured: { options?: Record<string, unknown> } = {};
vi.mock('better-auth', () => ({
  betterAuth: (options: Record<string, unknown>) => {
    captured.options = options;
    return { options };
  },
}));

process.env.BETTER_AUTH_SECRET ||= 'test-secret-at-least-32-chars-long-xxxx';
process.env.BETTER_AUTH_URL ||= 'https://lumina.example';

/**
 * A loose view of the captured BetterAuth options.
 *
 * The object is deeply heterogeneous and each assertion below narrows to the
 * single value it cares about, so a precise type would be pure ceremony. The
 * `any` is scoped to this one alias rather than sprayed across the file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CapturedOptions = Record<string, any>;

async function options(): Promise<CapturedOptions> {
  await import('@/lib/auth');
  if (!captured.options) throw new Error('betterAuth() was never called');
  return captured.options as CapturedOptions;
}

describe('F3.6 — a password reset path exists', () => {
  it('sendResetPassword is wired, so /request-password-reset no longer 400s', async () => {
    const o = await options();
    expect(typeof o.emailAndPassword.sendResetPassword).toBe('function');
  });

  it('a reset revokes other sessions', async () => {
    // Defaults to false, which leaves every stolen session alive — the exact
    // thing the user is resetting to stop.
    const o = await options();
    expect(o.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
  });
});

describe('F3.4 — an email-verification flow exists', () => {
  it('sendVerificationEmail is wired', async () => {
    const o = await options();
    expect(typeof o.emailVerification.sendVerificationEmail).toBe('function');
  });

  it('verification signs the user in afterwards rather than dead-ending them', async () => {
    const o = await options();
    expect(o.emailVerification.autoSignInAfterVerification).toBe(true);
  });

  it('requireEmailVerification tracks whether mail actually works', async () => {
    // Turning verification on without a provider would make registration
    // impossible, so it is gated on `isEmailConfigured()`. In this test
    // environment no provider is set, so it must be false — an unconfigured
    // deployment degrades to the previous behaviour rather than locking
    // everyone out.
    const o = await options();
    expect(o.emailAndPassword.requireEmailVerification).toBe(false);
  });
});

describe('F3.5 — the sign-in form no longer fights password managers', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'components', 'auth', 'EmailAuthForm.tsx'),
    'utf8',
  );

  it('uses current-password in sign-in mode', () => {
    // Was hard-coded to "new-password" in BOTH modes, forcing every returning
    // user to hand-type their password. F2.1 moved the field into the shared
    // form, where `authMode` is simply `mode`.
    expect(source).toContain("autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}");
  });

  it('drops the password-manager blockers', () => {
    // Match the ATTRIBUTE form, not the bare word — the comment explaining why
    // they were removed legitimately names them.
    expect(source).not.toContain('data-lpignore="true"');
    expect(source).not.toContain('data-1p-ignore="true"');
    expect(source).not.toContain('name="auth-password-no-autofill"');
  });

  it('links to the reset flow, so it is reachable', () => {
    // The link is page chrome — it belongs to `/auth/signin`, which passes it
    // to the shared form as `belowFields`. Onboarding deliberately does not
    // show it: you cannot reset a password you have not created yet.
    const page = readFileSync(
      join(process.cwd(), 'src', 'app', 'auth', 'signin', 'page.tsx'),
      'utf8',
    );
    expect(page).toContain('/auth/forgot-password');
    expect(page).toContain('belowFields=');
  });
});

describe('email sender — never throws, reports honestly', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it('reports not-configured rather than pretending to send', async () => {
    const { isEmailConfigured, sendMail } = await import('@/lib/email/send');
    expect(isEmailConfigured()).toBe(false);
    await expect(
      sendMail({ to: 'a@b.com', subject: 's', text: 't' }),
    ).resolves.toBe(false);
  });

  it('reports configured once both env vars are present', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key');
    vi.stubEnv('EMAIL_FROM', 'Lumina <no-reply@lumina.example>');
    const { isEmailConfigured } = await import('@/lib/email/send');
    expect(isEmailConfigured()).toBe(true);
  });

  it('returns false instead of throwing when the provider rejects', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key');
    vi.stubEnv('EMAIL_FROM', 'Lumina <no-reply@lumina.example>');
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 422 })) as never;

    const { sendMail } = await import('@/lib/email/send');
    // A mail failure must not take down the auth route that triggered it.
    await expect(sendMail({ to: 'a@b.com', subject: 's', text: 't' })).resolves.toBe(false);
  });

  it('returns false instead of throwing when the request rejects', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key');
    vi.stubEnv('EMAIL_FROM', 'Lumina <no-reply@lumina.example>');
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('offline');
    }) as never;

    const { sendMail } = await import('@/lib/email/send');
    await expect(sendMail({ to: 'a@b.com', subject: 's', text: 't' })).resolves.toBe(false);
  });

  it('sends the message on success', async () => {
    vi.stubEnv('RESEND_API_KEY', 'key');
    vi.stubEnv('EMAIL_FROM', 'Lumina <no-reply@lumina.example>');
    let sentBody: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response('{"id":"1"}', { status: 200 });
    }) as never;

    const { sendPasswordResetMail } = await import('@/lib/email/send');
    await expect(
      sendPasswordResetMail('user@example.com', 'https://lumina.example/reset?token=abc', 'Ada'),
    ).resolves.toBe(true);

    expect(sentBody.to).toEqual(['user@example.com']);
    expect(String(sentBody.subject)).toContain('Reset');
    // The link must actually be in the body, or the email is useless.
    expect(String(sentBody.text)).toContain('https://lumina.example/reset?token=abc');
  });
});
