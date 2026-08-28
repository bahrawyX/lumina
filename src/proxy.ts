import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge proxy — two independent concerns, both of which must run before any
 * route handler or page is reached.
 *
 * (Next.js 16 "proxy" convention — formerly `middleware.ts`.)
 *
 * ── 1. CSRF defence on `/api/*` ───────────────────────────────────────────
 * An Origin/Referer allowlist on state-changing API requests. A cross-site
 * `text/plain` POST is a "simple request" that doesn't preflight, and route
 * handlers parse the body with `req.json()` regardless of content-type — so
 * without this check a logged-in victim visiting a hostile page could have
 * POSTs driven on their behalf. This lives in the proxy, not in per-route
 * helpers, so a newly-added route can't forget it.
 *
 * The session cookie is `SameSite=Lax`, `Secure`, `httpOnly` and `__Secure-`
 * prefixed. Lax already blocks the cross-site *sub-resource* POST, so this
 * check is defence-in-depth rather than the only line — but it is the line
 * that also covers non-browser clients and any future cookie change.
 *
 * Only mutating methods are checked; GET/HEAD/OPTIONS pass untouched — which is
 * why the OAuth callback + connect routes (all GET) are never affected here.
 *
 * Two prefixes are exempt because they are NOT authenticated by the session
 * cookie (so they are not cookie-CSRF-able) and are legitimately called without
 * a browser Origin:
 *   - /api/auth/*  — BetterAuth enforces its own CSRF via `trustedOrigins`.
 *   - /api/cron/*  — shared-secret (cronAuth); server-to-server, no Origin.
 *
 * ── 2. Signed-in redirect off the marketing page ──────────────────────────
 * `/` used to gate the entire landing page behind a client-side session fetch
 * purely to bounce signed-in users to /calendar. That made the prerendered
 * marketing HTML a single wordmark. The bounce now happens here, from the
 * session cookie, before any HTML is produced.
 *
 * -- 3. Route protection on the authenticated app --
 * Before this existed there was NO route protection anywhere in the product.
 * `AppShell` referenced no session at all; the only gate was
 * `onboardingCompleted`, read from localStorage. So anyone whose session had
 * expired - or who had ever used guest mode - sat inside the full application,
 * signed out, indefinitely: every API call 401'd, the persistence layer turned
 * each 401 into an empty array, and the app rendered as a clean, empty,
 * completely functional-looking workspace.
 *
 * Data was never exposed - the API layer is correctly authenticated and every
 * query is user-scoped. The defect was in the product: there was no way to tell
 * "signed out" from "you have no data", and a localStorage flag was doing the
 * job of access control.
 *
 * The cookie check here is a *presence* check, not authentication, so a stale
 * or forged cookie still reaches the app. That is the remaining case the 401
 * interceptor handles; this stops the far more common one - arriving with no
 * cookie at all - before a single byte of app HTML is served.
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isExempt(pathname: string): boolean {
  return pathname.startsWith('/api/auth/') || pathname.startsWith('/api/cron/');
}

function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  // A forwarded header can carry a comma-separated chain; the first hop is the
  // client-facing host.
  return value.split(',')[0].trim().toLowerCase();
}

/**
 * The set of hostnames that count as "this site" for the current request.
 *
 * We derive it from the INCOMING request, not a single hardcoded value, so it
 * matches whatever public host the request actually arrived on — the production
 * alias, a per-deployment `lumina-<hash>-*.vercel.app` URL, or a future custom
 * domain — instead of 403ing legitimate same-origin POSTs that don't happen to
 * equal `BETTER_AUTH_URL`.
 *
 * Trust model: on Vercel the edge sets `x-forwarded-host` to the real client
 * host (overwriting any client-supplied value) and the `Host` header is a
 * fetch-forbidden header a page cannot spoof — so both reflect the true target
 * host. A cross-site attacker's request still arrives addressed to OUR host, so
 * every entry here resolves to our host while its `Origin` is the attacker's —
 * hence the mismatch. `req.nextUrl.host` and the configured URL are included as
 * belt-and-suspenders. (If ever self-hosted behind an untrusted proxy, this
 * forwarded-header trust must be revisited.)
 */
function selfHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const add = (h: string | null) => {
    const n = normalizeHost(h);
    if (n) hosts.add(n);
  };
  add(req.headers.get('x-forwarded-host'));
  add(req.headers.get('host'));
  add(req.nextUrl.host);
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) {
    try {
      add(new URL(configured).host);
    } catch {
      /* ignore malformed config */
    }
  }
  return hosts;
}

/** True if `urlish` (an Origin or a Referer) resolves to one of our own hosts. */
function isSameSite(req: NextRequest, urlish: string): boolean {
  let host: string;
  try {
    host = new URL(urlish).host.toLowerCase();
  } catch {
    return false;
  }
  return selfHosts(req).has(host);
}

function block(reason: string): NextResponse {
  return NextResponse.json(
    { error: 'Cross-site request blocked' },
    { status: 403, headers: { 'x-csrf-block': reason } },
  );
}

/**
 * P3-1: no API route set `Cache-Control`, so Vercel stamped its default
 * `public, max-age=0, must-revalidate` — with no `Vary: Cookie`.
 *
 * `max-age=0, must-revalidate` makes real-world leakage unlikely, but `public`
 * marks PER-USER JSON as shared-cacheable. Any intervening corporate proxy that
 * honours it, or any future CDN rule, can cross-serve one user's calendar to
 * another. `Vary: Cookie` is the second half: without it, a cache that did
 * store a response has no reason to key it by who asked.
 *
 * Stamped here rather than in 54 route handlers, so a route added tomorrow
 * cannot forget it.
 */
function apiHeaders(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'private, no-store, max-age=0');
  res.headers.set('Vary', 'Cookie, Accept-Encoding');
  return res;
}

/**
 * P3-2: Next.js route handlers have no default body cap, and `docs` writes
 * arbitrary client JSON straight into a JSONB column. Confirmed by the audit:
 * `POST /api/tasks` with a 100,000-character title returned 500, not 400.
 *
 * Checked at the edge against `Content-Length` so the body is rejected before a
 * function is invoked at all. A chunked request omits the header and slips
 * past — the platform's own request limit is the backstop there — but every
 * ordinary client sends it, which is what makes this worth having.
 */
const MAX_BODY_BYTES = 64 * 1024;
/** Documents legitimately carry a large ProseMirror JSON tree. */
const MAX_DOC_BODY_BYTES = 1024 * 1024;

function bodyLimitFor(pathname: string): number {
  return pathname.startsWith('/api/docs') ? MAX_DOC_BODY_BYTES : MAX_BODY_BYTES;
}

function tooLarge(limit: number): NextResponse {
  return apiHeaders(
    NextResponse.json(
      { error: `Request body exceeds ${Math.floor(limit / 1024)} KB` },
      { status: 413 },
    ),
  );
}


/**
 * BetterAuth names the session cookie `<prefix>.session_token`, with a
 * `__Secure-` prefix whenever cookies are secure (i.e. always in production),
 * and splits it into `.0`/`.1` chunks when it grows past the per-cookie limit.
 * Matching on the stem covers all four shapes.
 *
 * This is a *presence* check, not authentication — the cookie is signed and
 * only the route handlers verify it. A forged cookie buys an attacker nothing
 * but a redirect to a page that will 401 every fetch it makes.
 */
const SESSION_COOKIE_STEM = 'better-auth.session_token';

function hasSessionCookie(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some((c) => c.name.includes(SESSION_COOKIE_STEM) && c.value.length > 0);
}

/**
 * `/` with a session → /calendar, unless `?preview=1` was passed (which lets a
 * signed-in user read the marketing copy without being bounced).
 */
