import {
  char,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { TicketStatus } from '@eventora/shared';
import { scanModeEnum, scanResultEnum, ticketStatusEnum } from './enums';
import { events } from './events';
import { registrations } from './registrations';
import { users } from './users';

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .unique()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: char('token', { length: 32 }).notNull().unique(),
    status: ticketStatusEnum('status').notNull().default(TicketStatus.VALID),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    checkedInBy: uuid('checked_in_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    checkedInVia: text('checked_in_via'), // SCANNER, SPOT_WALKIN
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tickets_event_status_idx').on(table.eventId, table.status),
    index('tickets_event_checked_in_at_idx').on(table.eventId, table.checkedInAt),
    index('tickets_event_checked_in_via_idx').on(table.eventId, table.checkedInVia),
  ]
);

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

export const ticketRedemptions = pgTable(
  'ticket_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    kind: scanModeEnum('kind').notNull(), // MEAL, KIT
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
    redeemedBy: uuid('redeemed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('ticket_redemptions_ticket_kind_idx').on(table.ticketId, table.kind),
  ]
);

export type TicketRedemption = typeof ticketRedemptions.$inferSelect;
export type NewTicketRedemption = typeof ticketRedemptions.$inferInsert;

export const scannerPasskeys = pgTable(
  'scanner_passkeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    passkeyHash: text('passkey_hash').notNull(), // sha256 of full code
    label: text('label').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('scanner_passkeys_event_hash_idx').on(
      table.eventId,
      table.passkeyHash
    ),
  ]
);

export type ScannerPasskey = typeof scannerPasskeys.$inferSelect;
export type NewScannerPasskey = typeof scannerPasskeys.$inferInsert;

export const scannerSessions = pgTable('scanner_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  passkeyId: uuid('passkey_id')
    .notNull()
    .references(() => scannerPasskeys.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  volunteerName: text('volunteer_name'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ScannerSession = typeof scannerSessions.$inferSelect;
export type NewScannerSession = typeof scannerSessions.$inferInsert;

export const scanLogs = pgTable(
  'scan_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tokenPrefixHash: text('token_prefix_hash').notNull(),
    mode: scanModeEnum('mode').notNull(),
    result: scanResultEnum('result').notNull(),
    scannerUserId: uuid('scanner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    passkeyId: uuid('passkey_id').references(() => scannerPasskeys.id, {
      onDelete: 'set null',
    }),
    ticketId: uuid('ticket_id').references(() => tickets.id, {
      onDelete: 'set null',
    }),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('scan_logs_event_scanned_at_idx').on(table.eventId, table.scannedAt),
    index('scan_logs_event_result_idx').on(table.eventId, table.result),
    index('scan_logs_event_ticket_id_idx').on(table.eventId, table.ticketId),
  ]
);

export type ScanLog = typeof scanLogs.$inferSelect;
export type NewScanLog = typeof scanLogs.$inferInsert;
