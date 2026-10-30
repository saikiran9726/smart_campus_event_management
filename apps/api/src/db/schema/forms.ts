import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { QuestionType } from '@eventora/shared';
import { questionTypeEnum } from './enums';
import { events } from './events';

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
