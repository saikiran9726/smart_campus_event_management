import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  NotificationChannel,
  NotificationKind,
  RegistrationStatus,
  STRIKE_COOLDOWN_DAYS,
  STRIKE_THRESHOLD,
  TicketStatus,
} from '@eventora/shared';
import { db, withTx } from '../../db/client';
import {
  events,
  notifications,
  registrations,
  tickets,
  users,
} from '../../db/schema';

export interface ProcessEventStrikesResult {
  processed: boolean;
  attendedCount: number;
  noShowCount: number;
  cooldownAppliedCount: number;
}

/**
 * Idempotently evaluates attendance and strikes for a completed event.
 */
export async function processEventStrikes(
  tx: any,
  eventId: string
): Promise<ProcessEventStrikesResult> {
  // 1. Idempotency gate: set strikes_processed_at if not yet set
  const [locked] = await tx
    .update(events)
    .set({ strikesProcessedAt: new Date() })
    .where(
      and(
        eq(events.id, eventId),
        isNull(events.strikesProcessedAt)
      )
    )
    .returning({ id: events.id });

  if (!locked) {
    return {
      processed: false,
      attendedCount: 0,
      noShowCount: 0,
      cooldownAppliedCount: 0,
    };
  }

  // 2. Select all CONFIRMED registrations with ticket status
  const confirmedRows = await tx
    .select({
      registrationId: registrations.id,
      userId: registrations.userId,
      ticketId: tickets.id,
      ticketStatus: tickets.status,
    })
    .from(registrations)
    .leftJoin(tickets, eq(tickets.registrationId, registrations.id))
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.status, RegistrationStatus.CONFIRMED)
      )
    );

  let attendedCount = 0;
  let noShowCount = 0;
  let cooldownAppliedCount = 0;

  for (const row of confirmedRows) {
    if (row.ticketStatus === TicketStatus.CHECKED_IN) {
      // Participant attended: reset consecutive no-shows to 0
      await tx
        .update(users)
        .set({ consecutiveNoShows: 0 })
        .where(eq(users.id, row.userId));
      attendedCount++;
    } else {
      // Participant failed to check in: mark NO_SHOW and increment penalty counters
      noShowCount++;

      // Update registration to NO_SHOW
      await tx
        .update(registrations)
        .set({ status: RegistrationStatus.NO_SHOW })
        .where(eq(registrations.id, row.registrationId));

      // Void ticket if present
      if (row.ticketId) {
        await tx
          .update(tickets)
          .set({ status: TicketStatus.VOID })
          .where(eq(tickets.id, row.ticketId));
      }

      // Fetch user to calculate strikes and cooldown
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, row.userId))
        .limit(1)
        .for('update');

      if (user) {
        const nextStrikes = user.strikeCount + 1;
        const nextConsecutive = user.consecutiveNoShows + 1;
        let cooldownUntil = user.cooldownUntil;

        if (nextConsecutive >= STRIKE_THRESHOLD) {
          cooldownAppliedCount++;
          cooldownUntil = new Date(
            Date.now() + STRIKE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
          );

          // Enqueue strike penalty notice
          await tx.insert(notifications).values({
            userId: user.id,
            kind: NotificationKind.STRIKE_NOTICE,
            channel: NotificationChannel.EMAIL,
            payload: {
              strikeCount: nextStrikes,
              consecutiveNoShows: nextConsecutive,
              cooldownUntil: cooldownUntil.toISOString(),
            },
            status: 'QUEUED',
          });
        }

        await tx
          .update(users)
          .set({
            strikeCount: nextStrikes,
            consecutiveNoShows: nextConsecutive,
            cooldownUntil,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
      }
    }
  }

  return {
    processed: true,
    attendedCount,
    noShowCount,
    cooldownAppliedCount,
  };
}

/**
 * Sweeps all completed events whose end time is older than 30 minutes ago
 * and processes strikes idempotently.
 */
export async function sweepEventStrikes(): Promise<number> {
  const eligibleEvents = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        sql`${events.endAt} < now() - interval '30 minutes'`,
        isNull(events.strikesProcessedAt)
      )
    );

  let processedCount = 0;
  for (const ev of eligibleEvents) {
    const res = await withTx((tx) => processEventStrikes(tx, ev.id));
    if (res.processed) {
      processedCount++;
    }
  }

  return processedCount;
}
