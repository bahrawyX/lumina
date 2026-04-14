import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const goalStatusEnum = pgEnum('goal_status', [
  'active',
  'completed',
  'archived',
]);

export const goalTimeframeEnum = pgEnum('goal_timeframe', [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'custom',
]);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    emoji: varchar('emoji', { length: 10 }),
    /** Semantic color name: blue, green, purple, orange, red */
    color: varchar('color', { length: 20 }),
    status: goalStatusEnum('status').notNull().default('active'),
    timeframe: goalTimeframeEnum('timeframe').notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('goals_user_id_idx').on(table.userId),
    index('goals_status_idx').on(table.status),
  ]
);

export type GoalRow = typeof goals.$inferSelect;
export type NewGoalRow = typeof goals.$inferInsert;
