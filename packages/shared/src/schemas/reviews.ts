import { z } from 'zod';
import { isoDateTimeSchema, paginationQuerySchema, uuidSchema } from './common';

export const createReviewSchema = z.object({
  eventId: uuidSchema,
  rating: z.number().int().min(1, 'Rating must be at least 1 star').max(5, 'Rating cannot exceed 5 stars'),
  feedbackText: z.string().min(3).max(1000),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const reviewResponseSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  userId: uuidSchema,
  userName: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  feedbackText: z.string(),
  createdAt: isoDateTimeSchema,
});

export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export const eventReviewsListQuerySchema = paginationQuerySchema.extend({
  eventId: uuidSchema,
});

export type EventReviewsListQuery = z.infer<typeof eventReviewsListQuerySchema>;

export const eventReviewsSummaryResponseSchema = z.object({
  eventId: uuidSchema,
  averageRating: z.number().min(0).max(5),
  totalReviews: z.number().int().nonnegative(),
  ratingBreakdown: z.object({
    1: z.number().int().nonnegative(),
    2: z.number().int().nonnegative(),
    3: z.number().int().nonnegative(),
    4: z.number().int().nonnegative(),
    5: z.number().int().nonnegative(),
  }),
  reviews: z.array(reviewResponseSchema),
});

export type EventReviewsSummaryResponse = z.infer<typeof eventReviewsSummaryResponseSchema>;
