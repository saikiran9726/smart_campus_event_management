import { and, asc, eq, or, sql } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  formatTeamCode,
  generateTeamCode,
  generateTeamInviteToken,
  normalizeTeamCode,
  NotificationChannel,
  NotificationKind,
  PaymentStatus,
  RegistrationStatus,
  TeamStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  clubMembers,
  clubs,
  events,
  notifications,
  registrations,
  teamMembers,
  teammatePool,
  teamRosterSnapshots,
  teams,
  users,
  waitlistEntries,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { assertNotInCooldown } from '../../middleware/rbac';
import { getIO } from '../../realtime/io';
import { issueTicket } from '../tickets/service';
import { releaseSeat } from '../waitlist/service';
import { submitAnswers } from '../forms/service';

/**
 * Creates a new competition team and atomically reserves the leader's seat.
 */
export async function createTeam(
  userId: string,
  eventId: string,
  name: string,
  _answers?: Record<string, any>
) {
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    throw new AppError('VALIDATION_FAILED', 'Team name must be between 2 and 100 characters.', 400);
  }

  return await db.transaction(async (tx) => {
    // 1. Load user & check cooldown
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found.', 404);
    }
    assertNotInCooldown(user);

    // 2. Load event with row lock
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .for('update')
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
    }

    const allowsTeams =
      event.registrationMode === 'TEAM' ||
      event.registrationMode === 'BOTH' ||
      Boolean(event.isCompetition) ||
      Boolean(event.minTeamSize && event.minTeamSize > 1);

    if (!allowsTeams) {
      throw new AppError('VALIDATION_FAILED', 'Team formation is not permitted for this event.', 400);
    }

    if (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.LIVE) {
      throw new AppError('CONFLICT', 'Event is not open for registration.', 409);
    }

    const now = new Date();
    if (now < event.registrationOpensAt || now > event.registrationClosesAt) {
      throw new AppError('CONFLICT', 'Event registration is closed.', 409);
    }

    // 3. User must not already be in a team for this event
    const [existingMembership] = await tx
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, userId)))
      .limit(1);

    if (existingMembership) {
      throw new AppError('CONFLICT', 'You are already in a team for this event.', 409);
    }

    // Check unique team name within event
    const [existingName] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.eventId, eventId), sql`lower(${teams.name}) = lower(${trimmedName})`))
      .limit(1);

    if (existingName) {
      throw new AppError('CONFLICT', `A team named '${trimmedName}' already exists for this event.`, 409);
    }

    // 4. Reserve leader's seat
    // Check if user already has an existing confirmed registration
    const [existingReg] = await tx
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, eventId),
          eq(registrations.userId, userId),
          eq(registrations.status, RegistrationStatus.CONFIRMED)
        )
      )
      .limit(1);

    let leaderReg = existingReg;

    if (!leaderReg) {
      // Atomic seat reservation
      const [updatedEvent] = await tx
        .update(events)
        .set({
          remainingCapacity: sql`${events.remainingCapacity} - 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(events.id, eventId), sql`${events.remainingCapacity} > 0`))
        .returning({ remainingCapacity: events.remainingCapacity });

      if (!updatedEvent) {
        throw new AppError('CONFLICT', 'Event is at full capacity. Cannot form a new team.', 409);
      }

      const isPaid = Boolean(event.isPaid && event.pricePaise > 0);
      const paymentStatus = isPaid ? PaymentStatus.PENDING : PaymentStatus.NOT_REQUIRED;
      const amountPaise = isPaid ? event.pricePaise : 0;

      const [newReg] = await tx
        .insert(registrations)
        .values({
          eventId,
          userId,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus,
          amountPaise,
          formVersion: event.formVersion ?? 1,
          approvalStatus: event.approvalRequired ? 'PENDING' : 'APPROVED',
        })
        .returning();

      if (!newReg) {
        throw new AppError('CONFLICT', 'Failed to register leader seat.', 409);
      }

      leaderReg = newReg;
      if (!isPaid) {
        await issueTicket(tx, leaderReg);
      }
    }

    // If registration form answers were provided, record them
    if (_answers && Object.keys(_answers).length > 0) {
      await submitAnswers(tx, {
        registrationId: leaderReg.id,
        eventId,
        answers: _answers,
      });
    }

    // 5. Generate human-friendly 8-char CSPRNG join code and invitation token with collision retry
    let inviteCode = '';
    let inviteToken = '';
    let createdTeam: any = null;
    let attempts = 0;

    while (attempts < 5) {
      try {
        inviteCode = generateTeamCode(8);
        inviteToken = generateTeamInviteToken();
        const [inserted] = await tx
          .insert(teams)
          .values({
            eventId,
            name: trimmedName,
            leaderId: userId,
            inviteCode,
            inviteToken,
            codeStatus: 'ACTIVE',
            status: TeamStatus.FORMING,
          })
          .returning();
        createdTeam = inserted;
        break;
      } catch (err: any) {
        if (err.code === '23505') {
          attempts++;
          continue;
        }
        throw err;
      }
    }

    if (!createdTeam) {
      throw new AppError('CONFLICT', 'Failed to generate unique team code, please try again.', 409);
    }

    // 6. Insert leader membership
    await tx.insert(teamMembers).values({
      teamId: createdTeam.id,
      userId,
      eventId,
      role: 'LEADER',
    });

    // 7. Associate registration with team
    if (leaderReg) {
      await tx
        .update(registrations)
        .set({ teamId: createdTeam.id })
        .where(eq(registrations.id, leaderReg.id));
    }

    // 8. Remove leader from teammate pool if present
    await tx
      .delete(teammatePool)
      .where(and(eq(teammatePool.eventId, eventId), eq(teammatePool.userId, userId)));

    const formattedCode = formatTeamCode(inviteCode);

    return {
      team: {
        ...createdTeam,
        formattedCode,
      },
      inviteCode,
      formattedCode,
      inviteToken,
      display: formattedCode,
      registration: leaderReg,
    };
  });
}

/**
 * Joins an existing team using a case-insensitive code (with or without 'TEAM-' prefix).
 * Concurrency safe: locks team and event, enforces max_team_size, and atomically reserves a seat.
 */
export async function joinTeamByCode(
  userId: string,
  code: string,
  answers?: Record<string, any>
) {
  const cleanCode = normalizeTeamCode(code.replace(/^team-/i, ''));
  if (!cleanCode) {
    throw new AppError('VALIDATION_FAILED', 'Invite code is required.', 400);
  }

  return await db.transaction(async (tx) => {
    // 1. Check user & cooldown
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found.', 404);
    }
    try {
      assertNotInCooldown(user);
    } catch {
      throw new AppError('NOT_ELIGIBLE', 'User is currently in cooldown and ineligible to register.', 403);
    }

    // 2. Select team FOR UPDATE (matching inviteCode normalized or inviteToken)
    const [team] = await tx
      .select()
      .from(teams)
      .where(
        or(
          sql`replace(replace(upper(${teams.inviteCode}), '-', ''), ' ', '') = ${cleanCode}`,
          eq(teams.inviteToken, code.trim())
        )
      )
      .for('update')
      .limit(1);

    if (!team) {
      throw new AppError('INVALID', `Team code '${code}' is invalid or does not exist.`, 404);
    }

    // Check code status (REVOKED or EXPIRED)
    if (team.codeStatus === 'REVOKED') {
      throw new AppError('REVOKED', 'This team join code has been revoked by the team leader.', 409);
    }
    if (team.codeExpiresAt && team.codeExpiresAt < new Date()) {
      throw new AppError('EXPIRED', 'This team join code has expired.', 409);
    }

    // 3. Status check: team must be FORMING
    if (team.status === TeamStatus.LOCKED || team.status === TeamStatus.SUBMITTED) {
      throw new AppError('ROSTER_LOCKED', 'Team roster is locked and cannot accept new members.', 409);
    }
    if (team.status === TeamStatus.DISQUALIFIED) {
      throw new AppError('CONFLICT', 'Team is disqualified.', 409);
    }

    // 4. Ensure user not already in this team or in another team for this event
    const [existingMembership] = await tx
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.eventId, team.eventId), eq(teamMembers.userId, userId)))
      .limit(1);

    if (existingMembership) {
      if (existingMembership.teamId === team.id) {
        throw new AppError('ALREADY_MEMBER', 'You are already a member of this team.', 409);
      }
      throw new AppError('ALREADY_IN_OTHER_TEAM_FOR_EVENT', 'You are already in another team for this event.', 409);
    }

    // 5. Check team capacity: max_team_size
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, team.eventId))
      .for('update')
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    if (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.LIVE) {
      throw new AppError('REGISTRATION_CLOSED', 'Event is not open for registration.', 409);
    }

    // Late joining check
    const now = new Date();
    if (!event.allowLateJoining && now > event.registrationClosesAt) {
      throw new AppError(
        'LATE_JOINING_DISALLOWED',
        'Late joining is disabled for this event as registration has closed.',
        409
      );
    }

    const [memberCountRes] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, team.id));

    const currentCount = memberCountRes?.count ?? 0;
    const maxTeamSize = event.maxTeamSize ?? 4;

    if (currentCount >= maxTeamSize) {
      throw new AppError('TEAM_FULL', `Team has reached maximum capacity of ${maxTeamSize} members.`, 409);
    }

    // Determine payment status for joining member based on event policy
    let joinerPaymentStatus = PaymentStatus.NOT_REQUIRED;
    let joinerAmountPaise = 0;

    if (event.isPaid && event.pricePaise > 0) {
      if (event.teamPaymentPolicy === 'PER_TEAM') {
        // PER_TEAM: payment is covered by the team/leader pass
        joinerPaymentStatus = PaymentStatus.NOT_REQUIRED;
        joinerAmountPaise = 0;
      } else {
        // PER_MEMBER: individual member payment required
        joinerPaymentStatus = PaymentStatus.PENDING;
        joinerAmountPaise = event.pricePaise;
      }
    }

    // 6. Atomic seat reservation for joiner
    const [existingReg] = await tx
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, team.eventId),
          eq(registrations.userId, userId),
          eq(registrations.status, RegistrationStatus.CONFIRMED)
        )
      )
      .limit(1);

    let joinerReg = existingReg;

    if (!joinerReg) {
      const [updatedEvent] = await tx
        .update(events)
        .set({
          remainingCapacity: sql`${events.remainingCapacity} - 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(events.id, team.eventId), sql`${events.remainingCapacity} > 0`))
        .returning({ remainingCapacity: events.remainingCapacity });

      if (!updatedEvent) {
        // Create waitlist registration and queue entry for the joiner
        const [waitlistReg] = await tx
          .insert(registrations)
          .values({
            eventId: team.eventId,
            userId,
            status: RegistrationStatus.WAITLISTED,
          })
          .returning();

        if (waitlistReg) {
          await tx.insert(waitlistEntries).values({
            eventId: team.eventId,
            userId,
            registrationId: waitlistReg.id,
            status: 'QUEUED',
          });
        }

        throw new AppError(
          'TEAM_FULL_WAITLISTED',
          'Event capacity is full. You have been placed on the waitlist while the team leader retains their seat.',
          409
        );
      }

      const [newReg] = await tx
        .insert(registrations)
        .values({
          eventId: team.eventId,
          userId,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: joinerPaymentStatus,
          amountPaise: joinerAmountPaise,
          formVersion: event.formVersion ?? 1,
          approvalStatus: event.approvalRequired ? 'PENDING' : 'APPROVED',
        })
        .returning();

      if (!newReg) {
        throw new AppError('CONFLICT', 'Failed to register joiner seat.', 409);
      }

      joinerReg = newReg;
      if (joinerPaymentStatus === PaymentStatus.NOT_REQUIRED) {
        await issueTicket(tx, joinerReg);
      }
    }

    // If answers provided, record booking answers
    if (answers && Object.keys(answers).length > 0) {
      await submitAnswers(tx, {
        registrationId: joinerReg.id,
        eventId: team.eventId,
        answers,
      });
    }

    // 7. Insert member
    const [newMember] = await tx
      .insert(teamMembers)
      .values({
        teamId: team.id,
        userId,
        eventId: team.eventId,
        role: 'MEMBER',
      })
      .returning();

    // 8. Associate registration with team
    if (joinerReg) {
      await tx
        .update(registrations)
        .set({ teamId: team.id })
        .where(eq(registrations.id, joinerReg.id));
    }

    // 9. Remove user from teammate pool if present
    await tx
      .delete(teammatePool)
      .where(and(eq(teammatePool.eventId, team.eventId), eq(teammatePool.userId, userId)));

    // 10. Emit team:update over Socket.IO
    try {
      getIO().to(`team:${team.id}`).emit('team:update' as any, {
        teamId: team.id,
        action: 'MEMBER_JOINED',
        userId,
        memberCount: currentCount + 1,
      });
    } catch {
      // Sockets may be inactive
    }

    return {
      success: true,
      team: {
        ...team,
        formattedCode: formatTeamCode(team.inviteCode),
      },
      member: newMember,
      memberCount: currentCount + 1,
    };
  });
}

