import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  ClubMemberRole,
  DEFAULT_PROJECT_SUBMISSION_CONFIG,
  ProjectSubmissionConfig,
  TeamStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  clubMembers,
  events,
  projectSubmissions,
  registrations,
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
  projectTitle?: string | null;
  abstract?: string | null;
  repoUrl?: string | null;
  demoUrl?: string | null;
  deckKey?: string | null;
  customFields?: Record<string, unknown>;
}

/**
 * Validates submission fields against the event's ProjectSubmissionConfig
 */
export function validateSubmissionAgainstConfig(
  config: ProjectSubmissionConfig | null,
  event: { submissionDeadlineAt: Date | null; endAt: Date },
  input: SubmitProjectInput,
  hasExistingSubmission: boolean
) {
  // If config is present, check if enabled
  if (config && !config.enabled) {
    throw new AppError('SUBMISSIONS_DISABLED', 'Project submissions are not enabled for this event.', 400);
  }

  const effectiveConfig = config?.enabled ? config : DEFAULT_PROJECT_SUBMISSION_CONFIG;

  // Deadline check
  const now = new Date();
  const deadline = effectiveConfig.deadline
    ? new Date(effectiveConfig.deadline)
    : (event.submissionDeadlineAt ?? event.endAt);

  if (now > deadline) {
    throw new AppError('DEADLINE_PASSED', 'Submission deadline has passed. Submissions are closed.', 403);
  }

  // Editing check
  if (hasExistingSubmission && !effectiveConfig.allowEditAfterSubmission) {
    throw new AppError('EDITING_NOT_ALLOWED', 'Editing project submissions is disabled by the organizer.', 403);
  }

  // Validate fields if submission is enabled
  if (config?.enabled) {
    for (const field of effectiveConfig.fields || []) {
      if (!field.enabled) continue;

      if (field.key === 'title' && field.required) {
        if (!input.projectTitle || !input.projectTitle.trim()) {
          throw new AppError('VALIDATION_FAILED', `${field.label || 'Project Title'} is required.`, 400);
        }
      }

      if (field.key === 'abstract' && field.required) {
        if (!input.abstract || !input.abstract.trim()) {
          throw new AppError('VALIDATION_FAILED', `${field.label || 'Project Abstract'} is required.`, 400);
        }
      }

      if (field.key === 'repoUrl' && field.required) {
        if (!input.repoUrl || !input.repoUrl.trim()) {
          throw new AppError('VALIDATION_FAILED', `${field.label || 'Repository URL'} is required.`, 400);
        }
      }

      if (field.key === 'demoUrl' && field.required) {
        if (!input.demoUrl || !input.demoUrl.trim()) {
          throw new AppError('VALIDATION_FAILED', `${field.label || 'Demo URL'} is required.`, 400);
        }
      }

      if (field.key === 'deckKey' && field.required) {
        if (!input.deckKey || !input.deckKey.trim()) {
          throw new AppError('VALIDATION_FAILED', `${field.label || 'Presentation / Deck Document'} is required.`, 400);
        }
      }

      // Custom fields check
      if (
        !['title', 'abstract', 'repoUrl', 'demoUrl', 'deckKey'].includes(field.key) &&
        field.required
      ) {
        const val = input.customFields?.[field.key];
        if (val === undefined || val === null || val === '') {
          throw new AppError('VALIDATION_FAILED', `${field.label} is required.`, 400);
        }
      }
    }
  }

  // Generic sanity validations
  if (input.abstract && input.abstract.length > 2000) {
    throw new AppError('VALIDATION_FAILED', 'Project abstract must not exceed 2000 characters.', 400);
  }

  if (input.repoUrl && input.repoUrl.trim() && !GITHUB_GITLAB_REGEX.test(input.repoUrl.trim())) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Repository URL must be a valid HTTPS URL on GitHub or GitLab (e.g., https://github.com/org/repo).',
      400
    );
  }
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
  // Verify deck file if provided
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
    // 1. Load team FOR UPDATE
    const [team] = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .for('update')
      .limit(1);

    if (!team) {
      throw new AppError('NOT_FOUND', 'Team not found.', 404);
    }

    // 2. Verify user is leader or member
    const [membership] = await tx
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);

    if (!membership) {
      throw new AppError('FORBIDDEN', 'Only team members can submit project deliverables.', 403);
    }

    // 3. Load event
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, team.eventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    const config = event.projectSubmissionConfig as ProjectSubmissionConfig | null;

    // Check existing submission in project_submissions
    const [existingSub] = await tx
      .select()
      .from(projectSubmissions)
      .where(and(eq(projectSubmissions.eventId, event.id), eq(projectSubmissions.teamId, teamId)))
      .limit(1);

    const hasExisting = Boolean(existingSub || team.submittedAt);

    // Validate against event config (deadline, editability, required fields)
    validateSubmissionAgainstConfig(config, event, input, hasExisting);

    // 4. Load members and enforce min team size if competition
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

    const now = new Date();

    // 5. Ensure snapshot exists
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

    // 6. Upsert into project_submissions
    let savedSubmissionId = existingSub?.id;
    if (existingSub) {
      await tx
        .update(projectSubmissions)
        .set({
          projectTitle: input.projectTitle?.trim() || null,
          projectAbstract: input.abstract?.trim() || null,
          repoUrl: input.repoUrl?.trim() || null,
          demoUrl: input.demoUrl ? input.demoUrl.trim() : null,
          deckKey: input.deckKey || null,
          customFields: input.customFields || {},
          updatedAt: now,
        })
        .where(eq(projectSubmissions.id, existingSub.id));
    } else {
      const [newSub] = await tx
        .insert(projectSubmissions)
        .values({
          eventId: event.id,
          teamId,
          userId,
          projectTitle: input.projectTitle?.trim() || null,
          projectAbstract: input.abstract?.trim() || null,
          repoUrl: input.repoUrl?.trim() || null,
          demoUrl: input.demoUrl ? input.demoUrl.trim() : null,
          deckKey: input.deckKey || null,
          customFields: input.customFields || {},
          status: 'SUBMITTED',
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      savedSubmissionId = newSub?.id;
    }

    // 7. Update team submission record for backwards compatibility
    const [updatedTeam] = await tx
      .update(teams)
      .set({
        projectTitle: input.projectTitle?.trim() || null,
        projectAbstract: input.abstract?.trim() || null,
        repoUrl: input.repoUrl?.trim() || null,
        demoUrl: input.demoUrl ? input.demoUrl.trim() : null,
        deckKey: input.deckKey || null,
        submittedAt: now,
        status: TeamStatus.SUBMITTED,
        lockedAt: team.lockedAt || now,
      })
      .where(eq(teams.id, teamId))
      .returning();

    // 8. Emit team:update
    try {
      getIO().to(`team:${teamId}`).emit('team:update' as any, {
        teamId,
        action: 'PROJECT_SUBMITTED',
        submittedAt: now.toISOString(),
        submissionId: savedSubmissionId,
      });
    } catch {
      // Ignore
    }

    return updatedTeam;
  });
}

