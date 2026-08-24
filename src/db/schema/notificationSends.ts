import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * At-most-once record for scheduled notifications.
 *
 * ## P1-2 — neither `daily-brief` nor `streak-reminder` was idempotent
 *
 * Neither cron recorded that a notification had been sent, so a Vercel retry —
 * or a re-run after a partial timeout — **re-sent to everyone**. `tag:
 * 'daily-brief'` only collapses the *display* on-device; the push is still
 * sent and still costs quota.
 *
 * The `event-reminders` cron does this correctly, with an atomic
 * `reminderSentAt` claim and a regression test. That discipline was simply
 * never applied to the other two, because they had nowhere to record the claim
 * — event reminders could use a column on the event row, and a daily brief has
 * no row of its own.
 *
 * This table is that row. The unique index on `(user_id, kind, local_date)` is
 * what makes the claim atomic: `INSERT ... ON CONFLICT DO NOTHING RETURNING id`
 * returns a row to exactly one caller, however many run concurrently.
 *
 * `local_date` is the user's LOCAL calendar date, not UTC. A daily brief is
 * "one per day *for the user*", and with the crons now running hourly and
 * firing at each user's configured local hour, a UTC bucket would let someone
 * in UTC+13 receive two briefs on one of their days.
 */
export const notificationSends = pgTable(
  'notification_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `daily_brief` | `streak_reminder` | `tasks_due` … */
    kind: varchar('kind', { length: 64 }).notNull(),
    /** `YYYY-MM-DD` in the user's own timezone. */
    localDate: varchar('local_date', { length: 10 }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The claim. Everything else here is housekeeping.
    uniqueIndex('notification_sends_user_kind_date_uniq').on(
      table.userId,
      table.kind,
      table.localDate,
    ),
    // The retention sweep deletes by age; without this it is a seq-scan over a
    // table that grows by (users x kinds) every day.
    index('notification_sends_sent_at_idx').on(table.sentAt),
  ],
);

export type NotificationSendRow = typeof notificationSends.$inferSelect;