/**
 * Leaves a team. Releases seat and transfers leadership or disbands if alone.
 */
export async function leaveTeam(userId: string, teamId: string) {
  return await db.transaction(async (tx) => {
    // 1. Select team FOR UPDATE
    const [team] = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .for('update')
      .limit(1);

    if (!team) {
      throw new AppError('NOT_FOUND', 'Team not found.', 404);
    }

    // 2. Check locked status
    if (team.status === TeamStatus.LOCKED || team.status === TeamStatus.SUBMITTED) {
      throw new AppError('ROSTER_LOCKED', 'Cannot leave a locked team roster.', 409);
    }

    // 3. Verify user membership
    const members = await tx
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(teamMembers.joinedAt));

    const userMembership = members.find((m) => m.userId === userId);
    if (!userMembership) {
      throw new AppError('FORBIDDEN', 'You are not a member of this team.', 403);
    }

    let disbanded = false;

    // 4. Handle leadership transfer or disband
    if (team.leaderId === userId) {
      if (members.length === 1) {
        // Leader is alone -> disband team
        disbanded = true;
        await tx.delete(teams).where(eq(teams.id, teamId));
      } else {
        // Transfer leadership to oldest member
        const nextLeader = members.find((m) => m.userId !== userId)!;
        await tx
          .update(teams)
          .set({ leaderId: nextLeader.userId })
          .where(eq(teams.id, teamId));

        await tx
          .update(teamMembers)
          .set({ role: 'LEADER' })
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, nextLeader.userId)));

        await tx
          .delete(teamMembers)
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
      }
    } else {
      // Regular member leaving
      await tx
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    }

    // 5. Update user's registration and release seat
    await tx
      .update(registrations)
      .set({ teamId: null, status: RegistrationStatus.CANCELLED, cancelledAt: new Date() })
      .where(and(eq(registrations.eventId, team.eventId), eq(registrations.userId, userId)));

    await releaseSeat(tx, team.eventId);

    // 6. Emit team:update
    if (!disbanded) {
      try {
        getIO().to(`team:${teamId}`).emit('team:update' as any, {
          teamId,
          action: 'MEMBER_LEFT',
          userId,
          remainingMembers: members.length - 1,
        });
      } catch {
        // Ignore
      }
    }

    return {
      success: true,
      disbanded,
      remainingMembers: members.length - 1,
    };
  });
}

