import { z } from 'zod';
import { ScanMode, ScanResult, TicketStatus } from '../enums';
import { isoDateTimeSchema, uuidSchema } from './common';

export const gateScanSchema = z.object({
  passkey: z.string().min(6).max(20),
  qrToken: z.string().min(10).max(64),
  mode: z.nativeEnum(ScanMode).default(ScanMode.GATE),
});

export type GateScanInput = z.infer<typeof gateScanSchema>;

export const gateManualLookupSchema = z.object({
  passkey: z.string().min(6).max(20),
  eventId: uuidSchema,
  query: z.string().min(2).max(100),
});

export type GateManualLookupInput = z.infer<typeof gateManualLookupSchema>;

export const gateSpotRegisterSchema = z.object({
  passkey: z.string().min(6).max(20),
  eventId: uuidSchema,
  attendeeName: z.string().min(2).max(100),
  attendeeEmail: z.string().email(),
  attendeePhone: z.string().min(7).max(20).optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
});

export type GateSpotRegisterInput = z.infer<typeof gateSpotRegisterSchema>;

export const gateRedeemSchema = z.object({
  passkey: z.string().min(6).max(20),
  ticketId: uuidSchema,
  mode: z.nativeEnum(ScanMode).default(ScanMode.GATE),
});

export type GateRedeemInput = z.infer<typeof gateRedeemSchema>;

export const gateAttendeeInfoSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().nullable().optional(),
  department: z.string().nullable().optional(),
});

export type GateAttendeeInfo = z.infer<typeof gateAttendeeInfoSchema>;

export const gateTicketInfoSchema = z.object({
  id: uuidSchema,
  status: z.nativeEnum(TicketStatus),
  checkedInAt: isoDateTimeSchema.nullable().optional(),
  mealCollectedAt: isoDateTimeSchema.nullable().optional(),
  kitCollectedAt: isoDateTimeSchema.nullable().optional(),
});

export type GateTicketInfo = z.infer<typeof gateTicketInfoSchema>;

export const gateScanResponseSchema = z.object({
  scanId: uuidSchema,
  result: z.nativeEnum(ScanResult),
  mode: z.nativeEnum(ScanMode),
  message: z.string(),
  attendee: gateAttendeeInfoSchema.optional(),
  ticket: gateTicketInfoSchema.optional(),
  timestamp: isoDateTimeSchema,
});

export type GateScanResponse = z.infer<typeof gateScanResponseSchema>;
