import { and, asc, eq, sql } from 'drizzle-orm';
import {
  ClubMemberRole,
  TeamStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  clubMembers,
  events,
  teamMembers,
  teamRosterSnapshots,
  teams,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { headObject, presignGet } from '../../lib/r2';
import { getIO } from '../../realtime/io';

const GITHUB_GITLAB_REGEX = /^https:\/\/(www\.)?(github\.com|gitlab\.com)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+.*$/i;

const ALLOWED_DECK_MIMES = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.google-apps.presentation',
]);

export interface SubmitProjectInput {
  projectTitle: string;
  abstract: string;
  repoUrl: string;
  demoUrl?: string;
  deckKey?: string;
}

/**
 * Submits a project for a competition team. Enforces submission deadline, deck validation,
 * and roster snapshot creation.
 */
export async function submitProject(
  userId: string,
  teamId: string,
  input: SubmitProjectInput
) {
  // 1. Validate repository URL (must be https github or gitlab)
  if (!GITHUB_GITLAB_REGEX.test(input.repoUrl)) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Repository URL must be a valid HTTPS URL on GitHub or GitLab (e.g., https://github.com/org/repo).',
      400
    );
  }

  // 2. Validate abstract length
  if (!input.abstract || input.abstract.length > 2000) {
    throw new AppError('VALIDATION_FAILED', 'Project abstract must not exceed 2000 characters.', 400);
  }

  // 3. Verify deck file if provided
  if (input.deckKey) {
    const head = await headObject(input.deckKey);
    if (!head) {
      throw new AppError('VALIDATION_FAILED', 'Deck file does not exist in storage.', 400);
    }
    if (head.contentType && !ALLOWED_DECK_MIMES.has(head.contentType)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Invalid deck mime type '${head.contentType}'. Only PDF and presentation formats are allowed.`,
        400
      );
    }
  }

  return await db.transaction(async (tx) => {
    // 4. Load team FOR UPDATE
    const [team] = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .for('update')
      .limit(1);

    if (!team) {
      throw new AppError('NOT_FOUND', 'Team not found.', 404);
    }

    // 5. Verify user is leader or member
    const [membership] = await tx
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw new AppError('FORBIDDEN', 'Only team members can submit project deliverables.', 403);
    }

    // 6. Check event submission deadline
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, team.eventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    const now = new Date();
    const deadline = event.submissionDeadlineAt ?? event.endAt;

    if (now > deadline) {
      throw new AppError('DEADLINE_PASSED', 'Submission deadline has passed. Submissions are closed.', 403);
    }

    // 7. Load members and enforce min team size
    const members = await tx
      .select({
        userId: teamMembers.userId,
        fullName: users.fullName,
        rollNumber: users.rollNumber,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(teamMembers.joinedAt));

    const minTeamSize = event.minTeamSize ?? 1;
    const maxTeamSize = event.maxTeamSize ?? 4;

    if (members.length < minTeamSize) {
      throw new AppError(
        'TEAM_MIN_NOT_MET',
        `Cannot submit: Team has only ${members.length} members (minimum ${minTeamSize} required).`,
        422
      );
    }

    // 8. Ensure snapshot exists (create if absent or still forming)
    const [existingSnapshot] = await tx
      .select({ id: teamRosterSnapshots.id })
      .from(teamRosterSnapshots)
      .where(eq(teamRosterSnapshots.teamId, teamId))
      .limit(1);

    if (!existingSnapshot) {
      const snapshotPayload = {
        members: members.map((m) => ({
          userId: m.userId,
          fullName: m.fullName,
          rollNumber: m.rollNumber || null,
          joinedAt: m.joinedAt.toISOString(),
        })),
        lockedAt: now.toISOString(),
        minTeamSize,
        maxTeamSize,
      };

      await tx.insert(teamRosterSnapshots).values({
        teamId,
        snapshot: snapshotPayload,
        createdAt: now,
      });
    }

    // 9. Update team submission record
    const [updatedTeam] = await tx
      .update(teams)
      .set({
        projectTitle: input.projectTitle.trim(),
        projectAbstract: input.abstract.trim(),
        repoUrl: input.repoUrl.trim(),
        demoUrl: input.demoUrl ? input.demoUrl.trim() : null,
        deckKey: input.deckKey || null,
        submittedAt: now,
        status: TeamStatus.SUBMITTED,
        lockedAt: team.lockedAt || now,
      })
      .where(eq(teams.id, teamId))
      .returning();

    // 10. Emit team:update
    try {
      getIO().to(`team:${teamId}`).emit('team:update' as any, {
        teamId,
        action: 'PROJECT_SUBMITTED',
        submittedAt: now.toISOString(),
      });
    } catch {
      // Ignore
    }

    return updatedTeam;
  });
}

/**
 * Lists all submissions for an event with downloadable presigned links.
 */
export async function listSubmissionsForEvent(userId: string, eventId: string) {
  // Check authorization: organizer, faculty, or admin
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.role !== UserRole.ADMIN) {
    const [event] = await db
      .select({ createdBy: events.createdBy, clubId: events.clubId })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
    }

    let isOrganizer = Boolean(event.createdBy === userId);
    if (event.clubId) {
      const [cm] = await db
        .select({ role: clubMembers.role })
        .from(clubMembers)
        .where(and(eq(clubMembers.clubId, event.clubId), eq(clubMembers.userId, userId)))
        .limit(1);

      if (cm && (cm.role === ClubMemberRole.OWNER || cm.role === ClubMemberRole.ADMIN)) {
        isOrganizer = true;
      }
    }

    if (!isOrganizer) {
      throw new AppError('FORBIDDEN', 'Only organizers and judges can view event submissions.', 403);
    }
  }

  const submittedTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      leaderId: teams.leaderId,
      projectTitle: teams.projectTitle,
      projectAbstract: teams.projectAbstract,
      repoUrl: teams.repoUrl,
      demoUrl: teams.demoUrl,
      deckKey: teams.deckKey,
      submittedAt: teams.submittedAt,
      status: teams.status,
    })
    .from(teams)
    .where(and(eq(teams.eventId, eventId), sql`${teams.submittedAt} IS NOT NULL`))
    .orderBy(asc(teams.submittedAt));

  // Build response with downloadable presigned GET links
  const submissionsWithLinks = await Promise.all(
    submittedTeams.map(async (t) => {
      let deckDownloadUrl: string | null = null;
      if (t.deckKey) {
        deckDownloadUrl = await presignGet(t.deckKey, 3600);
      }

      // Load members
      const members = await db
        .select({
          userId: teamMembers.userId,
          fullName: users.fullName,
          email: users.email,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, t.id));

      return {
        ...t,
        deckDownloadUrl,
        members,
      };
    })
  );

  return submissionsWithLinks;
}
