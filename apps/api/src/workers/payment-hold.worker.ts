import { and, eq, sql } from 'drizzle-orm';
import { PaymentStatus, RegistrationStatus } from '@eventora/shared';
import { db, withTx } from '../db/client';
import { registrations } from '../db/schema';
import { releaseSeat } from '../modules/waitlist/service';

const ADVISORY_LOCK_ID = 800102;

/**
 * Sweeps paid registrations with unpaid payment holds older than 10 minutes,
 * releases held seats back to capacity or waitlist queue.
 */
export async function runPaymentHoldSweepOnce(): Promise<number> {
  const lockRes = await db.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS locked`
  );

  if (!lockRes.rows[0]?.locked) {
    return 0;
  }

  try {
    const expiredHolds = await db
      .select({
        id: registrations.id,
        eventId: registrations.eventId,
      })
      .from(registrations)
      .where(
        and(
          eq(registrations.paymentStatus, PaymentStatus.PENDING),
          sql`${registrations.createdAt} <= now() - interval '10 minutes'`
        )
      );

    let releasedCount = 0;

    for (const hold of expiredHolds) {
      await withTx(async (tx) => {
        const [reg] = await tx
          .select()
          .from(registrations)
          .where(
            and(
              eq(registrations.id, hold.id),
              eq(registrations.paymentStatus, PaymentStatus.PENDING),
              sql`${registrations.createdAt} <= now() - interval '10 minutes'`
            )
          )
          .limit(1)
          .for('update', { skipLocked: true });

        if (!reg) {
          return;
        }

        // Cancel expired pending registration
        await tx
          .update(registrations)
          .set({
            status: RegistrationStatus.EXPIRED,
            paymentStatus: PaymentStatus.FAILED,
            cancelledAt: new Date(),
          })
          .where(eq(registrations.id, reg.id));

        // Release seat back to queue or capacity
        await releaseSeat(tx, reg.eventId);
        releasedCount++;
      });
    }

    return releasedCount;
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`);
  }
}

/**
 * Starts periodic payment hold cleaner (every 30 seconds).
 */
export function startPaymentHoldWorker(intervalMs = 30000): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      await runPaymentHoldSweepOnce();
    } catch (err) {
      console.error('[PaymentHoldWorker] Sweep error:', err);
    }
  }, intervalMs);

  timer.unref();
  return timer;
}
