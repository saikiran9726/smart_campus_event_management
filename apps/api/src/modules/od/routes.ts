import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { odLetters } from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { r3Client } from '../../lib/r2';
import { requireAuth } from '../../plugins/auth';
import { generateOdLetter, getOrRenderOdPdf, verifyOdLetterBySerial } from './service';

export async function odRoutes(app: FastifyInstance): Promise<void> {
  // 1. Generate or fetch OD letter for an event (auth required)
  app.post(
    '/events/:eventId/od',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          eventId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const userId = request.user!.id;

      const result = await generateOdLetter(userId, eventId);
      return reply.code(200).send({
        letter: result.letter,
        serial: result.serial,
        downloadUrl: result.downloadUrl,
        alreadyGenerated: result.alreadyGenerated,
      });
    }
  );

  // 2. Stream OD letter PDF (owner or elevated role)
  app.get(
    '/od/:id.pdf',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.id;

      const { buffer, serial, userId: letterOwnerId } = await getOrRenderOdPdf(id);

      // Authorization: owner or admin
      const isOwner = letterOwnerId === userId;
      const isAdmin = request.user?.role === UserRole.ADMIN;
      if (!isOwner && !isAdmin) {
        throw new AppError('FORBIDDEN', 'Access denied to this On-Duty letter.', 403);
      }

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="OD-Letter-${serial}.pdf"`);
      return reply.send(buffer);
    }
  );

  // 3. Public verification endpoint for OD letter
  app.get(
    '/public/verify/od/:serial',
    {
      schema: {
        params: z.object({
          serial: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const { serial } = request.params as { serial: string };
      const result = await verifyOdLetterBySerial(serial);
      return reply.code(200).send(result);
    }
  );
}
