import 'server-only';
import { sql } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * BetterAuth rate-limit storage that FAILS OPEN.
 *
 * ## The outage this exists to prevent
 *
 * `rateLimit.storage: 'database'` (the F3.1 / P1-9 fix) makes BetterAuth query
 * a `rate_limits` table on **every** auth request — including `/get-session`,
 * which every page load makes. Its built-in database storage lets a query error
 * propagate, so if that table is missing or the database is briefly unreachable,
 * every authentication endpoint returns 500 and **nobody can sign in by any
 * method**. Reproduced exactly that way:
 *
 *     GET  /api/auth/get-session   -> 500
 *     POST /api/auth/sign-in/email -> 500
 *     cause: relation "rate_limits" does not exist (42P01)
 *
 * The table ships in the migration baseline, so this happens whenever the code
 * is ahead of the database — a deploy before migrations run, a fresh
 * environment, a restored branch. That is a routine situation, and the correct
 * response to it is degraded rate limiting, not a total auth outage.
 *
 * A rate limiter is a **protective** control. When it cannot function, the
 * question is which failure is worse: letting requests through unmetered, or
 * locking every user out. For a sign-in endpoint the answer is not close —
 * especially since brute-force protection has other layers here (breach
 * checking via `haveIBeenPwned`, a 12-character minimum, and the app's own
 * durable limiter on the routes it guards).
 *
 * So: every method swallows storage errors and reports "allowed", and logs once
 * per process so the condition is visible rather than silent.
 *
 * ## Why not just use BetterAuth's `storage: 'database'`
 *
 * Because it has no failure path. This keeps the same table, the same columns
 * and the same distributed semantics — the reason `storage: 'database'` was
 * chosen over the default in-memory `Map` in the first place — and only changes
 * what happens when the storage is unavailable.
 */

export interface RateLimitRecord {
  key: string;
  count: number;
  lastRequest: number;
}

interface ConsumeRule {
  window: number;
  max: number;
}

/**
 * Logged once per outage, not once per request — a per-request log would drown
 * everything else at exactly the moment the logs matter.
 *
 * It RESETS on the next success, so a 30-second database blip and a permanent
 * misconfiguration are distinguishable: the first produces a matched
 * degraded/recovered pair, the second produces one line and silence.
 */
let warnedUnavailable = false;

function reportUnavailable(operation: string, err: unknown): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  logger.error(
    'rate limit storage unavailable — FAILING OPEN so authentication keeps working. ' +
      'Run the pending Drizzle migrations (rate_limits ships in 0020_schema_baseline).',
    { operation },
    err,
  );
}

/** Called after any successful storage operation. */
function reportRecovered(): void {
  if (!warnedUnavailable) return;
  warnedUnavailable = false;
  logger.info('rate limit storage recovered — enforcement is active again');
}

/**
 * `db.execute()` returns a driver-shaped result: neon-serverless and pglite
 * both give `{ rows: [...] }`, others return the array directly.
 */
function firstRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result)) return result[0] as T | undefined;
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? (rows[0] as T | undefined) : undefined;
}

export function createFailOpenRateLimitStorage() {
  return {
    async get(key: string): Promise<RateLimitRecord | undefined> {
      try {
        const db = getDatabase();
        const result = await db.execute(
          sql`select "key", "count", "last_request" from "rate_limits" where "key" = ${key} limit 1`,
        );
        reportRecovered();
        const row = firstRow<{ key: string; count: number | string; last_request: number | string }>(result);
        if (!row) return undefined;
        return {
          key: row.key,
          count: Number(row.count),
          lastRequest: Number(row.last_request),
        };
      } catch (err) {
        reportUnavailable('get', err);
        return undefined;
      }
    },

    async set(key: string, value: RateLimitRecord): Promise<void> {
      try {
        const db = getDatabase();
        await db.execute(
          sql`insert into "rate_limits" ("key", "count", "last_request")
              values (${key}, ${value.count}, ${value.lastRequest})
              on conflict ("key") do update
                set "count" = ${value.count},
                    "last_request" = ${value.lastRequest},
                    "expires_at" = now() + interval '1 day'`,
        );
        reportRecovered();
      } catch (err) {
        reportUnavailable('set', err);
      }
    },

    /**
     * One atomic upsert per check — no read-then-write, so concurrent lambdas
     * cannot each see a stale count. This is the property the whole change
     * exists for: F3.1 reproduced 15 of 16 concurrent sign-in attempts getting
     * through against an in-memory counter.
     *
     * The `count` ceiling is `max + 1`, used as a sentinel: `count <= max` means
     * this request consumed a slot, `count > max` means it was refused. Capping
     * with `least(...)` stops a sustained attack inflating the number forever,
     * and freezing `last_request` while refused stops the window sliding — so a
     * blocked caller is unblocked `window` seconds after their last ALLOWED
     * request rather than never.
     */
    async consume(
      key: string,
      rule: ConsumeRule,
    ): Promise<{ allowed: boolean; retryAfter: number | null }> {
      const windowMs = rule.window * 1000;
      const now = Date.now();

      try {
        const db = getDatabase();
        const result = await db.execute(
          sql`insert into "rate_limits" ("key", "count", "last_request")
              values (${key}, 1, ${now})
              on conflict ("key") do update
                set "count" = case
                      when ${now} - "rate_limits"."last_request" > ${windowMs} then 1
                      else least("rate_limits"."count" + 1, ${rule.max + 1})
                    end,
                    "last_request" = case
                      when ${now} - "rate_limits"."last_request" > ${windowMs} then ${now}
                      when "rate_limits"."count" + 1 <= ${rule.max} then ${now}
                      else "rate_limits"."last_request"
                    end,
                    "expires_at" = now() + interval '1 day'
              returning "count", "last_request"`,
        );

        reportRecovered();
        const row = firstRow<{ count: number | string; last_request: number | string }>(result);
        if (!row) return { allowed: true, retryAfter: null };

        const count = Number(row.count);
        if (count <= rule.max) return { allowed: true, retryAfter: null };

        const lastRequest = Number(row.last_request);
        const retryAfter = Math.max(1, Math.ceil((lastRequest + windowMs - now) / 1000));
        return { allowed: false, retryAfter };
      } catch (err) {
        reportUnavailable('consume', err);
        return { allowed: true, retryAfter: null };
      }
    },
  };
}

/** Test seam: lets a suite assert the one-shot log fires exactly once. */
export function __resetRateLimitStorageWarning(): void {
  warnedUnavailable = false;
}
