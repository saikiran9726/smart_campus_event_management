import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';
import {
  getTicketDetailsByRegistrationId,
  renderQrPng,
  renderQrSvg,
} from './service';

export async function ticketRoutes(server: FastifyInstance): Promise<void> {
  // 1. GET /tickets/:registrationId (owner)
  server.get(
    '/tickets/:registrationId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { registrationId } = request.params as { registrationId: string };
      const data = await getTicketDetailsByRegistrationId(registrationId);

      if (
        data.ticket.userId !== request.user!.id &&
        request.user!.role !== 'ADMIN'
      ) {
        throw new AppError(
          'FORBIDDEN',
          'You are not authorized to view this ticket.',
          403
        );
      }

      return reply.status(200).send({
        ticket: {
          id: data.ticket.id,
          token: data.ticket.token,
          status: data.ticket.status,
          checkedInAt: data.ticket.checkedInAt,
          checkedInVia: data.ticket.checkedInVia,
          createdAt: data.ticket.createdAt,
        },
        event: {
          id: data.event.id,
          title: data.event.title,
          slug: data.event.slug,
          category: data.event.category,
          startAt: data.event.startAt,
          endAt: data.event.endAt,
          venue: data.venue
            ? {
                id: data.venue.id,
                name: data.venue.name,
                locationText: data.venue.locationText,
              }
            : null,
        },
      });
    }
  );

  // 2. GET /tickets/:registrationId/qr.png (owner)
  server.get(
    '/tickets/:registrationId/qr.png',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { registrationId } = request.params as { registrationId: string };
      const data = await getTicketDetailsByRegistrationId(registrationId);

      if (
        data.ticket.userId !== request.user!.id &&
        request.user!.role !== 'ADMIN'
      ) {
        throw new AppError(
          'FORBIDDEN',
          'You are not authorized to view this ticket QR.',
          403
        );
      }

      const pngBuffer = await renderQrPng(data.ticket.token);

      return reply
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'private, no-store')
        .status(200)
        .send(pngBuffer);
    }
  );

  // 3. GET /tickets/:registrationId/qr.svg (owner)
  server.get(
    '/tickets/:registrationId/qr.svg',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { registrationId } = request.params as { registrationId: string };
      const data = await getTicketDetailsByRegistrationId(registrationId);

      if (
        data.ticket.userId !== request.user!.id &&
        request.user!.role !== 'ADMIN'
      ) {
        throw new AppError(
          'FORBIDDEN',
          'You are not authorized to view this ticket QR.',
          403
        );
      }

      const svgString = await renderQrSvg(data.ticket.token);

      return reply
        .header('Content-Type', 'image/svg+xml')
        .header('Cache-Control', 'private, no-store')
        .status(200)
        .send(svgString);
    }
  );
}
