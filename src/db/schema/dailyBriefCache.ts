import { pgTable, uuid, date, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const dailyBriefCache = pgTable(
  'daily_brief_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    narrative: text('narrative').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('daily_brief_cache_user_date_unique').on(table.userId, table.date),
    index('daily_brief_cache_user_id_idx').on(table.userId),
  ],
);

export type DailyBriefCacheRow = typeof dailyBriefCache.$inferSelect;
