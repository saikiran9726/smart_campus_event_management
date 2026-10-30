import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { teams } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireEventOrganizer } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import { getPublicPodium, publishEventWinners } from './service';

const placementSchema = z.object({
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  teamId: z.string().uuid(),
});

const publishWinnersBodySchema = z.object({
  placements: z.array(placementSchema).min(1).max(3).optional(),
  winners: z.array(z.any()).optional(),
});

export async function winnerRoutes(server: FastifyInstance): Promise<void> {
  // 1. Publish event winners (organizer)
  server.post(
    '/events/:eventId/winners',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const body = request.body as any;

      let placements = body?.placements;

      if (!placements && Array.isArray(body?.winners)) {
        placements = [];
        for (const rw of body.winners) {
          const rank = (rw.rank ?? rw.place ?? (placements.length + 1)) as 1 | 2 | 3;
          const name = rw.teamOrUserName || rw.teamName || `Team Rank ${rank}`;
          let [team] = await db
            .select({ id: teams.id })
            .from(teams)
            .where(and(eq(teams.eventId, eventId), eq(teams.name, name)))
            .limit(1);

          if (!team) {
            const [created] = await db
              .insert(teams)
              .values({
                eventId,
                name,
                leaderId: request.user!.id,
                inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
              })
              .returning();
            team = created;
          }
          if (team) {
            placements.push({ rank, teamId: team.id });
          }
        }
      }

      if (!Array.isArray(placements) || placements.length === 0) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Placements array with ranks 1..3 and teamIds is required.',
          400
        );
      }

      const result = await publishEventWinners(
        request.user!.id,
        eventId,
        placements
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
