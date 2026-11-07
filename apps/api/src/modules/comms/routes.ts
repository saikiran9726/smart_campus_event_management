import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { NotificationChannel, NotificationKind, UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import {
  auditLogs,
  events,
  notificationPreferences,
  notifications,
  users,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { requireEventOrganizer, requireRole } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import { isEmailProviderConfigured } from './providers/email.provider';
import { isMetaWhatsAppConfigured } from './providers/whatsapp.provider';
import { broadcastOrganizerAlert } from './queue';

const listQuerySchema = z.object({
  status: z.enum(['QUEUED', 'SENT', 'FAILED', 'READ']).optional(),
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
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN)],
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [existing] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, id))
        .limit(1);

      if (!existing) {
        throw new AppError(
          'NOT_FOUND',
          `Notification with ID '${id}' was not found.`,
          404
        );
      }

      if (existing.status === 'SENT') {
        throw new AppError(
          'CONFLICT',
          'Cannot retry a notification that has already been successfully delivered.',
          409
        );
      }

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

      // Record audit history
      await db.insert(auditLogs).values({
        actorId: request.user!.id,
        action: 'NOTIFICATION_RETRY_ENQUEUED',
        entity: 'notification',
        entityId: id,
        diff: {
          previousStatus: existing.status,
          previousAttempts: existing.attempts,
        },
      });

      return reply.status(200).send({
        success: true,
        message: 'Notification reset to QUEUED for immediate dispatch.',
        notification: updated,
      });
    }
  );

  // 3. GET /me/notifications (Authenticated user notification inbox)
  server.get(
    '/me/notifications',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const limit = Math.min(Number(query?.limit) || 50, 100);
      const unreadOnly = query?.unreadOnly === 'true' || query?.unreadOnly === true;

      const conditions = [eq(notifications.userId, request.user!.id)];
      if (unreadOnly) {
        conditions.push(sql`${notifications.status} != 'READ'`);
      }

      const rows = await db
        .select({
          id: notifications.id,
          eventId: notifications.eventId,
          eventTitle: events.title,
          kind: notifications.kind,
          channel: notifications.channel,
          status: notifications.status,
          payload: notifications.payload,
          runAt: notifications.runAt,
          sentAt: notifications.sentAt,
        })
        .from(notifications)
        .leftJoin(events, eq(notifications.eventId, events.id))
        .where(and(...conditions))
        .orderBy(desc(notifications.runAt))
        .limit(limit);

      return reply.status(200).send({
        notifications: rows,
        unreadCount: rows.filter((r) => r.status !== 'READ').length,
      });
    }
  );

  // 4. POST /me/notifications/:id/read (Acknowledge / Mark in-app notification as read)
  server.post(
    '/me/notifications/:id/read',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [updated] = await db
        .update(notifications)
        .set({
          status: 'READ',
          payload: sql`jsonb_set(COALESCE(${notifications.payload}, '{}'::jsonb), '{read}', 'true'::jsonb, true)`,
        })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.userId, request.user!.id)
          )
        )
        .returning();

      if (!updated) {
        throw new AppError('NOT_FOUND', 'Notification not found.', 404);
      }

      return reply.status(200).send({
        success: true,
        notification: updated,
      });
    }
  );

  // 5. POST /me/notifications/read-all
  server.post(
    '/me/notifications/read-all',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await db
        .update(notifications)
        .set({
          status: 'READ',
          payload: sql`jsonb_set(COALESCE(${notifications.payload}, '{}'::jsonb), '{read}', 'true'::jsonb, true)`,
        })
        .where(
          and(
            eq(notifications.userId, request.user!.id),
            sql`${notifications.status} != 'READ'`
          )
        );

      return reply.status(200).send({ success: true });
    }
  );

  // 6. POST /events/:eventId/broadcast (Organizer broadcast alert / reminder)
  server.post(
    '/events/:eventId/broadcast',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const body = request.body as any;

      if (!body?.title || !body?.message) {
        throw new AppError('VALIDATION_FAILED', 'Title and message are required.', 400);
      }

      const result = await broadcastOrganizerAlert(db, {
        eventId,
        title: body.title,
        message: body.message,
        kind: body.kind || NotificationKind.ORGANIZER_ALERT,
      });

      return reply.status(200).send({
        success: true,
        deliveredCount: result.count,
      });
    }
  );

  // 7. GET /admin/notifications/stats (Comprehensive channel breakdown & monitoring)
  server.get(
    '/admin/notifications/stats',
    { preHandler: [requireAuth, requireRole(UserRole.ADMIN)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const channelBreakdownRes = await db.execute<{
        channel: string;
        status: string;
        count: string;
      }>(
        sql`SELECT channel, status, count(*)::text as count FROM notifications GROUP BY channel, status`
      );

      const dlqRes = await db.execute<{ count: string; total_attempts: string }>(
        sql`SELECT
              count(*) FILTER (WHERE status = 'FAILED' AND attempts >= 5)::text as count,
              COALESCE(sum(attempts), 0)::text as total_attempts
            FROM notifications`
      );

      const emailStats = { queued: 0, sent: 0, delivered: 0, failed: 0 };
      const whatsappStats = { queued: 0, accepted: 0, delivered: 0, read: 0, failed: 0, skipped: 0 };
      const inAppStats = { created: 0, read: 0 };

      const topCounts: Record<string, number> = {
        QUEUED: 0,
        SENT: 0,
        ACCEPTED: 0,
        DELIVERED: 0,
        FAILED: 0,
        READ: 0,
        SKIPPED: 0,
      };

      for (const row of channelBreakdownRes.rows) {
        const cnt = parseInt(row.count, 10) || 0;
        topCounts[row.status] = (topCounts[row.status] || 0) + cnt;

        if (row.channel === 'EMAIL') {
          if (row.status === 'QUEUED') emailStats.queued += cnt;
          if (row.status === 'SENT') emailStats.sent += cnt;
          if (row.status === 'DELIVERED') emailStats.delivered += cnt;
          if (row.status === 'FAILED') emailStats.failed += cnt;
        } else if (row.channel === 'WHATSAPP') {
          if (row.status === 'QUEUED') whatsappStats.queued += cnt;
          if (row.status === 'ACCEPTED') whatsappStats.accepted += cnt;
          if (row.status === 'DELIVERED') whatsappStats.delivered += cnt;
          if (row.status === 'READ') whatsappStats.read += cnt;
          if (row.status === 'FAILED') whatsappStats.failed += cnt;
          if (row.status === 'SKIPPED') whatsappStats.skipped += cnt;
        } else if (row.channel === 'IN_APP') {
          inAppStats.created += cnt;
          if (row.status === 'READ') inAppStats.read += cnt;
        }
      }

      const total = Object.values(topCounts).reduce((a, b) => a + b, 0);
      const dlqCount = parseInt(dlqRes.rows[0]?.count || '0', 10);
      const totalRetries = parseInt(dlqRes.rows[0]?.total_attempts || '0', 10);

      return reply.status(200).send({
        total,
        queued: topCounts.QUEUED || 0,
        sent: (topCounts.SENT || 0) + (topCounts.ACCEPTED || 0) + (topCounts.DELIVERED || 0),
        failed: topCounts.FAILED || 0,
        read: topCounts.READ || 0,
        dlq: dlqCount,
        totalRetries,
        email: emailStats,
        whatsapp: whatsappStats,
        inApp: inAppStats,
      });
    }
  );

  // 7.5. GET /admin/notifications/providers (Channel configuration health inspection)
  server.get(
    '/admin/notifications/providers',
    { preHandler: [requireAuth, requireRole(UserRole.ADMIN)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const emailConfigured = isEmailProviderConfigured();
      const waConfigured = isMetaWhatsAppConfigured();

      return reply.status(200).send({
        email: {
          provider: env.EMAIL_PROVIDER,
          isConfigured: emailConfigured,
          sender:
  env.EMAIL_PROVIDER === 'brevo'
    ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS || 'not configured'}>`
    : env.MAIL_FROM,
          status: emailConfigured
            ? 'PROVIDER CONFIGURED AND READY'
            : 'IMPLEMENTED BUT PROVIDER NOT CONFIGURED (Using Console Provider in dev/test)',
        },
        whatsapp: {
          provider: env.WHATSAPP_PROVIDER,
          isConfigured: waConfigured,
          apiVersion: env.META_WA_API_VERSION,
          phoneNumberIdMasked: env.META_WA_PHONE_ID && !env.META_WA_PHONE_ID.includes('placeholder')
            ? `${env.META_WA_PHONE_ID.slice(0, 3)}***${env.META_WA_PHONE_ID.slice(-3)}`
            : null,
          webhookVerified: Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
          status: waConfigured
            ? 'PROVIDER CONFIGURED AND READY'
            : 'IMPLEMENTED BUT PROVIDER NOT CONFIGURED (Using Console Provider in dev/test)',
        },
      });
    }
  );

  // 8. GET /me/notification-preferences
  server.get(
    '/me/notification-preferences',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const [prefs] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      if (!prefs) {
        return reply.status(200).send({
          preferences: {
            userId,
            emailEnabled: true,
            inAppEnabled: true,
            whatsappEnabled: false,
            eventReminders: true,
            registrationUpdates: true,
            teamUpdates: true,
            announcements: true,
            volunteerUpdates: true,
            whatsappConsentAt: null,
            whatsappConsentWithdrawnAt: null,
          },
        });
      }

      return reply.status(200).send({ preferences: prefs });
    }
  );

  // 9. PATCH /me/notification-preferences
  const updatePreferencesSchema = z.object({
    emailEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
    eventReminders: z.boolean().optional(),
    registrationUpdates: z.boolean().optional(),
    teamUpdates: z.boolean().optional(),
    announcements: z.boolean().optional(),
    volunteerUpdates: z.boolean().optional(),
  });

  server.patch(
    '/me/notification-preferences',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = updatePreferencesSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid notification preferences data.',
          400,
          parsed.error.format()
        );
      }

      const userId = request.user!.id;
      const data = parsed.data;

      // Handle WhatsApp opt-in consent and withdrawal timestamping
      const consentPatch: {
        whatsappConsentAt?: Date | null;
        whatsappConsentWithdrawnAt?: Date | null;
      } = {};

      if (data.whatsappEnabled === true) {
        consentPatch.whatsappConsentAt = new Date();
        consentPatch.whatsappConsentWithdrawnAt = null;
      } else if (data.whatsappEnabled === false) {
        consentPatch.whatsappConsentWithdrawnAt = new Date();
      }

      const [existing] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);

      let result;
      if (existing) {
        const [updated] = await db
          .update(notificationPreferences)
          .set({
            ...data,
            ...consentPatch,
            updatedAt: new Date(),
          })
          .where(eq(notificationPreferences.userId, userId))
          .returning();
        result = updated;
      } else {
        const [inserted] = await db
          .insert(notificationPreferences)
          .values({
            userId,
            ...data,
            ...consentPatch,
          })
          .returning();
        result = inserted;
      }

      return reply.status(200).send({
        success: true,
        preferences: result,
      });
    }
  );
}
