import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ClubMemberRole, UserRole } from '@eventora/shared';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { clubMembers, clubs, events } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';
import {
  generateNaacReport,
  getCampusAnalytics,
  getClubTrends,
  getEventAnalytics,
  verifyAccreditationReport,
} from './service';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // 1. Post-Mortem Event Analytics (organizers, faculty, admin)
  app.get(
    '/events/:eventId/analytics',
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
      const user = request.user!;

      // 1. Fetch event to locate clubId
      const [event] = await db
        .select({ clubId: events.clubId })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
      }

      // 2. Permission check: Admin, Club Faculty Coordinator, or Club Organizer/Owner
      const isAdmin = user.role === UserRole.ADMIN;
      if (!isAdmin) {
        const [club] = await db
          .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
          .from(clubs)
          .where(eq(clubs.id, event.clubId))
          .limit(1);

        const isFacultyAdvisor = club?.facultyCoordinatorId === user.id;

        const [member] = await db
          .select()
          .from(clubMembers)
          .where(
            and(
              eq(clubMembers.clubId, event.clubId),
              eq(clubMembers.userId, user.id),
              inArray(clubMembers.role, [
                ClubMemberRole.OWNER,
                ClubMemberRole.ADMIN,
              ])
            )
          )
          .limit(1);

        if (!isFacultyAdvisor && !member) {
          throw new AppError(
            'FORBIDDEN',
            'Access to event analytics is restricted to event organizers, faculty advisors, and administrators.',
            403
          );
        }
      }

      const analytics = await getEventAnalytics(eventId);
      return reply.code(200).send(analytics);
    }
  );

  // 2. Historical Club Trends
  app.get(
    '/clubs/:clubId/analytics/trends',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          clubId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const user = request.user!;

      const isAdmin = user.role === UserRole.ADMIN;
      if (!isAdmin) {
        const [club] = await db
          .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
          .from(clubs)
          .where(eq(clubs.id, clubId))
          .limit(1);

        if (!club) {
          throw new AppError('NOT_FOUND', `Club '${clubId}' not found.`, 404);
        }

        const isFacultyAdvisor = club.facultyCoordinatorId === user.id;

        const [member] = await db
          .select()
          .from(clubMembers)
          .where(
            and(
              eq(clubMembers.clubId, clubId),
              eq(clubMembers.userId, user.id),
              inArray(clubMembers.role, [
                ClubMemberRole.OWNER,
                ClubMemberRole.ADMIN,
              ])
            )
          )
          .limit(1);

        if (!isFacultyAdvisor && !member) {
          throw new AppError(
            'FORBIDDEN',
            'Access to club analytics trends is restricted to club organizers and faculty advisors.',
            403
          );
        }
      }

      const trends = await getClubTrends(clubId);
      return reply.code(200).send(trends);
    }
  );

  // 3. Campus-wide macro analytics (ADMIN only)
  app.get(
    '/admin/analytics/campus',
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        throw new AppError(
          'FORBIDDEN',
          'Campus-wide analytics requires administrator privileges.',
          403
        );
      }

      const campusData = await getCampusAnalytics();
      return reply.code(200).send(campusData);
    }
  );

  // 4. NAAC/NBA Accreditation Report Export (FACULTY/ADMIN/club OWNER)
  app.get(
    '/clubs/:clubId/reports/naac',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          clubId: z.string().uuid(),
        }),
        querystring: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
          format: z.enum(['pdf', 'csv', 'xlsx', 'PDF', 'CSV', 'XLSX']).default('pdf'),
        }),
      },
    },
    async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const query = request.query as {
        from?: string;
        to?: string;
        format?: string;
      };
      const user = request.user!;

      // Permission check: FACULTY coordinator, ADMIN, or club OWNER
      const isAdmin = user.role === UserRole.ADMIN;
      if (!isAdmin) {
        const [club] = await db
          .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
          .from(clubs)
          .where(eq(clubs.id, clubId))
          .limit(1);

        if (!club) {
          throw new AppError('NOT_FOUND', `Club '${clubId}' not found.`, 404);
        }

        const isClubFaculty = club.facultyCoordinatorId === user.id;

        const [ownerMember] = await db
          .select()
          .from(clubMembers)
          .where(
            and(
              eq(clubMembers.clubId, clubId),
              eq(clubMembers.userId, user.id),
              eq(clubMembers.role, ClubMemberRole.OWNER)
            )
          )
          .limit(1);

        if (!isClubFaculty && !ownerMember) {
          throw new AppError(
            'FORBIDDEN',
            'Accreditation reporting is restricted to club owners, assigned faculty coordinators, and administrators.',
            403
          );
        }
      }

      const normalizedFormat = (query.format?.toLowerCase() || 'pdf') as 'pdf' | 'csv' | 'xlsx';
      const fromDate = query.from ? new Date(query.from) : undefined;
      const toDate = query.to ? new Date(query.to) : undefined;

      const reportResult = await generateNaacReport({
        clubId,
        from: fromDate,
        to: toDate,
        format: normalizedFormat,
        userId: user.id,
      });

      reply.header('Content-Type', reportResult.contentType);
      reply.header('Content-Disposition', `attachment; filename="${reportResult.filename}"`);
      return reply.send(reportResult.buffer);
    }
  );

  // 5. Public verification endpoint for accreditation reports
  app.get(
    '/public/verify/report/:serial',
    {
      schema: {
        params: z.object({
          serial: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const { serial } = request.params as { serial: string };
      const verification = await verifyAccreditationReport(serial);
      return reply.code(200).send(verification);
    }
  );
}
