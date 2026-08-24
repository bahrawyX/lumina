import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession, haveIBeenPwned } from 'better-auth/plugins';
import { google, microsoft } from 'better-auth/social-providers';
import { db } from '@/lib/db';
import * as schema from '@/db/schema';

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
const microsoftClientSecret = process.env.MICROSOFT_CLIENT_SECRET;

const hasGoogleCredentials = Boolean(googleClientId && googleClientSecret);
const hasMicrosoftCredentials = Boolean(microsoftClientId && microsoftClientSecret);

if (!db) {
  throw new Error('DATABASE_URL is required for BetterAuth database sessions.');
}

if (!secret) {
  throw new Error('BETTER_AUTH_SECRET is required for BetterAuth.');
}

if (!baseURL) {
  throw new Error('BETTER_AUTH_URL is required for BetterAuth.');
}

const socialProviders = {
  // ── Google login: identity only (openid, email, profile) ──────────────────
  // Calendar scopes are requested separately via the explicit integration connect
  // flow (/api/integrations/google/connect). Never add calendar scopes here.
  ...(hasGoogleCredentials
    ? {
        google: google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }).options,
      }
    : {}),

  // ── Microsoft login: identity only ────────────────────────────────────────
  // Calendar scopes (Calendars.Read) are requested via /api/integrations/microsoft/connect.
  ...(hasMicrosoftCredentials
    ? {
        microsoft: microsoft({
          clientId: microsoftClientId,
          clientSecret: microsoftClientSecret,
        }).options,
      }
    : {}),
};

/**
 * Origins allowed to drive state-changing auth requests.
 *
 * `getTrustedOrigins` already pushes `new URL(baseURL).origin` unconditionally,
 * so listing `baseURL` here only added a duplicate — the effective allowlist was
 * exactly ONE origin, and `originCheckMiddleware` runs on `/**` for every
 * non-GET. That meant every `POST /api/auth/sign-in/email` from a preview
 * deployment (`lumina-<hash>-*.vercel.app`) was a hard `403 INVALID_ORIGIN`:
 * sign-in and sign-up were simply broken on every preview.
 *
 * `src/proxy.ts` already derives its self-host set from the incoming request to
 * avoid exactly this, but `/api/auth/*` is exempt there, so BetterAuth's
 * stricter check is the one that bit.
 *
 * Wildcards are supported (`trusted-origins.mjs:18-22`). This widens CSRF trust
 * to anything matching, so the patterns are kept as tight as the real
 * deployment topology allows — Vercel owns `*.vercel.app` and only our project's
 * deployments carry the `lumina-` prefix.
 */
const trustedOrigins = [
  baseURL,
  'https://lumina-*.vercel.app',
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
];

