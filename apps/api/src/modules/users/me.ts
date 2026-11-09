import { and, count, eq, gt, ne } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EventStatus, PHONE_REGEX } from '@eventora/shared';
import { db } from '../../db/client';
import { clubMembers, clubs, events, eventVolunteers, users, volunteerInvitations } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';

export function computeProfileCompleteness(user: {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  rollNumber?: string | null;
  collegeName?: string | null;
  department?: string | null;
  year?: number | null;
  program?: string | null;
}) {
  const missingFields: string[] = [];
  if (!user.fullName?.trim()) missingFields.push('fullName');
  if (!user.email?.trim()) missingFields.push('email');
  if (!user.phone?.trim()) missingFields.push('phone');
  if (!user.rollNumber?.trim()) missingFields.push('rollNumber');
  if (!user.collegeName?.trim()) missingFields.push('collegeName');
  if (!user.department?.trim()) missingFields.push('department');
  if (!user.year) missingFields.push('year');
  if (!user.program?.trim()) missingFields.push('program');

  return {
    profileComplete: missingFields.length === 0,
    missingFields,
  };
}

// Free-text profile fields: blank is ignored by the handler, but a non-blank value
// must be meaningful (rejects accidental one-character entries such as "b").
const profileText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .refine((v) => v == null || v.trim() === '' || v.trim().length >= 2, {
      message: 'Must be at least 2 characters',
    });

const updateMeSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100).optional(),
  rollNumber: z.string().min(1).max(50).nullable().optional(),
  roll_number: z.string().min(1).max(50).nullable().optional(),
  collegeName: profileText(150),
  college_name: profileText(150),
  department: profileText(100),
  year: z.number().int().min(1).max(6).nullable().optional(),
  yearOfStudy: z.number().int().min(1).max(6).nullable().optional(),
  program: profileText(100),
  course: profileText(100),
  phone: z.string().max(25).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export async function meRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;

      const memberships = await db
        .select({
          clubId: clubMembers.clubId,
          role: clubMembers.role,
          clubName: clubs.name,
        })
        .from(clubMembers)
        .innerJoin(clubs, eq(clubMembers.clubId, clubs.id))
        .where(eq(clubMembers.userId, currentUser.id));

      const completeness = computeProfileCompleteness(currentUser);

      const now = new Date();

      // Query active volunteer assignments count (excludes revoked assignments, cancelled events, and ended events)
      const [activeAssignmentsResult] = await db
        .select({ total: count() })
        .from(eventVolunteers)
        .innerJoin(events, eq(eventVolunteers.eventId, events.id))
        .where(
          and(
            eq(eventVolunteers.userId, currentUser.id),
            eq(eventVolunteers.status, 'ACTIVE'),
            ne(events.status, EventStatus.CANCELLED),
            gt(events.endAt, now)
          )
        );

      const activeCount = Number(activeAssignmentsResult?.total || 0);
      const isVolunteer = activeCount > 0;

      // Query pending unexpired invitations for user's email (excludes expired invites, cancelled events, and ended events)
      const [pendingInvitesResult] = await db
        .select({ total: count() })
        .from(volunteerInvitations)
        .innerJoin(events, eq(volunteerInvitations.eventId, events.id))
        .where(
          and(
            eq(volunteerInvitations.email, currentUser.email.toLowerCase()),
            eq(volunteerInvitations.status, 'PENDING'),
            gt(volunteerInvitations.expiresAt, now),
            ne(events.status, EventStatus.CANCELLED),
            gt(events.endAt, now)
          )
        );

      const hasPendingInvite = Number(pendingInvitesResult?.total || 0) > 0;

      return reply.status(200).send({
        user: {
          id: currentUser.id,
          clerkId: currentUser.clerkId,
          email: currentUser.email,
          name: currentUser.fullName,
          fullName: currentUser.fullName,
          avatarUrl: currentUser.avatarUrl,
          phone: currentUser.phone,
          rollNumber: currentUser.rollNumber,
          collegeName: currentUser.collegeName,
          department: currentUser.department,
          year: currentUser.year,
          yearOfStudy: currentUser.year,
          program: currentUser.program,
          course: currentUser.program,
          role: currentUser.role,
          strikesCount: currentUser.strikeCount,
          strikeCount: currentUser.strikeCount,
          consecutiveNoShows: currentUser.consecutiveNoShows,
          cooldownUntil: currentUser.cooldownUntil?.toISOString() ?? null,
          profileComplete: completeness.profileComplete,
          missingFields: completeness.missingFields,
          clubs: memberships,
          volunteer: {
            isVolunteer,
            hasPendingInvite,
            activeCount,
          },
          createdAt: currentUser.createdAt.toISOString(),
          updatedAt: currentUser.updatedAt.toISOString(),
        },
      });
    }
  );

  server.patch(
    '/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;
      const parseResult = updateMeSchema.safeParse(request.body);

      if (!parseResult.success) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Invalid user profile update data',
          400,
          parseResult.error.format()
        );
      }

      const body = parseResult.data;
      const effectiveRollNumber =
        body.rollNumber !== undefined ? body.rollNumber : body.roll_number;
      const effectiveFullName = body.fullName || body.name;
      const effectiveYear = body.year !== undefined ? body.year : body.yearOfStudy;
      const effectiveCollege =
        body.collegeName !== undefined ? body.collegeName : body.college_name;
      const effectiveProgram =
        body.program !== undefined ? body.program : body.course;

      if (effectiveRollNumber && effectiveRollNumber.trim()) {
        const [conflict] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.rollNumber, effectiveRollNumber.trim()),
              ne(users.id, currentUser.id)
            )
          )
          .limit(1);

        if (conflict) {
          throw new AppError(
            'CONFLICT',
            `Roll number '${effectiveRollNumber.trim()}' is already registered to another user.`,
            409,
            { rollNumber: effectiveRollNumber.trim() }
          );
        }
      }

      if (body.phone && body.phone.trim()) {
        if (!PHONE_REGEX.test(body.phone.trim())) {
          throw new AppError(
            'VALIDATION_FAILED',
            'Invalid phone number format. Must contain 7 to 25 valid phone characters.',
            400,
            { phone: body.phone }
          );
        }
      }

      const updatePayload: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // Safeguard: do not overwrite valid existing data with empty strings
      if (effectiveFullName !== undefined && effectiveFullName.trim()) {
        updatePayload.fullName = effectiveFullName.trim();
      }
      if (effectiveRollNumber !== undefined && effectiveRollNumber !== null && effectiveRollNumber.trim()) {
        updatePayload.rollNumber = effectiveRollNumber.trim();
      }
      if (effectiveCollege !== undefined && effectiveCollege !== null && effectiveCollege.trim()) {
        updatePayload.collegeName = effectiveCollege.trim();
      }
      if (body.department !== undefined && body.department !== null && body.department.trim()) {
        updatePayload.department = body.department.trim();
      }
      if (effectiveProgram !== undefined && effectiveProgram !== null && effectiveProgram.trim()) {
        updatePayload.program = effectiveProgram.trim();
      }
      if (effectiveYear !== undefined && effectiveYear !== null) {
        updatePayload.year = effectiveYear;
      }
      if (body.phone !== undefined && body.phone !== null && body.phone.trim()) {
        updatePayload.phone = body.phone.trim();
      }
      if (body.avatarUrl !== undefined) {
        updatePayload.avatarUrl = body.avatarUrl;
      }

      const [updatedUser] = await db
        .update(users)
        .set(updatePayload)
        .where(eq(users.id, currentUser.id))
        .returning();

      if (!updatedUser) {
        throw new AppError('NOT_FOUND', 'User profile not found', 404);
      }

      request.user = updatedUser;
      const completeness = computeProfileCompleteness(updatedUser);

      return reply.status(200).send({
        user: {
          id: updatedUser.id,
          clerkId: updatedUser.clerkId,
          email: updatedUser.email,
          name: updatedUser.fullName,
          fullName: updatedUser.fullName,
          avatarUrl: updatedUser.avatarUrl,
          phone: updatedUser.phone,
          rollNumber: updatedUser.rollNumber,
          collegeName: updatedUser.collegeName,
          department: updatedUser.department,
          year: updatedUser.year,
          yearOfStudy: updatedUser.year,
          program: updatedUser.program,
          course: updatedUser.program,
          role: updatedUser.role,
          strikesCount: updatedUser.strikeCount,
          strikeCount: updatedUser.strikeCount,
          consecutiveNoShows: updatedUser.consecutiveNoShows,
          cooldownUntil: updatedUser.cooldownUntil?.toISOString() ?? null,
          profileComplete: completeness.profileComplete,
          missingFields: completeness.missingFields,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      });
    }
  );
}
