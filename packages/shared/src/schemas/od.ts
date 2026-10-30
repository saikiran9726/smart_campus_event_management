import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

export const generateOdRequestSchema = z.object({
  registrationId: uuidSchema,
});

export type GenerateOdRequest = z.infer<typeof generateOdRequestSchema>;

export const odCertificateResponseSchema = z.object({
  certificateId: uuidSchema,
  registrationId: uuidSchema,
  eventId: uuidSchema,
  eventTitle: z.string(),
  eventDate: isoDateTimeSchema,
  studentId: uuidSchema,
  studentName: z.string(),
  rollNumber: z.string().optional(),
  department: z.string().optional(),
  verificationHash: z.string().min(16),
  sealSignature: z.string().min(16),
  issuedAt: isoDateTimeSchema,
  pdfUrl: z.string().url().optional(),
});

export type OdCertificateResponse = z.infer<typeof odCertificateResponseSchema>;

export const verifyOdCertificateSchema = z.object({
  certificateId: uuidSchema,
  verificationHash: z.string().min(16),
});

export type VerifyOdCertificateInput = z.infer<typeof verifyOdCertificateSchema>;
