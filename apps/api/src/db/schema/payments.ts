import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PaymentStatus } from '@eventora/shared';
import { paymentStatusEnum } from './enums';
import { registrations } from './registrations';

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  registrationId: uuid('registration_id')
    .notNull()
    .references(() => registrations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('SANDBOX'),
  providerRef: text('provider_ref').notNull().unique(),
  amountPaise: integer('amount_paise').notNull(),
  status: paymentStatusEnum('status').notNull().default(PaymentStatus.PENDING),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // CHARGE, REFUND
  amountPaise: integer('amount_paise').notNull(),
  balanceAfterPaise: integer('balance_after_paise').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
