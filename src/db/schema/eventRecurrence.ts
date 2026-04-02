import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { events } from './events';
import { users } from './users';

export const eventRecurrence = pgTable(
  'event_recurrence',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rrule: text('rrule').notNull(),
    exdates: text('exdates').array().notNull().default([]),
    recurrenceEnd: timestamp('recurrence_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('event_recurrence_event_id_idx').on(table.eventId),
    index('event_recurrence_user_id_idx').on(table.userId),
  ]
);

export type EventRecurrenceRow = typeof eventRecurrence.$inferSelect;
export type NewEventRecurrenceRow = typeof eventRecurrence.$inferInsert;
