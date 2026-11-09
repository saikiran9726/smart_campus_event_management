import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@eventora/shared';
import { requireRole } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import {
  deleteOwnReview,
  getClubReviewsBySlug,
  getEventReviewsBySlug,
  getReportedReviewsForAdmin,
  hideOrUnhideReview,
  reportReview,
  submitOrUpdateReview,
} from './service';

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  // 1. Submit or update review for an event (auth required, rate-limited)
  app.post(
    '/events/:eventId/reviews',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
      schema: {
        params: z.object({
          eventId: z.string().uuid(),
        }),
        body: z.object({
          stars: z.number().int().min(1).max(5),
          comment: z.string().max(1000).optional().nullable(),
          clubStars: z.number().int().min(1).max(5).optional().nullable(),
          clubComment: z.string().max(1000).optional().nullable(),
          showName: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const { stars, comment, clubStars, clubComment, showName } = request.body as {
        stars: number;
        comment?: string | null;
        clubStars?: number | null;
        clubComment?: string | null;
        showName?: boolean;
      };
      const userId = request.user!.id;

      const result = await submitOrUpdateReview({
        userId,
        eventId,
        stars,
        comment,
        clubStars,
        clubComment,
        showName,
      });

      return reply.code(result.updated ? 200 : 201).send(result);
    }
  );

  // 2. Delete caller's own review for an event (auth required)
  app.delete(
    '/events/:eventId/reviews/me',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          eventId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const userId = request.user!.id;

      const result = await deleteOwnReview(userId, eventId);
      return reply.code(200).send(result);
    }
  );

  // 3. Public reviews retrieval by event slug (with pagination)
  app.get(
    '/public/events/:slug/reviews',
    {
      schema: {
        params: z.object({
          slug: z.string().min(1),
        }),
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().positive().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const { cursor, limit } = request.query as { cursor?: string; limit?: number };
      const data = await getEventReviewsBySlug(slug, cursor, limit);
      return reply.code(200).send(data);
    }
  );

  // 4. Public reviews retrieval by club slug (with pagination)
  app.get(
    '/public/clubs/:slug/reviews',
    {
      schema: {
        params: z.object({
          slug: z.string().min(1),
        }),
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().positive().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const { cursor, limit } = request.query as { cursor?: string; limit?: number };
      const data = await getClubReviewsBySlug(slug, cursor, limit);
      return reply.code(200).send(data);
    }
  );

  // 5. Report review abuse (auth required, rate-limited)
  app.post(
    '/reviews/:reviewId/report',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
      schema: {
        params: z.object({
          reviewId: z.string().uuid(),
        }),
        body: z.object({
          reason: z.string().min(3).max(500),
        }),
      },
    },
    async (request, reply) => {
      const { reviewId } = request.params as { reviewId: string };
      const { reason } = request.body as { reason: string };
      const userId = request.user!.id;

      const result = await reportReview(userId, reviewId, reason);
      return reply.code(201).send(result);
    }
  );

  // 6. Admin list reported reviews (Admin only)
  app.get(
    '/admin/reviews/reported',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN)],
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { limit } = request.query as { limit?: number };
      const data = await getReportedReviewsForAdmin(limit);
      return reply.code(200).send(data);
    }
  );

  // 7. Admin hide / unhide a review (Admin only)
  app.patch(
    '/admin/reviews/:reviewId/hide',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN)],
      schema: {
        params: z.object({
          reviewId: z.string().uuid(),
        }),
        body: z.object({
          hidden: z.boolean(),
        }),
      },
    },
    async (request, reply) => {
      const { reviewId } = request.params as { reviewId: string };
      const { hidden } = request.body as { hidden: boolean };
      const adminUserId = request.user!.id;

      const result = await hideOrUnhideReview(adminUserId, reviewId, hidden);
      return reply.code(200).send(result);
    }
  );
}
