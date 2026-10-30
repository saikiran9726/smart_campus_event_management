import { desc, eq } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client';
import { events, teamMembers, teamRosterSnapshots, teams, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireEventOrganizer } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import { autoLockTeamsForEvent } from '../../workers/team-lock.worker';
import {
  createTeam,
  getTeamById,
  getUserTeamForEvent,
  joinTeamByCode,
  leaveTeam,
  lockTeam,
} from './service';

const createTeamBodySchema = z.object({
  name: z.string().min(2).max(100),
  answers: z.record(z.any()).optional(),
});

const joinTeamBodySchema = z.object({
  code: z.string().min(1).max(20).optional(),
  inviteCode: z.string().min(1).max(20).optional(),
}).refine((data) => Boolean(data.code || data.inviteCode), {
  message: 'Team code is required.',
});

export async function teamRoutes(server: FastifyInstance): Promise<void> {
  // 1. Create a competition team
  server.post(
    '/events/:eventId/teams',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const parsed = createTeamBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Team name must be between 2 and 100 characters.', 400);
      }

      const result = await createTeam(
        request.user!.id,
        eventId,
        parsed.data.name,
        parsed.data.answers
      );

      return reply.status(201).send(result);
    }
  );

  // 2. Join a team using code
  server.post(
    '/teams/join',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = joinTeamBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Team code is required.', 400);
      }

      const code = (parsed.data.code || parsed.data.inviteCode)!;
      const result = await joinTeamByCode(request.user!.id, code);
      return reply.status(200).send(result);
    }
  );

  // 3. Leave a team
  server.post(
    '/teams/:id/leave',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await leaveTeam(request.user!.id, id);
      return reply.status(200).send(result);
    }
  );

  // 4. Get team by ID
  server.get(
    '/teams/:id',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const team = await getTeamById(id, request.user!.id);
      return reply.status(200).send({ team });
    }
  );

  // 5. Get current user's team for an event
  server.get(
    '/events/:eventId/teams/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const team = await getUserTeamForEvent(request.user!.id, eventId);
      return reply.status(200).send({ team });
    }
  );

  // 6. Lock team roster
  server.post(
    '/teams/:id/lock',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await lockTeam(request.user!.id, id);
      return reply.status(200).send(result);
    }
  );

  // 7. Close check-in and trigger auto-lock for the event
  server.post(
    '/events/:eventId/close-checkin',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };

      const [updated] = await db
        .update(events)
        .set({
          checkinClosedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();

      if (!updated) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
      }

      const lockResult = await autoLockTeamsForEvent(eventId);

      return reply.status(200).send({
        success: true,
        checkinClosedAt: updated.checkinClosedAt,
        ...lockResult,
      });
    }
  );

  // 8. List all teams for an event (Organizer)
  server.get(
    '/events/:eventId/teams',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const teamsList = await db
        .select()
        .from(teams)
        .where(eq(teams.eventId, eventId))
        .orderBy(desc(teams.name));

      const result = [];
      for (const t of teamsList) {
        const members = await db
          .select({
            userId: teamMembers.userId,
            role: teamMembers.role,
            joinedAt: teamMembers.joinedAt,
            fullName: users.fullName,
            email: users.email,
            rollNumber: users.rollNumber,
            department: users.department,
          })
          .from(teamMembers)
          .innerJoin(users, eq(teamMembers.userId, users.id))
          .where(eq(teamMembers.teamId, t.id));

        const [snapshot] = await db
          .select()
          .from(teamRosterSnapshots)
          .where(eq(teamRosterSnapshots.teamId, t.id))
          .limit(1);

        result.push({
          ...t,
          members,
          snapshot: snapshot ? snapshot.snapshot : null,
        });
      }

      return reply.status(200).send({ teams: result });
    }
  );
}
