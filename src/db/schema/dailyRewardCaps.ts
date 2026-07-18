import { check, date, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

/**
 * Per-user, per-day reward ceilings — the DB-enforced anti-abuse backstop for
 * the coin economy. Generalizes two shapes under one table:
 *
 *   • Quantitative caps (reason 'focus'): `used_units` accumulates rewarded
 *     minutes up to MAX_DAILY_FOCUS_MINUTES (720). Bounds focus-coin farming
 *     even while session timestamps remain client-forgeable (until the
 *     server-anchored start/complete flow lands, this is the ONLY bound).
 *   • Binary once-per-day awards (reason 'daily_brief' | 'doc_500' |
 *     'planner_day' …): the mere presence of the (user, reason, date) row —
 *     inserted ON CONFLICT DO NOTHING — is the "already claimed today" guard.
 *
 * LOCK ORDER: callers lock a `daily_reward_caps` row (SELECT … FOR UPDATE)
 * BEFORE touching `users`. See the canonical rule in src/lib/coins/awardCoins.ts.
 */
export const dailyRewardCaps = pgTable(
  'daily_reward_caps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Award family: 'focus' | 'daily_brief' | 'doc_500' | 'planner_day' | … */
    reason: varchar('reason', { length: 100 }).notNull(),
    /**
     * UTC calendar day — the anti-abuse anchor. MUST be derived in UTC, never
     * from a user-settable timezone (a tz change must not roll the bucket).
     * App code passes an explicit UTC date; any SQL fallback MUST use
     * `(now() AT TIME ZONE 'UTC')::date` — NEVER a bare `now()::date`, which
     * resolves against the connection's session TimeZone and is not
     * guaranteed UTC on a pooled connection.
     */
    bucketDate: date('bucket_date').notNull(),
    /** focus: rewarded minutes (clamped to MAX_DAILY_FOCUS_MINUTES); binary awards: 0/1. */
    usedUnits: integer('used_units').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('daily_reward_caps_user_reason_date_uniq').on(
      table.userId,
      table.reason,
      table.bucketDate,
    ),
    // Floor only. The per-reason ceiling (720 / binary 1) varies by `reason`
    // and is clamped in the award SQL via LEAST(...), not by a DB CHECK.
    check('daily_reward_caps_used_nonneg', sql`${table.usedUnits} >= 0`),
  ],
);

export type DailyRewardCapRow = typeof dailyRewardCaps.$inferSelect;
export type NewDailyRewardCapRow = typeof dailyRewardCaps.$inferInsert;