/**
 * Removes a member from a team (by leader, organizer, or admin).
 * Enforces allowMemberReplacement and releases the event seat.
 */
export async function removeTeamMember(
  callerUserId: string,
  teamId: string,
  memberUserId: string
) {
  return await db.transaction(async (tx) => {
    // 1. Select team FOR UPDATE
    const [team] = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .for('update')
      .limit(1);

    if (!team) {
      throw new AppError('NOT_FOUND', 'Team not found.', 404);
    }

    if (team.status === TeamStatus.LOCKED || team.status === TeamStatus.SUBMITTED) {
      throw new AppError('ROSTER_LOCKED', 'Cannot remove members from a locked team roster.', 409);
    }

    if (memberUserId === team.leaderId) {
      throw new AppError(
        'VALIDATION_FAILED',
        'The team leader cannot be removed. Transfer leadership or disband the team.',
        400
      );
    }

    // 2. Select event
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, team.eventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    // Check authorization: leader, organizer, or admin
    let isAuthorized = team.leaderId === callerUserId;
    if (!isAuthorized) {
      const [caller] = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, callerUserId))
        .limit(1);

      if (caller?.role === UserRole.ADMIN || event.createdBy === callerUserId) {
        isAuthorized = true;
      } else if (event.clubId) {
        const [cm] = await tx
          .select({ role: clubMembers.role })
          .from(clubMembers)
          .where(and(eq(clubMembers.clubId, event.clubId), eq(clubMembers.userId, callerUserId)))
          .limit(1);
        if (cm && (cm.role === ClubMemberRole.OWNER || cm.role === ClubMemberRole.ADMIN)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      throw new AppError('FORBIDDEN', 'Only the team leader or event organizer can remove a member.', 403);
    }

    // 3. Member replacement check
    if (!event.allowMemberReplacement) {
      throw new AppError(
        'REPLACEMENT_DISALLOWED',
        'Member replacement is not allowed for this event.',
        409
      );
    }

    // 4. Verify target member is in team
    const [membership] = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, memberUserId)))
      .limit(1);

    if (!membership) {
      throw new AppError('NOT_FOUND', 'Member not found in this team.', 404);
    }

    // 5. Delete from teamMembers
    await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, memberUserId)));

    // 6. Update registration: unlink team and cancel
    await tx
      .update(registrations)
      .set({
        teamId: null,
        status: RegistrationStatus.CANCELLED,
        cancelledAt: new Date(),
      })
      .where(and(eq(registrations.eventId, team.eventId), eq(registrations.userId, memberUserId)));

    // 7. Release seat back to event
    await releaseSeat(tx, team.eventId);

    // 8. Realtime event emit
    try {
      getIO().to(`team:${teamId}`).emit('team:update' as any, {
        teamId,
        action: 'MEMBER_REMOVED',
        userId: memberUserId,
      });
    } catch {
      // Ignore
    }

    return {
      success: true,
      removedUserId: memberUserId,
    };
  });
}

