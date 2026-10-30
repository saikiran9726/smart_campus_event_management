import { z } from 'zod';
import { MAX_UPLOAD_BYTES } from '../constants';
import { isoDateTimeSchema, uuidSchema } from './common';

export const createSubmissionSchema = z.object({
  eventId: uuidSchema,
  teamId: uuidSchema.optional(),
  r2ObjectKey: z.string().min(1, 'R2 object key is required'),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  mimeType: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  repositoryUrl: z.string().url().optional(),
  demoUrl: z.string().url().optional(),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const updateSubmissionSchema = createSubmissionSchema.partial().omit({
  eventId: true,
  teamId: true,
});

export type UpdateSubmissionInput = z.infer<typeof updateSubmissionSchema>;

export const submissionResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  teamId: uuidSchema.nullable().optional(),
  submittedByUserId: uuidSchema,
  r2ObjectKey: z.string(),
  fileName: z.string(),
  fileSize: z.number().int().positive(),
  mimeType: z.string(),
  description: z.string().nullable().optional(),
  repositoryUrl: z.string().url().nullable().optional(),
  demoUrl: z.string().url().nullable().optional(),
  submittedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;
