import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { requireScanner } from '../passkeys/auth';
import {
  getGateStats,
  lookupStudent,
  manualCheckin,
  scanTicket,
  spotRegister,
} from './service';

const scanBodySchema = z.object({
  eventId: z.string().uuid(),
  token: z.string().min(1).max(64),
  mode: z.enum(['GATE', 'MEAL', 'KIT']).default('GATE'),
});

const lookupQuerySchema = z.object({
  eventId: z.string().uuid(),
  rollNumber: z.string().min(1).max(50),
});

const manualCheckinBodySchema = z.object({
  eventId: z.string().uuid(),
  rollNumber: z.string().min(1).max(50),
});

const spotRegisterBodySchema = z.object({
  eventId: z.string().uuid(),
  rollNumber: z.string().min(1).max(50),
});

const statsQuerySchema = z.object({
  eventId: z.string().uuid(),
});

export async function gateRoutes(server: FastifyInstance): Promise<void> {
  // 1. POST /gate/scan (Scanner session or Organizer)
  server.post(
    '/gate/scan',
    { preHandler: [requireScanner] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = scanBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid scan parameters.',
          400,
          parsed.error.format()
        );
      }

      const result = await scanTicket(request.scanner!, {
        eventId: parsed.data.eventId,
        token: parsed.data.token,
        mode: parsed.data.mode,
        clientIp: request.ip,
      });

      return reply.status(200).send(result);
    }
  );

  // 2. GET /gate/lookup (Scanner session or Organizer)
  server.get(
    '/gate/lookup',
    { preHandler: [requireScanner] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = lookupQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Missing eventId or rollNumber query parameter.',
          400,
          parsed.error.format()
        );
      }

      const result = await lookupStudent(
        parsed.data.eventId,
        parsed.data.rollNumber
      );
      return reply.status(200).send(result);
    }
  );

  // 3. POST /gate/manual-checkin (Scanner session or Organizer)
  server.post(
    '/gate/manual-checkin',
    { preHandler: [requireScanner] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = manualCheckinBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid manual check-in payload.',
          400,
          parsed.error.format()
        );
      }

      const result = await manualCheckin(request.scanner!, {
        eventId: parsed.data.eventId,
        rollNumber: parsed.data.rollNumber,
      });

      return reply.status(200).send(result);
    }
  );

  // 4. POST /gate/spot-register (Scanner session or Organizer)
  server.post(
    '/gate/spot-register',
    { preHandler: [requireScanner] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = spotRegisterBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid spot registration payload.',
          400,
          parsed.error.format()
        );
      }

      const result = await spotRegister(request.scanner!, {
        eventId: parsed.data.eventId,
        rollNumber: parsed.data.rollNumber,
      });

      return reply.status(201).send(result);
    }
  );

  // 5. GET /gate/stats (Scanner session or Organizer)
  server.get(
    '/gate/stats',
    { preHandler: [requireScanner] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = statsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Missing eventId query parameter.',
          400,
          parsed.error.format()
        );
      }

      const result = await getGateStats(parsed.data.eventId);
      return reply.status(200).send(result);
    }
  );
}
