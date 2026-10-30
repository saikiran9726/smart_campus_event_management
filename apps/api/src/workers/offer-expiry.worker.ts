import { and, asc, eq, sql } from 'drizzle-orm';
import { RegistrationStatus } from '@eventora/shared';
import { db, withTx } from '../db/client';
import { registrations, waitlistEntries } from '../db/schema';
import { releaseSeat } from '../modules/waitlist/service';

const ADVISORY_LOCK_ID = 800101;

/**
 * Runs a single sweep to expire lapsed waitlist offers and promote the next queued participants.
 */
export async function runOfferExpirySweepOnce(): Promise<number> {
  // Acquire advisory lock to ensure single-instance execution
  const lockRes = await db.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS locked`
  );

  if (!lockRes.rows[0]?.locked) {
    return 0;
  }

  try {
    const expiredRows = await db
      .select({
        entryId: waitlistEntries.id,
        registrationId: waitlistEntries.registrationId,
        eventId: waitlistEntries.eventId,
      })
      .from(waitlistEntries)
      .innerJoin(
        registrations,
        eq(waitlistEntries.registrationId, registrations.id)
      )
      .where(
        and(
          eq(waitlistEntries.status, 'OFFERED'),
          eq(registrations.status, RegistrationStatus.OFFERED),
          sql`${registrations.offerExpiresAt} <= now()`
        )
      )
      .orderBy(asc(registrations.offerExpiresAt));

    let processedCount = 0;

    for (const row of expiredRows) {
      await withTx(async (tx) => {
        // Double check status with lock
        const [reg] = await tx
          .select()
          .from(registrations)
          .where(
            and(
              eq(registrations.id, row.registrationId),
              eq(registrations.status, RegistrationStatus.OFFERED),
              sql`${registrations.offerExpiresAt} <= now()`
            )
          )
          .limit(1)
          .for('update', { skipLocked: true });

        if (!reg) {
          return;
        }

        // 1. Mark registration EXPIRED
        await tx
          .update(registrations)
          .set({
            status: RegistrationStatus.EXPIRED,
          })
          .where(eq(registrations.id, reg.id));

        // 2. Mark waitlist entry EXPIRED
        await tx
          .update(waitlistEntries)
          .set({ status: 'EXPIRED' })
          .where(eq(waitlistEntries.id, row.entryId));

        // 3. Promote next person in line
        await releaseSeat(tx, row.eventId);
        processedCount++;
      });
    }

    return processedCount;
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`);
  }
}

/**
 * Starts periodic offer expiry worker (every 15 seconds).
 */
export function startOfferExpiryWorker(intervalMs = 15000): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      await runOfferExpirySweepOnce();
    } catch (err) {
      console.error('[OfferExpiryWorker] Sweep error:', err);
    }
  }, intervalMs);

  timer.unref();
  return timer;
}
