import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { PaymentStatus, RegistrationStatus } from '@eventora/shared';
import { paymentStatusEnum, registrationStatusEnum } from './enums';
import { events } from './events';
import { formQuestions } from './forms';
import { users } from './users';

export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: registrationStatusEnum('status')
      .notNull()
      .default(RegistrationStatus.CONFIRMED),
    paymentStatus: paymentStatusEnum('payment_status')
      .notNull()
      .default(PaymentStatus.NOT_REQUIRED),
    amountPaise: integer('amount_paise').notNull().default(0),
    formVersion: integer('form_version').notNull().default(1),
    approvalStatus: text('approval_status').notNull().default('APPROVED'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    cancellationReason: text('cancellation_reason'),
    waitlistPositionHint: integer('waitlist_position_hint'),
    offerExpiresAt: timestamp('offer_expires_at', { withTimezone: true }),
    offeredAt: timestamp('offered_at', { withTimezone: true }),
    teamId: uuid('team_id'), // Referenced to teams.id
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('registrations_event_status_created_idx').on(
      table.eventId,
      table.status,
      table.createdAt
    ),
    index('registrations_approval_status_idx').on(table.approvalStatus),
    uniqueIndex('registrations_event_user_active_idx')
      .on(table.eventId, table.userId)
      .where(sql`status NOT IN ('CANCELLED', 'EXPIRED')`),
  ]
);

export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    promotedAt: timestamp('promoted_at', { withTimezone: true }),
    status: text('status').notNull().default('QUEUED'), // QUEUED, OFFERED, CLAIMED, EXPIRED, LEFT
  },
  (table) => [
    index('waitlist_entries_event_status_created_id_idx').on(
      table.eventId,
      table.status,
      table.createdAt,
      table.id
    ),
  ]
);

export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;

export const bookingAnswers = pgTable(
  'booking_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => formQuestions.id, { onDelete: 'cascade' }),
    questionLabelSnapshot: text('question_label_snapshot').notNull(),
    questionTypeSnapshot: text('question_type_snapshot').notNull(),
    value: jsonb('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('booking_answers_reg_question_idx').on(
      table.registrationId,
      table.questionId
    ),
  ]
);

export type BookingAnswer = typeof bookingAnswers.$inferSelect;
export type NewBookingAnswer = typeof bookingAnswers.$inferInsert;
