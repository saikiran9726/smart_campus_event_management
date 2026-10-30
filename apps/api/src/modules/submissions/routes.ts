import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';
import { listSubmissionsForEvent, submitProject } from './service';

const submitProjectBodySchema = z.object({
  projectTitle: z.string().min(1).max(200),
  abstract: z.string().min(1).max(2000),
  repoUrl: z.string().url(),
  demoUrl: z.string().url().optional(),
  deckKey: z.string().optional(),
});

export async function submissionRoutes(server: FastifyInstance): Promise<void> {
  // 1. Submit project deliverables
  server.post(
    '/teams/:id/submission',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = submitProjectBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid submission parameters. Verify projectTitle, abstract (<= 2000 chars), and repoUrl.',
          400
        );
      }

      const team = await submitProject(request.user!.id, id, parsed.data);
      return reply.status(200).send({ success: true, team });
    }
  );

  // 2. List submissions for an event (organizer/judges)
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
