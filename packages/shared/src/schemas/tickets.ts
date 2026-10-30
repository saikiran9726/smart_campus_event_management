import { z } from 'zod';
import { NotificationChannel, TicketStatus } from '../enums';
import { isoDateTimeSchema, uuidSchema } from './common';

export const ticketResponseSchema = z.object({
  id: uuidSchema,
  registrationId: uuidSchema,
  eventId: uuidSchema,
  eventTitle: z.string().optional(),
  eventVenue: z.string().optional(),
  eventStartAt: isoDateTimeSchema.optional(),
  attendeeId: uuidSchema,
  attendeeName: z.string().optional(),
  attendeeEmail: z.string().email().optional(),
  qrToken: z.string().min(1),
  status: z.nativeEnum(TicketStatus),
  checkedInAt: isoDateTimeSchema.nullable().optional(),
  kitCollectedAt: isoDateTimeSchema.nullable().optional(),
  mealCollectedAt: isoDateTimeSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type TicketResponse = z.infer<typeof ticketResponseSchema>;

export const resendTicketSchema = z.object({
  ticketId: uuidSchema,
  channel: z.nativeEnum(NotificationChannel).default(NotificationChannel.EMAIL),
});

export type ResendTicketInput = z.infer<typeof resendTicketSchema>;
