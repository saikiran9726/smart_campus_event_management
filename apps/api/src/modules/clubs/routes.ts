import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ChannelKind,
  ClubMemberRole,
  UserRole,
} from '@eventora/shared';
import { db } from '../../db/client';
import { clubChannels, clubMembers, clubs, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireClubRole, requireRole } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';

export async function clubRoutes(server: FastifyInstance): Promise<void> {
  // 1. Create Club
  server.post(
    '/clubs',
    {
      preHandler: [
        requireAuth,
        requireRole(UserRole.ORGANIZER, UserRole.FACULTY, UserRole.ADMIN),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as any;

      if (!body.name || !body.slug || !body.description) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Club name, slug, and description are required.',
          400
        );
      }

      // Check unique slug/name
      const [existing] = await db
        .select({ id: clubs.id })
        .from(clubs)
        .where(eq(clubs.slug, body.slug))
        .limit(1);

      if (existing) {
        throw new AppError(
          'CONFLICT',
          `Club with slug '${body.slug}' already exists.`,
          409
        );
      }

      // Resolve faculty coordinator if email provided
      let facultyId: string | null = null;
      if (body.facultyAdvisorEmail) {
        const [faculty] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, body.facultyAdvisorEmail))
          .limit(1);
        if (faculty) {
          facultyId = faculty.id;
        }
      }

      // Create club in a transaction along with owner membership and default channels
      const newClub = await db.transaction(async (tx) => {
        const [club] = await tx
          .insert(clubs)
          .values({
            name: body.name,
            slug: body.slug,
            description: body.description,
            logoKey: body.logoUrl || body.logoKey || null,
            bannerKey: body.bannerUrl || body.bannerKey || null,
            facultyCoordinatorId: facultyId,
            createdBy: request.user!.id,
          })
          .returning();

        if (!club) {
          throw new AppError('CONFLICT', 'Failed to create club record.', 409);
        }

        // Creator becomes club OWNER
        await tx.insert(clubMembers).values({
          clubId: club.id,
          userId: request.user!.id,
          role: ClubMemberRole.OWNER,
        });

        // Auto-create default channels
        await tx.insert(clubChannels).values([
          {
            clubId: club.id,
            kind: ChannelKind.ANNOUNCEMENTS,
            name: 'Announcements',
            slug: 'announcements',
          },
          {
            clubId: club.id,
            kind: ChannelKind.GENERAL,
            name: 'General',
            slug: 'general',
          },
          {
            clubId: club.id,
            kind: ChannelKind.EVENTS,
            name: 'Events',
            slug: 'events',
          },
        ]);

        return club;
      });

      return reply.status(201).send({ club: newClub });
    }
  );

  // 2. List Clubs
  server.get('/clubs', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { q?: string; limit?: string };
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);

    const conditions = [];
    if (query.q) {
      conditions.push(ilike(clubs.name, `%${query.q}%`));
    }

    const items = await db
      .select({
        id: clubs.id,
        name: clubs.name,
        slug: clubs.slug,
        description: clubs.description,
        logoKey: clubs.logoKey,
        bannerKey: clubs.bannerKey,
        facultyCoordinatorId: clubs.facultyCoordinatorId,
        createdBy: clubs.createdBy,
        createdAt: clubs.createdAt,
      })
      .from(clubs)
      .where(conditions.length > 0 ? conditions[0] : undefined)
      .orderBy(desc(clubs.createdAt))
      .limit(limit);

    return reply.status(200).send({ items, clubs: items });
  });

  // 3. Get Club by Slug
  server.get('/clubs/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };

    const [club] = await db
      .select()
      .from(clubs)
      .where(eq(clubs.slug, slug))
      .limit(1);

    if (!club) {
      throw new AppError('NOT_FOUND', `Club '${slug}' not found.`, 404);
    }

    const [memberCountRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clubMembers)
      .where(eq(clubMembers.clubId, club.id));

    return reply.status(200).send({
      club: {
        ...club,
        memberCount: Number(memberCountRes?.count ?? 0),
      },
    });
  });

  // 4. Update Club
  server.patch(
    '/clubs/:id',
    {
      preHandler: [
        requireAuth,
        requireClubRole('id', ClubMemberRole.OWNER, ClubMemberRole.ADMIN),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.logoKey !== undefined || body.logoUrl !== undefined) {
        updateData.logoKey = body.logoKey ?? body.logoUrl;
      }
      if (body.bannerKey !== undefined || body.bannerUrl !== undefined) {
        updateData.bannerKey = body.bannerKey ?? body.bannerUrl;
      }

      const [updated] = await db
        .update(clubs)
        .set(updateData)
        .where(eq(clubs.id, id))
        .returning();

      if (!updated) {
        throw new AppError('NOT_FOUND', `Club '${id}' was not found.`, 404);
      }

      return reply.status(200).send({ club: updated });
    }
  );

  // 5. Add Member
  server.post(
    '/clubs/:id/members',
    {
      preHandler: [
        requireAuth,
        requireClubRole('id', ClubMemberRole.OWNER, ClubMemberRole.ADMIN),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { userId: string; role?: ClubMemberRole };

      if (!body.userId) {
        throw new AppError('VALIDATION_FAILED', 'userId is required.', 400);
      }

      const role = body.role ?? ClubMemberRole.MEMBER;

      const [membership] = await db
        .insert(clubMembers)
        .values({
          clubId: id,
          userId: body.userId,
          role,
        })
        .onConflictDoUpdate({
          target: [clubMembers.clubId, clubMembers.userId],
          set: { role },
        })
        .returning();

      return reply.status(201).send({ member: membership });
    }
  );

  // 6. Remove Member
  server.delete(
    '/clubs/:id/members/:userId',
    {
      preHandler: [requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, userId } = request.params as { id: string; userId: string };

      // Either self-leaving or club owner/admin
      const isSelf = request.user!.id === userId;
      if (!isSelf && request.user!.role !== UserRole.ADMIN) {
        const [callerMember] = await db
          .select({ role: clubMembers.role })
          .from(clubMembers)
          .where(
            and(
              eq(clubMembers.clubId, id),
              eq(clubMembers.userId, request.user!.id)
            )
          )
          .limit(1);

        if (
          !callerMember ||
          (callerMember.role !== ClubMemberRole.OWNER &&
            callerMember.role !== ClubMemberRole.ADMIN)
        ) {
          throw new AppError(
            'FORBIDDEN',
            'Insufficient permissions to remove club member.',
            403
          );
        }
      }

      await db
        .delete(clubMembers)
        .where(
          and(eq(clubMembers.clubId, id), eq(clubMembers.userId, userId))
        );

      return reply.status(200).send({ success: true });
    }
  );

  // 7. List Members
  server.get(
    '/clubs/:id/members',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const members = await db
        .select({
          userId: users.id,
          fullName: users.fullName,
          email: users.email,
          avatarUrl: users.avatarUrl,
          role: clubMembers.role,
          joinedAt: clubMembers.joinedAt,
        })
        .from(clubMembers)
        .innerJoin(users, eq(clubMembers.userId, users.id))
        .where(eq(clubMembers.clubId, id))
        .orderBy(desc(clubMembers.joinedAt));

      return reply.status(200).send({ members });
    }
  );
}
