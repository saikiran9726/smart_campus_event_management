import { z } from 'zod';
import { moneyPaiseSchema, uuidSchema } from './common';

export const analyticsSummaryResponseSchema = z.object({
  eventId: uuidSchema,
  totalRegistrations: z.number().int().nonnegative(),
  confirmedCount: z.number().int().nonnegative(),
  waitlistCount: z.number().int().nonnegative(),
  checkedInCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative(),
  noShowCount: z.number().int().nonnegative(),
  totalRevenuePaise: moneyPaiseSchema,
  attendanceRatePercent: z.number().min(0).max(100),
  strikesIssuedCount: z.number().int().nonnegative(),
});

export type AnalyticsSummaryResponse = z.infer<typeof analyticsSummaryResponseSchema>;
