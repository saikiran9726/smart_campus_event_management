import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../plugins/auth';
import { getEventReviewsBySlug, submitOrUpdateReview } from './service';

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  // 1. Submit or update review for an event (auth required)
  app.post(
    '/events/:eventId/reviews',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          eventId: z.string().uuid(),
        }),
        body: z.object({
          stars: z.number().int().min(1).max(5),
          comment: z.string().min(1).max(1000),
          showName: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const { stars, comment, showName } = request.body as {
        stars: number;
        comment: string;
        showName?: boolean;
      };
      const userId = request.user!.id;

      const result = await submitOrUpdateReview({
        userId,
        eventId,
        stars,
        comment,
        showName,
      });

      return reply.code(result.updated ? 200 : 201).send(result);
    }
  );

  // 2. Public reviews retrieval by event slug
  app.get(
    '/public/events/:slug/reviews',
    {
      schema: {
        params: z.object({
          slug: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const data = await getEventReviewsBySlug(slug);
      return reply.code(200).send(data);
    }
  );
}
