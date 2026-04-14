import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
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
  'doing',
  'done',
]);

export const taskPriorityEnum = pgEnum('task_priority', [
  'low',
  'medium',
  'high',
]);

export const taskDifficultyEnum = pgEnum('task_difficulty', [
  'easy',
  'medium',
  'hard',
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
    difficulty: taskDifficultyEnum('difficulty').notNull().default('medium'),
    estimatedMinutes: integer('estimated_minutes').notNull().default(30),
    dueDate: timestamp('due_date', { withTimezone: true }),
    scheduledStart: varchar('scheduled_start', { length: 5 }),
    scheduledEnd: varchar('scheduled_end', { length: 5 }),
    remainingFocusTime: integer('remaining_focus_time'),
    linkedEventId: uuid('linked_event_id'),
    linkedDocId: uuid('linked_doc_id'),
    /** Self-referential FK for subtask hierarchy. NULL = root task. */
    parentTaskId: uuid('parent_task_id'),
    /** Nesting depth: 0 = root, 1 = subtask, 2 = sub-subtask. Max 2. */
    depth: integer('depth').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tasks_user_id_idx').on(table.userId),
    index('tasks_status_idx').on(table.status),
    index('tasks_linked_event_id_idx').on(table.linkedEventId),
    index('tasks_parent_task_id_idx').on(table.parentTaskId),
    foreignKey({
      columns: [table.parentTaskId],
      foreignColumns: [table.id],
    }).onDelete('cascade'),
    check('tasks_estimated_minutes_check', sql`${table.estimatedMinutes} > 0`),
  ]
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
