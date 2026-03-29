import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tasks } from './tasks';
import { users } from './users';

export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    coinsEarned: integer('coins_earned').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('focus_sessions_user_id_idx').on(table.userId),
    check('focus_sessions_duration_check', sql`${table.durationMinutes} > 0`),
    check('focus_sessions_time_range_check', sql`${table.endTime} > ${table.startTime}`),
  ]
);

export type FocusSessionRow = typeof focusSessions.$inferSelect;
export type NewFocusSessionRow = typeof focusSessions.$inferInsert;
