import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Durable, cross-instance rate-limit counters.
 *
 * Every limiter in the app used to be a module-level `Map`. On Vercel that is
 * per-lambda memory: concurrent requests land on fresh instances each starting
 * at count 0, so the effective ceiling is `max x instances` — i.e. unbounded
 * under exactly the load a limiter exists to survive. Reproduced against
 * production: 8 *sequential* sign-in attempts were correctly cut off at 3 with
 * a 429, but 16 *concurrent* attempts against the same account had **15 of 16
 * processed**.
 *
 * None of the maps ever evicted either, so a long-lived instance grew memory
 * per unique key forever — and `/api/contact` keyed on a client-supplied
 * header, making that growth attacker-controlled.
 *
 * Postgres is already here and is more than sufficient at this scale: one
 * upsert per limited request, on a table whose rows are tiny and swept daily.
 * Redis would be faster but is another dependency to run and pay for.
 *
 * ## Shape
 *
 * A fixed-window counter, not a sliding log. Each row is one (key, window)
 * pair; the window start is derived arithmetically from the current time so no
 * read is needed to find it. The trade is the classic fixed-window burst at a
 * boundary (up to 2x `max` across two adjacent windows), which is an acceptable
 * price for a single-statement, contention-free check — and still infinitely
 * better than a per-instance counter that an attacker bypasses just by
 * increasing concurrency.
 *
 * `better-auth` also writes this table directly via `rateLimit.storage:
 * 'database'`; its column names are fixed by the library, which is why they are
 * `key` / `count` / `last_request` rather than something more descriptive.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    /**
     * Surrogate key. `key` would be the natural primary key, but better-auth's
     * Drizzle adapter writes this table too and always supplies an `id`, so the
     * column has to exist. Uniqueness that matters is on `key` below, which is
     * what both writers conflict-target.
     */
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * `<limiterName>:<window-start-epoch-ms>:<subject>`, where subject is a
     * user id or a trusted client IP. better-auth writes its own opaque keys
     * into the same column.
     */
    key: text('key').notNull(),

    /** Requests seen in this window. */
    count: integer('count').notNull().default(0),

    /**
     * Epoch milliseconds of the most recent request. better-auth reads this
     * column by name to compute its own window, so the type and name are not
     * ours to choose.
     */
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),

    /**
     * When this row stops being meaningful. Rows are swept after this; nothing
     * reads a row past its expiry, so a missed sweep is a storage cost rather
     * than a correctness problem.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '1 day'`),
  },
  (table) => [
    uniqueIndex('rate_limits_key_uniq').on(table.key),
    // The daily sweep deletes by expiry; without this it is a seq-scan over
    // what is, by design, one of the busiest tables in the database.
    index('rate_limits_expires_at_idx').on(table.expiresAt),
  ],
);

export type RateLimitRow = typeof rateLimits.$inferSelect;
