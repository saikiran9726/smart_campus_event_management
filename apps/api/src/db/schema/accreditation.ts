import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clubs } from './clubs';
import { users } from './users';

export const accreditationReports = pgTable('accreditation_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id')
    .notNull()
    .references(() => clubs.id, { onDelete: 'cascade' }),
  serial: text('serial').notNull().unique(), // e.g. NAAC-2026-A1B2C3D4
  periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
  periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
  format: text('format').notNull(), // PDF, CSV, XLSX
  generatedBy: uuid('generated_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key'),
  eventCount: integer('event_count').notNull().default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AccreditationReport = typeof accreditationReports.$inferSelect;
export type NewAccreditationReport = typeof accreditationReports.$inferInsert;
