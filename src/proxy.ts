import { NextResponse, type NextRequest } from 'next/server';

/**
 * CSRF defence — an Origin/Referer allowlist on state-changing API requests.
 *
 * (Next.js 16 "proxy" convention — formerly `middleware.ts`.)
 *
 * The session cookie is `SameSite=None` in production (required by the popup
 * OAuth login/connect flow — see lib/auth.ts), so it rides cross-site requests.
 * Without this check a logged-in victim visiting a hostile page could have
 * POSTs driven on their behalf (a cross-site `text/plain` POST is a "simple
 * request" that doesn't preflight, and route handlers parse the body with
 * `req.json()` regardless of content-type). This lives in the proxy, not
 * per-route helpers, so a newly-added route can't forget it.
 *
 * Only mutating methods are checked; GET/HEAD/OPTIONS pass untouched — which is
 * why the OAuth callback + connect routes (all GET) are never affected here.
 *
 * Two prefixes are exempt because they are NOT authenticated by the session
 * cookie (so they are not cookie-CSRF-able) and are legitimately called without
 * a browser Origin:
 *   - /api/auth/*  — BetterAuth enforces its own CSRF via `trustedOrigins`.
 *   - /api/cron/*  — shared-secret (cronAuth); server-to-server, no Origin.
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

export function proxy(req: NextRequest): NextResponse {
  if (!MUTATING_METHODS.has(req.method)) return NextResponse.next();
  if (isExempt(req.nextUrl.pathname)) return NextResponse.next();

  const origin = req.headers.get('origin');
  if (origin !== null) {
    return isSameSite(req, origin) ? NextResponse.next() : block('origin_mismatch');
  }

  // No Origin header — some privacy setups and non-browser clients omit it.
  // Fall back to Referer; when present it must resolve to one of our hosts.
  const referer = req.headers.get('referer');
  if (referer !== null) {
    return isSameSite(req, referer) ? NextResponse.next() : block('referer_mismatch');
  }

  // Neither Origin nor Referer on a mutating request → REJECT (deliberate). A
  // cross-site browser attack always carries an Origin (fetch/XHR/form all send
  // it cross-origin), so this rejects only anomalous / non-browser callers —
  // which for this app's cookie-authed API should always be same-origin.
  // Shared-secret callers (cron) are exempt above.
  return block('missing_origin_and_referer');
}

export const config = {
  matcher: '/api/:path*',
};
