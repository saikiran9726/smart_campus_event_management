import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { events } from './events';
import { teams } from './teams';
import { users } from './users';

export const winners = pgTable(
  'winners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    rank: smallint('rank').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('winners_event_rank_idx').on(table.eventId, table.rank),
    check('winners_rank_check', sql`${table.rank} IN (1, 2, 3)`),
  ]
);

export type Winner = typeof winners.$inferSelect;
export type NewWinner = typeof winners.$inferInsert;

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stars: smallint('stars').notNull(),
    comment: text('comment'),
    clubStars: smallint('club_stars'),
    clubComment: text('club_comment'),
    verified: boolean('verified').notNull().default(true),
    showName: boolean('show_name').notNull().default(false),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenBy: uuid('hidden_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('reviews_event_user_idx').on(table.eventId, table.userId),
    index('reviews_event_stars_idx').on(table.eventId, table.stars),
    index('reviews_hidden_at_idx').on(table.hiddenAt),
    index('reviews_club_stars_idx').on(table.clubStars),
    check('reviews_stars_check', sql`${table.stars} >= 1 AND ${table.stars} <= 5`),
    check('reviews_club_stars_check', sql`${table.clubStars} IS NULL OR (${table.clubStars} >= 1 AND ${table.clubStars} <= 5)`),
  ]
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export const reviewReports = pgTable(
  'review_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('review_reports_review_reporter_unique').on(table.reviewId, table.reporterUserId),
    index('review_reports_review_id_idx').on(table.reviewId),
    index('review_reports_reporter_user_id_idx').on(table.reporterUserId),
  ]
);

export type ReviewReport = typeof reviewReports.$inferSelect;
export type NewReviewReport = typeof reviewReports.$inferInsert;

export const odLetters = pgTable(
  'od_letters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serial: text('serial').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    signature: text('signature').notNull(),
    pdfKey: text('pdf_key'),
  },
  (table) => [
    uniqueIndex('od_letters_event_user_idx').on(table.eventId, table.userId),
  ]
);

export type OdLetter = typeof odLetters.$inferSelect;
export type NewOdLetter = typeof odLetters.$inferInsert;

export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(), // Public verification id
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // PARTICIPATION, WINNER
  rank: smallint('rank'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  ogImageKey: text('og_image_key'),
});

export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
