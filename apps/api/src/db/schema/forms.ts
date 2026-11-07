import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { QuestionType } from '@eventora/shared';
import { questionTypeEnum } from './enums';
import { events } from './events';
import { users } from './users';

export const formQuestions = pgTable(
  'form_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    type: questionTypeEnum('type').notNull(),
    label: text('label').notNull(),
    helpText: text('help_text'),
    placeholder: text('placeholder'),
    defaultValue: text('default_value'),
    visibility: text('visibility').notNull().default('ALWAYS'),
    required: boolean('required').notNull().default(false),
    options: jsonb('options').$type<string[]>(),
    validation: jsonb('validation').$type<Record<string, unknown>>(),
    addedAfterFreeze: boolean('added_after_freeze').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
  },
  (table) => [
    uniqueIndex('form_questions_event_position_idx').on(table.eventId, table.position),
  ]
);

export type FormQuestion = typeof formQuestions.$inferSelect;
export type NewFormQuestion = typeof formQuestions.$inferInsert;

export const formVersions = pgTable(
  'form_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    schemaSnapshot: jsonb('schema_snapshot').notNull().$type<Record<string, unknown>[]>(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('form_versions_event_version_idx').on(table.eventId, table.version),
  ]
);

export type FormVersion = typeof formVersions.$inferSelect;
export type NewFormVersion = typeof formVersions.$inferInsert;
