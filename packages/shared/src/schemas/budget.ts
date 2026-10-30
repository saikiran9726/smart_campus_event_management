import { z } from 'zod';
import { isoDateTimeSchema, moneyPaiseSchema, uuidSchema } from './common';

export const budgetAllocationSchema = z.object({
  eventId: uuidSchema,
  totalAllocatedPaise: moneyPaiseSchema,
  notes: z.string().max(1000).optional(),
});

export type BudgetAllocationInput = z.infer<typeof budgetAllocationSchema>;

export const expenseLineItemSchema = z.object({
  eventId: uuidSchema,
  category: z.string().min(2).max(50),
  description: z.string().min(3).max(255),
  amountPaise: moneyPaiseSchema.positive('Expense amount must be positive'),
  receiptR2Key: z.string().min(1, 'Receipt R2 key is required'),
  vendorName: z.string().min(2).max(100),
  incurredAt: isoDateTimeSchema,
});

export type ExpenseLineItemInput = z.infer<typeof expenseLineItemSchema>;

export const expenseResponseItemSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  category: z.string(),
  description: z.string(),
  amountPaise: moneyPaiseSchema,
  receiptR2Key: z.string(),
  vendorName: z.string(),
  incurredAt: isoDateTimeSchema,
  recordedByUserId: uuidSchema,
  createdAt: isoDateTimeSchema,
});

export type ExpenseResponseItem = z.infer<typeof expenseResponseItemSchema>;

export const budgetSummaryResponseSchema = z.object({
  eventId: uuidSchema,
  totalAllocatedPaise: moneyPaiseSchema,
  totalSpentPaise: moneyPaiseSchema,
  remainingPaise: z.number().int(),
  expenses: z.array(expenseResponseItemSchema),
});

export type BudgetSummaryResponse = z.infer<typeof budgetSummaryResponseSchema>;
