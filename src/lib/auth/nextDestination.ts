/**
 * Post-authentication redirect target.
 *
 * Every navigation on the sign-in page used to be the literal
 * `router.replace('/onboarding')` — nothing read a `next` / `callbackUrl` /
 * `returnTo` param, so a user who followed a deep link, or who was bounced off
 * `/tasks` by the route guard, was dropped into the onboarding flow with their
 * intended destination discarded.
 */

/** Where users go when no destination was requested. */
export const DEFAULT_DESTINATION = '/onboarding';

/**
 * Accept `raw` as a redirect target only if it is a same-origin *relative*
 * path. Everything else — absolute URLs, protocol-relative `//evil.com`, the
 * backslash variants browsers normalise to `//`, and `javascript:` — is
 * rejected, so a crafted `?next=` can never become an open redirect.
 *
 * Returns `null` when `raw` is not usable, so the caller can fall back.
 */
export function sanitizeNextDestination(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // Must be a rooted path.
  if (raw[0] !== '/') return null;
  // `//host` and `/\host` are both parsed as protocol-relative URLs by browsers
  // and would leave the origin.
  if (raw[1] === '/' || raw[1] === '\\') return null;
  // Defence in depth: reject anything that still parses as an absolute URL.
  try {
    const parsed = new URL(raw, 'https://lumina.invalid');
    if (parsed.origin !== 'https://lumina.invalid') return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/** `sanitizeNextDestination` with the default applied. */
export function resolveNextDestination(raw: string | null | undefined): string {
  return sanitizeNextDestination(raw) ?? DEFAULT_DESTINATION;
}
