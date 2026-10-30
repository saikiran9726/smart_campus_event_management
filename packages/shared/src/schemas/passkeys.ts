import { z } from 'zod';
import { ScanMode } from '../enums';
import { isoDateTimeSchema, uuidSchema } from './common';

export const createPasskeySchema = z.object({
  eventId: uuidSchema,
  mode: z.nativeEnum(ScanMode).default(ScanMode.GATE),
  label: z.string().min(2).max(100),
  expiresAt: isoDateTimeSchema,
});

export type CreatePasskeyInput = z.infer<typeof createPasskeySchema>;

export const unlockPasskeySchema = z.object({
  passkey: z.string().min(6).max(20),
});

export type UnlockPasskeyInput = z.infer<typeof unlockPasskeySchema>;

export const revokePasskeySchema = z.object({
  passkeyId: uuidSchema,
});

export type RevokePasskeyInput = z.infer<typeof revokePasskeySchema>;

export const passkeyResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  eventTitle: z.string().optional(),
  mode: z.nativeEnum(ScanMode),
  digits: z.string().length(6),
  label: z.string(),
  isActive: z.boolean(),
  expiresAt: isoDateTimeSchema,
  createdById: uuidSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type PasskeyResponse = z.infer<typeof passkeyResponseSchema>;
