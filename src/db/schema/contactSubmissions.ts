import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const contactSubmissions = pgTable(
  'contact_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 32 }).notNull(),
    subject: varchar('subject', { length: 100 }).notNull(),
    message: text('message').notNull(),
    email: varchar('email', { length: 255 }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  }
);

export type ContactSubmissionRow = typeof contactSubmissions.$inferSelect;
export type NewContactSubmissionRow = typeof contactSubmissions.$inferInsert;
