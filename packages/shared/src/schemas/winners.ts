import { z } from 'zod';
import { isoDateTimeSchema, moneyPaiseSchema, uuidSchema } from './common';

export const winnerItemSchema = z
  .object({
    rank: z.number().int().min(1).max(3),
    teamId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    prizeTitle: z.string().min(1).max(100),
    prizePaise: moneyPaiseSchema.default(0),
  })
  .refine(
    (data) => Boolean(data.teamId || data.userId),
    'Winner item must specify either a teamId or a userId'
  );

export type WinnerItem = z.infer<typeof winnerItemSchema>;

export const publishWinnersSchema = z.object({
  eventId: uuidSchema,
  winners: z.array(winnerItemSchema).min(1).max(3),
});

export type PublishWinnersInput = z.infer<typeof publishWinnersSchema>;

export const winnerResponseItemSchema = z.object({
  id: uuidSchema,
  rank: z.number().int().min(1).max(3),
  teamId: uuidSchema.nullable().optional(),
  teamName: z.string().nullable().optional(),
  userId: uuidSchema.nullable().optional(),
  userName: z.string().nullable().optional(),
  prizeTitle: z.string(),
  prizePaise: moneyPaiseSchema,
});

export type WinnerResponseItem = z.infer<typeof winnerResponseItemSchema>;

export const winnersResponseSchema = z.object({
  eventId: uuidSchema,
  eventTitle: z.string().optional(),
  publishedAt: isoDateTimeSchema,
  winners: z.array(winnerResponseItemSchema),
});

export type WinnersResponse = z.infer<typeof winnersResponseSchema>;
