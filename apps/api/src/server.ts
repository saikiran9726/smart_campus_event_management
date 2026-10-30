import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { ApiErrorBody } from '@eventora/shared';
import { pool } from './db/client';
import { env } from './env';
import { AppError } from './lib/app-error';
import { meRoutes } from './modules/users/me';
import { clerkWebhookRoutes } from './modules/webhooks/clerk';
import { clubRoutes } from './modules/clubs/routes';
import { uploadRoutes } from './modules/uploads/routes';
import { proposalRoutes } from './modules/proposals/routes';
import { eventRoutes } from './modules/events/routes';
import { formRoutes } from './modules/forms';
import { registrationRoutes } from './modules/registrations';
import { paymentRoutes } from './modules/payments';
import { waitlistRoutes } from './modules/waitlist';
import { ticketRoutes } from './modules/tickets';
import { passkeyRoutes } from './modules/passkeys';
import { gateRoutes } from './modules/gate';
import { commsAdminRoutes } from './modules/comms/routes';
import { channelRoutes } from './modules/channels';
import { doubtRoutes } from './modules/doubts';

export function buildServer(opts: FastifyServerOptions = {}): FastifyInstance {
  const server = fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            transport:
              env.NODE_ENV === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { colorize: true },
                  }
                : undefined,
          },
    requestIdHeader: 'x-request-id',
    ...opts,
  }).withTypeProvider<ZodTypeProvider>();

  // Type provider compilers
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Preserve raw body for webhook HMAC/Svix verification
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      if (!body || body.length === 0) {
        (req as any).rawBody = '';
        return done(null, {});
      }
      const rawString = body.toString('utf8');
      (req as any).rawBody = rawString;
      try {
        const json = JSON.parse(rawString);
        done(null, json);
      } catch (err: any) {
        done(err, undefined);
      }
    }
  );

  // Plugins
  server.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  server.register(cors, {
    origin: env.PUBLIC_WEB_URL,
    credentials: true,
  });

  server.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  server.register(cookie, {
    secret: env.MAGIC_LINK_SECRET,
  });

  server.register(sensible);

  // Request ID hook
  server.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Least-privilege route guard: Scanner tokens MUST receive 403 on all non-scanner endpoints
  server.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payloadJson = Buffer.from(parts[1]!, 'base64url').toString('utf8');
          const parsed = JSON.parse(payloadJson);
          if (parsed && parsed.kind === 'scanner') {
            const urlPath = request.url.split('?')[0] || '';
            const isAllowed =
              urlPath.startsWith('/gate') ||
              urlPath.startsWith('/scanner') ||
              urlPath.startsWith('/public/scanner');
            if (!isAllowed) {
              throw new AppError(
                'FORBIDDEN',
                'Scanner tokens are restricted to gate endpoints.',
                403
              );
            }
          }
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
      }
    }
  });

  // Global Error Handler
  server.setErrorHandler((error: any, request, reply) => {
    // 1. Zod validation error
    if (error instanceof ZodError) {
      const response: ApiErrorBody = {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request schema validation failed',
          details: error.format() as any,
        },
      };
      return reply.status(400).send(response);
    }

    // 2. Custom Application Error
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toResponseBody());
    }

    // 3. Fastify Schema Validation Error
    if ((error as any).validation) {
      const response: ApiErrorBody = {
        error: {
          code: 'VALIDATION_FAILED',
          message: error.message || 'Validation failed',
          details: (error as any).validation,
        },
      };
      return reply.status(400).send(response);
    }

    // 4. Rate Limiter Error
    if (error.statusCode === 429) {
      const response: ApiErrorBody = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      };
      return reply.status(429).send(response);
    }

    // 5. Unknown Internal Server Error (no stack leakage)
    request.log.error(error);
    const response = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'An unexpected internal server error occurred',
        details: { requestId: request.id },
      },
    };
    return reply.status(500).send(response);
  });

  // Health endpoint
  server.get('/health', async (request, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.status(200).send({ status: 'ok', db: 'up' });
    } catch (err) {
      request.log.error(err, 'Database health check failed');
      return reply.status(503).send({ status: 'error', db: 'down' });
    }
  });

  // Register core routes
  server.register(clerkWebhookRoutes);
  server.register(meRoutes);
  server.register(clubRoutes);
  server.register(uploadRoutes);
  server.register(proposalRoutes);
  server.register(eventRoutes);
  server.register(formRoutes);
  server.register(registrationRoutes);
  server.register(paymentRoutes);
  server.register(waitlistRoutes);
  server.register(ticketRoutes);
  server.register(passkeyRoutes);
  server.register(gateRoutes);
  server.register(commsAdminRoutes);
  server.register(channelRoutes);
  server.register(doubtRoutes);

  return server;
}