/**
 * Loads team by ID with all member profiles and leader information.
 */
export async function getTeamById(teamId: string, currentUserId: string) {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    throw new AppError('NOT_FOUND', 'Team not found.', 404);
  }

  // Load members with user profiles
  const members = await db
    .select({
      userId: teamMembers.userId,
      role: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
      fullName: users.fullName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      rollNumber: users.rollNumber,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(teamMembers.joinedAt));

  // Check read permission: member, organizer, or admin
  const isMember = members.some((m) => m.userId === currentUserId);
  if (!isMember) {
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1);

    if (user?.role !== UserRole.ADMIN) {
      const [event] = await db
        .select({ createdBy: events.createdBy, clubId: events.clubId })
        .from(events)
        .where(eq(events.id, team.eventId))
        .limit(1);

      let isOrganizer = Boolean(event && event.createdBy === currentUserId);
      if (event?.clubId) {
        const [clubMem] = await db
          .select({ role: clubMembers.role })
          .from(clubMembers)
          .where(and(eq(clubMembers.clubId, event.clubId), eq(clubMembers.userId, currentUserId)))
          .limit(1);
        if (clubMem && (clubMem.role === ClubMemberRole.OWNER || clubMem.role === ClubMemberRole.ADMIN)) {
          isOrganizer = true;
        }
      }

      if (!isOrganizer) {
        throw new AppError('FORBIDDEN', 'You do not have permission to view this team.', 403);
      }
    }
  }

  return {
    ...team,
    formattedCode: formatTeamCode(team.inviteCode),
    memberCount: members.length,
    members,
  };
}