/**
 * Submits an individual project for an event participant
 */
export async function submitIndividualProject(
  userId: string,
  eventId: string,
  input: SubmitProjectInput
) {
  return await db.transaction(async (tx) => {
    // 1. Load event
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    // 2. Load user's registration for this event
    const [reg] = await tx
      .select()
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), eq(registrations.userId, userId)))
      .limit(1);

    if (!reg) {
      throw new AppError('FORBIDDEN', 'You must be registered for this event to submit a project.', 403);
    }

    const config = event.projectSubmissionConfig as ProjectSubmissionConfig | null;

    // 3. Check existing individual submission
    const [existingSub] = await tx
      .select()
      .from(projectSubmissions)
      .where(
        and(
          eq(projectSubmissions.eventId, eventId),
          eq(projectSubmissions.userId, userId),
          isNull(projectSubmissions.teamId)
        )
      )
      .limit(1);

    const hasExisting = Boolean(existingSub);

    // 4. Validate against event config
    validateSubmissionAgainstConfig(config, event, input, hasExisting);

    // Verify deck if provided
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

    const now = new Date();

    // 5. Upsert into project_submissions
    let savedSubmission: typeof projectSubmissions.$inferSelect;
    if (existingSub) {
      const [updated] = await tx
        .update(projectSubmissions)
        .set({
          projectTitle: input.projectTitle?.trim() || null,
          projectAbstract: input.abstract?.trim() || null,
          repoUrl: input.repoUrl?.trim() || null,
          demoUrl: input.demoUrl ? input.demoUrl.trim() : null,
          deckKey: input.deckKey || null,
          customFields: input.customFields || {},
          registrationId: reg.id,
          updatedAt: now,
        })
        .where(eq(projectSubmissions.id, existingSub.id))
        .returning();
      savedSubmission = updated!;
    } else {
      const [created] = await tx
        .insert(projectSubmissions)
        .values({
          eventId,
          teamId: null,
          userId,
          registrationId: reg.id,
          projectTitle: input.projectTitle?.trim() || null,
          projectAbstract: input.abstract?.trim() || null,
          repoUrl: input.repoUrl?.trim() || null,
          demoUrl: input.demoUrl ? input.demoUrl.trim() : null,
          deckKey: input.deckKey || null,
          customFields: input.customFields || {},
          status: 'SUBMITTED',
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      savedSubmission = created!;
    }

    return savedSubmission;
  });
}

