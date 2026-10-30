import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  RegistrationStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  certificates,
  clubMembers,
  events,
  registrations,
  teamMembers,
  teams,
  tickets,
  users,
  winners,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';

export interface PlacementItem {
  rank: 1 | 2 | 3;
  teamId: string;
}

export const PRIZE_BADGES: Record<number, string> = {
  1: '🥇 1st Place',
  2: '🥈 2nd Place',
  3: '🥉 3rd Place',
};

/**
 * Publishes winners podium for an event, atomically replacing existing placements,
 * issuing WINNER certificates to all team members, and PARTICIPATION certificates to checked-in attendees.
 */
export async function publishEventWinners(
  userId: string,
  eventId: string,
  placements: PlacementItem[]
) {
  // 1. Verify user is organizer or admin
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
  }

  if (user?.role !== UserRole.ADMIN && event.createdBy !== userId) {
    if (event.clubId) {
      const [cm] = await db
        .select({ role: clubMembers.role })
        .from(clubMembers)
        .where(and(eq(clubMembers.clubId, event.clubId), eq(clubMembers.userId, userId)))
        .limit(1);

      if (!cm || (cm.role !== ClubMemberRole.OWNER && cm.role !== ClubMemberRole.ADMIN)) {
        throw new AppError('FORBIDDEN', 'Only event organizers can publish winners.', 403);
      }
    } else {
      throw new AppError('FORBIDDEN', 'Only event organizers can publish winners.', 403);
    }
  }

  // 2. Validate placements
  if (!Array.isArray(placements) || placements.length === 0 || placements.length > 3) {
    throw new AppError('VALIDATION_FAILED', 'Placements must specify 1 to 3 winners.', 400);
  }

  const ranksSeen = new Set<number>();
  const teamsSeen = new Set<string>();

  for (const p of placements) {
    if (![1, 2, 3].includes(p.rank)) {
      throw new AppError('VALIDATION_FAILED', `Invalid rank ${p.rank}. Allowed ranks are 1, 2, and 3.`, 400);
    }
    if (ranksSeen.has(p.rank)) {
      throw new AppError('VALIDATION_FAILED', `Duplicate rank ${p.rank} specified.`, 400);
    }
    if (teamsSeen.has(p.teamId)) {
      throw new AppError('VALIDATION_FAILED', `Duplicate teamId '${p.teamId}' specified.`, 400);
    }
    ranksSeen.add(p.rank);
    teamsSeen.add(p.teamId);
  }

  // 3. Condition check: requires submissions closed or event COMPLETED
  const now = new Date();
  const isSubmissionsClosed = event.submissionDeadlineAt ? now > event.submissionDeadlineAt : false;
  const isCompleted = event.status === EventStatus.COMPLETED || now > event.endAt;

  if (!isSubmissionsClosed && !isCompleted) {
    throw new AppError(
      'CONFLICT',
      'Cannot publish winners before the submission deadline has passed or the event is completed.',
      409
    );
  }

  // 4. In one transaction: replace winners and issue certificates
  return await db.transaction(async (tx) => {
    // Verify each team belongs to this event
    for (const p of placements) {
      const [team] = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.id, p.teamId), eq(teams.eventId, eventId)))
        .limit(1);

      if (!team) {
        throw new AppError('NOT_FOUND', `Team '${p.teamId}' does not belong to this event.`, 404);
      }
    }

    // Replace placements atomically
    await tx.delete(winners).where(eq(winners.eventId, eventId));

    const insertedWinners = [];
    const winningUserIds: string[] = [];

    for (const p of placements) {
      const [w] = await tx
        .insert(winners)
        .values({
          eventId,
          teamId: p.teamId,
          rank: p.rank,
          publishedAt: now,
        })
        .returning();
      insertedWinners.push(w);

      // Load team members
      const members = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, p.teamId));

      for (const m of members) {
        winningUserIds.push(m.userId);
      }
    }

    // Replace WINNER certificates
    await tx
      .delete(certificates)
      .where(and(eq(certificates.eventId, eventId), eq(certificates.kind, 'WINNER')));

    for (const p of placements) {
      const members = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, p.teamId));

      for (const m of members) {
        await tx.insert(certificates).values({
          eventId,
          userId: m.userId,
          kind: 'WINNER',
          rank: p.rank,
          issuedAt: now,
        });
      }
    }

    // Issue PARTICIPATION certificates for checked-in attendees who are not winners
    const checkedInRegistrations = await tx
      .select({ userId: registrations.userId })
      .from(registrations)
      .innerJoin(tickets, eq(tickets.registrationId, registrations.id))
      .where(
        and(
          eq(registrations.eventId, eventId),
          eq(registrations.status, RegistrationStatus.CONFIRMED),
          sql`${tickets.checkedInAt} IS NOT NULL`
        )
      );

    const nonWinningCheckedInUserIds = checkedInRegistrations
      .map((r) => r.userId)
      .filter((uid) => !winningUserIds.includes(uid));

    // Dedup user IDs
    const uniqueParticipantUserIds = Array.from(new Set(nonWinningCheckedInUserIds));

    for (const participantId of uniqueParticipantUserIds) {
      // Check if participation cert already exists
      const [existingCert] = await tx
        .select({ id: certificates.id })
        .from(certificates)
        .where(
          and(
            eq(certificates.eventId, eventId),
            eq(certificates.userId, participantId),
            eq(certificates.kind, 'PARTICIPATION')
          )
        )
        .limit(1);

      if (!existingCert) {
        await tx.insert(certificates).values({
          eventId,
          userId: participantId,
          kind: 'PARTICIPATION',
          rank: null,
          issuedAt: now,
        });
      }
    }

    return {
      success: true,
      winners: insertedWinners,
      winnerCertificatesIssued: winningUserIds.length,
      participationCertificatesIssued: uniqueParticipantUserIds.length,
    };
  });
}

/**
 * Returns public podium for an event by slug.
 * Includes team name, members with public profile link, project deliverables, and prize badge label.
 */
export async function getPublicPodium(slug: string) {
  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
    })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${slug}' not found.`, 404);
  }

  const rows = await db
    .select({
      rank: winners.rank,
      publishedAt: winners.publishedAt,
      teamId: teams.id,
      teamName: teams.name,
      projectTitle: teams.projectTitle,
      projectAbstract: teams.projectAbstract,
      demoUrl: teams.demoUrl,
      repoUrl: teams.repoUrl,
    })
    .from(winners)
    .innerJoin(teams, eq(winners.teamId, teams.id))
    .where(eq(winners.eventId, event.id))
    .orderBy(asc(winners.rank));

  const podium = await Promise.all(
    rows.map(async (row) => {
      const members = await db
        .select({
          userId: users.id,
          name: users.fullName,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, row.teamId))
        .orderBy(asc(teamMembers.joinedAt));

      return {
        rank: row.rank,
        prizeBadge: PRIZE_BADGES[row.rank] || `Rank ${row.rank}`,
        teamName: row.teamName,
        projectTitle: row.projectTitle,
        abstract: row.projectAbstract,
        demoUrl: row.demoUrl,
        repoUrl: row.repoUrl,
        members: members.map((m) => ({
          name: m.name,
          profileUrl: `/u/${m.userId}`,
        })),
      };
    })
  );

  return {
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
    },
    podium,
  };
}
