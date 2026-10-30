import {
  char,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { TeamStatus } from '@eventora/shared';
import { teamStatusEnum } from './enums';
import { events } from './events';
import { users } from './users';

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    leaderId: uuid('leader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteCode: char('invite_code', { length: 6 }).notNull(),
    status: teamStatusEnum('status').notNull().default(TeamStatus.FORMING),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    projectTitle: text('project_title'),
    projectAbstract: text('project_abstract'),
    repoUrl: text('repo_url'),
    demoUrl: text('demo_url'),
    deckKey: text('deck_key'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('teams_event_invite_code_idx').on(table.eventId, table.inviteCode),
    uniqueIndex('teams_event_name_idx').on(table.eventId, table.name),
  ]
);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    role: text('role').notNull().default('MEMBER'),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    uniqueIndex('team_members_event_user_idx').on(table.eventId, table.userId),
  ]
);

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export const teamRosterSnapshots = pgTable('team_roster_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TeamRosterSnapshot = typeof teamRosterSnapshots.$inferSelect;
export type NewTeamRosterSnapshot = typeof teamRosterSnapshots.$inferInsert;

export const teammatePool = pgTable(
  'teammate_pool',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skills: text('skills').array(),
    bio: text('bio'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
  ]
);

export type TeammatePoolEntry = typeof teammatePool.$inferSelect;
export type NewTeammatePoolEntry = typeof teammatePool.$inferInsert;
