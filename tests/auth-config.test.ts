/**
 * Auth configuration hardening — F3.2, F3.3, P1-5, P1-7, P1-8/F5.8, F5.7, F5.10.
 *
 * These assert the *options object* BetterAuth was constructed with, because
 * that is where each of these defects lived: a value that was silently
 * defaulted, or one that was written in a shape the library never reads.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => ({ id: 'drizzle-stub' }),
}));

// Capture the options object rather than standing up a real auth instance.
const captured: { options?: Record<string, unknown> } = {};
vi.mock('better-auth', () => ({
  betterAuth: (options: Record<string, unknown>) => {
    captured.options = options;
    return { options };
  },
}));

process.env.BETTER_AUTH_SECRET ||= 'test-secret-at-least-32-chars-long-xxxx';
process.env.BETTER_AUTH_URL ||= 'https://lumina.example';

async function options(): Promise<Record<string, any>> {
  await import('@/lib/auth');
  if (!captured.options) throw new Error('betterAuth() was never called');
  return captured.options;
}

describe('P1-8 / F5.8 — the no-op `cookies` block is gone, not relocated', () => {
  it('has no top-level `cookies` key', async () => {
    // BetterAuth reads cookie attributes only from
    // `advanced.cookies.session_token.attributes`. The old top-level
    // `cookies.sessionToken.options` matched nothing and was silently
    // discarded — it compiled because `betterAuth` is generically typed.
    expect(await options().then((o) => o.cookies)).toBeUndefined();
  });

  it('does NOT relocate it to advanced.cookies with SameSite=None', async () => {
    // The hazard was someone "fixing" the placement and actually shipping
    // SameSite=None, which would materially weaken the app. The effective
    // default (Lax + Secure + httpOnly + __Secure-) is already correct and
    // sufficient for the popup OAuth flow.
    const o = await options();
    expect(o.advanced?.cookies).toBeUndefined();
  });
});

describe('F3.2 — sign-up is no longer a user-enumeration oracle', () => {
  it('autoSignIn is false, which flips the generic-duplicate-response flag', async () => {
    // shouldReturnGenericDuplicateResponse =
    //   requireEmailVerification || autoSignIn === false
    const o = await options();
    expect(o.emailAndPassword.autoSignIn).toBe(false);
  });
});

describe('F3.3 — password policy', () => {
  it('requires at least 12 characters', async () => {
    expect((await options()).emailAndPassword.minPasswordLength).toBe(12);
  });

  it('caps length so a huge body cannot be used as a scrypt DoS', async () => {
    expect((await options()).emailAndPassword.maxPasswordLength).toBe(128);
  });

  it('installs the breach check', async () => {
    const o = await options();
    const ids = (o.plugins as Array<{ id?: string }>).map((p) => p?.id);
    expect(ids).toContain('have-i-been-pwned');
  });
});

describe('P1-5 — the session token is not readable by JavaScript', () => {
  it('installs customSession to strip it from the get-session body', async () => {
    const o = await options();
    const ids = (o.plugins as Array<{ id?: string }>).map((p) => p?.id);
    expect(ids).toContain('custom-session');
  });

  it('disables /list-sessions, which returned every token at once', async () => {
    expect((await options()).disabledPaths).toContain('/list-sessions');
  });
});

describe('P1-7 — implicit account linking is off', () => {
  it('disableImplicitLinking is true', async () => {
    // Otherwise: attacker registers victim@gmail.com with a password (landing
    // email_verified=false), the victim later signs in with Google, Google's
    // identity is linked into the ATTACKER's account, and the attacker keeps
    // password access to everything.
    const o = await options();
    expect(o.account.accountLinking.disableImplicitLinking).toBe(true);
  });
});

describe('P1-6 — provider tokens on the login side are encrypted at rest', () => {
  it('encryptOAuthTokens is enabled', async () => {
    expect((await options()).account.encryptOAuthTokens).toBe(true);
  });
});

describe('F5.7 — preview deployments can authenticate', () => {
  it('trusts the wildcard preview origin, not just baseURL', async () => {
    const o = await options();
    expect(o.trustedOrigins).toContain('https://lumina-*.vercel.app');
  });
});

describe('F5.10 — session lifecycle is explicit', () => {
  it('declares expiresIn, updateAge and freshAge rather than defaulting them', async () => {
    const o = await options();
    expect(o.session.expiresIn).toBe(60 * 60 * 24 * 7);
    expect(o.session.updateAge).toBe(60 * 60 * 24);
    expect(o.session.freshAge).toBe(60 * 60 * 24);
  });
});

describe('F3.1 — the rate limiter keys on a trusted client IP', () => {
  it('lists Vercel single-value headers before the multi-value XFF chain', async () => {
    // getIPFromHeader returns null for a multi-value x-forwarded-for chain when
    // no trusted proxies are configured, at which point the limiter keys every
    // request in the world on the literal string "no-trusted-ip" — one global
    // 3-per-10s bucket, i.e. a one-request global login outage.
    const o = await options();
    expect(o.advanced.ipAddress.ipAddressHeaders[0]).toBe('x-vercel-forwarded-for');
  });
});
