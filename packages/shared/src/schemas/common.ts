import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Invalid ISO 8601 timestamp' })
  .or(
    z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
      message: 'Invalid date format',
    })
  );

export const moneyPaiseSchema = z
  .number()
  .int('Amount in paise must be an integer')
  .nonnegative('Amount in paise must be non-negative');

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const successResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export type SuccessResponse = z.infer<typeof successResponseSchema>;
