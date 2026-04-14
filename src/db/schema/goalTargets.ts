import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { goals } from './goals';

export const targetTypeEnum = pgEnum('target_type', [
  'number',
  'percentage',
  'boolean',
  'task_completion',
]);

export const goalTargets = pgTable(
  'goal_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    type: targetTypeEnum('type').notNull(),
    currentValue: numeric('current_value', { precision: 10, scale: 2 }).notNull().default('0'),
    targetValue: numeric('target_value', { precision: 10, scale: 2 }).notNull(),
    unit: varchar('unit', { length: 50 }),
    /** JSON-encoded array of task UUIDs (e.g. '["uuid1","uuid2"]'). Used when type = task_completion. */
    linkedTaskIds: text('linked_task_ids'),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('goal_targets_goal_id_idx').on(table.goalId),
  ]
);

export type GoalTargetRow = typeof goalTargets.$inferSelect;
export type NewGoalTargetRow = typeof goalTargets.$inferInsert;
