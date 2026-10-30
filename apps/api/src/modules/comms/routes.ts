import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { notifications, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireRole } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';

const listQuerySchema = z.object({
  status: z.enum(['QUEUED', 'SENT', 'FAILED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function commsAdminRoutes(server: FastifyInstance): Promise<void> {
  // 1. GET /admin/notifications?status= (Admin only)
  server.get(
    '/admin/notifications',
    { preHandler: [requireAuth, requireRole(UserRole.ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid notification filter parameters.',
          400,
          parsed.error.format()
        );
      }

      const { status, limit, offset } = parsed.data;

      const conditions = [];
      if (status) {
        conditions.push(eq(notifications.status, status));
      }

      const rows = await db
        .select({
          id: notifications.id,
          userId: notifications.userId,
          userEmail: users.email,
          userFullName: users.fullName,
          eventId: notifications.eventId,
          kind: notifications.kind,
          channel: notifications.channel,
          status: notifications.status,
          attempts: notifications.attempts,
          runAt: notifications.runAt,
          sentAt: notifications.sentAt,
          error: notifications.error,
          payload: notifications.payload,
        })
        .from(notifications)
        .leftJoin(users, eq(notifications.userId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(notifications.runAt))
        .limit(limit)
        .offset(offset);

      return reply.status(200).send({
        notifications: rows,
        limit,
        offset,
      });
    }
  );

  // 2. POST /admin/notifications/:id/retry (Admin only)
  server.post(
    '/admin/notifications/:id/retry',
    { preHandler: [requireAuth, requireRole(UserRole.ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [updated] = await db
        .update(notifications)
        .set({
          status: 'QUEUED',
          attempts: 0,
          runAt: new Date(),
          error: null,
        })
        .where(eq(notifications.id, id))
        .returning();

      if (!updated) {
        throw new AppError(
          'NOT_FOUND',
          `Notification with ID '${id}' was not found.`,
          404
        );
      }

      return reply.status(200).send({
        success: true,
        message: 'Notification reset to QUEUED for immediate dispatch.',
        notification: updated,
      });
    }
  );
}
