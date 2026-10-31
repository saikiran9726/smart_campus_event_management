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
import { eq } from 'drizzle-orm';
import { RegistrationStatus } from '@eventora/shared';
import { db } from './db/client';
import { registrations } from './db/schema';
import { runOfferExpirySweepOnce } from './workers/offer-expiry.worker';
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
import { teamRoutes } from './modules/teams';
import { submissionRoutes } from './modules/submissions';
import { teammatePoolRoutes } from './modules/teammates';
import { winnerRoutes } from './modules/winners';
import { odRoutes } from './modules/od';
import { reviewRoutes } from './modules/reviews';
import { verifyRoutes } from './modules/verify';
import { budgetRoutes } from './modules/budget';
import { analyticsRoutes } from './modules/analytics';

const allowedDevOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
]);

const redactionPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["cf-turnstile-response"]',
  'req.headers["x-test-user-id"]',
  'req.body.token',
  'req.body.code',
  'req.body.passkey',
  'req.body.turnstileToken',
  'req.body["cf-turnstile-response"]',
  '*.token',
  '*.code',
  '*.passkey',
];

export function buildServer(opts: FastifyServerOptions = {}): FastifyInstance {
  const defaultLogger =
    env.NODE_ENV === 'test'
      ? false
      : {
          level: 'info',
          redact: {
            paths: redactionPaths,
            censor: '[REDACTED]',
          },
          transport:
            env.NODE_ENV === 'development'
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true },
                }
              : undefined,
        };

  const server = fastify({
    logger: opts.logger !== undefined ? opts.logger : defaultLogger,
    trustProxy: true,
    bodyLimit: 1048576, // 1 MB
    requestTimeout: 30000, // 30s
    keepAliveTimeout: 65000, // 65s
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

  // Helmet with cross-origin resource policy
  server.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // CORS origin allowlist
  server.register(cors, {
    origin: (origin, cb) => {
      // allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        return cb(null, true);
      }
      if (origin === env.PUBLIC_WEB_URL) {
        return cb(null, true);
      }
      if (env.NODE_ENV !== 'production' && allowedDevOrigins.has(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'cf-turnstile-response',
      ...(env.NODE_ENV === 'test' ? ['x-test-user-id'] : []),
    ],
    optionsSuccessStatus: 204,
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
    if (process.env.NODE_ENV === 'test') {
      console.error('SERVER ERROR IN TEST:', error);
    }
    const response = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal server error occurred',
        details: { requestId: request.id },
      },
    };
    return reply.status(500).send(response);
  });

  // Health endpoint: Liveness probe without DB access
  server.get('/health', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  // Ready endpoint: Readiness probe with DB ping & table check
  server.get('/ready', async (request, reply) => {
    try {
      await pool.query('SELECT 1');
      const result = await pool.query(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'"
      );
      if (Number(result.rows[0]?.count) === 0) {
        return reply.status(503).send({
          status: 'not_ready',
          error: 'Database schema migrations not applied',
        });
      }
      return reply.status(200).send({
        status: 'ready',
        db: 'up',
        migrations: 'applied',
      });
    } catch (err: any) {
      request.log.error(err, 'Database readiness check failed');
      return reply.status(503).send({
        status: 'not_ready',
        db: 'down',
        error: err?.message || 'Database unavailable',
      });
    }
  });

  // Version endpoint
  server.get('/version', async (_request, reply) => {
    return reply.status(200).send({
      version: '0.1.0',
      commit: env.GIT_SHA || process.env.GIT_SHA || 'dev',
    });
  });

  // Test-only endpoint to force waitlist offer expiry sweep in E2E tests
  if (env.NODE_ENV === 'test') {
    server.post('/test/expire-offers', async (_request, reply) => {
      await db
        .update(registrations)
        .set({ offerExpiresAt: new Date(Date.now() - 5000) })
        .where(eq(registrations.status, RegistrationStatus.OFFERED));

      const count = await runOfferExpirySweepOnce();
      return reply.status(200).send({ success: true, expired: count });
    });
  }

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
  server.register(teamRoutes);
  server.register(submissionRoutes);
  server.register(teammatePoolRoutes);
  server.register(winnerRoutes);
  server.register(odRoutes);
  server.register(reviewRoutes);
  server.register(verifyRoutes);
  server.register(budgetRoutes);
  server.register(analyticsRoutes);

  return server;
}