/**
 * Returns current user's team for an event.
 */
export async function getUserTeamForEvent(userId: string, eventId: string) {
  const [membership] = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.eventId, eventId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    return null;
  }

  return await getTeamById(membership.teamId, userId);
}

/**
 * Locks a team's roster and inserts an immutable snapshot row into team_roster_snapshots.
 */
export async function lockTeam(userId: string, teamId: string) {
  return await db.transaction(async (tx) => {
    // 1. Select team FOR UPDATE
    const [team] = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .for('update')
      .limit(1);

    if (!team) {
      throw new AppError('NOT_FOUND', 'Team not found.', 404);
    }

    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, team.eventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', 'Event not found.', 404);
    }

    // 2. Authorization check: Leader or Organizer or Admin
    let isAuthorized = team.leaderId === userId;
    if (!isAuthorized) {
      const [u] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
      if (u?.role === UserRole.ADMIN || event.createdBy === userId) {
        isAuthorized = true;
      } else if (event.clubId) {
        const [cm] = await tx
          .select({ role: clubMembers.role })
          .from(clubMembers)
          .where(and(eq(clubMembers.clubId, event.clubId), eq(clubMembers.userId, userId)))
          .limit(1);
        if (cm && (cm.role === ClubMemberRole.OWNER || cm.role === ClubMemberRole.ADMIN)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      throw new AppError('FORBIDDEN', 'Only the team leader or event organizer can lock the roster.', 403);
    }

    // 3. If already locked, return existing snapshot
    if (team.status === TeamStatus.LOCKED || team.status === TeamStatus.SUBMITTED) {
      const [existingSnapshot] = await tx
        .select()
        .from(teamRosterSnapshots)
        .where(eq(teamRosterSnapshots.teamId, teamId))
        .limit(1);
      return { success: true, team, snapshot: existingSnapshot };
    }

    // 4. Verify minimum team size
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
        `Team requires at least ${minTeamSize} members before locking. Current: ${members.length}.`,
        422
      );
    }

    // 5. Update team status to LOCKED
    const lockedAt = new Date();
    const [updatedTeam] = await tx
      .update(teams)
      .set({
        status: TeamStatus.LOCKED,
        lockedAt,
      })
      .where(eq(teams.id, teamId))
      .returning();

    // 6. Insert immutable snapshot
    const snapshotPayload = {
      members: members.map((m) => ({
        userId: m.userId,
        fullName: m.fullName,
        rollNumber: m.rollNumber || null,
        joinedAt: m.joinedAt.toISOString(),
      })),
      lockedAt: lockedAt.toISOString(),
      minTeamSize,
      maxTeamSize,
    };

    const [snapshot] = await tx
      .insert(teamRosterSnapshots)
      .values({
        teamId,
        snapshot: snapshotPayload,
        createdAt: lockedAt,
      })
      .returning();

    // 7. Emit team:update
    try {
      getIO().to(`team:${teamId}`).emit('team:update' as any, {
        teamId,
        action: 'ROSTER_LOCKED',
        lockedAt: lockedAt.toISOString(),
      });
    } catch {
      // Ignore
    }

    return {
      success: true,
      team: updatedTeam,
      snapshot,
    };
  });
}