/**
 * Page routes that require a session. These are exactly the `(app)` route
 * group — nothing else.
 *
 * `/onboarding` is deliberately NOT here, and this is the second time that has
 * had to be decided. It was added on the reasoning that it "collects profile
 * data against the signed-in user", which is true of steps 2 onward and false
 * of step 1: step 1 IS the auth step. It offers sign in, sign up, Continue
 * with Google, and Continue as guest, and `canContinue()` refuses to advance
 * past it until `authStatus === 'logged in' || isGuest`. The gate lives in the
 * flow, where it can tell those four cases apart.
 *
 * Putting it behind the session cookie broke the front door. All three landing
 * CTAs — hero, nav, and the closing section — point at `/onboarding`, so every
 * signed-out visitor who clicked "Get started free" was 307'd to
 * `/auth/signin?next=/onboarding`, which opens on the **Sign in** tab. A new
 * user was shown a sign-in form and no way forward: the same wrong-tab problem
 * F2.3 fixed, re-created one layer down at the proxy.
 *
 * It also made guest mode dead code. `enterGuestMode()` has exactly one call
 * site (`OnboardingFlow.tsx`), reachable only from `/onboarding`, so
 * `guestStorage.ts`, `guestMigration.ts` and all four guest persistence
 * branches became unreachable the moment this prefix was added.
 *
 * Kept as an explicit list rather than "everything except X" so that adding a
 * new PUBLIC route can never accidentally end up behind the wall, and adding a
 * new private route is a visible one-line change in review.
 */
const PROTECTED_PREFIXES = [
  '/calendar',
  '/tasks',
  '/plan',
  '/docs',
  '/focus',
  '/goals',
  '/intelligence',
  '/performance',
  '/pomodoro',
  '/shop',
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

/**
 * An app route with no session cookie -> /auth/signin, carrying where they were
 * headed so the sign-in page can return them there instead of dead-ending
 * everyone at /onboarding.
 */
function handleProtected(req: NextRequest): NextResponse | null {
  if (!isProtectedPath(req.nextUrl.pathname)) return null;
  if (hasSessionCookie(req)) return null;

  const url = req.nextUrl.clone();
  url.pathname = '/auth/signin';
  url.search = '';
  // Same-origin relative path only. `nextUrl.pathname` is server-derived and
  // already normalised, so this cannot become an open redirect.
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url, 307);
}

function handleLanding(req: NextRequest): NextResponse | null {
  if (req.nextUrl.pathname !== '/') return null;
  if (req.nextUrl.searchParams.get('preview') === '1') return null;
  if (!hasSessionCookie(req)) return null;

  const url = req.nextUrl.clone();
  url.pathname = '/calendar';
  url.search = '';
  return NextResponse.redirect(url, 307);
}

export function proxy(req: NextRequest): NextResponse {
  const landing = handleLanding(req);
  if (landing) return landing;

  const guarded = handleProtected(req);
  if (guarded) return guarded;

  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

  // Every response from here down is per-user JSON.
  const pass = () => apiHeaders(NextResponse.next());

  if (!MUTATING_METHODS.has(req.method)) return pass();

  const limit = bodyLimitFor(req.nextUrl.pathname);
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    return tooLarge(limit);
  }

  if (isExempt(req.nextUrl.pathname)) return pass();

  const origin = req.headers.get('origin');
  if (origin !== null) {
    return isSameSite(req, origin) ? pass() : block('origin_mismatch');
  }

  // No Origin header — some privacy setups and non-browser clients omit it.
  // Fall back to Referer; when present it must resolve to one of our hosts.
  const referer = req.headers.get('referer');
  if (referer !== null) {
    return isSameSite(req, referer) ? pass() : block('referer_mismatch');
  }

  // Neither Origin nor Referer on a mutating request → REJECT (deliberate). A
  // cross-site browser attack always carries an Origin (fetch/XHR/form all send
  // it cross-origin), so this rejects only anomalous / non-browser callers —
  // which for this app's cookie-authed API should always be same-origin.
  // Shared-secret callers (cron) are exempt above.
  return block('missing_origin_and_referer');
}

export const config = {
  matcher: [
    '/',
    '/api/:path*',
    '/calendar/:path*',
    '/tasks/:path*',
    '/plan/:path*',
    '/docs/:path*',
    '/focus/:path*',
    '/goals/:path*',
    '/intelligence/:path*',
    '/performance/:path*',
    '/pomodoro/:path*',
    '/shop/:path*',
  ],
};
