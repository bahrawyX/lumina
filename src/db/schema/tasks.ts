import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'done',
  'archived',
]);

export const taskPriorityEnum = pgEnum('task_priority', [
  'low',
  'medium',
  'high',
]);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 512 }).notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('todo'),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    estimatedMinutes: integer('estimated_minutes').notNull().default(30),
    dueDate: timestamp('due_date', { withTimezone: true }),
    scheduledStart: varchar('scheduled_start', { length: 5 }),
    scheduledEnd: varchar('scheduled_end', { length: 5 }),
    remainingFocusTime: integer('remaining_focus_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tasks_user_id_idx').on(table.userId),
    index('tasks_status_idx').on(table.status),
    check('tasks_estimated_minutes_check', sql`${table.estimatedMinutes} > 0`),
  ]
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
