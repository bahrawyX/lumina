import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { calendars } from './calendars';
import { tasks } from './tasks';
import { users } from './users';

export const eventSourceEnum = pgEnum('event_source', [
  'manual',
  'google',
  'microsoft',
  'scheduler',
]);

export const eventProviderEnum = pgEnum('event_provider', [
  'local',
  'google',
  'outlook',
]);

export const eventSyncStatusEnum = pgEnum('event_sync_status', [
  'local_only',
  'synced',
  'pending_update',
  'pending_delete',
]);

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 512 }).notNull(),
    description: text('description'),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    isAllDay: boolean('is_all_day').notNull().default(false),
    timezone: text('timezone').notNull().default('UTC'),
    category: varchar('category', { length: 64 }),
    color: varchar('color', { length: 32 }),
    completed: boolean('completed').notNull().default(false),
    linkedTaskId: uuid('linked_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    location: varchar('location', { length: 512 }),
    provider: eventProviderEnum('provider').notNull().default('local'),
    externalEventId: text('external_event_id'),
    externalEtag: text('external_etag'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    syncStatus: eventSyncStatusEnum('sync_status').notNull().default('local_only'),
    meetingUrl: text('meeting_url'),
    organizerEmail: text('organizer_email'),
    isTaskGenerated: boolean('is_task_generated').notNull().default(false),
    source: eventSourceEnum('source').notNull().default('manual'),
    externalId: varchar('external_id', { length: 255 }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    recurringEventId: uuid('recurring_event_id'),
    originalStartTime: timestamp('original_start_time', { withTimezone: true }),
    isRecurrenceException: boolean('is_recurrence_exception').notNull().default(false),
    createdViaNl: boolean('created_via_nl').notNull().default(false),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    linkedDocId: uuid('linked_doc_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('events_user_start_time_idx').on(table.userId, table.startTime),
    index('events_user_end_time_idx').on(table.userId, table.endTime),
    index('events_calendar_id_idx').on(table.calendarId),
    index('events_calendar_start_time_idx').on(table.calendarId, table.startTime),
    index('events_external_id_idx').on(table.externalId),
    index('events_recurring_event_id_idx').on(table.recurringEventId),
    // P2-5: the other half of the task↔event link invariant.
    uniqueIndex('events_linked_task_uniq')
      .on(table.linkedTaskId)
      .where(sql`${table.linkedTaskId} is not null`),
    uniqueIndex('events_calendar_external_event_unique')
      .on(table.calendarId, table.externalEventId)
      .where(sql`${table.externalEventId} is not null`),
    check('events_time_range_check', sql`${table.endTime} > ${table.startTime}`),
  ]
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
