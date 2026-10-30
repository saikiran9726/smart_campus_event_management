import { check, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ProposalStatus } from '@eventora/shared';
import { clubs } from './clubs';
import { proposalStatusEnum } from './enums';
import { users } from './users';
import { avResources, venues } from './venues';

export const eventProposals = pgTable(
  'event_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    proposedBy: uuid('proposed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    expectedAttendance: integer('expected_attendance').notNull(),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    status: proposalStatusEnum('status').notNull().default(ProposalStatus.PENDING),
    facultyId: uuid('faculty_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('proposals_end_after_start', sql`${table.endAt} > ${table.startAt}`),
  ]
);

export type EventProposal = typeof eventProposals.$inferSelect;
export type NewEventProposal = typeof eventProposals.$inferInsert;

export const proposalAvRequests = pgTable(
  'proposal_av_requests',
  {
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => eventProposals.id, { onDelete: 'cascade' }),
    avResourceId: uuid('av_resource_id')
      .notNull()
      .references(() => avResources.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId, table.avResourceId] }),
  ]
);

export type ProposalAvRequest = typeof proposalAvRequests.$inferSelect;
export type NewProposalAvRequest = typeof proposalAvRequests.$inferInsert;

export const magicLinkJti = pgTable('magic_link_jti', {
  jti: text('jti').primaryKey(),
  proposalId: uuid('proposal_id')
    .notNull()
    .references(() => eventProposals.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type MagicLinkJti = typeof magicLinkJti.$inferSelect;
export type NewMagicLinkJti = typeof magicLinkJti.$inferInsert;