/**
 * Regenerates the join code for a team (Leader only).
 * Instantly invalidates the previous code and creates a new 8-character CSPRNG code.
 */
export async function regenerateTeamCode(
  leaderId: string,
  teamId: string,
  expiryHours?: number
) {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    throw new AppError('NOT_FOUND', 'Team not found.', 404);
  }

  if (team.leaderId !== leaderId) {
    throw new AppError('FORBIDDEN', 'Only the team leader can regenerate the team code.', 403);
  }

  if (team.status === TeamStatus.LOCKED || team.status === TeamStatus.SUBMITTED) {
    throw new AppError('ROSTER_LOCKED', 'Team roster is locked and code cannot be modified.', 409);
  }

  const newCode = generateTeamCode(8);
  const newToken = generateTeamInviteToken();
  const codeExpiresAt = expiryHours ? new Date(Date.now() + expiryHours * 3600000) : null;

  const [updatedTeam] = await db
    .update(teams)
    .set({
      inviteCode: newCode,
      inviteToken: newToken,
      codeStatus: 'ACTIVE',
      codeExpiresAt,
    })
    .where(eq(teams.id, teamId))
    .returning();

  const formattedCode = formatTeamCode(newCode);

  try {
    getIO().to(`team:${teamId}`).emit('team:update' as any, {
      team: {
        ...updatedTeam,
        formattedCode,
      },
    });
  } catch {
    // Sockets may be inactive
  }

  return {
    team: {
      ...updatedTeam,
      formattedCode,
    },
    inviteCode: newCode,
    formattedCode,
    inviteToken: newToken,
  };
}

