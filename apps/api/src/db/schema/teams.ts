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
    inviteCode: text('invite_code').notNull(),
    codeStatus: text('code_status').notNull().default('ACTIVE'), // ACTIVE, REVOKED, EXPIRED
    codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
    inviteToken: text('invite_token'),
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
    uniqueIndex('teams_invite_token_idx').on(table.inviteToken),
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

export const teamInvitations = pgTable(
  'team_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedEmail: text('invited_email'),
    invitedRollNumber: text('invited_roll_number'),
    invitedUserId: uuid('invited_user_id').references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('PENDING'), // PENDING, ACCEPTED, REJECTED, CANCELLED, EXPIRED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  }
);

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type NewTeamInvitation = typeof teamInvitations.$inferInsert;
