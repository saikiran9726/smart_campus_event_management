import { and, asc, eq } from 'drizzle-orm';
import {
  NotificationChannel,
  NotificationKind,
  RegistrationStatus,
  TeamStatus,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  events,
  registrations,
  teamMembers,
  teammatePool,
  teams,
  users,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { enqueue } from '../comms/queue';

export const ALLOWED_SKILLS = [
  'Frontend',
  'Backend',
  'ML',
  'Smart Contracts',
  'Design',
  'Mobile',
  'DevOps',
  'Data',
] as const;

export type AllowedSkill = (typeof ALLOWED_SKILLS)[number];

const ALLOWED_SKILLS_SET = new Set<string>(ALLOWED_SKILLS);

export interface JoinPoolInput {
  skills: string[];
  bio: string;
}

/**
 * Registers a solo participant in the event's teammate matchmaking pool.
 * Only allowed for registered solo participants who are NOT in a team.
 */
export async function joinTeammatePool(
  userId: string,
  eventId: string,
  input: JoinPoolInput
) {
  // 1. Validate skills against allowed set
  if (!Array.isArray(input.skills) || input.skills.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'At least one skill must be selected.', 400);
  }

  for (const s of input.skills) {
    if (!ALLOWED_SKILLS_SET.has(s)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Invalid skill '${s}'. Allowed skills are: ${ALLOWED_SKILLS.join(', ')}.`,
        400
      );
    }
  }

  // 2. Validate bio
  const bio = input.bio?.trim();
  if (!bio || bio.length > 500) {
    throw new AppError('VALIDATION_FAILED', 'Bio is required and must not exceed 500 characters.', 400);
  }

  // 3. User must have confirmed registration for this event
  const [reg] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.userId, userId),
        eq(registrations.status, RegistrationStatus.CONFIRMED)
      )
    )
    .limit(1);

  if (!reg) {
    throw new AppError('FORBIDDEN', 'Must have a confirmed registration to join the teammate pool.', 403);
  }

  // 4. User must NOT be in any team for this event
  const [inTeam] = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (inTeam) {
    throw new AppError('CONFLICT', 'Participants already in a team cannot join the teammate pool.', 409);
  }

  // 5. Upsert teammate pool entry
  const [entry] = await db
    .insert(teammatePool)
    .values({
      eventId,
      userId,
      skills: input.skills,
      bio,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [teammatePool.eventId, teammatePool.userId],
      set: {
        skills: input.skills,
        bio,
        createdAt: new Date(),
      },
    })
    .returning();

  return entry;
}

/**
 * Removes a participant from the teammate pool.
 */
export async function leaveTeammatePool(userId: string, eventId: string) {
  await db
    .delete(teammatePool)
    .where(and(eq(teammatePool.eventId, eventId), eq(teammatePool.userId, userId)));

  return { success: true };
}

/**
 * Lists participants in the teammate pool for team leaders and participants.
 * Shows name, skills, bio only (and userId for inviting).
 */
export async function listTeammatePool(eventId: string) {
  const entries = await db
    .select({
      userId: teammatePool.userId,
      name: users.fullName,
      skills: teammatePool.skills,
      bio: teammatePool.bio,
      createdAt: teammatePool.createdAt,
    })
    .from(teammatePool)
    .innerJoin(users, eq(teammatePool.userId, users.id))
    .where(eq(teammatePool.eventId, eventId))
    .orderBy(asc(teammatePool.createdAt));

  return entries;
}

/**
 * Invites a user from the teammate pool to join a team.
 * Sends an email notification with invite code and deep link.
 */
export async function inviteFromPool(
  leaderUserId: string,
  teamId: string,
  targetUserId: string
) {
  return await db.transaction(async (tx) => {
    // 1. Load team
    const [team] = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new AppError('NOT_FOUND', 'Team not found.', 404);
    }

    if (team.leaderId !== leaderUserId) {
      throw new AppError('FORBIDDEN', 'Only the team leader can send invitations.', 403);
    }

    if (team.status !== TeamStatus.FORMING) {
      throw new AppError('CONFLICT', 'Cannot invite to a locked or submitted team roster.', 409);
    }

    // 2. Load target user from teammate pool
    const [poolEntry] = await tx
      .select()
      .from(teammatePool)
      .where(and(eq(teammatePool.eventId, team.eventId), eq(teammatePool.userId, targetUserId)))
      .limit(1);

    if (!poolEntry) {
      throw new AppError('NOT_FOUND', 'Target user is not currently in the teammate pool for this event.', 404);
    }

    // 3. Load event for slug
    const [event] = await tx
      .select({ title: events.title, slug: events.slug })
      .from(events)
      .where(eq(events.id, team.eventId))
      .limit(1);

    const deepLink = `${env.PUBLIC_WEB_URL}/events/${event?.slug || team.eventId}/teams/join?code=${team.inviteCode}`;

    // 4. Send invite notification (EMAIL)
    await enqueue(tx, {
      userId: targetUserId,
      eventId: team.eventId,
      kind: NotificationKind.BOOKING_CONFIRMED,
      channel: NotificationChannel.EMAIL,
      payload: {
        type: 'TEAM_INVITE',
        teamName: team.name,
        eventTitle: event?.title || 'Hackathon',
        inviteCode: `TEAM-${team.inviteCode}`,
        deepLink,
      },
    });

    return {
      success: true,
      message: 'Invitation sent successfully.',
      deepLink,
    };
  });
}
