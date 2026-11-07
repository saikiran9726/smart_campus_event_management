import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from '../../plugins/auth';
import { requireTurnstile } from '../../lib/turnstile';
import { requireEventOrganizer } from '../../middleware/rbac';
import {
  approveRegistration,
  cancelRegistration,
  claimWaitlistOffer,
  getUserRegistrations,
  registerForEvent,
  rejectRegistration,
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
      const projectSubmission = body.projectSubmission ?? null;

      const result = await registerForEvent({
        eventId,
        user: request.user!,
        answers,
        projectSubmission,
      });

      const statusCode =
        result.outcome === 'CONFIRMED' || result.outcome === 'PAYMENT_REQUIRED'
          ? 201
          : 200;

      return reply.status(statusCode).send(result);
    }
  );

  // 2. POST /registrations/:id/cancel (auth) - Student request with cancellation deadline check
  server.post(
    '/registrations/:id/cancel',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as any) ?? {};
      const result = await cancelRegistration(request.user!, id, {
        reason: body.reason,
      });
      return reply.status(200).send(result);
    }
  );

  // 3. POST /events/:eventId/registrations/:registrationId/approve (Organizer approval)
  server.post(
    '/events/:eventId/registrations/:registrationId/approve',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, registrationId } = request.params as {
        eventId: string;
        registrationId: string;
      };

      const result = await approveRegistration(
        request.user!,
        eventId,
        registrationId
      );
      return reply.status(200).send(result);
    }
  );

  // 4. POST /events/:eventId/registrations/:registrationId/reject (Organizer rejection)
  server.post(
    '/events/:eventId/registrations/:registrationId/reject',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, registrationId } = request.params as {
        eventId: string;
        registrationId: string;
      };
      const body = (request.body as any) ?? {};

      const result = await rejectRegistration(
        request.user!,
        eventId,
        registrationId,
        body.reason
      );
      return reply.status(200).send(result);
    }
  );

  // 5. POST /events/:eventId/registrations/:registrationId/cancel (Organizer cancellation override)
  server.post(
    '/events/:eventId/registrations/:registrationId/cancel',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { registrationId } = request.params as {
        registrationId: string;
      };
      const body = (request.body as any) ?? {};

      const result = await cancelRegistration(request.user!, registrationId, {
        reason: body.reason,
        isOrganizerOverride: true,
      });
      return reply.status(200).send(result);
    }
  );

  // 6. POST /registrations/:id/claim-offer (auth)
  server.post(
    '/registrations/:id/claim-offer',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await claimWaitlistOffer(request.user!, id);
      return reply.status(200).send(result);
    }
  );

  // 7. GET /me/registrations (auth)
  server.get(
    '/me/registrations',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const results = await getUserRegistrations(request.user!.id);
      return reply.status(200).send({ items: results });
    }
  );
}
