import { boolean, date, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: text('name'),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    avatar: text('avatar'),
    focusSessionLength: integer('focus_session_length').notNull().default(25),
    coins: integer('coins').notNull().default(0),
    dailyStreak: integer('daily_streak').notNull().default(0),
    bestDailyStreak: integer('best_daily_streak').notNull().default(0),
    sessionStreak: integer('session_streak').notNull().default(0),
    bestSessionStreak: integer('best_session_streak').notNull().default(0),
    lastFocusDate: date('last_focus_date'),
    lastSessionAt: timestamp('last_session_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('users_email_idx').on(table.email)]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
