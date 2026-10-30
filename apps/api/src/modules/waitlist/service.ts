import { and, asc, eq, sql } from 'drizzle-orm';
import {
  NotificationChannel,
  NotificationKind,
  RegistrationStatus,
  WAITLIST_OFFER_MINUTES,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  events,
  notifications,
  registrations,
  WaitlistEntry,
  waitlistEntries,
} from '../../db/schema';

export interface ReleaseSeatResult {
  promoted: boolean;
  waitlistEntryId?: string;
  userId?: string;
  registrationId?: string;
  remainingCapacity?: number;
}

/**
 * Calculates a participant's exact 1-based sequential position in the waitlist queue
 * using deterministic (created_at, id) tie-breaking.
 */
export async function calculateWaitlistPosition(
  tx: any,
  eventId: string,
  entryId: string,
  _createdAt?: Date
): Promise<number> {
  const [result] = await tx
    .select({
      position: sql<number>`count(*)::int`,
    })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.eventId, eventId),
        eq(waitlistEntries.status, 'QUEUED'),
        sql`(
          ${waitlistEntries.createdAt} < (SELECT created_at FROM waitlist_entries WHERE id = ${entryId})
          OR (
            ${waitlistEntries.createdAt} = (SELECT created_at FROM waitlist_entries WHERE id = ${entryId})
            AND ${waitlistEntries.id} <= ${entryId}
          )
        )`
      )
    );

  return Number(result?.position ?? 1);
}

/**
 * Atomically releases a seat for an event:
 * 1. Checks if a participant is QUEUED in waitlist using FOR UPDATE SKIP LOCKED.
 *    If found: marks entry & registration OFFERED with a 20-minute expiry window,
 *    enqueues WAITLIST_OFFER notification, and does NOT increment remaining_capacity.
 * 2. If no participant is queued: increments remaining_capacity by 1 (up to capacity).
 */
export async function releaseSeat(
  tx: any,
  eventId: string
): Promise<ReleaseSeatResult> {
  // Query next queued entry in chronological order with row locking
  const [queued] = await tx
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.eventId, eventId),
        eq(waitlistEntries.status, 'QUEUED')
      )
    )
    .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id))
    .limit(1)
    .for('update', { skipLocked: true });

  if (queued) {
    const offeredAt = new Date();
    const offerExpiresAt = new Date(
      offeredAt.getTime() + WAITLIST_OFFER_MINUTES * 60 * 1000
    );

    // Update waitlist entry to OFFERED
    await tx
      .update(waitlistEntries)
      .set({
        status: 'OFFERED',
        promotedAt: offeredAt,
      })
      .where(eq(waitlistEntries.id, queued.id));

    // Update registration to OFFERED
    await tx
      .update(registrations)
      .set({
        status: RegistrationStatus.OFFERED,
        offeredAt,
        offerExpiresAt,
      })
      .where(eq(registrations.id, queued.registrationId));

    // Enqueue WAITLIST_OFFER notification
    await tx.insert(notifications).values({
      userId: queued.userId,
      kind: NotificationKind.WAITLIST_OFFER,
      channel: NotificationChannel.EMAIL,
      payload: {
        eventId,
        registrationId: queued.registrationId,
        offerExpiresAt: offerExpiresAt.toISOString(),
      },
      status: 'QUEUED',
    });

    return {
      promoted: true,
      waitlistEntryId: queued.id,
      userId: queued.userId,
      registrationId: queued.registrationId,
    };
  }

  // No participants waiting: increment available seat capacity
  const [updatedEvent] = await tx
    .update(events)
    .set({
      remainingCapacity: sql`${events.remainingCapacity} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(events.id, eventId),
        sql`${events.remainingCapacity} < ${events.capacity}`
      )
    )
    .returning({ remainingCapacity: events.remainingCapacity });

  return {
    promoted: false,
    remainingCapacity: updatedEvent?.remainingCapacity,
  };
}

/**
 * Retrieves live waitlist status and position for a user on a given event.
 */
export async function getLiveWaitlistPosition(
  userId: string,
  eventId: string
): Promise<{ waitlisted: boolean; position?: number; entry?: WaitlistEntry }> {
  const [entry] = await db
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.eventId, eventId),
        eq(waitlistEntries.userId, userId),
        eq(waitlistEntries.status, 'QUEUED')
      )
    )
    .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id))
    .limit(1);

  if (!entry) {
    return { waitlisted: false };
  }

  const position = await calculateWaitlistPosition(
    db,
    eventId,
    entry.id,
    entry.createdAt
  );

  return {
    waitlisted: true,
    position,
    entry,
  };
}
