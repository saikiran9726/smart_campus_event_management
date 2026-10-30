import { z } from 'zod';
import { RegistrationStatus } from '../enums';
import { isoDateTimeSchema, uuidSchema } from './common';

export const createRegistrationSchema = z.object({
  eventId: uuidSchema,
  answers: z.record(z.string(), z.unknown()).default({}),
  teamCode: z.string().optional(),
  turnstileToken: z.string().min(1, 'Turnstile verification token is required'),
});

export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>;

export const cancelRegistrationSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CancelRegistrationInput = z.infer<typeof cancelRegistrationSchema>;

export const claimOfferSchema = z.object({
  registrationId: uuidSchema,
});

export type ClaimOfferInput = z.infer<typeof claimOfferSchema>;

export const registrationResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  userId: uuidSchema,
  userName: z.string().optional(),
  userEmail: z.string().optional(),
  status: z.nativeEnum(RegistrationStatus),
  teamId: uuidSchema.nullable().optional(),
  ticketId: uuidSchema.nullable().optional(),
  offerExpiresAt: isoDateTimeSchema.nullable().optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;

export const waitlistStatusResponseSchema = z.object({
  registrationId: uuidSchema,
  eventId: uuidSchema,
  position: z.number().int().positive(),
  totalWaitlisted: z.number().int().nonnegative(),
  offeredAt: isoDateTimeSchema.nullable().optional(),
  offerExpiresAt: isoDateTimeSchema.nullable().optional(),
});

export type WaitlistStatusResponse = z.infer<typeof waitlistStatusResponseSchema>;
