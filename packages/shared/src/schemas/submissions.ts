import { z } from 'zod';
import { MAX_UPLOAD_BYTES } from '../constants';
import { isoDateTimeSchema, uuidSchema } from './common';

export const projectSubmissionFieldConfigSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean().default(true),
  required: z.boolean().default(false),
  type: z.enum(['text', 'textarea', 'url', 'file']).default('text'),
});

export type ProjectSubmissionFieldConfig = z.infer<typeof projectSubmissionFieldConfigSchema>;

export const projectSubmissionConfigSchema = z.object({
  enabled: z.boolean().default(false),
  requirement: z.enum(['OPTIONAL', 'MANDATORY']).default('OPTIONAL'),
  timing: z.enum(['DURING_REGISTRATION', 'AFTER_REGISTRATION']).default('AFTER_REGISTRATION'),
  deadline: z.string().nullable().optional(),
  allowEditAfterSubmission: z.boolean().default(true),
  fields: z.array(projectSubmissionFieldConfigSchema).default([]),
});

export type ProjectSubmissionConfig = z.infer<typeof projectSubmissionConfigSchema>;

export const DEFAULT_SUBMISSION_FIELDS: ProjectSubmissionFieldConfig[] = [
  { key: 'title', label: 'Project Title', enabled: true, required: true, type: 'text' },
  { key: 'abstract', label: 'Project Abstract & Overview', enabled: true, required: true, type: 'textarea' },
  { key: 'demoUrl', label: 'Demo URL / Video', enabled: true, required: false, type: 'url' },
  { key: 'repoUrl', label: 'GitHub / GitLab Repository', enabled: true, required: true, type: 'url' },
  { key: 'deckKey', label: 'Slide Deck / PDF Document', enabled: true, required: false, type: 'file' },
];

export const DEFAULT_PROJECT_SUBMISSION_CONFIG: ProjectSubmissionConfig = {
  enabled: false,
  requirement: 'OPTIONAL',
  timing: 'AFTER_REGISTRATION',
  deadline: null,
  allowEditAfterSubmission: true,
  fields: DEFAULT_SUBMISSION_FIELDS,
};

export const submitProjectDeliverablesSchema = z.object({
  projectTitle: z.string().optional().nullable(),
  abstract: z.string().max(2000).optional().nullable(),
  repoUrl: z.string().optional().nullable(),
  demoUrl: z.string().optional().nullable(),
  deckKey: z.string().optional().nullable(),
  customFields: z.record(z.unknown()).optional().default({}),
});

export type SubmitProjectDeliverablesInput = z.infer<typeof submitProjectDeliverablesSchema>;

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
