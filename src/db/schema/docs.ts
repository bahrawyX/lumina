import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { tasks } from './tasks';
import { events } from './events';

export const docs = pgTable(
  'docs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    title: varchar('title', { length: 512 }).notNull().default('Untitled'),
    content: jsonb('content'),
    contentText: text('content_text').default(''),
    icon: varchar('icon', { length: 64 }),
    coverImage: text('cover_image'),
    coverGradient: integer('cover_gradient'),
    isArchived: boolean('is_archived').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    position: integer('position').notNull().default(0),
    linkedTaskId: uuid('linked_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    linkedEventId: uuid('linked_event_id').references(() => events.id, { onDelete: 'set null' }),
    wordCount: integer('word_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('docs_user_id_idx').on(table.userId),
    index('docs_parent_id_idx').on(table.parentId),
    index('docs_user_parent_idx').on(table.userId, table.parentId),
    index('docs_linked_task_id_idx').on(table.linkedTaskId),
    index('docs_linked_event_id_idx').on(table.linkedEventId),
    index('docs_content_fts_idx').using(
      'gin',
      sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || coalesce(${table.contentText}, ''))`
    ),
  ]
);

export type DocRow = typeof docs.$inferSelect;
export type NewDocRow = typeof docs.$inferInsert;
