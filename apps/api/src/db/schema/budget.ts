import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clubs } from './clubs';
import { events } from './events';
import { users } from './users';

export const budgetAllocations = pgTable('budget_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id')
    .notNull()
    .references(() => clubs.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  title: text('title').notNull().default('General Allocation'),
  category: text('category').notNull().default('GENERAL'),
  allocatedPaise: integer('allocated_paise').notNull(),
  spentPaise: integer('spent_paise').notNull().default(0),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BudgetAllocation = typeof budgetAllocations.$inferSelect;
export type NewBudgetAllocation = typeof budgetAllocations.$inferInsert;

export const expenseItems = pgTable('expense_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  allocationId: uuid('allocation_id')
    .notNull()
    .references(() => budgetAllocations.id, { onDelete: 'cascade' }),
  category: text('category').notNull(), // CATERING, PRINTING, PRIZES, OTHER
  description: text('description').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  receiptKey: text('receipt_key').notNull(),
  signedOffBy: uuid('signed_off_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ExpenseItem = typeof expenseItems.$inferSelect;
export type NewExpenseItem = typeof expenseItems.$inferInsert;
