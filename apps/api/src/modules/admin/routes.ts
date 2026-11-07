import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SQL, and, count, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { auditLogs, clubMembers, clubs, events, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireRole } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';

const SYSTEM_BOT_USER_ID = '00000000-0000-0000-0000-000000000000';

const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  role: z.nativeEnum(UserRole).optional(),
});

const updateRoleBodySchema = z.object({
  role: z.nativeEnum(UserRole),
});

const clubListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().optional(),
});

const updateClubBodySchema = z.object({
  description: z.string().trim().min(1).optional(),
  facultyCoordinatorId: z.string().uuid().nullable().optional(),
});

const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().trim().optional(),
  entity: z.string().trim().optional(),
});

export async function adminRoutes(server: FastifyInstance): Promise<void> {
  // 1. GET /admin/users — Paginated user directory with role & text search
  server.get(
    '/admin/users',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN)],
      schema: { querystring: userListQuerySchema },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, limit, q, role } = request.query as z.infer<typeof userListQuerySchema>;
      const offset = (page - 1) * limit;

      // Exclude internal automated system bot identity from human user directory
      const conditions: SQL[] = [ne(users.id, SYSTEM_BOT_USER_ID)];

      if (role) {
        conditions.push(eq(users.role, role));
      }

      if (q && q.length > 0) {
        const pattern = `%${q}%`;
        const searchCondition = or(
          ilike(users.fullName, pattern),
          ilike(users.email, pattern),
          ilike(users.rollNumber, pattern)
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalCountResult] = await db
        .select({ total: count() })
        .from(users)
        .where(whereClause);

      const total = Number(totalCountResult?.total || 0);

      const userRows = await db
        .select({
          id: users.id,
          clerkId: users.clerkId,
          email: users.email,
          fullName: users.fullName,
          rollNumber: users.rollNumber,
          department: users.department,
          year: users.year,
          phone: users.phone,
          avatarUrl: users.avatarUrl,
          role: users.role,
          strikeCount: users.strikeCount,
          consecutiveNoShows: users.consecutiveNoShows,
          cooldownUntil: users.cooldownUntil,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.status(200).send({
        users: userRows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }
  );

  // 2. PATCH /admin/users/:id/role — Update user system role with audit trail
  server.patch(
    '/admin/users/:id/role',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: updateRoleBodySchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { role: newRole } = request.body as z.infer<typeof updateRoleBodySchema>;

      if (id === SYSTEM_BOT_USER_ID) {
        throw new AppError('FORBIDDEN', 'Internal system bot account role cannot be modified.', 403);
      }

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!targetUser) {
        throw new AppError('NOT_FOUND', `User with ID '${id}' not found`, 404);
      }

      // Safeguard: Prevent admin from revoking the last active admin role
      if (
        targetUser.role === UserRole.ADMIN &&
        newRole !== UserRole.ADMIN
      ) {
        const [adminCount] = await db
          .select({ count: count() })
          .from(users)
          .where(and(eq(users.role, UserRole.ADMIN), ne(users.id, id), isNull(users.deletedAt)));

        if (Number(adminCount?.count || 0) === 0) {
          throw new AppError(
            'FORBIDDEN',
            'Cannot demote the last remaining administrator in the system',
            403
          );
        }
      }

      const [updatedUser] = await db
        .update(users)
        .set({
          role: newRole,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      // Record audit log
      await db.insert(auditLogs).values({
        actorId: request.user!.id,
        action: 'USER_ROLE_UPDATED',
        entity: 'user',
        entityId: id,
        diff: {
          previousRole: targetUser.role,
          newRole,
          userEmail: targetUser.email,
        },
      });

      return reply.status(200).send({
        success: true,
        user: updatedUser,
      });
    }
  );

  // 3. GET /admin/clubs — Comprehensive club directory with coordinators and statistics
  server.get(
    '/admin/clubs',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN)],
      schema: { querystring: clubListQuerySchema },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, limit, q } = request.query as z.infer<typeof clubListQuerySchema>;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (q && q.length > 0) {
        const pattern = `%${q}%`;
        conditions.push(or(ilike(clubs.name, pattern), ilike(clubs.slug, pattern)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalCountResult] = await db
        .select({ total: count() })
        .from(clubs)
        .where(whereClause);

      const total = Number(totalCountResult?.total || 0);

      // Fetch clubs along with faculty coordinator info and aggregated stats
      const clubRows = await db
        .select({
          id: clubs.id,
          name: clubs.name,
          slug: clubs.slug,
          description: clubs.description,
          logoKey: clubs.logoKey,
          bannerKey: clubs.bannerKey,
          facultyCoordinatorId: clubs.facultyCoordinatorId,
          coordinatorName: users.fullName,
          coordinatorEmail: users.email,
          createdAt: clubs.createdAt,
        })
        .from(clubs)
        .leftJoin(users, eq(clubs.facultyCoordinatorId, users.id))
        .where(whereClause)
        .orderBy(desc(clubs.createdAt))
        .limit(limit)
        .offset(offset);

      // Fetch member count and event count for each club
      const clubsWithStats = await Promise.all(
        clubRows.map(async (c) => {
          const [memberCountRes] = await db
            .select({ count: count() })
            .from(clubMembers)
            .where(eq(clubMembers.clubId, c.id));

          const [eventCountRes] = await db
            .select({ count: count() })
            .from(events)
            .where(eq(events.clubId, c.id));

          return {
            ...c,
            memberCount: Number(memberCountRes?.count || 0),
            eventCount: Number(eventCountRes?.count || 0),
          };
        })
      );

      return reply.status(200).send({
        clubs: clubsWithStats,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }
  );

  // 4. PATCH /admin/clubs/:id — Update club details & coordinator assignment
  server.patch(
    '/admin/clubs/:id',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: updateClubBodySchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof updateClubBodySchema>;

      const [existingClub] = await db
        .select()
        .from(clubs)
        .where(eq(clubs.id, id))
        .limit(1);

      if (!existingClub) {
        throw new AppError('NOT_FOUND', `Club with ID '${id}' not found`, 404);
      }

      if (body.facultyCoordinatorId) {
        const [coordinator] = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(and(eq(users.id, body.facultyCoordinatorId), isNull(users.deletedAt)))
          .limit(1);

        if (!coordinator) {
          throw new AppError('NOT_FOUND', `Faculty coordinator with ID '${body.facultyCoordinatorId}' not found`, 404);
        }

        if (coordinator.role !== UserRole.FACULTY && coordinator.role !== UserRole.ADMIN) {
          throw new AppError(
            'VALIDATION_FAILED',
            'Faculty coordinator must have FACULTY or ADMIN role',
            400
          );
        }
      }

      const updates: Partial<typeof clubs.$inferInsert> = {};
      if (body.description !== undefined) {
        updates.description = body.description;
      }
      if (body.facultyCoordinatorId !== undefined) {
        updates.facultyCoordinatorId = body.facultyCoordinatorId;
      }

      const [updatedClub] = await db
        .update(clubs)
        .set(updates)
        .where(eq(clubs.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorId: request.user!.id,
        action: 'CLUB_UPDATED',
        entity: 'club',
        entityId: id,
        diff: body,
      });

      return reply.status(200).send({
        success: true,
        club: updatedClub,
      });
    }
  );

  // 5. GET /admin/audit-logs — Paginated system security and governance audit logs
  server.get(
    '/admin/audit-logs',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN)],
      schema: { querystring: auditLogsQuerySchema },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, limit, action, entity } = request.query as z.infer<typeof auditLogsQuerySchema>;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (action) {
        conditions.push(eq(auditLogs.action, action));
      }
      if (entity) {
        conditions.push(eq(auditLogs.entity, entity));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalCountResult] = await db
        .select({ total: count() })
        .from(auditLogs)
        .where(whereClause);

      const total = Number(totalCountResult?.total || 0);

      const logs = await db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.actorId,
          actorName: users.fullName,
          actorEmail: users.email,
          action: auditLogs.action,
          entity: auditLogs.entity,
          entityId: auditLogs.entityId,
          diff: auditLogs.diff,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.status(200).send({
        logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }
  );
}
