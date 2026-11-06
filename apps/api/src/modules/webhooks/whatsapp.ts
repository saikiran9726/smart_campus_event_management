import crypto from 'node:crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { notifications } from '../../db/schema';
import { env } from '../../env';

export interface WhatsAppStatusWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        statuses?: Array<{
          id: string; // e.g. wamid.HBgL...
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string; // Unix epoch seconds
          recipient_id?: string;
          errors?: Array<{
            code: number;
            title: string;
            message?: string;
            error_data?: { details: string };
          }>;
        }>;
      };
      field?: string;
    }>;
  }>;
}

/**
 * Verifies Meta X-Hub-Signature-256 header.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const incomingHash = parts[1];
  if (!incomingHash) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(incomingHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch {
    return false;
  }
}

export async function whatsappWebhookRoutes(server: FastifyInstance): Promise<void> {
  // 1. GET /webhooks/whatsapp (Meta Webhook Verification Challenge)
  server.get(
    '/webhooks/whatsapp',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;
      const mode = query['hub.mode'];
      const verifyToken = query['hub.verify_token'];
      const challenge = query['hub.challenge'];

      if (mode === 'subscribe' && verifyToken === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        return reply.status(200).type('text/plain').send(challenge || '');
      }

      return reply.status(403).send({
        error: 'Forbidden: Invalid verification token or subscription mode.',
      });
    }
  );

  // 2. POST /webhooks/whatsapp (Meta Message Status & Delivery Updates)
  server.post(
    '/webhooks/whatsapp',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Optional signature verification if WHATSAPP_APP_SECRET is configured
      if (env.WHATSAPP_APP_SECRET) {
        const signature = request.headers['x-hub-signature-256'] as string | undefined;
        const rawBody = (request as any).rawBody || JSON.stringify(request.body);
        if (!verifyMetaSignature(rawBody, signature, env.WHATSAPP_APP_SECRET)) {
          return reply.status(403).send({ error: 'Invalid HMAC signature' });
        }
      }

      const body = request.body as WhatsAppStatusWebhookPayload;
      let processedCount = 0;

      const entries = body?.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const statuses = change.value?.statuses || [];
          for (const statusItem of statuses) {
            const providerMessageId = statusItem.id;
            const waStatus = statusItem.status;
            const eventTimestamp = statusItem.timestamp
              ? new Date(parseInt(statusItem.timestamp, 10) * 1000)
              : new Date();

            const [existing] = await db
              .select()
              .from(notifications)
              .where(eq(notifications.providerMessageId, providerMessageId))
              .limit(1);

            if (!existing) {
              continue;
            }

            if (waStatus === 'delivered') {
              await db
                .update(notifications)
                .set({
                  status: 'DELIVERED',
                  deliveredAt: eventTimestamp,
                })
                .where(eq(notifications.id, existing.id));
              processedCount++;
            } else if (waStatus === 'read') {
              await db
                .update(notifications)
                .set({
                  status: 'READ',
                  readAt: eventTimestamp,
                })
                .where(eq(notifications.id, existing.id));
              processedCount++;
            } else if (waStatus === 'failed') {
              const err =
                statusItem.errors?.[0]?.message ||
                statusItem.errors?.[0]?.title ||
                'Meta delivery failure';
              await db
                .update(notifications)
                .set({
                  status: 'FAILED',
                  error: `WhatsApp Delivery Failed: ${err}`,
                })
                .where(eq(notifications.id, existing.id));
              processedCount++;
            } else if (waStatus === 'sent') {
              await db
                .update(notifications)
                .set({
                  status: 'ACCEPTED',
                })
                .where(eq(notifications.id, existing.id));
              processedCount++;
            }
          }
        }
      }

      return reply.status(200).send({
        success: true,
        processed: processedCount,
      });
    }
  );
}
