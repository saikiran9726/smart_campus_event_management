import { z } from 'zod';
import { PaymentStatus } from '../enums';
import { isoDateTimeSchema, moneyPaiseSchema, uuidSchema } from './common';

export const sandboxCheckoutRequestSchema = z.object({
  registrationId: uuidSchema,
});

export type SandboxCheckoutRequest = z.infer<typeof sandboxCheckoutRequestSchema>;

export const sandboxCheckoutResponseSchema = z.object({
  paymentId: uuidSchema,
  registrationId: uuidSchema,
  amountPaise: moneyPaiseSchema,
  status: z.nativeEnum(PaymentStatus),
  checkoutUrl: z.string().url(),
  expiresAt: isoDateTimeSchema,
});

export type SandboxCheckoutResponse = z.infer<typeof sandboxCheckoutResponseSchema>;

export const sandboxWebhookSchema = z.object({
  paymentId: uuidSchema,
  registrationId: uuidSchema,
  status: z.enum([PaymentStatus.SUCCEEDED, PaymentStatus.FAILED]),
  simulationSecret: z.string().min(1),
  failureReason: z.string().optional(),
});

export type SandboxWebhookInput = z.infer<typeof sandboxWebhookSchema>;

export const paymentResponseSchema = z.object({
  id: uuidSchema,
  registrationId: uuidSchema,
  eventId: uuidSchema,
  userId: uuidSchema,
  amountPaise: moneyPaiseSchema,
  status: z.nativeEnum(PaymentStatus),
  transactionRef: z.string(),
  failureReason: z.string().nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type PaymentResponse = z.infer<typeof paymentResponseSchema>;
