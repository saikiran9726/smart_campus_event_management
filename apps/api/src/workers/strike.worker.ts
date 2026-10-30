import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { sweepEventStrikes } from '../modules/strikes/service';

const ADVISORY_LOCK_ID = 800103;

/**
 * Runs a single strike evaluation sweep on completed events.
 */
export async function runStrikeSweepOnce(): Promise<number> {
  const lockRes = await db.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS locked`
  );

  if (!lockRes.rows[0]?.locked) {
    return 0;
  }

  try {
    return await sweepEventStrikes();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`);
  }
}

/**
 * Starts periodic strike engine worker (every 5 minutes).
 */
export function startStrikeWorker(intervalMs = 300000): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      await runStrikeSweepOnce();
    } catch (err) {
      console.error('[StrikeWorker] Sweep error:', err);
    }
  }, intervalMs);

  timer.unref();
  return timer;
}
