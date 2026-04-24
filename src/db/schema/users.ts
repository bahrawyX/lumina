import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

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
    timezone: text('timezone').notNull().default('UTC'),
    /** Active cosmetics: { accentColor?: string, confetti?: boolean } */
    activeCosmetics: jsonb('active_cosmetics').$type<{
      accentColor?: string;
      confetti?: boolean;
    }>().default({}),
    /** Permanently owned item IDs */
    ownedItems: jsonb('owned_items').$type<string[]>().default([]),
    /** Consumable power-up counts */
    consumables: jsonb('consumables').$type<{
      focusBoost: number;
      streakShield: number;
      taskMultiplier: number;
      autoPlan: number;
      goalAccelerator: number;
    }>().default({ focusBoost: 0, streakShield: 0, taskMultiplier: 0, autoPlan: 0, goalAccelerator: 0 }),
    notificationPreferences: jsonb('notification_preferences').$type<{
      dailyBrief: boolean;
      eventReminders: boolean;
      streakReminder: boolean;
      taskReminders: boolean;
      focusComplete: boolean;
    }>().default({
      dailyBrief: true,
      eventReminders: true,
      streakReminder: true,
      taskReminders: true,
      focusComplete: false,
    }),
    workStart: varchar('work_start', { length: 5 }).default('09:00'),
    workEnd: varchar('work_end', { length: 5 }).default('17:00'),
    shortBreakMins: integer('short_break_mins').notNull().default(5),
    longBreakMins: integer('long_break_mins').notNull().default(20),
    sessionsPerCycle: integer('sessions_per_cycle').notNull().default(4),
    ambientTrack: varchar('ambient_track', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('users_email_idx').on(table.email)]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
