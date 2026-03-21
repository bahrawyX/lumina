import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const calendarProviderEnum = pgEnum('calendar_provider', [
  'google',
  'microsoft',
  'local',
]);

export const calendars = pgTable(
  'calendars',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: calendarProviderEnum('provider').notNull(),
    externalId: varchar('external_id', { length: 255 }),
    name: varchar('name', { length: 255 }).notNull(),
    color: varchar('color', { length: 32 }).notNull().default('#6D59E0'),
    enabled: boolean('enabled').notNull().default(true),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('calendars_user_id_idx').on(table.userId),
    index('calendars_provider_idx').on(table.provider),
    uniqueIndex('calendars_one_primary_local_per_user')
      .on(table.userId)
      .where(sql`${table.provider} = 'local' and ${table.isPrimary} = true`),
  ]
);

export type CalendarRow = typeof calendars.$inferSelect;
export type NewCalendarRow = typeof calendars.$inferInsert;
