import { and, eq, ne } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client';
import { clubMembers, clubs, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../plugins/auth';

const updateMeSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100).optional(),
  rollNumber: z.string().min(1).max(50).nullable().optional(),
  roll_number: z.string().min(1).max(50).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  year: z.number().int().min(1).max(6).nullable().optional(),
  yearOfStudy: z.number().int().min(1).max(6).nullable().optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
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
          department: currentUser.department,
          year: currentUser.year,
          yearOfStudy: currentUser.year,
          role: currentUser.role,
          strikesCount: currentUser.strikeCount,
          strikeCount: currentUser.strikeCount,
          consecutiveNoShows: currentUser.consecutiveNoShows,
          cooldownUntil: currentUser.cooldownUntil?.toISOString() ?? null,
          clubs: memberships,
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
      const effectiveRollNumber = body.rollNumber !== undefined ? body.rollNumber : body.roll_number;
      const effectiveFullName = body.fullName || body.name;
      const effectiveYear = body.year !== undefined ? body.year : body.yearOfStudy;

      if (effectiveRollNumber) {
        const [conflict] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.rollNumber, effectiveRollNumber),
              ne(users.id, currentUser.id)
            )
          )
          .limit(1);

        if (conflict) {
          throw new AppError(
            'CONFLICT',
            `Roll number '${effectiveRollNumber}' is already registered to another user.`,
            409,
            { rollNumber: effectiveRollNumber }
          );
        }
      }

      const updatePayload: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (effectiveFullName !== undefined) updatePayload.fullName = effectiveFullName;
      if (effectiveRollNumber !== undefined) updatePayload.rollNumber = effectiveRollNumber;
      if (body.department !== undefined) updatePayload.department = body.department;
      if (effectiveYear !== undefined) updatePayload.year = effectiveYear;
      if (body.phone !== undefined) updatePayload.phone = body.phone;
      if (body.avatarUrl !== undefined) updatePayload.avatarUrl = body.avatarUrl;

      const [updatedUser] = await db
        .update(users)
        .set(updatePayload)
        .where(eq(users.id, currentUser.id))
        .returning();

      if (!updatedUser) {
        throw new AppError('NOT_FOUND', 'User profile not found', 404);
      }

      request.user = updatedUser;

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
          department: updatedUser.department,
          year: updatedUser.year,
          yearOfStudy: updatedUser.year,
          role: updatedUser.role,
          strikesCount: updatedUser.strikeCount,
          strikeCount: updatedUser.strikeCount,
          consecutiveNoShows: updatedUser.consecutiveNoShows,
          cooldownUntil: updatedUser.cooldownUntil?.toISOString() ?? null,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      });
    }
  );
}