/**
 * Unified submit endpoint: automatically detects whether the user is in a team
 * for this event or submitting as an individual.
 */
export async function submitProjectOrDeliverables(
  userId: string,
  eventId: string,
  input: SubmitProjectInput
) {
  // Check if user has an active team for this event
  const [memberRow] = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (memberRow) {
    return await submitProject(userId, memberRow.teamId, input);
  }

  return await submitIndividualProject(userId, eventId, input);
}

/**
 * Gets submission status, details, and permissions for the current user and event
 */
export async function getSubmissionForEventAndUser(userId: string, eventId: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', 'Event not found.', 404);
  }

  const config = (event.projectSubmissionConfig as ProjectSubmissionConfig | null) || DEFAULT_PROJECT_SUBMISSION_CONFIG;

  // Check team membership
  const [memberRow] = await db
    .select({
      teamId: teamMembers.teamId,
      teamName: teams.name,
      teamStatus: teams.status,
      leaderId: teams.leaderId,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, userId)))
    .limit(1);

  // Check individual registration
  const [registration] = await db
    .select({ id: registrations.id, status: registrations.status })
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.userId, userId)))
    .limit(1);

  let submission = null;
  if (memberRow) {
    const [sub] = await db
      .select()
      .from(projectSubmissions)
      .where(and(eq(projectSubmissions.eventId, eventId), eq(projectSubmissions.teamId, memberRow.teamId)))
      .limit(1);
    submission = sub || null;
  } else if (registration) {
    const [sub] = await db
      .select()
      .from(projectSubmissions)
      .where(
        and(
          eq(projectSubmissions.eventId, eventId),
          eq(projectSubmissions.userId, userId),
          isNull(projectSubmissions.teamId)
        )
      )
      .limit(1);
    submission = sub || null;
  }

  const now = new Date();
  const deadline = config.deadline
    ? new Date(config.deadline)
    : (event.submissionDeadlineAt ?? event.endAt);
  const isDeadlinePassed = now > deadline;

  const canEdit =
    Boolean(config.enabled) &&
    !isDeadlinePassed &&
    (!submission || config.allowEditAfterSubmission);

  return {
    config,
    submission,
    team: memberRow || null,
    isRegistered: Boolean(registration || memberRow),
    isDeadlinePassed,
    canEdit,
  };
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

  // Load from project_submissions
  const submissions = await db
    .select({
      id: projectSubmissions.id,
      eventId: projectSubmissions.eventId,
      teamId: projectSubmissions.teamId,
      userId: projectSubmissions.userId,
      registrationId: projectSubmissions.registrationId,
      projectTitle: projectSubmissions.projectTitle,
      projectAbstract: projectSubmissions.projectAbstract,
      repoUrl: projectSubmissions.repoUrl,
      demoUrl: projectSubmissions.demoUrl,
      deckKey: projectSubmissions.deckKey,
      customFields: projectSubmissions.customFields,
      status: projectSubmissions.status,
      createdAt: projectSubmissions.createdAt,
      updatedAt: projectSubmissions.updatedAt,
      submitterName: users.fullName,
      submitterEmail: users.email,
      teamName: teams.name,
    })
    .from(projectSubmissions)
    .innerJoin(users, eq(projectSubmissions.userId, users.id))
    .leftJoin(teams, eq(projectSubmissions.teamId, teams.id))
    .where(eq(projectSubmissions.eventId, eventId))
    .orderBy(asc(projectSubmissions.createdAt));

  // Build response with downloadable presigned GET links & members
  const submissionsWithLinks = await Promise.all(
    submissions.map(async (sub) => {
      let deckDownloadUrl: string | null = null;
      if (sub.deckKey) {
        deckDownloadUrl = await presignGet(sub.deckKey, 3600);
      }

      let members: Array<{ userId: string; fullName: string | null; email: string }> = [];
      if (sub.teamId) {
        members = await db
          .select({
            userId: teamMembers.userId,
            fullName: users.fullName,
            email: users.email,
          })
          .from(teamMembers)
          .innerJoin(users, eq(teamMembers.userId, users.id))
          .where(eq(teamMembers.teamId, sub.teamId));
      }

      return {
        ...sub,
        id: sub.teamId || sub.id,
        submissionId: sub.id,
        deckDownloadUrl,
        members,
      };
    })
  );

  return submissionsWithLinks;
}
