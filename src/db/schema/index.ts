import { relations } from 'drizzle-orm';
import { accounts } from './accounts';
import { achievements } from './achievements';
import { calendars } from './calendars';
import { contactSubmissions } from './contactSubmissions';
import { dailyBriefCache } from './dailyBriefCache';
import { docs } from './docs';
import { eventRecurrence } from './eventRecurrence';
import { events } from './events';
import { focusSessions } from './focusSessions';
import { integrations } from './integrations';
import { moodLogs } from './moodLogs';
import { plannerItems } from './plannerItems';
import { pushSubscriptions } from './pushSubscriptions';
import { sessions } from './sessions';
import { tasks } from './tasks';
import { goals } from './goals';
import { goalTargets } from './goalTargets';
import { coinTransactions } from './coinTransactions';
import { dailyRewardCaps } from './dailyRewardCaps';
import { users } from './users';
import { verifications } from './verifications';

export * from './users';
export * from './accounts';
export * from './sessions';
export * from './verifications';
export * from './calendars';
export * from './eventRecurrence';
export * from './events';
export * from './tasks';
export * from './plannerItems';
export * from './focusSessions';
export * from './integrations';
export * from './achievements';
export * from './moodLogs';
export * from './contactSubmissions';
export * from './dailyBriefCache';
export * from './pushSubscriptions';
export * from './docs';
export * from './goals';
export * from './goalTargets';
export * from './coinTransactions';
export * from './dailyRewardCaps';
export * from './rateLimits';
export * from './notificationSends';

export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
	sessions: many(sessions),
	calendars: many(calendars),
	events: many(events),
	eventRecurrences: many(eventRecurrence),
	tasks: many(tasks),
	plannerItems: many(plannerItems),
	focusSessions: many(focusSessions),
	integrations: many(integrations),
	achievements: many(achievements),
	moodLogs: many(moodLogs),
	contactSubmissions: many(contactSubmissions),
	dailyBriefCache: many(dailyBriefCache),
	pushSubscriptions: many(pushSubscriptions),
	docs: many(docs),
	goals: many(goals),
	coinTransactions: many(coinTransactions),
	dailyRewardCaps: many(dailyRewardCaps),
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

export const eventsRelations = relations(events, ({ one, many }) => ({
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
	recurrence: many(eventRecurrence),
}));

export const eventRecurrenceRelations = relations(eventRecurrence, ({ one }) => ({
	event: one(events, {
		fields: [eventRecurrence.eventId],
		references: [events.id],
	}),
	user: one(users, {
		fields: [eventRecurrence.userId],
		references: [users.id],
	}),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
	user: one(users, {
		fields: [tasks.userId],
		references: [users.id],
	}),
	parent: one(tasks, {
		fields: [tasks.parentTaskId],
		references: [tasks.id],
		relationName: 'taskChildren',
	}),
	children: many(tasks, { relationName: 'taskChildren' }),
	events: many(events),
	plannerItems: many(plannerItems),
	focusSessions: many(focusSessions),
	docs: many(docs),
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

export const focusSessionsRelations = relations(focusSessions, ({ one, many }) => ({
	user: one(users, {
		fields: [focusSessions.userId],
		references: [users.id],
	}),
	task: one(tasks, {
		fields: [focusSessions.taskId],
		references: [tasks.id],
	}),
	moodLogs: many(moodLogs),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
	user: one(users, {
		fields: [integrations.userId],
		references: [users.id],
	}),
}));

export const achievementsRelations = relations(achievements, ({ one }) => ({
	user: one(users, {
		fields: [achievements.userId],
		references: [users.id],
	}),
}));

export const moodLogsRelations = relations(moodLogs, ({ one }) => ({
	user: one(users, {
		fields: [moodLogs.userId],
		references: [users.id],
	}),
	focusSession: one(focusSessions, {
		fields: [moodLogs.focusSessionId],
		references: [focusSessions.id],
	}),
}));

export const contactSubmissionsRelations = relations(contactSubmissions, ({ one }) => ({
	user: one(users, {
		fields: [contactSubmissions.userId],
		references: [users.id],
	}),
}));

export const dailyBriefCacheRelations = relations(dailyBriefCache, ({ one }) => ({
	user: one(users, {
		fields: [dailyBriefCache.userId],
		references: [users.id],
	}),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
	user: one(users, {
		fields: [pushSubscriptions.userId],
		references: [users.id],
	}),
}));

export const docsRelations = relations(docs, ({ one, many }) => ({
	user: one(users, {
		fields: [docs.userId],
		references: [users.id],
	}),
	parent: one(docs, {
		fields: [docs.parentId],
		references: [docs.id],
		relationName: 'docParent',
	}),
	children: many(docs, { relationName: 'docParent' }),
	linkedTask: one(tasks, {
		fields: [docs.linkedTaskId],
		references: [tasks.id],
	}),
	linkedEvent: one(events, {
		fields: [docs.linkedEventId],
		references: [events.id],
	}),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
	user: one(users, {
		fields: [goals.userId],
		references: [users.id],
	}),
	targets: many(goalTargets),
}));

export const goalTargetsRelations = relations(goalTargets, ({ one }) => ({
	goal: one(goals, {
		fields: [goalTargets.goalId],
		references: [goals.id],
	}),
}));

export const coinTransactionsRelations = relations(coinTransactions, ({ one }) => ({
	user: one(users, {
		fields: [coinTransactions.userId],
		references: [users.id],
	}),
}));

export const dailyRewardCapsRelations = relations(dailyRewardCaps, ({ one }) => ({
	user: one(users, {
		fields: [dailyRewardCaps.userId],
		references: [users.id],
	}),
}));
