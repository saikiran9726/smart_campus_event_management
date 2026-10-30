import { z } from 'zod';
import { isoDateTimeSchema, paginationQuerySchema, uuidSchema } from './common';

export const createDoubtSchema = z.object({
  eventId: uuidSchema,
  title: z.string().min(3).max(200),
  body: z.string().min(5).max(4000),
  isAnonymous: z.boolean().default(false),
});

export type CreateDoubtInput = z.infer<typeof createDoubtSchema>;

export const answerDoubtSchema = z.object({
  answerBody: z.string().min(1).max(4000),
});

export type AnswerDoubtInput = z.infer<typeof answerDoubtSchema>;

export const resolveDoubtSchema = z.object({
  isResolved: z.boolean().default(true),
});

export type ResolveDoubtInput = z.infer<typeof resolveDoubtSchema>;

export const doubtResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  studentId: uuidSchema,
  studentName: z.string(),
  isAnonymous: z.boolean(),
  title: z.string(),
  body: z.string(),
  isResolved: z.boolean(),
  answerBody: z.string().nullable().optional(),
  answeredByUserId: uuidSchema.nullable().optional(),
  answeredByName: z.string().nullable().optional(),
  answeredAt: isoDateTimeSchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DoubtResponse = z.infer<typeof doubtResponseSchema>;

export const doubtListQuerySchema = paginationQuerySchema.extend({
  eventId: uuidSchema,
  resolved: z.coerce.boolean().optional(),
});

export type DoubtListQuery = z.infer<typeof doubtListQuerySchema>;
