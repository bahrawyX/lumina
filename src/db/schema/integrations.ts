import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const integrationProviderEnum = pgEnum('integration_provider', [
  'google',
  'microsoft',
  'outlook',
]);

export const integrationStatusEnum = pgEnum('integration_status', [
  'active',
  'disconnected',
  'error',
]);

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: integrationProviderEnum('provider').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    scope: text('scope'),
    tokenType: text('token_type'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    status: integrationStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('integrations_user_provider_idx').on(table.userId, table.provider),
    uniqueIndex('integrations_user_provider_unique').on(table.userId, table.provider),
  ]
);

export type IntegrationRow = typeof integrations.$inferSelect;
export type NewIntegrationRow = typeof integrations.$inferInsert;
