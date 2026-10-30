import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../../db/client';
import { events, registrations } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { claimWaitlistOffer } from '../registrations/service';
import { requireAuth } from '../../plugins/auth';
import { getLiveWaitlistPosition } from './service';

export async function waitlistRoutes(server: FastifyInstance): Promise<void> {
  // GET /events/:id/waitlist/me
  server.get(
    '/events/:id/waitlist/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.id;

      const result = await getLiveWaitlistPosition(userId, id);
      return reply.status(200).send(result);
    }
  );

  // GET /waitlist/:registrationId/status
  server.get(
    '/waitlist/:registrationId/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { registrationId } = request.params as { registrationId: string };

      const [reg] = await db
        .select({
          registrationId: registrations.id,
          eventId: registrations.eventId,
          eventTitle: events.title,
          status: registrations.status,
          offerExpiresAt: registrations.offerExpiresAt,
        })
        .from(registrations)
        .innerJoin(events, eq(registrations.eventId, events.id))
        .where(eq(registrations.id, registrationId))
        .limit(1);

      if (!reg) {
        throw new AppError('NOT_FOUND', 'Waitlist registration not found', 404);
      }

      return reply.status(200).send({
        offer: {
          registrationId: reg.registrationId,
          eventId: reg.eventId,
          eventTitle: reg.eventTitle,
          status: reg.status,
          offerExpiresAt: reg.offerExpiresAt ? reg.offerExpiresAt.toISOString() : null,
        },
      });
    }
  );

  // POST /waitlist/:registrationId/claim
  server.post(
    '/waitlist/:registrationId/claim',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { registrationId } = request.params as { registrationId: string };
      const result = await claimWaitlistOffer(request.user!, registrationId);
      return reply.status(200).send(result);
    }
  );
}
