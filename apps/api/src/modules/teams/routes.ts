import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { formatTeamCode } from '@eventora/shared';
import { db } from '../../db/client';
import {
  bookingAnswers,
  events,
  registrations,
  teamInvitations,
  teamMembers,
  teamRosterSnapshots,
  teams,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireEventOrganizer } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import { notifyInApp, notifyTeamInvitation } from '../comms/queue';
import { autoLockTeamsForEvent } from '../../workers/team-lock.worker';
import {
  createTeam,
  getTeamById,
  getTeamPreview,
  getUserTeamForEvent,
  joinTeamByCode,
  leaveTeam,
  lockTeam,
  regenerateTeamCode,
  removeTeamMember,
  revokeTeamCode,
} from './service';

const createTeamBodySchema = z.object({
  name: z.string().min(2).max(100),
  answers: z.record(z.any()).optional(),
});

const joinTeamBodySchema = z.object({
  code: z.string().min(1).max(20).optional(),
  inviteCode: z.string().min(1).max(20).optional(),
  answers: z.record(z.any()).optional(),
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

  // 1.5. Team Preview (Public / authenticated inspection before joining)
  server.get(
    '/teams/preview',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { code?: string; token?: string };
      const codeOrToken = (query.code || query.token)?.trim();
      if (!codeOrToken) {
        throw new AppError('VALIDATION_FAILED', 'Team code or invite token is required.', 400);
      }
      const preview = await getTeamPreview(codeOrToken);
      return reply.status(200).send(preview);
    }
  );

  // 1.6. Regenerate team code (Leader only)
  server.post(
    '/teams/:id/code/regenerate',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { expiryHours?: number } | undefined;
      const result = await regenerateTeamCode(request.user!.id, id, body?.expiryHours);
      return reply.status(200).send(result);
    }
  );

  // 1.7. Revoke team code (Leader only)
  server.post(
    '/teams/:id/code/revoke',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await revokeTeamCode(request.user!.id, id);
      return reply.status(200).send(result);
    }
  );

  // 2. Join a team using code (Rate-limited against brute force)
  server.post(
    '/teams/join',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = joinTeamBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Team code is required.', 400);
      }

      const code = (parsed.data.code || parsed.data.inviteCode)!;
      const result = await joinTeamByCode(request.user!.id, code, parsed.data.answers);
      return reply.status(200).send(result);
    }
  );

  // 2.5. Join a team using code (event-scoped alias, Rate-limited)
  server.post(
    '/events/:eventId/teams/join',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = joinTeamBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Team code is required.', 400);
      }

      const code = (parsed.data.code || parsed.data.inviteCode)!;
      const result = await joinTeamByCode(request.user!.id, code, parsed.data.answers);
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

  // 5.1. Get all teams for current user across events
  server.get(
    '/me/teams',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const myMemberships = await db
        .select({
          teamId: teamMembers.teamId,
          role: teamMembers.role,
          joinedAt: teamMembers.joinedAt,
          teamName: teams.name,
          inviteCode: teams.inviteCode,
          inviteToken: teams.inviteToken,
          codeStatus: teams.codeStatus,
          status: teams.status,
          eventId: teams.eventId,
          eventTitle: events.title,
          eventSlug: events.slug,
          eventStartAt: events.startAt,
          minTeamSize: events.minTeamSize,
          maxTeamSize: events.maxTeamSize,
          leaderId: teams.leaderId,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .innerJoin(events, eq(teams.eventId, events.id))
        .where(eq(teamMembers.userId, request.user!.id))
        .orderBy(desc(teamMembers.joinedAt));

      // Enrich with member count
      const result = await Promise.all(
        myMemberships.map(async (t) => {
          const [countRes] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(teamMembers)
            .where(eq(teamMembers.teamId, t.teamId));

          return {
            ...t,
            formattedCode: formatTeamCode(t.inviteCode),
            memberCount: countRes?.count ?? 1,
            isLeader: t.leaderId === request.user!.id,
          };
        })
      );

      return reply.status(200).send({ teams: result });
    }
  );

  // 5. Get current user's team for an event
  server.get(
    '/events/:eventId/teams/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const team = await getUserTeamForEvent(request.user!.id, eventId);
      if (!team) {
        return reply.status(200).send({ team: null });
      }

      if (team.leaderId === request.user!.id) {
        // Auto-expire past-due pending invitations
        await db
          .update(teamInvitations)
          .set({ status: 'EXPIRED' })
          .where(
            and(
              eq(teamInvitations.teamId, team.id),
              eq(teamInvitations.status, 'PENDING'),
              sql`${teamInvitations.expiresAt} <= now()`
            )
          );

        const invitations = await db
          .select()
          .from(teamInvitations)
          .where(eq(teamInvitations.teamId, team.id))
          .orderBy(desc(teamInvitations.createdAt));

        return reply.status(200).send({ team: { ...team, invitations } });
      }

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

  // 8. List all teams for an event (Organizer view)
  server.get(
    '/events/:eventId/teams',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      const minTeamSize = event?.minTeamSize ?? 1;
      const maxTeamSize = event?.maxTeamSize ?? 4;

      const teamsList = await db
        .select()
        .from(teams)
        .where(eq(teams.eventId, eventId))
        .orderBy(desc(teams.name));

      const result = [];
      for (const t of teamsList) {
        // Members with user profiles
        const memberRows = await db
          .select({
            userId: teamMembers.userId,
            role: teamMembers.role,
            joinedAt: teamMembers.joinedAt,
            fullName: users.fullName,
            email: users.email,
            rollNumber: users.rollNumber,
            department: users.department,
            phone: users.phone,
          })
          .from(teamMembers)
          .innerJoin(users, eq(teamMembers.userId, users.id))
          .where(eq(teamMembers.teamId, t.id));

        // Member registrations and form answers
        const enrichedMembers = [];
        for (const m of memberRows) {
          const [reg] = await db
            .select({
              id: registrations.id,
              status: registrations.status,
              paymentStatus: registrations.paymentStatus,
              amountPaise: registrations.amountPaise,
              approvalStatus: registrations.approvalStatus,
              createdAt: registrations.createdAt,
            })
            .from(registrations)
            .where(
              and(
                eq(registrations.eventId, eventId),
                eq(registrations.userId, m.userId)
              )
            )
            .limit(1);

          let answers: Record<string, any> = {};
          if (reg) {
            const ansRows = await db
              .select({
                questionId: bookingAnswers.questionId,
                label: bookingAnswers.questionLabelSnapshot,
                type: bookingAnswers.questionTypeSnapshot,
                value: bookingAnswers.value,
              })
              .from(bookingAnswers)
              .where(eq(bookingAnswers.registrationId, reg.id));

            for (const a of ansRows) {
              answers[a.questionId] = {
                label: a.label,
                type: a.type,
                value: a.value,
              };
            }
          }

          enrichedMembers.push({
            ...m,
            registration: reg || null,
            answers,
          });
        }

        // Leader info
        const leader = enrichedMembers.find((m) => m.userId === t.leaderId) || null;

        // Auto-expire past-due pending invitations
        await db
          .update(teamInvitations)
          .set({ status: 'EXPIRED' })
          .where(
            and(
              eq(teamInvitations.teamId, t.id),
              eq(teamInvitations.status, 'PENDING'),
              sql`${teamInvitations.expiresAt} <= now()`
            )
          );

        // Team invitations
        const invitations = await db
          .select({
            id: teamInvitations.id,
            teamId: teamInvitations.teamId,
            eventId: teamInvitations.eventId,
            status: teamInvitations.status,
            invitedEmail: teamInvitations.invitedEmail,
            invitedRollNumber: teamInvitations.invitedRollNumber,
            invitedUserId: teamInvitations.invitedUserId,
            createdAt: teamInvitations.createdAt,
            expiresAt: teamInvitations.expiresAt,
            respondedAt: teamInvitations.respondedAt,
          })
          .from(teamInvitations)
          .where(eq(teamInvitations.teamId, t.id))
          .orderBy(desc(teamInvitations.createdAt));

        // Immutable snapshot if roster locked
        const [snapshot] = await db
          .select()
          .from(teamRosterSnapshots)
          .where(eq(teamRosterSnapshots.teamId, t.id))
          .limit(1);

        // Project submission summary
        const projectSubmission = t.projectTitle
          ? {
              projectTitle: t.projectTitle,
              abstract: t.projectAbstract,
              repoUrl: t.repoUrl,
              demoUrl: t.demoUrl,
              deckKey: t.deckKey,
              submittedAt: t.submittedAt,
            }
          : null;

        const isReady =
          enrichedMembers.length >= minTeamSize &&
          enrichedMembers.length <= maxTeamSize;

        result.push({
          id: t.id,
          name: t.name,
          inviteCode: t.inviteCode,
          code: t.inviteCode,
          status: t.status,
          lockedAt: t.lockedAt,
          leaderId: t.leaderId,
          leader,
          members: enrichedMembers,
          invitations,
          minTeamSize,
          maxTeamSize,
          isReady,
          projectSubmission,
          snapshot: snapshot ? snapshot.snapshot : null,
        });
      }

      return reply.status(200).send({ teams: result });
    }
  );

  // 9. Send Team Invitation (Leader only)
  server.post(
    '/events/:eventId/teams/:teamId/invite',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, teamId } = request.params as { eventId: string; teamId: string };
      const body = request.body as any;
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
      const rollNumber = typeof body?.rollNumber === 'string' ? body.rollNumber.trim() : null;

      if (!email && !rollNumber) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Please provide an email or roll number to invite a teammate.',
          400
        );
      }

      // Check caller is team leader
      const [team] = await db
        .select()
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.eventId, eventId)))
        .limit(1);

      if (!team) {
        throw new AppError('NOT_FOUND', 'Team was not found.', 404);
      }

      if (team.leaderId !== request.user!.id) {
        throw new AppError('FORBIDDEN', 'Only the team leader can invite members.', 403);
      }

      if (team.status !== 'FORMING') {
        throw new AppError('CONFLICT', 'Team is not open for new members.', 409);
      }

      // Check event team size limits (counting current members + active pending invites)
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', 'Event not found.', 404);
      }

      const [memberCountRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId));

      const activePendingInvites = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, teamId),
            eq(teamInvitations.status, 'PENDING'),
            or(isNull(teamInvitations.expiresAt), sql`${teamInvitations.expiresAt} > now()`)!
          )
        );

      const currentCount = memberCountRes?.count ?? 0;
      const pendingCount = activePendingInvites[0]?.count ?? 0;
      const maxTeamSize = event.maxTeamSize ?? 4;

      if (currentCount + pendingCount >= maxTeamSize) {
        throw new AppError(
          'TEAM_CAPACITY_EXCEEDED',
          `Team has reached or reserved the maximum capacity of ${maxTeamSize} members.`,
          409
        );
      }

      // Search if target user exists in database
      let targetUser = null;
      if (email) {
        const [u] = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`)
          .limit(1);
        if (u) targetUser = u;
      }
      if (!targetUser && rollNumber) {
        const [u] = await db
          .select()
          .from(users)
          .where(eq(users.rollNumber, rollNumber))
          .limit(1);
        if (u) targetUser = u;
      }

      // If user exists, check if already in a team for this event
      if (targetUser) {
        if (targetUser.id === request.user!.id) {
          throw new AppError('CONFLICT', 'You cannot invite yourself to your own team.', 409);
        }

        const [existingMembership] = await db
          .select()
          .from(teamMembers)
          .where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, targetUser.id)))
          .limit(1);

        if (existingMembership) {
          throw new AppError('CONFLICT', 'User is already enrolled in a team for this event.', 409);
        }
      }

      // Check for duplicate pending invitation
      const [existingInv] = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, teamId),
            eq(teamInvitations.status, 'PENDING'),
            or(isNull(teamInvitations.expiresAt), sql`${teamInvitations.expiresAt} > now()`),
            or(
              targetUser ? eq(teamInvitations.invitedUserId, targetUser.id) : sql`false`,
              email ? eq(teamInvitations.invitedEmail, email) : sql`false`,
              rollNumber ? eq(teamInvitations.invitedRollNumber, rollNumber) : sql`false`
            )!
          )
        )
        .limit(1);

      if (existingInv) {
        throw new AppError('CONFLICT', 'A pending invitation already exists for this teammate.', 409);
      }

      // Expiry: 48h from now or event registration close, whichever is earlier
      const defaultExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const expiresAt =
        event.registrationClosesAt && event.registrationClosesAt < defaultExpiry
          ? event.registrationClosesAt
          : defaultExpiry;

      const [invitation] = await db
        .insert(teamInvitations)
        .values({
          teamId,
          eventId,
          invitedBy: request.user!.id,
          invitedEmail: email || (targetUser ? targetUser.email : null),
          invitedRollNumber: rollNumber || (targetUser ? targetUser.rollNumber : null),
          invitedUserId: targetUser ? targetUser.id : null,
          status: 'PENDING',
          expiresAt,
        })
        .returning();

      if (targetUser) {
        await notifyTeamInvitation(db, {
          invitedUserId: targetUser.id,
          eventId,
          teamId,
          teamName: team.name,
          inviterName: request.user!.fullName || 'Teammate',
        });
      }

      return reply.status(201).send({
        success: true,
        invitation,
        targetFound: Boolean(targetUser),
      });
    }
  );

  // 9.5. Get Team Invitations for a team (Leader or Organizer)
  server.get(
    '/events/:eventId/teams/:teamId/invitations',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, teamId } = request.params as { eventId: string; teamId: string };

      const [team] = await db
        .select()
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.eventId, eventId)))
        .limit(1);

      if (!team) {
        throw new AppError('NOT_FOUND', 'Team was not found.', 404);
      }

      // Auto-expire past-due invitations
      await db
        .update(teamInvitations)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(teamInvitations.teamId, teamId),
            eq(teamInvitations.status, 'PENDING'),
            sql`${teamInvitations.expiresAt} <= now()`
          )
        );

      const invs = await db
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.teamId, teamId))
        .orderBy(desc(teamInvitations.createdAt));

      return reply.status(200).send({ invitations: invs });
    }
  );

  // 9.6. Cancel Team Invitation (Leader)
  server.post(
    '/events/:eventId/teams/:teamId/invitations/:invitationId/cancel',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, teamId, invitationId } = request.params as {
        eventId: string;
        teamId: string;
        invitationId: string;
      };

      const [team] = await db
        .select()
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.eventId, eventId)))
        .limit(1);

      if (!team) {
        throw new AppError('NOT_FOUND', 'Team was not found.', 404);
      }

      if (team.leaderId !== request.user!.id) {
        throw new AppError('FORBIDDEN', 'Only the team leader can cancel invitations.', 403);
      }

      const [inv] = await db
        .select()
        .from(teamInvitations)
        .where(and(eq(teamInvitations.id, invitationId), eq(teamInvitations.teamId, teamId)))
        .limit(1);

      if (!inv) {
        throw new AppError('NOT_FOUND', 'Invitation not found.', 404);
      }

      if (inv.status !== 'PENDING') {
        throw new AppError('CONFLICT', `Cannot cancel invitation with status '${inv.status}'.`, 409);
      }

      const [cancelled] = await db
        .update(teamInvitations)
        .set({ status: 'CANCELLED', respondedAt: new Date() })
        .where(eq(teamInvitations.id, invitationId))
        .returning();

      return reply.status(200).send({ success: true, invitation: cancelled });
    }
  );

  // Global cancel alias for invitation
  server.post(
    '/team-invitations/:id/cancel',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [inv] = await db
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.id, id))
        .limit(1);

      if (!inv) {
        throw new AppError('NOT_FOUND', 'Invitation not found.', 404);
      }

      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, inv.teamId))
        .limit(1);

      if (!team || team.leaderId !== request.user!.id) {
        throw new AppError('FORBIDDEN', 'Only the team leader can cancel invitations.', 403);
      }

      if (inv.status !== 'PENDING') {
        throw new AppError('CONFLICT', `Cannot cancel invitation with status '${inv.status}'.`, 409);
      }

      const [cancelled] = await db
        .update(teamInvitations)
        .set({ status: 'CANCELLED', respondedAt: new Date() })
        .where(eq(teamInvitations.id, id))
        .returning();

      return reply.status(200).send({ success: true, invitation: cancelled });
    }
  );

  // 9.7. Remove Team Member (Leader, Organizer, Admin)
  server.post(
    '/events/:eventId/teams/:teamId/members/:memberUserId/remove',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId, memberUserId } = request.params as {
        eventId: string;
        teamId: string;
        memberUserId: string;
      };
      const result = await removeTeamMember(request.user!.id, teamId, memberUserId);
      return reply.status(200).send(result);
    }
  );

  server.delete(
    '/events/:eventId/teams/:teamId/members/:memberUserId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { teamId, memberUserId } = request.params as {
        eventId: string;
        teamId: string;
        memberUserId: string;
      };
      const result = await removeTeamMember(request.user!.id, teamId, memberUserId);
      return reply.status(200).send(result);
    }
  );

  // 10. List My Team Invitations (Student)
  server.get(
    '/me/team-invitations',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;

      // Auto-expire past-due pending invitations
      await db
        .update(teamInvitations)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(teamInvitations.status, 'PENDING'),
            sql`${teamInvitations.expiresAt} <= now()`
          )
        );

      const conditions = [
        eq(teamInvitations.status, 'PENDING'),
        or(
          eq(teamInvitations.invitedUserId, currentUser.id),
          currentUser.email ? sql`lower(${teamInvitations.invitedEmail}) = lower(${currentUser.email})` : sql`false`,
          currentUser.rollNumber ? eq(teamInvitations.invitedRollNumber, currentUser.rollNumber) : sql`false`
        )!,
      ];

      const invRows = await db
        .select({
          id: teamInvitations.id,
          teamId: teamInvitations.teamId,
          eventId: teamInvitations.eventId,
          status: teamInvitations.status,
          createdAt: teamInvitations.createdAt,
          expiresAt: teamInvitations.expiresAt,
          teamName: teams.name,
          teamCode: teams.inviteCode,
          eventTitle: events.title,
          inviterName: users.fullName,
          inviterEmail: users.email,
        })
        .from(teamInvitations)
        .innerJoin(teams, eq(teamInvitations.teamId, teams.id))
        .innerJoin(events, eq(teamInvitations.eventId, events.id))
        .innerJoin(users, eq(teamInvitations.invitedBy, users.id))
        .where(and(...conditions))
        .orderBy(desc(teamInvitations.createdAt));

      return reply.status(200).send({ invitations: invRows });
    }
  );

  // 11. Accept Team Invitation (Student consent)
  server.post(
    '/team-invitations/:id/accept',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const currentUser = request.user!;

      const [inv] = await db
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.id, id))
        .limit(1);

      if (!inv || inv.status !== 'PENDING') {
        throw new AppError('NOT_FOUND', 'Active invitation not found or already processed.', 404);
      }

      // Verify the invitation matches current user
      const isTarget =
        inv.invitedUserId === currentUser.id ||
        (inv.invitedEmail && inv.invitedEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
        (inv.invitedRollNumber && currentUser.rollNumber && inv.invitedRollNumber === currentUser.rollNumber);

      if (!isTarget) {
        throw new AppError('FORBIDDEN', 'This team invitation was sent to another student.', 403);
      }

      // Check if invitation has expired
      if (inv.expiresAt && new Date() > inv.expiresAt) {
        await db
          .update(teamInvitations)
          .set({ status: 'EXPIRED' })
          .where(eq(teamInvitations.id, id));
        throw new AppError('INVITATION_EXPIRED', 'This team invitation has expired.', 410);
      }

      // Check late joining on event
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, inv.eventId))
        .limit(1);

      if (event && !event.allowLateJoining && new Date() > event.registrationClosesAt) {
        throw new AppError(
          'LATE_JOINING_DISALLOWED',
          'Late joining is disabled for this event as registration has closed.',
          409
        );
      }

      // Get team inviteCode
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, inv.teamId))
        .limit(1);

      if (!team) {
        throw new AppError('NOT_FOUND', 'Inviting team no longer exists.', 404);
      }

      // Join team via robust joinTeamByCode
      const answers = (request.body as any)?.answers;
      const joinResult = await joinTeamByCode(currentUser.id, team.inviteCode, answers);

      // Mark invitation accepted
      await db
        .update(teamInvitations)
        .set({
          status: 'ACCEPTED',
          invitedUserId: currentUser.id,
          respondedAt: new Date(),
        })
        .where(eq(teamInvitations.id, id));

      await notifyInApp(db, {
        userId: team.leaderId,
        eventId: team.eventId,
        kind: 'ORGANIZER_ALERT' as any,
        title: 'Team Member Joined',
        message: `${currentUser.fullName} accepted your invitation and joined team "${team.name}"!`,
        metadata: { teamId: team.id, memberId: currentUser.id },
      });

      return reply.status(200).send({
        ...joinResult,
        message: `Successfully joined ${team.name}!`,
      });
    }
  );

  // 12. Reject Team Invitation
  server.post(
    '/team-invitations/:id/reject',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const currentUser = request.user!;

      const [inv] = await db
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.id, id))
        .limit(1);

      if (!inv || inv.status !== 'PENDING') {
        throw new AppError('NOT_FOUND', 'Active invitation not found or already processed.', 404);
      }

      const isTarget =
        inv.invitedUserId === currentUser.id ||
        (inv.invitedEmail && inv.invitedEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
        (inv.invitedRollNumber && currentUser.rollNumber && inv.invitedRollNumber === currentUser.rollNumber);

      if (!isTarget) {
        throw new AppError('FORBIDDEN', 'This team invitation was sent to another student.', 403);
      }

      await db
        .update(teamInvitations)
        .set({
          status: 'REJECTED',
          invitedUserId: currentUser.id,
          respondedAt: new Date(),
        })
        .where(eq(teamInvitations.id, id));

      const [teamRow] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, inv.teamId))
        .limit(1);

      if (teamRow) {
        await notifyInApp(db, {
          userId: teamRow.leaderId,
          eventId: teamRow.eventId,
          kind: 'ORGANIZER_ALERT' as any,
          title: 'Invitation Declined',
          message: `${currentUser.fullName} declined your invitation to join team "${teamRow.name}".`,
          metadata: { teamId: teamRow.id, memberId: currentUser.id },
        });
      }

      return reply.status(200).send({
        success: true,
        message: 'Team invitation declined.',
      });
    }
  );
}
