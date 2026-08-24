import 'server-only';

import { sql } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';

/**
 * Durable, cross-instance rate limiting.
 *
 * ## What was wrong
 *
 * Every limiter in the app — including the "5 AI suggestions per day" one, whose
 * own comment conceded the problem — was a module-level `Map`. On Vercel that is
 * per-lambda memory: concurrent requests land on fresh instances each starting
 * at count 0, so the effective ceiling was `max x instances`, i.e. unbounded
 * under exactly the load a limiter exists to survive.
 *
 * Reproduced against production against a single account:
 *
 *     8 SEQUENTIAL sign-in attempts  -> 401,401,401,429,429,429,429,429   correct
 *     16 CONCURRENT sign-in attempts -> 15 processed, 1 limited           bypassed
 *
 * Three of the limiters were also hand-rolled duplicates of this module rather
 * than uses of it, and none of the maps ever evicted — so a long-lived instance
 * grew memory per unique key forever. `/api/contact` keyed on a client-supplied
 * `x-forwarded-for`, which made that growth attacker-controlled *and* let an
 * attacker defeat the cooldown entirely just by rotating the header.
 *
 * ## The shape now
 *
 * A fixed-window counter in Postgres, one upsert per limited request:
 *
 *     INSERT ... ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1
 *     RETURNING count
 *
 * Atomic, contention-free, and correct across any number of instances because
 * the counter lives in the one place they all share.
 *
 * The window start is derived arithmetically from the clock, so the key itself
 * identifies the window and no read is needed to find it. The trade is the
 * classic fixed-window boundary burst — up to 2x `max` across two adjacent
 * windows — which is a reasonable price for a single round-trip, and vastly
 * better than a counter an attacker bypasses by raising concurrency.
 *
 * ## Failure mode
 *
 * If the database is unreachable the limiter **fails open** and the request
 * proceeds. That is deliberate: these limiters guard cost and abuse, not
 * authorisation, and turning a database blip into a total outage of every
 * limited endpoint would be a worse failure than briefly unmetered traffic.
 * Auth endpoints do not rely on this module — better-auth has its own
 * database-backed limiter over the same table.
 */

export interface LimiterOptions {
  windowMs: number;
  max: number;
}

export interface LimiterCheck {
  limited: boolean;
  /** Milliseconds until the current window ends. */
  retryAfterMs: number;
  /** Requests remaining in this window; 0 once limited. */
  remaining: number;
}

const ALLOWED: (max: number) => LimiterCheck = (max) => ({
  limited: false,
  retryAfterMs: 0,
  remaining: max,
});

/**
 * `db.execute()` returns a driver-shaped result: neon-serverless and pglite
 * both give `{ rows: [...] }`, while some drivers return the array directly.
 * Normalising here keeps the limiter driver-agnostic — and a silently
 * mis-read result would make the limiter fail open on every request, which is
 * the failure mode this whole change exists to remove.
 */
function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function firstRow<T>(result: unknown): T | undefined {
  return resultRows<T>(result)[0];
}

/**
 * Resolve the client IP from headers the platform sets, never from a raw
 * client-supplied value.
 *
 * `x-forwarded-for` is a chain that a client can prepend to, so its FIRST entry
 * is attacker-controlled. Vercel sets `x-vercel-forwarded-for` and `x-real-ip`
 * to the true client address and overwrites any inbound value, so those are
 * preferred. When only `x-forwarded-for` is available we take the **last**
 * entry, which is the one the nearest trusted proxy appended.
 */
export function clientIp(headers: Headers): string {
  const trusted = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip');
  if (trusted) return trusted.split(',')[0].trim();

  const chain = headers.get('x-forwarded-for');
  if (chain) {
    const parts = chain.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return 'unknown';
}

/**
 * Create a limiter.
 *
 * `name` namespaces the key so two limiters never share a counter.
 * Call `check(subject)` with a user id or `clientIp(req.headers)`.
 */
export function createRateLimiter(name: string, opts: LimiterOptions) {
  return {
    async check(subject: string): Promise<LimiterCheck> {
      const db = getDatabase();
      if (!db) return ALLOWED(opts.max);

      const now = Date.now();
      const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs;
      const windowEnd = windowStart + opts.windowMs;
      const key = `${name}:${windowStart}:${subject}`;

      try {
        // One statement: insert the window's first request, or increment it.
        // `RETURNING` gives us the post-increment count, so there is no
        // read-then-write race between concurrent instances.
        const rows = await db.execute<{ count: number }>(sql`
          INSERT INTO rate_limits (key, count, last_request, expires_at)
          VALUES (
            ${key},
            1,
            ${now},
            ${new Date(windowEnd + 60_000)}
          )
          ON CONFLICT (key) DO UPDATE
            SET count = rate_limits.count + 1,
                last_request = ${now}
          RETURNING count
        `);

        const count = Number(firstRow<{ count: number }>(rows)?.count ?? 1);
        if (count > opts.max) {
          return {
            limited: true,
            retryAfterMs: Math.max(0, windowEnd - now),
            remaining: 0,
          };
        }
        return {
          limited: false,
          retryAfterMs: 0,
          remaining: Math.max(0, opts.max - count),
        };
      } catch (err) {
        // Fail open — see the module doc comment.
        console.error(`[rateLimit:${name}] check failed, allowing request`, err);
        return ALLOWED(opts.max);
      }
    },
  };
}

/** Produce a 429 with a `Retry-After` header. */
export function rateLimitedResponse(retryAfterMs: number, message?: string): Response {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new Response(
    JSON.stringify({ error: 'Rate limit exceeded', message: message ?? undefined }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}

/**
 * Delete expired counters. Called from the daily cleanup cron — nothing reads a
 * row past its expiry, so a missed sweep is a storage cost, not a correctness
 * problem.
 */
export async function sweepExpiredRateLimits(): Promise<number> {
  const db = getDatabase();
  if (!db) return 0;
  const result = await db.execute<{ key: string }>(sql`
    DELETE FROM rate_limits WHERE expires_at < now() RETURNING key
  `);
  return resultRows(result).length;
}
