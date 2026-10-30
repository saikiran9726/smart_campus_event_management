import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from '../../plugins/auth';
import { requireTurnstile } from '../../lib/turnstile';
import {
  cancelRegistration,
  claimWaitlistOffer,
  getUserRegistrations,
  registerForEvent,
} from './service';

export async function registrationRoutes(
  server: FastifyInstance
): Promise<void> {
  // 1. POST /events/:eventId/registrations (auth + requireTurnstile)
  server.post(
    '/events/:eventId/registrations',
    { preHandler: [requireAuth, requireTurnstile] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const body = (request.body as any) ?? {};
      const answers = body.answers ?? {};

      const result = await registerForEvent({
        eventId,
        user: request.user!,
        answers,
      });

      const statusCode =
        result.outcome === 'CONFIRMED' || result.outcome === 'PAYMENT_REQUIRED'
          ? 201
          : 200;

      return reply.status(statusCode).send(result);
    }
  );

  // 2. POST /registrations/:id/cancel (auth)
  server.post(
    '/registrations/:id/cancel',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await cancelRegistration(request.user!, id);
      return reply.status(200).send(result);
    }
  );

  // 3. POST /registrations/:id/claim-offer (auth)
  server.post(
    '/registrations/:id/claim-offer',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await claimWaitlistOffer(request.user!, id);
      return reply.status(200).send(result);
    }
  );

  // 4. GET /me/registrations (auth)
  server.get(
    '/me/registrations',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const results = await getUserRegistrations(request.user!.id);
      return reply.status(200).send({ items: results });
    }
  );
}
