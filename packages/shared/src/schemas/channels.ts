import { z } from 'zod';
import { ChannelKind } from '../enums';
import { isoDateTimeSchema, paginationQuerySchema, uuidSchema } from './common';

export const createMessageSchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  body: z.string().min(1).max(4000).optional(),
  replyToId: uuidSchema.optional(),
  attachments: z.array(z.string().min(1)).default([]),
}).refine((data) => data.content !== undefined || data.body !== undefined, {
  message: 'Either body or content is required',
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const postMessageBodySchema = z.object({
  body: z.string().min(1).max(4000),
  replyToId: uuidSchema.optional(),
});

export type PostMessageBody = z.infer<typeof postMessageBodySchema>;

export const markReadSchema = z.object({
  lastMessageId: uuidSchema,
});

export type MarkReadInput = z.infer<typeof markReadSchema>;

export const channelMessagesQuerySchema = paginationQuerySchema.extend({
  cursor: z.string().optional(),
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
