import { relations } from 'drizzle-orm';
import { accounts } from './accounts';
import { calendars } from './calendars';
import { events } from './events';
import { focusSessions } from './focusSessions';
import { integrations } from './integrations';
import { plannerItems } from './plannerItems';
import { sessions } from './sessions';
import { tasks } from './tasks';
import { users } from './users';
import { verifications } from './verifications';

export * from './users';
export * from './accounts';
export * from './sessions';
export * from './verifications';
export * from './calendars';
export * from './events';
export * from './tasks';
export * from './plannerItems';
export * from './focusSessions';
export * from './integrations';

export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
	sessions: many(sessions),
	calendars: many(calendars),
	events: many(events),
	tasks: many(tasks),
	plannerItems: many(plannerItems),
	focusSessions: many(focusSessions),
	integrations: many(integrations),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

export const calendarsRelations = relations(calendars, ({ one, many }) => ({
	user: one(users, {
		fields: [calendars.userId],
		references: [users.id],
	}),
	events: many(events),
}));

export const eventsRelations = relations(events, ({ one }) => ({
	user: one(users, {
		fields: [events.userId],
		references: [users.id],
	}),
	calendar: one(calendars, {
		fields: [events.calendarId],
		references: [calendars.id],
	}),
	task: one(tasks, {
		fields: [events.linkedTaskId],
		references: [tasks.id],
	}),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
	user: one(users, {
		fields: [tasks.userId],
		references: [users.id],
	}),
	events: many(events),
	plannerItems: many(plannerItems),
	focusSessions: many(focusSessions),
}));

export const plannerItemsRelations = relations(plannerItems, ({ one }) => ({
	user: one(users, {
		fields: [plannerItems.userId],
		references: [users.id],
	}),
	task: one(tasks, {
		fields: [plannerItems.taskId],
		references: [tasks.id],
	}),
}));

export const focusSessionsRelations = relations(focusSessions, ({ one }) => ({
	user: one(users, {
		fields: [focusSessions.userId],
		references: [users.id],
	}),
	task: one(tasks, {
		fields: [focusSessions.taskId],
		references: [tasks.id],
	}),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
	user: one(users, {
		fields: [integrations.userId],
		references: [users.id],
	}),
}));
