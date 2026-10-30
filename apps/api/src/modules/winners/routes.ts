import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { requireEventOrganizer } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import { getPublicPodium, publishEventWinners } from './service';

const placementSchema = z.object({
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  teamId: z.string().uuid(),
});

const publishWinnersBodySchema = z.object({
  placements: z.array(placementSchema).min(1).max(3),
});

export async function winnerRoutes(server: FastifyInstance): Promise<void> {
  // 1. Publish event winners (organizer)
  server.post(
    '/events/:eventId/winners',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const parsed = publishWinnersBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Placements array with ranks 1..3 and teamIds is required.',
          400
        );
      }

      const result = await publishEventWinners(
        request.user!.id,
        eventId,
        parsed.data.placements
      );

      return reply.status(200).send(result);
    }
  );

  // 2. Public winners podium by slug (cached with Cache-Control: public, max-age=60)
  server.get(
    '/public/events/:slug/winners',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { slug } = request.params as { slug: string };
      const result = await getPublicPodium(slug);

      reply.header('Cache-Control', 'public, max-age=60');
      return reply.status(200).send(result);
    }
  );
}
