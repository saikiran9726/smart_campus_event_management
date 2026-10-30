import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { EventStatus } from '@eventora/shared';
import { clubs } from './clubs';
import { tstzrange } from './custom-types';
import { eventStatusEnum } from './enums';
import { eventProposals } from './proposals';
import { users } from './users';
import { avResources, venues } from './venues';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id').references(() => eventProposals.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull(),
    agenda: jsonb('agenda'),
    notes: jsonb('notes'),
    category: text('category').notNull(),
    posterKey: text('poster_key'),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    registrationOpensAt: timestamp('registration_opens_at', {
      withTimezone: true,
    }).notNull(),
    registrationClosesAt: timestamp('registration_closes_at', {
      withTimezone: true,
    }).notNull(),
    status: eventStatusEnum('status').notNull().default(EventStatus.DRAFT),
    capacity: integer('capacity').notNull(),
    remainingCapacity: integer('remaining_capacity').notNull(),
    pricePaise: integer('price_paise').notNull().default(0),
    isPaid: boolean('is_paid').notNull().default(false),
    isCompetition: boolean('is_competition').notNull().default(false),
    minTeamSize: integer('min_team_size'),
    maxTeamSize: integer('max_team_size'),
    formFrozenAt: timestamp('form_frozen_at', { withTimezone: true }),
    checkinClosedAt: timestamp('checkin_closed_at', { withTimezone: true }),
    strikesProcessedAt: timestamp('strikes_processed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('events_status_start_at_idx').on(table.status, table.startAt),
    index('events_club_id_idx').on(table.clubId),
    check('events_remaining_nonneg', sql`${table.remainingCapacity} >= 0`),
    check('events_remaining_le_capacity', sql`${table.remainingCapacity} <= ${table.capacity}`),
    check('events_end_after_start', sql`${table.endAt} > ${table.startAt}`),
    check(
      'events_competition_team_sizes',
      sql`(NOT ${table.isCompetition}) OR (${table.minTeamSize} >= 1 AND ${table.maxTeamSize} >= ${table.minTeamSize})`
    ),
  ]
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export const eventAvBookings = pgTable('event_av_bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  avResourceId: uuid('av_resource_id')
    .notNull()
    .references(() => avResources.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull().default(1),
  during: tstzrange('during').notNull(),
});

export type EventAvBooking = typeof eventAvBookings.$inferSelect;
export type NewEventAvBooking = typeof eventAvBookings.$inferInsert;

export const venueBookings = pgTable('venue_bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  proposalId: uuid('proposal_id').references(() => eventProposals.id, {
    onDelete: 'cascade',
  }),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id, { onDelete: 'cascade' }),
  during: tstzrange('during').notNull(),
  status: text('status').notNull().default('ACTIVE'),
});

export type VenueBooking = typeof venueBookings.$inferSelect;
export type NewVenueBooking = typeof venueBookings.$inferInsert;
