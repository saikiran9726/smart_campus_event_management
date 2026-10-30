import { z } from 'zod';
import { QuestionType } from '../enums';

export interface FormQuestionDef {
  id: string;
  type: QuestionType;
  label: string;
  description?: string;
  required: boolean;
  orderIndex: number;
  placeholder?: string;
  options?: string[];
  minSelect?: number;
  maxSelect?: number;
  minLength?: number;
  maxLength?: number;
  minNumber?: number;
  maxNumber?: number;
  regexPattern?: string;
  regexErrorMessage?: string;
  maxFileBytes?: number;
  allowedMimeTypes?: string[];
}

export const formQuestionDefSchema = z.object({
  id: z.string().min(1),
  type: z.nativeEnum(QuestionType),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  orderIndex: z.number().int().nonnegative().default(0),
  placeholder: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
  minSelect: z.number().int().positive().optional(),
  maxSelect: z.number().int().positive().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  minNumber: z.number().optional(),
  maxNumber: z.number().optional(),
  regexPattern: z.string().max(200).optional(),
  regexErrorMessage: z.string().optional(),
  maxFileBytes: z.number().int().positive().optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
});

export interface FileAnswerValue {
  objectKey: string;
  sizeBytes: number;
  mimeType: string;
}

export const fileAnswerValueSchema = z.object({
  objectKey: z.string().min(1, 'File objectKey is required'),
  sizeBytes: z.number().int().positive('File size must be positive'),
  mimeType: z.string().min(1, 'File mimeType is required'),
});

export type FormAnswerMap = Record<string, unknown>;
