import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';
import {
  inviteFromPool,
  joinTeammatePool,
  leaveTeammatePool,
  listTeammatePool,
} from './service';

const joinPoolBodySchema = z.object({
  skills: z.array(z.string()).min(1),
  bio: z.string().min(1).max(500),
});

const inviteBodySchema = z.object({
  userId: z.string().uuid(),
});

export async function teammatePoolRoutes(server: FastifyInstance): Promise<void> {
  // 1. Join teammate pool (solo participants only)
  server.post(
    '/events/:eventId/teammate-pool',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const parsed = joinPoolBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Skills and bio are required.', 400);
      }

      const entry = await joinTeammatePool(request.user!.id, eventId, parsed.data);
      return reply.status(201).send({ success: true, entry });
    }
  );

  // 2. Leave teammate pool
  server.delete(
    '/events/:eventId/teammate-pool',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const result = await leaveTeammatePool(request.user!.id, eventId);
      return reply.status(200).send(result);
    }
  );

  // 3. List teammate pool entries (shows name, skills, bio only)
  server.get(
    '/events/:eventId/teammate-pool',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const pool = await listTeammatePool(eventId);
      return reply.status(200).send({ pool });
    }
  );

  // 4. Invite participant from pool
  server.post(
    '/teams/:id/invite-from-pool',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = inviteBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Target userId is required.', 400);
      }

      const result = await inviteFromPool(request.user!.id, id, parsed.data.userId);
      return reply.status(200).send(result);
    }
  );
}
