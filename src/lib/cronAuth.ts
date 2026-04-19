import 'server-only';
import crypto from 'node:crypto';

/**
 * Verify the bearer token on cron requests.
 *
 * Security properties:
 * - Fails closed when CRON_SECRET is missing or too short (< 32 chars).
 *   Previously the check was `auth === "Bearer " + process.env.CRON_SECRET`
 *   which silently compared against the literal string "Bearer undefined"
 *   when the env var was missing — a fail-open bug.
 * - Uses `crypto.timingSafeEqual` to prevent timing side-channels that could
 *   leak the secret byte-by-byte to an attacker who can measure response times.
 * - Accepts both lowercase and canonical `Authorization` header casing.
 */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;

  const authHeader =
    request.headers.get('authorization') ??
    request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const provided = authHeader.slice(7);
  try {
    const a = Buffer.from(secret);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
