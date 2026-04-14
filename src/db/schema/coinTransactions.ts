import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const coinTransactions = pgTable(
  'coin_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Positive = earn, negative = spend */
    amount: integer('amount').notNull(),
    /** Machine-readable reason: e.g. "task_complete", "focus_session", "shop_purchase" */
    reason: varchar('reason', { length: 100 }).notNull(),
    /** Human-readable label for toasts: e.g. "Completed a hard task" */
    label: varchar('label', { length: 255 }).notNull(),
    /** Optional metadata JSON */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('coin_tx_user_created_idx').on(table.userId, table.createdAt),
  ]
);

export type CoinTransactionRow = typeof coinTransactions.$inferSelect;
export type NewCoinTransactionRow = typeof coinTransactions.$inferInsert;
