import crypto from 'node:crypto';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { TicketStatus, UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import {
  events,
  eventVolunteers,
  scannerPasskeys,
  scannerSessions,
  scanLogs,
  tickets,
  users,
  venues,
  volunteerInvitations,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { requireRole } from '../../middleware/rbac';
import { authenticateRequest, requireAuth } from '../../plugins/auth';

const volunteerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  eventId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'REVOKED', 'ALL']).default('ALL'),
});

const createVolunteerBodySchema = z.object({
  eventId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().trim().min(2),
  rollNumber: z.string().trim().optional(),
  gate: z.string().trim().min(1).default('Main Gate'),
  role: z.string().trim().min(1).default('SCANNER'),
  notes: z.string().trim().optional(),
});

const updateVolunteerBodySchema = z.object({
  gate: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  status: z.enum(['ACTIVE', 'REVOKED']).optional(),
  notes: z.string().trim().optional(),
});

const activateVolunteerBodySchema = z.object({
  token: z.string().trim().min(8),
  fullName: z.string().trim().optional(),
  rollNumber: z.string().trim().optional(),
});

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(env.MAGIC_LINK_SECRET);
}

export async function volunteerRoutes(server: FastifyInstance): Promise<void> {
  // 1. GET /admin/volunteers — List & search volunteers across events
  server.get(
    '/admin/volunteers',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN, UserRole.ORGANIZER)],
      schema: { querystring: volunteerListQuerySchema },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { page, limit, q, eventId, status } =
        request.query as z.infer<typeof volunteerListQuerySchema>;
      const offset = (page - 1) * limit;

      const conditions = [];

      if (eventId) {
        conditions.push(eq(eventVolunteers.eventId, eventId));
      }
      if (status && status !== 'ALL') {
        conditions.push(eq(eventVolunteers.status, status as any));
      }
      if (q && q.length > 0) {
        const pattern = `%${q}%`;
        conditions.push(
          or(
            ilike(users.fullName, pattern),
            ilike(users.email, pattern),
            ilike(users.rollNumber, pattern),
            ilike(eventVolunteers.gate, pattern)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalCountResult] = await db
        .select({ total: count() })
        .from(eventVolunteers)
        .innerJoin(users, eq(eventVolunteers.userId, users.id))
        .where(whereClause);

      const total = Number(totalCountResult?.total || 0);

      const rows = await db
        .select({
          id: eventVolunteers.id,
          eventId: eventVolunteers.eventId,
          eventTitle: events.title,
          eventSlug: events.slug,
          userId: eventVolunteers.userId,
          fullName: users.fullName,
          email: users.email,
          rollNumber: users.rollNumber,
          department: users.department,
          gate: eventVolunteers.gate,
          role: eventVolunteers.role,
          status: eventVolunteers.status,
          notes: eventVolunteers.notes,
          createdAt: eventVolunteers.createdAt,
          updatedAt: eventVolunteers.updatedAt,
        })
        .from(eventVolunteers)
        .innerJoin(users, eq(eventVolunteers.userId, users.id))
        .innerJoin(events, eq(eventVolunteers.eventId, events.id))
        .where(whereClause)
        .orderBy(desc(eventVolunteers.createdAt))
        .limit(limit)
        .offset(offset);

      // Join scan counts per volunteer
      const volunteerUserIds = [...new Set(rows.map((r) => r.userId))];
      const scanCountsMap = new Map<string, number>();

      if (volunteerUserIds.length > 0) {
        const scanCounts = await db
          .select({
            scannerUserId: scanLogs.scannerUserId,
            totalScans: count(),
          })
          .from(scanLogs)
          .where(
            and(
              sql`${scanLogs.scannerUserId} IS NOT NULL`,
              sql`${scanLogs.scannerUserId} IN ${volunteerUserIds}`
            )
          )
          .groupBy(scanLogs.scannerUserId);

        for (const sc of scanCounts) {
          if (sc.scannerUserId) {
            scanCountsMap.set(sc.scannerUserId, Number(sc.totalScans));
          }
        }
      }

      const items = rows.map((r) => ({
        ...r,
        totalScans: scanCountsMap.get(r.userId) || 0,
      }));

      return reply.status(200).send({
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }
  );

  // 2. POST /admin/volunteers — Assign or invite a volunteer
  server.post(
    '/admin/volunteers',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN, UserRole.ORGANIZER)],
      schema: { body: createVolunteerBodySchema },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as z.infer<typeof createVolunteerBodySchema>;
      const currentUser = request.user!;

      // 1. Verify target event
      const [targetEvent] = await db
        .select({ id: events.id, title: events.title })
        .from(events)
        .where(eq(events.id, body.eventId))
        .limit(1);

      if (!targetEvent) {
        throw new AppError('NOT_FOUND', `Event '${body.eventId}' was not found.`, 404);
      }

      // 2. Check if user already exists
      let [existingUser] = await db
        .select()
        .from(users)
        .where(
          or(
            eq(users.email, body.email.toLowerCase()),
            body.rollNumber ? eq(users.rollNumber, body.rollNumber) : sql`false`
          )
        )
        .limit(1);

      if (!existingUser) {
        // Create user placeholder for volunteer
        const [newUser] = await db
          .insert(users)
          .values({
            email: body.email.toLowerCase(),
            fullName: body.fullName,
            rollNumber: body.rollNumber || null,
            clerkId: `volunteer_${crypto.randomUUID()}`,
            role: UserRole.STUDENT,
          })
          .returning();
        existingUser = newUser;
      }

      // 3. Upsert event_volunteers record
      const [existingAssignment] = await db
        .select()
        .from(eventVolunteers)
        .where(
          and(
            eq(eventVolunteers.eventId, body.eventId),
            eq(eventVolunteers.userId, existingUser!.id)
          )
        )
        .limit(1);

      let volunteerRecord;
      if (existingAssignment) {
        const [updated] = await db
          .update(eventVolunteers)
          .set({
            gate: body.gate,
            role: body.role,
            status: 'ACTIVE',
            notes: body.notes ?? existingAssignment.notes,
            assignedBy: currentUser.id,
            updatedAt: new Date(),
          })
          .where(eq(eventVolunteers.id, existingAssignment.id))
          .returning();
        volunteerRecord = updated;
      } else {
        const [inserted] = await db
          .insert(eventVolunteers)
          .values({
            eventId: body.eventId,
            userId: existingUser!.id,
            gate: body.gate,
            role: body.role,
            status: 'ACTIVE',
            notes: body.notes || null,
            assignedBy: currentUser.id,
          })
          .returning();
        volunteerRecord = inserted;
      }

      // 4. Generate local activation token for fast/offline setup
      const token = `VOL-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invitation] = await db
        .insert(volunteerInvitations)
        .values({
          email: body.email.toLowerCase(),
          fullName: body.fullName,
          eventId: body.eventId,
          gate: body.gate,
          role: body.role,
          invitedBy: currentUser.id,
          token,
          status: 'PENDING',
          expiresAt,
        })
        .returning();

      return reply.status(201).send({
        success: true,
        volunteer: volunteerRecord,
        user: {
          id: existingUser!.id,
          fullName: existingUser!.fullName,
          email: existingUser!.email,
          rollNumber: existingUser!.rollNumber,
        },
        invitationToken: token,
        invitationId: invitation!.id,
      });
    }
  );

  // 3. PATCH /admin/volunteers/:id — Reassign or update volunteer status
  server.patch(
    '/admin/volunteers/:id',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN, UserRole.ORGANIZER)],
      schema: { body: updateVolunteerBodySchema },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof updateVolunteerBodySchema>;

      const [existing] = await db
        .select()
        .from(eventVolunteers)
        .where(eq(eventVolunteers.id, id))
        .limit(1);

      if (!existing) {
        throw new AppError('NOT_FOUND', `Volunteer assignment '${id}' was not found.`, 404);
      }

      const updates: Partial<typeof eventVolunteers.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.gate !== undefined) updates.gate = body.gate;
      if (body.role !== undefined) updates.role = body.role;
      if (body.status !== undefined) updates.status = body.status as any;
      if (body.notes !== undefined) updates.notes = body.notes;

      const [updated] = await db
        .update(eventVolunteers)
        .set(updates)
        .where(eq(eventVolunteers.id, id))
        .returning();

      return reply.status(200).send({
        success: true,
        volunteer: updated,
      });
    }
  );

  // 4. DELETE /admin/volunteers/:id — Revoke volunteer assignment
  server.delete(
    '/admin/volunteers/:id',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN, UserRole.ORGANIZER)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [existing] = await db
        .select()
        .from(eventVolunteers)
        .where(eq(eventVolunteers.id, id))
        .limit(1);

      if (!existing) {
        throw new AppError('NOT_FOUND', `Volunteer assignment '${id}' was not found.`, 404);
      }

      const [revoked] = await db
        .update(eventVolunteers)
        .set({
          status: 'REVOKED',
          updatedAt: new Date(),
        })
        .where(eq(eventVolunteers.id, id))
        .returning();

      return reply.status(200).send({
        success: true,
        message: 'Volunteer assignment revoked.',
        volunteer: revoked,
      });
    }
  );

  // 5. POST /volunteers/activate — Local activation of volunteer invitation token
  server.post(
    '/volunteers/activate',
    {
      schema: { body: activateVolunteerBodySchema },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token, fullName, rollNumber } =
        request.body as z.infer<typeof activateVolunteerBodySchema>;

      const [invitation] = await db
        .select()
        .from(volunteerInvitations)
        .where(
          and(
            eq(volunteerInvitations.token, token.trim()),
            eq(volunteerInvitations.status, 'PENDING')
          )
        )
        .limit(1);

      if (!invitation) {
        throw new AppError('NOT_FOUND', 'Invalid or already activated invitation token.', 404);
      }

      if (new Date() > invitation.expiresAt) {
        await db
          .update(volunteerInvitations)
          .set({ status: 'EXPIRED' })
          .where(eq(volunteerInvitations.id, invitation.id));
        throw new AppError('OFFER_EXPIRED', 'This volunteer invitation token has expired.', 410);
      }

      // Check current authed user or resolve by email
      const currentUser = await authenticateRequest(request);
      let userId: string;

      if (currentUser) {
        if (currentUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
          throw new AppError(
            'FORBIDDEN',
            'This invitation was issued to a different email address.',
            403
          );
        }
        userId = currentUser.id;
      } else {
        let [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, invitation.email.toLowerCase()))
          .limit(1);

        if (!existingUser) {
          const [newUser] = await db
            .insert(users)
            .values({
              email: invitation.email.toLowerCase(),
              fullName: fullName || invitation.fullName,
              rollNumber: rollNumber || null,
              clerkId: `volunteer_${crypto.randomUUID()}`,
              role: UserRole.STUDENT,
            })
            .returning();
          existingUser = newUser;
        }
        userId = existingUser!.id;
      }

      // Activate or create eventVolunteers record
      const [existingVol] = await db
        .select()
        .from(eventVolunteers)
        .where(
          and(
            eq(eventVolunteers.eventId, invitation.eventId),
            eq(eventVolunteers.userId, userId)
          )
        )
        .limit(1);

      let volunteerRecord;
      if (existingVol) {
        const [updated] = await db
          .update(eventVolunteers)
          .set({
            status: 'ACTIVE',
            gate: invitation.gate,
            role: invitation.role,
            updatedAt: new Date(),
          })
          .where(eq(eventVolunteers.id, existingVol.id))
          .returning();
        volunteerRecord = updated;
      } else {
        const [inserted] = await db
          .insert(eventVolunteers)
          .values({
            eventId: invitation.eventId,
            userId,
            gate: invitation.gate,
            role: invitation.role,
            status: 'ACTIVE',
            assignedBy: invitation.invitedBy,
          })
          .returning();
        volunteerRecord = inserted;
      }

      // Mark invitation accepted
      await db
        .update(volunteerInvitations)
        .set({ status: 'ACCEPTED', updatedAt: new Date() })
        .where(eq(volunteerInvitations.id, invitation.id));

      const [targetEvent] = await db
        .select({
          id: events.id,
          title: events.title,
          slug: events.slug,
          startDate: events.startAt,
          endDate: events.endAt,
        })
        .from(events)
        .where(eq(events.id, invitation.eventId))
        .limit(1);

      return reply.status(200).send({
        success: true,
        message: 'Volunteer access activated successfully.',
        volunteer: volunteerRecord,
        event: targetEvent,
      });
    }
  );

  // 6. GET /me/volunteer-assignments — Authenticated user's volunteer assignments
  server.get(
    '/me/volunteer-assignments',
    {
      preHandler: [requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;

      const assignments = await db
        .select({
          id: eventVolunteers.id,
          eventId: eventVolunteers.eventId,
          eventTitle: events.title,
          eventSlug: events.slug,
          eventStatus: events.status,
          startDate: events.startAt,
          endDate: events.endAt,
          capacity: events.capacity,
          remainingCapacity: events.remainingCapacity,
          venueName: venues.name,
          gate: eventVolunteers.gate,
          role: eventVolunteers.role,
          notes: eventVolunteers.notes,
          status: eventVolunteers.status,
          createdAt: eventVolunteers.createdAt,
        })
        .from(eventVolunteers)
        .innerJoin(events, eq(eventVolunteers.eventId, events.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(
          and(
            eq(eventVolunteers.userId, user.id),
            eq(eventVolunteers.status, 'ACTIVE')
          )
        )
        .orderBy(desc(events.startAt));

      // Calculate check-in progress and personal scan count for each assigned event
      const enriched = await Promise.all(
        assignments.map(async (asgn) => {
          const [checkInCountResult] = await db
            .select({ total: count() })
            .from(tickets)
            .where(
              and(
                eq(tickets.eventId, asgn.eventId),
                eq(tickets.status, TicketStatus.CHECKED_IN)
              )
            );

          const [myScansResult] = await db
            .select({ total: count() })
            .from(scanLogs)
            .where(
              and(
                eq(scanLogs.eventId, asgn.eventId),
                eq(scanLogs.scannerUserId, user.id)
              )
            );

          return {
            ...asgn,
            checkedInCount: Number(checkInCountResult?.total || 0),
            myScanCount: Number(myScansResult?.total || 0),
          };
        })
      );

      return reply.status(200).send({
        assignments: enriched,
      });
    }
  );

  // 7. POST /me/volunteer-assignments/:id/scanner-session — Launch scanner session for assigned volunteer
  server.post(
    '/me/volunteer-assignments/:id/scanner-session',
    {
      preHandler: [requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const [assignment] = await db
        .select({
          id: eventVolunteers.id,
          eventId: eventVolunteers.eventId,
          gate: eventVolunteers.gate,
          role: eventVolunteers.role,
          status: eventVolunteers.status,
          eventTitle: events.title,
        })
        .from(eventVolunteers)
        .innerJoin(events, eq(eventVolunteers.eventId, events.id))
        .where(
          and(
            eq(eventVolunteers.id, id),
            eq(eventVolunteers.userId, user.id),
            eq(eventVolunteers.status, 'ACTIVE')
          )
        )
        .limit(1);

      if (!assignment) {
        throw new AppError(
          'FORBIDDEN',
          'Active volunteer assignment not found for this event.',
          403
        );
      }

      // Create an internal scanner passkey + session for the volunteer
      const passkeyLabel = `${assignment.gate} (${assignment.role} - ${user.fullName})`;
      const passkeyHash = crypto
        .createHash('sha256')
        .update(`VOL_SESSION_${assignment.id}_${Date.now()}`)
        .digest('hex');

      const [passkey] = await db
        .insert(scannerPasskeys)
        .values({
          eventId: assignment.eventId,
          passkeyHash,
          label: passkeyLabel,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
          createdBy: user.id,
        })
        .returning();

      const [session] = await db
        .insert(scannerSessions)
        .values({
          passkeyId: passkey!.id,
          userId: user.id,
          volunteerName: user.fullName,
        })
        .returning();

      // Sign scoped JWT scanner token (valid 12h)
      const token = await new SignJWT({
        sessionId: session!.id,
        passkeyId: passkey!.id,
        userId: user.id,
        eventId: assignment.eventId,
        volunteerName: user.fullName,
        passkeyLabel,
        kind: 'scanner',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('12h')
        .sign(getJwtSecret());

      return reply.status(200).send({
        token,
        sessionId: session!.id,
        eventId: assignment.eventId,
        eventTitle: assignment.eventTitle,
        volunteerName: user.fullName,
        gate: assignment.gate,
        role: assignment.role,
      });
    }
  );

  // 8. GET /admin/volunteers/activity — Audit log of gate scan events
  server.get(
    '/admin/volunteers/activity',
    {
      preHandler: [requireAuth, requireRole(UserRole.ADMIN, UserRole.ORGANIZER)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const page = Math.max(1, parseInt(query?.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query?.limit || '50', 10)));
      const offset = (page - 1) * limit;

      const conditions = [];
      if (query?.eventId) {
        conditions.push(eq(scanLogs.eventId, query.eventId));
      }
      if (query?.result) {
        conditions.push(eq(scanLogs.result, query.result));
      }
      if (query?.mode) {
        conditions.push(eq(scanLogs.mode, query.mode));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalCountResult] = await db
        .select({ total: count() })
        .from(scanLogs)
        .where(whereClause);

      const total = Number(totalCountResult?.total || 0);

      const logs = await db
        .select({
          id: scanLogs.id,
          eventId: scanLogs.eventId,
          eventTitle: events.title,
          mode: scanLogs.mode,
          result: scanLogs.result,
          scannedAt: scanLogs.scannedAt,
          scannerUserId: scanLogs.scannerUserId,
          scannerName: users.fullName,
          scannerEmail: users.email,
          passkeyLabel: scannerPasskeys.label,
          ticketId: scanLogs.ticketId,
        })
        .from(scanLogs)
        .innerJoin(events, eq(scanLogs.eventId, events.id))
        .leftJoin(users, eq(scanLogs.scannerUserId, users.id))
        .leftJoin(scannerPasskeys, eq(scanLogs.passkeyId, scannerPasskeys.id))
        .where(whereClause)
        .orderBy(desc(scanLogs.scannedAt))
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
