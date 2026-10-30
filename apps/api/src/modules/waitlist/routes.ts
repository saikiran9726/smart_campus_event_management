import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
}
