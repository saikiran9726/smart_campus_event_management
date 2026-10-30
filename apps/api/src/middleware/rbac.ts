import { and, eq } from 'drizzle-orm';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ClubMemberRole, UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { clubMembers, events, User } from '../db/schema';
import { AppError } from '../lib/app-error';
import { authenticateRequest } from '../plugins/auth';

/**
 * Asserts that a user is not currently in an active penalty cooldown period.
 * Throws COOLDOWN_ACTIVE (HTTP 403) if active.
 */
export function assertNotInCooldown(user: User): void {
  if (user.cooldownUntil) {
    const cooldownEnd = new Date(user.cooldownUntil).getTime();
    const now = Date.now();
    if (cooldownEnd > now) {
      throw new AppError(
        'COOLDOWN_ACTIVE',
        `Your account is under cooldown penalty until ${new Date(user.cooldownUntil).toISOString()} due to excessive strikes/no-shows.`,
        403,
        {
          cooldownUntil: new Date(user.cooldownUntil).toISOString(),
          strikeCount: user.strikeCount,
          consecutiveNoShows: user.consecutiveNoShows,
        }
      );
    }
  }
}

/**
 * Fastify preHandler factory to enforce user-level system roles.
 */
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      await authenticateRequest(request);
    }

    if (!request.user) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Authentication required to perform this action.',
        401
      );
    }

    if (!roles.includes(request.user.role)) {
      throw new AppError(
        'FORBIDDEN',
        `User role '${request.user.role}' is not authorized to access this resource. Required: ${roles.join(', ')}.`,
        403,
        {
          requiredRoles: roles,
          currentRole: request.user.role,
        }
      );
    }
  };
}

/**
 * Fastify preHandler factory to enforce club-level roles (e.g., OWNER, ADMIN).
 * System ADMIN users bypass this check.
 */
export function requireClubRole(
  clubIdParam: string,
  ...clubRoles: ClubMemberRole[]
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      await authenticateRequest(request);
    }

    if (!request.user) {
      throw new AppError('UNAUTHENTICATED', 'Authentication required.', 401);
    }

    // System ADMIN has global override access
    if (request.user.role === UserRole.ADMIN) {
      return;
    }

    const params = request.params as Record<string, string | undefined>;
    const body = request.body as Record<string, string | undefined> | undefined;
    const clubId = params[clubIdParam] || body?.[clubIdParam];

    if (!clubId) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Missing required club parameter '${clubIdParam}'`,
        400
      );
    }

    const [membership] = await db
      .select()
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, clubId),
          eq(clubMembers.userId, request.user.id)
        )
      )
      .limit(1);

    if (!membership || !clubRoles.includes(membership.role)) {
      throw new AppError(
        'FORBIDDEN',
        `Insufficient club permissions. Required role: ${clubRoles.join(', ')}.`,
        403,
        {
          clubId,
          requiredRoles: clubRoles,
          currentRole: membership?.role ?? 'NON_MEMBER',
        }
      );
    }
  };
}

/**
 * Fastify preHandler factory ensuring the user is an organizer of the event's club
 * (OWNER or ADMIN of the club hosting the event) or a system ADMIN.
 */
export function requireEventOrganizer(eventIdParam: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      await authenticateRequest(request);
    }

    if (!request.user) {
      throw new AppError('UNAUTHENTICATED', 'Authentication required.', 401);
    }

    if (request.user.role === UserRole.ADMIN) {
      return;
    }

    const params = request.params as Record<string, string | undefined>;
    const body = request.body as Record<string, string | undefined> | undefined;
    const eventId = params[eventIdParam] || body?.[eventIdParam];

    if (!eventId) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Missing required event parameter '${eventIdParam}'`,
        400
      );
    }

    const [event] = await db
      .select({ clubId: events.clubId })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
    }

    const [membership] = await db
      .select({ role: clubMembers.role })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, event.clubId),
          eq(clubMembers.userId, request.user.id)
        )
      )
      .limit(1);

    const isOrganizer =
      membership &&
      (membership.role === ClubMemberRole.OWNER ||
        membership.role === ClubMemberRole.ADMIN);

    if (!isOrganizer) {
      throw new AppError(
        'FORBIDDEN',
        'Only club organizers (Owner or Admin) or System Administrators may manage this event.',
        403,
        { eventId, clubId: event.clubId }
      );
    }
  };
}

/**
 * Fastify preHandler to enforce that the user is Faculty or System Admin.
 */
export async function requireFaculty(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    await authenticateRequest(request);
  }

  if (!request.user) {
    throw new AppError('UNAUTHENTICATED', 'Authentication required.', 401);
  }

  if (
    request.user.role !== UserRole.FACULTY &&
    request.user.role !== UserRole.ADMIN
  ) {
    throw new AppError(
      'FORBIDDEN',
      'Faculty advisor or System Administrator authorization required.',
      403,
      { currentRole: request.user.role }
    );
  }
}
