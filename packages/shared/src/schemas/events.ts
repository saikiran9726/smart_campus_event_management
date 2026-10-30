import { z } from 'zod';
import { EventStatus } from '../enums';
import { isoDateTimeSchema, moneyPaiseSchema, paginationQuerySchema, uuidSchema } from './common';

export const createEventSchema = z
  .object({
    title: z.string().min(3).max(150),
    slug: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must consist of lowercase alphanumeric chars and hyphens'),
    clubId: uuidSchema,
    category: z.string().min(2).max(50),
    shortDescription: z.string().min(5).max(300),
    description: z.string().min(20).max(10000),
    venue: z.string().min(2).max(100),
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
    capacity: z.number().int().positive('Capacity must be greater than 0'),
    isTeamEvent: z.boolean().default(false),
    minTeamSize: z.number().int().min(1).default(1),
    maxTeamSize: z.number().int().min(1).default(1),
    pricePaise: moneyPaiseSchema.default(0),
    coverImageUrl: z.string().url().optional(),
    requiresApproval: z.boolean().default(false),
    formId: uuidSchema.optional(),
  })
  .refine(
    (data) => {
      const start = new Date(data.startAt).getTime();
      const end = new Date(data.endAt).getTime();
      return end > start;
    },
    {
      message: 'End date/time must be after start date/time',
      path: ['endAt'],
    }
  )
  .refine(
    (data) => {
      if (data.isTeamEvent) {
        return data.maxTeamSize >= data.minTeamSize;
      }
      return true;
    },
    {
      message: 'maxTeamSize must be greater than or equal to minTeamSize',
      path: ['maxTeamSize'],
    }
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    title: z.string().min(3).max(150).optional(),
    slug: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    category: z.string().min(2).max(50).optional(),
    shortDescription: z.string().min(5).max(300).optional(),
    description: z.string().min(20).max(10000).optional(),
    venue: z.string().min(2).max(100).optional(),
    startAt: isoDateTimeSchema.optional(),
    endAt: isoDateTimeSchema.optional(),
    capacity: z.number().int().positive().optional(),
    isTeamEvent: z.boolean().optional(),
    minTeamSize: z.number().int().min(1).optional(),
    maxTeamSize: z.number().int().min(1).optional(),
    pricePaise: moneyPaiseSchema.optional(),
    coverImageUrl: z.string().url().nullable().optional(),
    requiresApproval: z.boolean().optional(),
    formId: uuidSchema.nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.startAt && data.endAt) {
        return new Date(data.endAt).getTime() > new Date(data.startAt).getTime();
      }
      return true;
    },
    {
      message: 'End date/time must be after start date/time',
      path: ['endAt'],
    }
  );

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const publishEventSchema = z.object({
  eventId: uuidSchema,
});

export type PublishEventInput = z.infer<typeof publishEventSchema>;

export const eventListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  category: z.string().optional(),
  status: z.nativeEnum(EventStatus).optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  clubId: uuidSchema.optional(),
});

export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const eventResponseSchema = z.object({
  id: uuidSchema,
  clubId: uuidSchema,
  clubName: z.string().optional(),
  title: z.string(),
  slug: z.string(),
  category: z.string(),
  shortDescription: z.string(),
  description: z.string(),
  venue: z.string(),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  capacity: z.number().int().positive(),
  confirmedCount: z.number().int().nonnegative(),
  waitlistCount: z.number().int().nonnegative(),
  remainingSeats: z.number().int(),
  isTeamEvent: z.boolean(),
  minTeamSize: z.number().int().positive(),
  maxTeamSize: z.number().int().positive(),
  pricePaise: moneyPaiseSchema,
  coverImageUrl: z.string().url().nullable().optional(),
  status: z.nativeEnum(EventStatus),
  requiresApproval: z.boolean(),
  formId: uuidSchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type EventResponse = z.infer<typeof eventResponseSchema>;
