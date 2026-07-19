import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

/**
 * Append-only coin ledger. Balance reconciliation invariant (verified by
 * scripts/reconcile-coins.mjs): SUM(amount) per user == users.coins.
 *
 * COLUMN AUTHORITY (read before adding call sites in Batch 3):
 *   • `reason`      — AUTHORITATIVE discriminator for all querying, analytics,
 *                     and the existing filters (e.g. award-brief filters
 *                     reason='daily_brief'). Every row MUST set it. Fine-grained,
 *                     one per earn-rule (task_complete, first_task_of_day,
 *                     focus_session, goal_complete, shop_purchase, …).
 *   • `source_type` + `source_id` — provenance only (which entity caused the
 *                     row). NEVER query/dedupe by these. Populate BOTH together
 *                     or NEITHER — never one without the other. `source_type` is
 *                     the coarse entity kind (task|goal|doc|focus_session|shop|
 *                     streak_recover|achievement|daily_brief|migration),
 *                     derivable from `reason`; it exists for joins/analytics.
 *   • `dedupe_key`  — deterministic idempotency key, UNIQUE per (user, key).
 *                     NULL for legacy + opening-balance rows (partial index).
 */
export const coinTransactions = pgTable(
  'coin_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Positive = earn, negative = spend */
    amount: integer('amount').notNull(),
    /** AUTHORITATIVE machine-readable reason (see COLUMN AUTHORITY above). */
    reason: varchar('reason', { length: 100 }).notNull(),
    /** Human-readable label for toasts: e.g. "Completed a hard task" */
    label: varchar('label', { length: 255 }).notNull(),
    /** Optional metadata JSON */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    // ── Ledger idempotency + provenance (Batch 2) ──────────────────────────
    /** Deterministic idempotency key; NULL exempts legacy/opening rows. */
    dedupeKey: varchar('dedupe_key', { length: 200 }),
    /** Provenance (with source_id) only — not a query key. */
    sourceType: varchar('source_type', { length: 100 }),
    /** Id of the causing entity; both-or-neither with source_type. */
    sourceId: varchar('source_id', { length: 255 }),
    /** User's coins immediately after this row — reconciliation aid. */
    balanceAfter: integer('balance_after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('coin_tx_user_created_idx').on(table.userId, table.createdAt),
    // At most one ledger row per (user, dedupe_key). Legacy/opening rows carry
    // a NULL key and are exempt via the partial predicate.
    uniqueIndex('coin_tx_user_dedupe_uniq')
      .on(table.userId, table.dedupeKey)
      .where(sql`${table.dedupeKey} is not null`),
  ],
);

export type CoinTransactionRow = typeof coinTransactions.$inferSelect;
export type NewCoinTransactionRow = typeof coinTransactions.$inferInsert;