/**
 * Revokes the join code for a team (Leader only).
 */
export async function revokeTeamCode(leaderId: string, teamId: string) {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    throw new AppError('NOT_FOUND', 'Team not found.', 404);
  }

  if (team.leaderId !== leaderId) {
    throw new AppError('FORBIDDEN', 'Only the team leader can revoke the team code.', 403);
  }

  const [updatedTeam] = await db
    .update(teams)
    .set({
      codeStatus: 'REVOKED',
    })
    .where(eq(teams.id, teamId))
    .returning();

  const formattedCode = formatTeamCode(team.inviteCode);

  try {
    getIO().to(`team:${teamId}`).emit('team:update' as any, {
      team: {
        ...updatedTeam,
        formattedCode,
      },
    });
  } catch {
    // Sockets may be inactive
  }

  return {
    success: true,
    message: 'Team join code has been revoked.',
  };
}

/**
 * Public/Safe preview of a team by code or invite token without auto-joining.
 */
export async function getTeamPreview(codeOrToken: string) {
  const clean = normalizeTeamCode(codeOrToken.replace(/^team-/i, ''));
  if (!clean) {
    throw new AppError('VALIDATION_FAILED', 'Team code or invite token is required.', 400);
  }

  const [team] = await db
    .select()
    .from(teams)
    .where(
      or(
        sql`replace(replace(upper(${teams.inviteCode}), '-', ''), ' ', '') = ${clean}`,
        eq(teams.inviteToken, codeOrToken.trim())
      )
    )
    .limit(1);

  if (!team) {
    throw new AppError('INVALID', 'Team not found or code is invalid.', 404);
  }

  if (team.codeStatus === 'REVOKED') {
    throw new AppError('REVOKED', 'This team join code has been revoked.', 409);
  }

  if (team.codeExpiresAt && team.codeExpiresAt < new Date()) {
    throw new AppError('EXPIRED', 'This team join code has expired.', 409);
  }

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, team.eventId))
    .limit(1);

  const [leader] = await db
    .select({ fullName: users.fullName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, team.leaderId))
    .limit(1);

  const [memberCountRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, team.id));

  return {
    teamId: team.id,
    teamName: team.name,
    eventId: team.eventId,
    eventTitle: event?.title ?? 'Event',
    leaderName: leader?.fullName ?? 'Team Leader',
    leaderAvatarUrl: leader?.avatarUrl,
    memberCount: memberCountRes?.count ?? 1,
    minTeamSize: event?.minTeamSize ?? 2,
    maxTeamSize: event?.maxTeamSize ?? 4,
    isLocked: team.status === TeamStatus.LOCKED || team.status === TeamStatus.SUBMITTED,
    isPaid: Boolean(event?.isPaid),
    pricePaise: event?.pricePaise ?? 0,
    teamPaymentPolicy: event?.teamPaymentPolicy ?? 'PER_MEMBER',
    formattedCode: formatTeamCode(team.inviteCode),
    inviteToken: team.inviteToken,
  };
}
