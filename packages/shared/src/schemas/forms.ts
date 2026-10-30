import { z } from 'zod';
import { QuestionType } from '../enums';
import { formQuestionDefSchema } from '../forms/types';
import { isoDateTimeSchema, uuidSchema } from './common';

export { formQuestionDefSchema, type FormQuestionDef } from '../forms/types';

export const createFormQuestionSchema = z.object({
  type: z.nativeEnum(QuestionType),
  label: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  required: z.boolean().default(false),
  orderIndex: z.number().int().nonnegative().default(0),
  placeholder: z.string().max(255).optional(),
  options: z.array(z.string().min(1)).optional(),
  minSelect: z.number().int().positive().optional(),
  maxSelect: z.number().int().positive().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  minNumber: z.number().optional(),
  maxNumber: z.number().optional(),
  regexPattern: z.string().max(200).optional(),
  regexErrorMessage: z.string().max(200).optional(),
  maxFileBytes: z.number().int().positive().optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
});

export type CreateFormQuestionInput = z.infer<typeof createFormQuestionSchema>;

export const updateFormQuestionSchema = createFormQuestionSchema.partial();

export type UpdateFormQuestionInput = z.infer<typeof updateFormQuestionSchema>;

export const reorderQuestionsSchema = z.object({
  items: z.array(
    z.object({
      id: uuidSchema,
      orderIndex: z.number().int().nonnegative(),
    })
  ).min(1),
});

export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsSchema>;

export const submitAnswersSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  turnstileToken: z.string().optional(),
});

export type SubmitAnswersInput = z.infer<typeof submitAnswersSchema>;

export const formResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  isFrozen: z.boolean(),
  questions: z.array(formQuestionDefSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type FormResponse = z.infer<typeof formResponseSchema>;
