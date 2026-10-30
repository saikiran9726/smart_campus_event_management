import { and, asc, eq, sql } from 'drizzle-orm';
import {
  NotificationChannel,
  NotificationKind,
  TeamStatus,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  events,
  notifications,
  teamMembers,
  teamRosterSnapshots,
  teams,
  users,
} from '../db/schema';
import { getIO } from '../realtime/io';

export interface AutoLockResult {
  lockedCount: number;
  disqualifiedCount: number;
}

/**
 * Runs the auto-lock process for an event:
 * - FORMING teams with member_count >= minTeamSize are locked with an immutable snapshot.
 * - FORMING teams with member_count < minTeamSize are marked DISQUALIFIED and notified.
 */
export async function autoLockTeamsForEvent(eventId: string): Promise<AutoLockResult> {
  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      minTeamSize: events.minTeamSize,
      maxTeamSize: events.maxTeamSize,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    return { lockedCount: 0, disqualifiedCount: 0 };
  }

  const minTeamSize = event.minTeamSize ?? 1;
  const maxTeamSize = event.maxTeamSize ?? 4;

  // Find all FORMING teams for this event
  const formingTeams = await db
    .select({ id: teams.id, name: teams.name, leaderId: teams.leaderId })
    .from(teams)
    .where(and(eq(teams.eventId, eventId), eq(teams.status, TeamStatus.FORMING)));

  let lockedCount = 0;
  let disqualifiedCount = 0;

  for (const team of formingTeams) {
    await db.transaction(async (tx) => {
      // Load current members
      const members = await tx
        .select({
          userId: teamMembers.userId,
          fullName: users.fullName,
          rollNumber: users.rollNumber,
          joinedAt: teamMembers.joinedAt,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, team.id))
        .orderBy(asc(teamMembers.joinedAt));

      const now = new Date();

      if (members.length >= minTeamSize) {
        // Lock team and snapshot
        await tx
          .update(teams)
          .set({ status: TeamStatus.LOCKED, lockedAt: now })
          .where(eq(teams.id, team.id));

        const snapshotData = {
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
          teamId: team.id,
          snapshot: snapshotData,
          createdAt: now,
        });

        lockedCount++;

        try {
          getIO().to(`team:${team.id}`).emit('team:update' as any, {
            teamId: team.id,
            action: 'ROSTER_LOCKED',
            lockedAt: now.toISOString(),
          });
        } catch {
          // Ignore
        }
      } else {
        // Disqualify under-minimum team
        await tx
          .update(teams)
          .set({ status: TeamStatus.DISQUALIFIED })
          .where(eq(teams.id, team.id));

        disqualifiedCount++;

        // Enqueue comms notification to all team members
        for (const member of members) {
          await tx
            .insert(notifications)
            .values({
              userId: member.userId,
              eventId: event.id,
              kind: NotificationKind.STRIKE_NOTICE,
              channel: NotificationChannel.EMAIL,
              payload: {
                type: 'TEAM_DISQUALIFIED',
                teamName: team.name,
                eventTitle: event.title,
                reason: `Failed to meet minimum team size of ${minTeamSize} members before check-in closed.`,
              },
              status: 'QUEUED',
              runAt: now,
            })
            .onConflictDoNothing();
        }

        try {
          getIO().to(`team:${team.id}`).emit('team:update' as any, {
            teamId: team.id,
            action: 'TEAM_DISQUALIFIED',
            reason: `Minimum team size (${minTeamSize}) not reached`,
          });
        } catch {
          // Ignore
        }
      }
    });
  }

  return { lockedCount, disqualifiedCount };
}
