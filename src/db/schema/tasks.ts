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
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { goals } from './goals';

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
    /** Optional FK to the parent goal for the Goal-Driven Work loop. */
    goalId: uuid('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    /** Self-referential FK for subtask hierarchy. NULL = root task. */
    parentTaskId: uuid('parent_task_id'),
    /** Nesting depth: 0 = root, 1 = subtask, 2 = sub-subtask. Max 2. */
    depth: integer('depth').notNull().default(0),
    /**
     * Manual position within a status column.
     *
     * There was NO order column. `GET /api/tasks` synthesised `order: index`
     * from a `createdAt` sort on every read, and the PATCH handler ignored the
     * field entirely — so a drag-reorder fired N requests that each wrote
     * nothing, and the board snapped back to created-at order on the next
     * reload. (Matches `docs.position`.)
     */
    position: integer('position').notNull().default(0),
    /**
     * RRULE for a repeating task, e.g. `FREQ=WEEKLY;BYDAY=TU`.
     *
     * Events have had recurrence since the beginning; tasks had none at all, so
     * "water the plants every Tuesday" — the single most ordinary thing a
     * to-do list is asked to do — could not be expressed.
     *
     * ## Why a next-occurrence model rather than expansion
     *
     * Events expand: one row, many virtual instances projected across a
     * window, because a calendar has to render a range. A task is not viewed
     * over a range — it is worked, then done. Expanding would fill the board
     * with dozens of identical future rows nobody can act on yet.
     *
     * So a recurring task exists once. Completing it spawns the next
     * occurrence, carrying the rule forward. That matches what people expect
     * from a repeating to-do, and it means the board only ever shows work that
     * is actually actionable.
     */
    recurrenceRule: text('recurrence_rule'),
    /** Stop spawning after this instant. NULL = repeats indefinitely. */
    recurrenceEnd: timestamp('recurrence_end', { withTimezone: true }),
    /**
     * The task this one was spawned from, so a series can be traced and
     * cancelled as a whole. NULL for the first in a series and for one-offs.
     *
     * Deliberately not a hard FK to `tasks.id`: deleting the original must not
     * cascade away the occurrences someone has already completed, which are
     * their record of work done.
     */
    recurrenceParentId: uuid('recurrence_parent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tasks_user_id_idx').on(table.userId),
    // Finding every occurrence spawned from one original, for series edits.
    index('tasks_recurrence_parent_idx').on(table.recurrenceParentId),
    index('tasks_status_idx').on(table.status),
    // P2-7: `tasks` had only single-column (user_id) and (status) indexes, and
    // no composite matching any real query shape. These are the two hot ones —
    // the board read and the due-date read.
    index('tasks_user_status_position_idx').on(table.userId, table.status, table.position),
    index('tasks_user_due_idx').on(table.userId, table.dueDate),
    // P2-5: nothing stopped two tasks from claiming the same event. The
    // "already linked?" read in `POST /api/link` and `create-linked` was
    // outside the transaction, so two concurrent calls each created an event
    // and one was permanently orphaned. This index is the backstop the guarded
    // UPDATEs sit on top of. Partial, because unlinked tasks are the norm.
    uniqueIndex('tasks_linked_event_uniq')
      .on(table.linkedEventId)
      .where(sql`${table.linkedEventId} is not null`),
    index('tasks_parent_task_id_idx').on(table.parentTaskId),
    index('tasks_goal_id_idx').on(table.goalId),
    foreignKey({
      columns: [table.parentTaskId],
      foreignColumns: [table.id],
    }).onDelete('cascade'),
    check('tasks_estimated_minutes_check', sql`${table.estimatedMinutes} > 0`),
  ]
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
