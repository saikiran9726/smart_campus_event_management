import { and, eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ChannelKind } from '@eventora/shared';
import { db } from '../../db/client';
import { clubChannels, clubMembers, clubs } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';
import {
  getChannelMessages,
  getPinnedMessages,
  getUnreadCountsForUser,
  markChannelRead,
  pinMessage,
  postMessageToChannel,
  softDeleteMessage,
} from './service';

const postMessageSchema = z.object({
  body: z.string().min(1).max(4000).optional(),
  content: z.string().min(1).max(4000).optional(),
  replyToId: z.string().uuid().optional(),
}).refine((data) => Boolean(data.body || data.content), {
  message: 'Either body or content is required',
});

const markReadBodySchema = z.object({
  lastMessageId: z.string().uuid(),
});

export async function channelRoutes(server: FastifyInstance): Promise<void> {
  // 1. List channels for a club
  server.get(
    '/clubs/:clubId/channels',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { clubId?: string; id?: string };
      const clubId = params.clubId || params.id;

      if (!clubId) {
        throw new AppError('VALIDATION_FAILED', 'Club ID is required.', 400);
      }

      const [club] = await db
        .select({ id: clubs.id })
        .from(clubs)
        .where(eq(clubs.id, clubId))
        .limit(1);

      if (!club) {
        throw new AppError('NOT_FOUND', `Club '${clubId}' not found.`, 404);
      }

      let channels = await db
        .select({
          id: clubChannels.id,
          clubId: clubChannels.clubId,
          eventId: clubChannels.eventId,
          kind: clubChannels.kind,
          name: clubChannels.name,
          slug: clubChannels.slug,
        })
        .from(clubChannels)
        .where(eq(clubChannels.clubId, clubId));

      // If club has 0 channels, create the 3 defaults atomically in a transaction
      if (channels.length === 0) {
        await db.transaction(async (tx) => {
          await tx
            .insert(clubChannels)
            .values([
              {
                clubId,
                kind: ChannelKind.ANNOUNCEMENTS,
                name: 'Announcements',
                slug: 'announcements',
              },
              {
                clubId,
                kind: ChannelKind.GENERAL,
                name: 'General',
                slug: 'general',
              },
              {
                clubId,
                kind: ChannelKind.EVENTS,
                name: 'Events',
                slug: 'events',
              },
            ])
            .onConflictDoNothing();
        });

        channels = await db
          .select({
            id: clubChannels.id,
            clubId: clubChannels.clubId,
            eventId: clubChannels.eventId,
            kind: clubChannels.kind,
            name: clubChannels.name,
            slug: clubChannels.slug,
          })
          .from(clubChannels)
          .where(eq(clubChannels.clubId, clubId));
      }

      return reply.status(200).send({ channels });
    }
  );

  // 2. Keyset paginated messages for a channel
  server.get(
    '/channels/:id/messages',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { cursor?: string; limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 50;

      const result = await getChannelMessages(id, request.user!.id, query.cursor, limit);
      return reply.status(200).send(result);
    }
  );

  // 3. Post a message to a channel
  server.post(
    '/channels/:id/messages',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const parseResult = postMessageSchema.safeParse(body);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_FAILED', 'Invalid message payload.', 400);
      }

      const messageContent = parseResult.data.body || parseResult.data.content || '';
      const replyToId = parseResult.data.replyToId;

      const message = await postMessageToChannel(
        id,
        request.user!.id,
        messageContent,
        replyToId
      );

      return reply.status(201).send({ message });
    }
  );

  // 4. Pin a message
  server.post(
    '/channels/:id/pin/:messageId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, messageId } = request.params as { id: string; messageId: string };
      const updated = await pinMessage(id, messageId, request.user!.id, true);
      return reply.status(200).send({ success: true, message: updated });
    }
  );

  // 5. Unpin a message
  server.delete(
    '/channels/:id/pin/:messageId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, messageId } = request.params as { id: string; messageId: string };
      const updated = await pinMessage(id, messageId, request.user!.id, false);
      return reply.status(200).send({ success: true, message: updated });
    }
  );

  // 6. List pinned messages
  server.get(
    '/channels/:id/pinned',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const pinned = await getPinnedMessages(id, request.user!.id);
      return reply.status(200).send({ pinned });
    }
  );

  // 7. Mark channel as read
  server.post(
    '/channels/:id/read',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const parseResult = markReadBodySchema.safeParse(body);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_FAILED', 'lastMessageId is required.', 400);
      }

      await markChannelRead(id, request.user!.id, parseResult.data.lastMessageId);
      return reply.status(200).send({ success: true });
    }
  );

  // 8. User unread counts across all accessible channels
  server.get(
    '/me/unread',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const unread = await getUnreadCountsForUser(request.user!.id);
      return reply.status(200).send({ unread });
    }
  );

  // 9. Soft delete a message
  server.delete(
    '/messages/:id',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const deleted = await softDeleteMessage(id, request.user!.id);
      return reply.status(200).send(deleted);
    }
  );
}
