import { eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Webhook, WebhookRequiredHeaders } from 'svix';
import { UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { users, webhookEvents } from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';

interface ClerkWebhookEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkWebhookUserData {
  id: string;
  email_addresses?: ClerkWebhookEmailAddress[];
  primary_email_address_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  phone_numbers?: Array<{ phone_number: string }>;
}

interface ClerkWebhookEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted' | string;
  data: ClerkWebhookUserData;
}

export async function clerkWebhookRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/webhooks/clerk',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const svixId = request.headers['svix-id'] as string | undefined;
      const svixTimestamp = request.headers['svix-timestamp'] as string | undefined;
      const svixSignature = request.headers['svix-signature'] as string | undefined;

      if (!svixId || !svixTimestamp || !svixSignature) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Missing required Svix webhook verification headers',
          400
        );
      }

      const rawBody =
        (request as any).rawBody ??
        (typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body));

      try {
        const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
        const headers: WebhookRequiredHeaders = {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        };
        wh.verify(rawBody, headers);
      } catch (err) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Svix webhook signature verification failed: ${
            err instanceof Error ? err.message : 'Invalid signature'
          }`,
          400
        );
      }

      const event: ClerkWebhookEvent =
        typeof rawBody === 'string' ? JSON.parse(rawBody) : (rawBody as ClerkWebhookEvent);

      // Check idempotency: avoid duplicate event processing
      const [alreadyProcessed] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.svixId, svixId))
        .limit(1);

      if (alreadyProcessed) {
        return reply.status(200).send({ received: true, replayed: true });
      }

      // Record webhook event receipt
      await db.insert(webhookEvents).values({
        svixId,
        eventType: event.type,
      });

      const { type, data } = event;

      if (type === 'user.created' || type === 'user.updated') {
        const clerkId = data.id;
        const primaryEmail =
          data.email_addresses?.find((e) => e.id === data.primary_email_address_id)
            ?.email_address ||
          data.email_addresses?.[0]?.email_address;

        if (!primaryEmail) {
          return reply.status(200).send({ received: true, warning: 'No email address found' });
        }

        const fullName =
          [data.first_name, data.last_name].filter(Boolean).join(' ').trim() ||
          primaryEmail.split('@')[0] ||
          'Campus Member';

        const avatarUrl = data.image_url ?? null;

        // Determine default role: never trust role from webhook payload
        let initialRole: UserRole = UserRole.STUDENT;
        if (env.ADMIN_EMAIL_DOMAIN_ALLOWLIST) {
          const domains = env.ADMIN_EMAIL_DOMAIN_ALLOWLIST.split(',').map((d) => d.trim());
          const userDomain = primaryEmail.split('@')[1];
          if (userDomain && domains.includes(userDomain)) {
            initialRole = UserRole.ADMIN;
          }
        }

        await db
          .insert(users)
          .values({
            clerkId,
            email: primaryEmail,
            fullName,
            avatarUrl,
            role: initialRole,
          })
          .onConflictDoUpdate({
            target: users.clerkId,
            set: {
              email: primaryEmail,
              fullName,
              avatarUrl,
              updatedAt: new Date(),
            },
          });
      } else if (type === 'user.deleted') {
        const clerkId = data.id;
        if (clerkId) {
          // Soft delete: null out personal data except id
          await db
            .update(users)
            .set({
              deletedAt: new Date(),
              fullName: 'Deleted User',
              phone: null,
              avatarUrl: null,
              department: null,
              year: null,
              updatedAt: new Date(),
            })
            .where(eq(users.clerkId, clerkId));
        }
      }

      return reply.status(200).send({ received: true });
    }
  );
}
