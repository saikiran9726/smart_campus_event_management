import { z } from 'zod';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from '../constants';
import { isoDateTimeSchema } from './common';

export const presignUploadRequestSchema = z.object({
  purpose: z.string().min(1).max(50),
  fileName: z.string().min(1).max(255),
  mimeType: z
    .string()
    .refine(
      (mime) => (ALLOWED_UPLOAD_MIME as readonly string[]).includes(mime),
      `MIME type must be one of: ${ALLOWED_UPLOAD_MIME.join(', ')}`
    ),
  sizeBytes: z
    .number()
    .int()
    .positive('File size must be positive')
    .max(MAX_UPLOAD_BYTES, `File size cannot exceed ${MAX_UPLOAD_BYTES} bytes (10MB)`),
});

export type PresignUploadRequest = z.infer<typeof presignUploadRequestSchema>;

export const presignUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  objectKey: z.string().min(1),
  expiresAt: isoDateTimeSchema,
});

export type PresignUploadResponse = z.infer<typeof presignUploadResponseSchema>;
