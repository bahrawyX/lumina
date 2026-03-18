import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tasks } from './tasks';
import { users } from './users';

export const plannerItems = pgTable(
  'planner_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    isAutoScheduled: boolean('is_auto_scheduled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('planner_items_user_start_time_idx').on(table.userId, table.startTime),
    check('planner_items_time_range_check', sql`${table.endTime} > ${table.startTime}`),
  ]
);

export type PlannerItemRow = typeof plannerItems.$inferSelect;
export type NewPlannerItemRow = typeof plannerItems.$inferInsert;
