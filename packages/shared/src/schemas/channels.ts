import { z } from 'zod';
import { ChannelKind } from '../enums';
import { isoDateTimeSchema, paginationQuerySchema, uuidSchema } from './common';

export const createMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  attachments: z.array(z.string().min(1)).default([]),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const channelMessagesQuerySchema = paginationQuerySchema.extend({
  pinnedOnly: z.coerce.boolean().optional(),
});

export type ChannelMessagesQuery = z.infer<typeof channelMessagesQuerySchema>;

export const pinMessageSchema = z.object({
  messageId: uuidSchema,
  isPinned: z.boolean(),
});

export type PinMessageInput = z.infer<typeof pinMessageSchema>;

export const messageResponseSchema = z.object({
  id: uuidSchema,
  channelId: uuidSchema,
  senderId: uuidSchema,
  senderName: z.string(),
  senderAvatar: z.string().url().nullable().optional(),
  senderRole: z.string().optional(),
  content: z.string(),
  attachments: z.array(z.string()).default([]),
  isPinned: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;

export const channelResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema.nullable().optional(),
  clubId: uuidSchema.nullable().optional(),
  name: z.string(),
  kind: z.nativeEnum(ChannelKind),
  isArchived: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ChannelResponse = z.infer<typeof channelResponseSchema>;
