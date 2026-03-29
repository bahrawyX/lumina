import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';
import { focusSessions } from './focusSessions';

export const moodLogs = pgTable(
  'mood_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    focusSessionId: uuid('focus_session_id')
      .references(() => focusSessions.id, { onDelete: 'set null' }),
    mood: varchar('mood', { length: 16 }).notNull(),
    note: text('note'),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('mood_logs_user_id_idx').on(table.userId),
  ]
);

export type MoodLogRow = typeof moodLogs.$inferSelect;
export type NewMoodLogRow = typeof moodLogs.$inferInsert;
