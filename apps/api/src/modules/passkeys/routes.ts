import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { z } from 'zod';
import { db } from '../../db/client';
import { events, scannerPasskeys } from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { requireTurnstile } from '../../lib/turnstile';
import { requireEventOrganizer } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import {
  createPasskey,
  revokePasskey,
  unlockScanner,
} from './service';

const createPasskeyBodySchema = z.object({
  label: z.string().min(2).max(100),
  ttlHours: z.number().int().min(1).max(72).optional().default(12),
});

const unlockScannerBodySchema = z.object({
  code: z.string().min(6).max(32),
  volunteerName: z.string().min(2).max(100),
  eventId: z.string().uuid().optional(),
  turnstileToken: z.string().optional(),
});

export async function passkeyRoutes(server: FastifyInstance): Promise<void> {
  // 1. POST /events/:eventId/passkeys (Organizer)
  server.post(
    '/events/:eventId/passkeys',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const parsed = createPasskeyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid passkey creation payload.',
          400,
          parsed.error.format()
        );
      }

      const result = await createPasskey({
        eventId,
        label: parsed.data.label,
        ttlHours: parsed.data.ttlHours,
        userId: request.user!.id,
      });

      return reply.status(201).send(result);
    }
  );

  // 2. GET /events/:eventId/passkeys (Organizer)
  server.get(
    '/events/:eventId/passkeys',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };

      const list = await db
        .select({
          id: scannerPasskeys.id,
          label: scannerPasskeys.label,
          expiresAt: scannerPasskeys.expiresAt,
          revokedAt: scannerPasskeys.revokedAt,
          createdAt: scannerPasskeys.createdAt,
        })
        .from(scannerPasskeys)
        .where(eq(scannerPasskeys.eventId, eventId))
        .orderBy(desc(scannerPasskeys.createdAt));

      return reply.status(200).send({ passkeys: list });
    }
  );

  // 3. GET /events/:eventId/passkeys/:id/setup-qr.png (Organizer)
  server.get(
    '/events/:eventId/passkeys/:id/setup-qr.png',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, id } = request.params as {
        eventId: string;
        id: string;
      };

      const [passkey] = await db
        .select()
        .from(scannerPasskeys)
        .where(
          and(
            eq(scannerPasskeys.id, id),
            eq(scannerPasskeys.eventId, eventId)
          )
        )
        .limit(1);

      if (!passkey) {
        throw new AppError('NOT_FOUND', 'Passkey not found for this event.', 404);
      }

      const setupUrl = `${env.PUBLIC_WEB_URL}/scanner/unlock?eventId=${eventId}&passkeyId=${id}`;
      const qrBuffer = await QRCode.toBuffer(setupUrl, {
        type: 'png',
        width: 600,
        margin: 4,
        errorCorrectionLevel: 'M',
      });

      return reply
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'private, no-store')
        .status(200)
        .send(qrBuffer);
    }
  );

  // 4. DELETE /events/:eventId/passkeys/:id (Organizer)
  server.delete(
    '/events/:eventId/passkeys/:id',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, id } = request.params as {
        eventId: string;
        id: string;
      };

      await revokePasskey(eventId, id);
      return reply.status(200).send({
        success: true,
        message: 'Passkey revoked successfully.',
      });
    }
  );

  // 5. POST /public/scanner/unlock (Public + Turnstile + Rate limit)
  server.post(
    '/public/scanner/unlock',
    {
      preHandler: [requireTurnstile],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = unlockScannerBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid scanner unlock payload.',
          400,
          parsed.error.format()
        );
      }

      const result = await unlockScanner({
        ip: request.ip,
        code: parsed.data.code,
        volunteerName: parsed.data.volunteerName,
        eventId: parsed.data.eventId,
      });

      return reply.status(200).send(result);
    }
  );
}
