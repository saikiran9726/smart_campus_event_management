import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { events } from './events';
import { registrations } from './registrations';
import { teams } from './teams';
import { users } from './users';

export const projectSubmissions = pgTable(
  'project_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id').references(() => registrations.id, {
      onDelete: 'cascade',
    }),
    projectTitle: text('project_title'),
    projectAbstract: text('project_abstract'),
    demoUrl: text('demo_url'),
    repoUrl: text('repo_url'),
    deckKey: text('deck_key'),
    customFields: jsonb('custom_fields').default({}),
    status: varchar('status', { length: 20 }).notNull().default('SUBMITTED'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('project_submissions_event_team_idx')
      .on(table.eventId, table.teamId)
      .where(sql`team_id IS NOT NULL`),
    uniqueIndex('project_submissions_event_user_idx')
      .on(table.eventId, table.userId)
      .where(sql`team_id IS NULL`),
    index('project_submissions_event_id_idx').on(table.eventId),
    index('project_submissions_user_id_idx').on(table.userId),
    index('project_submissions_team_id_idx').on(table.teamId),
  ]
);

export type ProjectSubmission = typeof projectSubmissions.$inferSelect;
export type NewProjectSubmission = typeof projectSubmissions.$inferInsert;
