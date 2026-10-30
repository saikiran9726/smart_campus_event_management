import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from '../../plugins/auth';
import { getEventDoubtRoom } from './service';

export async function doubtRoutes(server: FastifyInstance): Promise<void> {
  // Get doubt room for an event
  server.get(
    '/events/:eventId/doubt-room',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const result = await getEventDoubtRoom(eventId, request.user!.id);
      return reply.status(200).send(result);
    }
  );
}
