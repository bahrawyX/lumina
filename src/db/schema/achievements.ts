import { boolean, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const achievements = pgTable(
  'achievements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
    seen: boolean('seen').notNull().default(false),
  },
  (table) => [
    index('achievements_user_id_idx').on(table.userId),
    // M6: one row per (user, type) — blocks duplicate unlocks under concurrency.
    // Modeled here (not only in migration 0019) so a future db:push keeps it.
    uniqueIndex('achievements_user_type_uniq').on(table.userId, table.type),
  ]
);

export type AchievementRow = typeof achievements.$inferSelect;
export type NewAchievementRow = typeof achievements.$inferInsert;
