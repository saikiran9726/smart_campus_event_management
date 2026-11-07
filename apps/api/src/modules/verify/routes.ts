import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../plugins/auth';
import {
  addEventResource,
  getCertificateDetails,
  getCertificateOgHtml,
  getCertificateShareData,
  getEventResourcesForUser,
  getUserPassport,
  revokeCertificate,
} from './service';
import { getOrGenerateCertificateOgPng } from './og.service';

export async function verifyRoutes(app: FastifyInstance): Promise<void> {
  // 1. Public certificate verification JSON
  app.get(
    '/public/verify/cert/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const details = await getCertificateDetails(id);
      return reply.code(200).send(details);
    }
  );

  // 1.5. Public certificate verification alias
  app.get(
    '/public/verify/certificate/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const details = await getCertificateDetails(id);
      return reply.code(200).send(details);
    }
  );

  // 2. Server-rendered OG HTML page for crawlers
  app.get(
    '/og/cert/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const html = await getCertificateOgHtml(id);
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(html);
    }
  );

  // Canonical share URL used in LinkedIn and crawler links
  app.get(
    '/share/cert/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const html = await getCertificateOgHtml(id);
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(html);
    }
  );

  // 3. Dynamic 1200x630 OG Card PNG rendered via Satori & Resvg
  app.get(
    '/og/cert/:id.png',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const details = await getCertificateDetails(id);

      const png = await getOrGenerateCertificateOgPng(id, {
        certId: id,
        holderName: details.holderName,
        eventTitle: details.event.title,
        clubName: details.club.name,
        kind: details.kind,
        rank: details.rank,
        issuedAt: details.issuedAt,
      });

      reply.header('Content-Type', 'image/png');
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(png);
    }
  );

  // 4. LinkedIn share intent payload
  app.get(
    '/certificates/:id/share',
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
      const shareData = await getCertificateShareData(id, userId);
      return reply.code(200).send(shareData);
    }
  );

  // 5. Personal passport
  app.get(
    '/me/passport',
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const passportData = await getUserPassport(userId);
      return reply.code(200).send(passportData);
    }
  );

  // 6. Resource vault: create resource
  app.post(
    '/events/:eventId/resources',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          eventId: z.string().uuid(),
        }),
        body: z.object({
          title: z.string().min(1).max(255),
          kind: z.enum(['SLIDES', 'REPO', 'ALBUM', 'OTHER']),
          resourceKey: z.string().optional(),
          url: z.string().url().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const body = request.body as {
        title: string;
        kind: string;
        resourceKey?: string;
        url?: string;
      };
      const userId = request.user!.id;

      const resource = await addEventResource(eventId, userId, body);
      return reply.code(201).send({ resource });
    }
  );

  // 7. Resource vault: get resources (checked-in attendees only)
  app.get(
    '/events/:eventId/resources',
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
      const role = request.user?.role;

      const data = await getEventResourcesForUser(eventId, userId, role);
      return reply.code(200).send(data);
    }
  );

  // 8. Revoke certificate (Organizer/Faculty/Admin)
  app.post(
    '/certificates/:id/revoke',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z
          .object({
            reason: z.string().trim().optional(),
          })
          .default({}),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as { reason?: string } | undefined) || {};
      const result = await revokeCertificate(id, request.user!, body.reason);
      return reply.code(200).send(result);
    }
  );
}
