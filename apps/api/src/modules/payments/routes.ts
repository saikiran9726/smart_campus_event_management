import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';
import {
  createSandboxCheckout,
  handleSandboxWebhook,
  sandboxCheckoutSchema,
  verifySandboxWebhookSignature,
} from './service';

export async function paymentRoutes(server: FastifyInstance): Promise<void> {
  // 1. POST /registrations/:id/sandbox-checkout (auth)
  server.post(
    '/registrations/:id/sandbox-checkout',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body;

      const result = await createSandboxCheckout(
        request.user!,
        id,
        body as any
      );

      const statusCode = result.outcome === 'SUCCEEDED' ? 200 : 402;
      return reply.status(statusCode).send(result);
    }
  );

  // 1.5. POST /events/:eventId/payments/sandbox (alias for sandbox-checkout)
  server.post(
    '/events/:eventId/payments/sandbox',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as any;
      const registrationId = body?.registrationId;
      if (!registrationId) {
        throw new AppError('VALIDATION_FAILED', 'registrationId is required.', 400);
      }
      const simulate = body?.outcome === 'FAILED' ? 'FAILURE' : (body?.simulate || 'SUCCESS');
      const result = await createSandboxCheckout(
        request.user!,
        registrationId,
        { simulate }
      );
      const statusCode = result.outcome === 'SUCCEEDED' ? 200 : 402;
      return reply.status(statusCode).send({
        ...result,
        success: result.outcome === 'SUCCEEDED',
        transactionId: result.payment?.id || 'SANDBOX_TX_001',
      });
    }
  );

  // 2. POST /webhooks/sandbox (gateway webhook simulation)
  server.post(
    '/webhooks/sandbox',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (env.PAYMENT_MODE !== 'sandbox') {
        throw new AppError('FORBIDDEN', 'Sandbox webhooks are disabled outside sandbox mode.', 403);
      }

      const signature = request.headers['x-sandbox-signature'] as string | undefined;
      const rawBody = JSON.stringify(request.body);

      if (!signature || !verifySandboxWebhookSignature(rawBody, signature)) {
        throw new AppError('FORBIDDEN', 'Invalid or missing sandbox webhook signature.', 403);
      }

      const body = request.body as any;
      if (!body?.paymentId || !body?.simulate) {
        throw new AppError('VALIDATION_FAILED', 'Missing paymentId or simulate.', 400);
      }

      const result = await handleSandboxWebhook({
        paymentId: body.paymentId,
        simulate: body.simulate,
      });

      return reply.status(200).send(result);
    }
  );
}