export const auth = betterAuth({
  secret,
  baseURL,
  trustedOrigins,

  // NOTE: there is deliberately no `cookies` block here.
  //
  // This config used to carry:
  //
  //     cookies: { sessionToken: { options: { sameSite: 'none', secure: true } } }
  //
  // which was a **no-op**. BetterAuth reads cookie attributes only from
  // `options.advanced.cookies.session_token.attributes` — all three levels were
  // wrong (`cookies` vs `advanced.cookies`, `sessionToken` vs `session_token`,
  // `options` vs `attributes`) and it compiled because `betterAuth` is
  // generically typed, so no excess-property check fired. Verified against
  // `node_modules/better-auth/dist/cookies/index.mjs:26-28`.
  //
  // The effective production cookie is `httpOnly`, `sameSite: 'lax'`, `secure`,
  // `__Secure-` prefixed — i.e. SAFER than the code claimed. It is deleted
  // rather than relocated: `SameSite=Lax` is sufficient for the popup OAuth
  // flow, because the provider callback is a top-level navigation, which Lax
  // permits. Moving the block under `advanced` would actually ship
  // `SameSite=None` and materially weaken the app in the name of a bug fix.

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: true,
  }),

  advanced: {
    database: {
      generateId: 'uuid',
    },
    // `getIp` reads only `x-forwarded-for` by default, and with no trusted
    // proxies configured `getIPFromHeader` returns null for a multi-value XFF
    // chain — at which point the rate limiter keys every request in the world on
    // the literal string "no-trusted-ip", i.e. one global 3-per-10s bucket and a
    // one-request login outage. Vercel's own single-value header is listed
    // first so the chain case cannot arise.
    ipAddress: {
      ipAddressHeaders: ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'],
    },
  },

  /**
   * F3.1 - the brute-force limiter looked like it worked and did not.
   *
   * BetterAuth's limiter IS enabled by default in production, with a built-in
   * rule of 3 requests / 10s on any path starting /sign-in, /sign-up,
   * /change-password or /change-email. Fired SEQUENTIALLY against production it
   * behaved perfectly - 401, 401, 401, then 429s with x-retry-after. It would
   * pass any manual test.
   *
   * Fired CONCURRENTLY, 16 attempts against the same account produced:
   *
   *     401 x15, 429 x1     -- fifteen of sixteen passwords were processed
   *
   * because the default storage is `memory`: a module-scope Map, one per lambda.
   * Every concurrent request got a fresh instance with its own counter, and a
   * cold start reset it. The effective ceiling was 3 per 10s PER INSTANCE, and
   * it scaled with the attacker's concurrency. Combined with an 8-character
   * minimum, no breach check and a working enumeration oracle to build the
   * target list, that was a viable credential-stuffing path.
   *
   * `storage: 'database'` moves the counter to the one place every instance
   * shares. The table is `rate_limits` (src/db/schema/rateLimits.ts) - BetterAuth
   * will NOT create it, which is why it is modelled in Drizzle and shipped in
   * the migration baseline.
   */
  rateLimit: {
    enabled: true,
    storage: 'database',
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 3600, max: 3 },
      '/request-password-reset': { window: 3600, max: 3 },
      '/reset-password': { window: 3600, max: 5 },
      '/change-password': { window: 3600, max: 5 },
      '/change-email': { window: 3600, max: 3 },
    },
  },

  /**
   * `/list-sessions` hands the caller EVERY active session for their account,
   * each including its raw `token`, from a same-origin endpoint readable by
   * JavaScript. Nothing in this app calls it, so it is turned off entirely
   * rather than left as an XSS amplifier.
   */
  disabledPaths: ['/list-sessions'],

  /**
   * Session lifecycle, previously entirely defaulted and therefore invisible.
   * These are the values that were already in effect, now written down so a
   * change is a decision rather than an accident.
   */
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // rolling: refreshed at most once a day
    freshAge: 60 * 60 * 24, // "fresh" window for sensitive operations
  },

  emailAndPassword: {
    enabled: true,

    /**
     * F3.2 — sign-up was a user-enumeration oracle.
     *
     * BetterAuth guards this with
     * `shouldReturnGenericDuplicateResponse = requireEmailVerification || autoSignIn === false`.
     * With `autoSignIn: true` and no verification the flag was `false`, so an
     * existing address threw the explicit `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`
     * error — and threw it *before* `password.hash()`, while the generic branch
     * hashes specifically to equalise timing. Reproduced against production:
     * 422 in 319 ms for an existing address versus 401 in 698 ms for a
     * nonexistent one on sign-in. An explicit error code AND a 2x timing tell.
     *
     * `autoSignIn: false` flips the flag, so sign-up now returns the same
     * synthetic-user response either way. The client compensates by issuing an
     * explicit `signIn.email` immediately after a successful sign-up, so the
     * user-visible flow is unchanged.
     */
    autoSignIn: false,

    /**
     * F3.3 — the effective minimum was BetterAuth's default of 8 and there was
     * no strength or breach check anywhere in the codebase, so `password1` was
     * an acceptable password.
     */
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },

  account: {
    /**
     * P1-6 — `accounts.access_token` / `refresh_token` were bare `text`
     * columns. Any database read (a backup, a Neon snapshot, a leaked
     * DATABASE_URL) yielded long-lived provider credentials for every user.
     * BetterAuth's encryption is opt-in and was never enabled.
     */
    encryptOAuthTokens: true,

    accountLinking: {
      enabled: true,
      /**
       * P1-7 — account takeover via unverified email.
       *
       * BetterAuth's implicit linker links a social account into an existing
       * same-email user whenever the provider asserts a verified email, and
       * Google always asserts `email_verified: true`. With no email
       * verification on the password side, the attack was: register
       * `victim@gmail.com` with a password; the victim later signs in with
       * Google; Google's identity is linked into the ATTACKER's pre-existing
       * account, and the attacker keeps password access to all of the victim's
       * docs, tasks, calendar and connected integrations.
       *
       * Implicit linking is off until the local email has actually been
       * verified. Users who want both sign-in methods link them deliberately
       * from a signed-in session.
       */
      disableImplicitLinking: true,
    },
  },

  socialProviders,

  plugins: [
    /**
     * P1-5 — the session token was handed out in a JSON response body.
     *
     * Confirmed live: `GET /api/auth/session` returned
     * `{"session":{"token":"ijiGiQ1Rs...", ...}}`. `parseSessionOutput` only
     * strips fields explicitly declared `returned: false`, and `token` is a
     * core field, so nothing removed it.
     *
     * The cookie being httpOnly is the right call, but it is pointless while
     * the token is readable by JavaScript from a same-origin endpoint: any XSS
     * or compromised dependency does `fetch('/api/auth/session')` and replays
     * the token for its full 7-day lifetime.
     *
     * Nothing in this app reads `session.token` client-side.
     */
    customSession(async ({ user, session }) => ({
      user,
      session: { ...session, token: undefined as unknown as string },
    })),

    /**
     * F3.3 — reject passwords known to have appeared in a breach, via the
     * k-anonymity range API (only a 5-character SHA-1 prefix leaves the
     * server; the password never does).
     *
     * Caveat worth knowing: BetterAuth's implementation has no fail-open, so if
     * `api.pwnedpasswords.com` is unreachable, the affected paths (sign-up,
     * change-password, reset-password) return 500 rather than proceeding. Sign
     * -IN is unaffected, so an outage degrades registration rather than access.
     */
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        'This password has appeared in a data breach. Please choose a different one.',
    }),
  ],
});
