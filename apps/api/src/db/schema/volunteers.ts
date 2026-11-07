import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { events } from './events';
import { users } from './users';

export const volunteerStatusEnum = pgEnum('volunteer_status', [
  'ACTIVE',
  'REVOKED',
]);

export const eventVolunteers = pgTable(
  'event_volunteers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gate: text('gate').notNull().default('Main Gate'),
    role: text('role').notNull().default('SCANNER'),
    assignedBy: uuid('assigned_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: volunteerStatusEnum('status').notNull().default('ACTIVE'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('event_volunteers_event_user_idx').on(table.eventId, table.userId),
    index('event_volunteers_user_id_idx').on(table.userId),
    index('event_volunteers_event_id_idx').on(table.eventId),
    index('event_volunteers_status_idx').on(table.status),
  ]
);

export type EventVolunteer = typeof eventVolunteers.$inferSelect;
export type NewEventVolunteer = typeof eventVolunteers.$inferInsert;

export const volunteerInvitations = pgTable(
  'volunteer_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    gate: text('gate').notNull().default('Main Gate'),
    role: text('role').notNull().default('SCANNER'),
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    token: text('token').notNull().unique(),
    status: text('status').notNull().default('PENDING'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('volunteer_invitations_email_idx').on(table.email),
    index('volunteer_invitations_event_id_idx').on(table.eventId),
    uniqueIndex('volunteer_invitations_token_idx').on(table.token),
  ]
);

export type VolunteerInvitation = typeof volunteerInvitations.$inferSelect;
export type NewVolunteerInvitation = typeof volunteerInvitations.$inferInsert;
