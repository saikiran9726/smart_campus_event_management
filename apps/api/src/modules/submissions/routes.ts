import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';
import {
  getSubmissionForEventAndUser,
  listSubmissionsForEvent,
  submitProject,
  submitProjectOrDeliverables,
} from './service';

const submitProjectBodySchema = z.object({
  projectTitle: z.string().max(200).optional().nullable(),
  abstract: z.string().max(2000).optional().nullable(),
  repoUrl: z.string().optional().nullable(),
  demoUrl: z.string().optional().nullable(),
  deckKey: z.string().optional().nullable(),
  customFields: z.record(z.unknown()).optional().default({}),
});

export async function submissionRoutes(server: FastifyInstance): Promise<void> {
  // 1. Submit project deliverables for a specific team (backward compatibility)
  server.post(
    '/teams/:id/submission',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = submitProjectBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid submission parameters.',
          400,
          parsed.error.format()
        );
      }

      const team = await submitProject(request.user!.id, id, parsed.data);
      return reply.status(200).send({ success: true, team });
    }
  );

  // 2. Submit project deliverables for an event (handles both individual & team submissions)
  server.post(
    '/events/:eventId/submissions',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const parsed = submitProjectBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid submission parameters.',
          400,
          parsed.error.format()
        );
      }

      const result = await submitProjectOrDeliverables(request.user!.id, eventId, parsed.data);
      return reply.status(200).send({ success: true, submission: result });
    }
  );

  // 3. Get current user's / team's submission status and event configuration
  server.get(
    '/events/:eventId/submissions/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const data = await getSubmissionForEventAndUser(request.user!.id, eventId);
      return reply.status(200).send(data);
    }
  );

  // 4. List submissions for an event (organizer/judges)
  server.get(
    '/events/:eventId/submissions',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const submissions = await listSubmissionsForEvent(request.user!.id, eventId);
      return reply.status(200).send({ submissions });
    }
  );
}
