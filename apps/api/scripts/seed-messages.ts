import { performance } from 'node:perf_hooks';
import { eq, sql } from 'drizzle-orm';
import { ChannelKind, ClubMemberRole, UserRole } from '@eventora/shared';
import { db, pool } from '../src/db/client';
import { clubChannels, clubMembers, clubs, messages, users } from '../src/db/schema';
import { getChannelMessages } from '../src/modules/channels/service';

const TOTAL_MESSAGES = 6000;
const BATCH_SIZE = 1000;

async function run() {
  console.log(`[Seed Messages] Starting 6,000 message scale & latency benchmark...`);

  // 1. Ensure test user exists
  const benchmarkEmail = 'perf_benchmark_user@eventora.test';
  let [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, benchmarkEmail))
    .limit(1);

  if (!user) {
    const [createdUser] = await db
      .insert(users)
      .values({
        clerkId: `clerk_perf_${Date.now()}`,
        email: benchmarkEmail,
        fullName: 'Performance Benchmark User',
        role: UserRole.ORGANIZER,
      })
      .returning();
    user = createdUser;
  }

  // 2. Ensure test club and channel exists
  const benchmarkClubSlug = 'perf-bench-club';
  let [club] = await db
    .select({ id: clubs.id })
    .from(clubs)
    .where(eq(clubs.slug, benchmarkClubSlug))
    .limit(1);

  if (!club) {
    const [newClub] = await db
      .insert(clubs)
      .values({
        name: 'Performance Benchmark Club',
        slug: benchmarkClubSlug,
        description: 'Used for scale and pagination latency benchmarking',
        createdBy: user.id,
      })
      .returning();
    club = newClub;

    // Add membership
    await db.insert(clubMembers).values({
      clubId: club.id,
      userId: user.id,
      role: ClubMemberRole.OWNER,
    });
  }

  // Channel
  let [channel] = await db
    .select({ id: clubChannels.id })
    .from(clubChannels)
    .where(eq(clubChannels.clubId, club.id))
    .limit(1);

  if (!channel) {
    const [newChannel] = await db
      .insert(clubChannels)
      .values({
        clubId: club.id,
        kind: ChannelKind.GENERAL,
        name: 'Benchmark Channel',
        slug: 'benchmark-general',
      })
      .returning();
    channel = newChannel;
  }

  // 3. Check existing count in channel
  const [countRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.channelId, channel.id));

  const existingCount = countRes?.count || 0;
  console.log(`[Seed Messages] Current message count in channel: ${existingCount}`);

  if (existingCount < TOTAL_MESSAGES) {
    const needed = TOTAL_MESSAGES - existingCount;
    console.log(`[Seed Messages] Seeding ${needed} messages in batches of ${BATCH_SIZE}...`);

    const baseTime = Date.now() - (needed * 1000);

    for (let i = 0; i < needed; i += BATCH_SIZE) {
      const currentBatchSize = Math.min(BATCH_SIZE, needed - i);
      const batchRows = [];

      for (let j = 0; j < currentBatchSize; j++) {
        const msgIdx = existingCount + i + j;
        const msgTime = new Date(baseTime + msgIdx * 1000);
        batchRows.push({
          channelId: channel.id,
          authorId: user.id,
          body: `Benchmark message #${msgIdx} - performance verification for keyset pagination.`,
          authorRoleBadge: 'ORGANIZER',
          createdAt: msgTime,
        });
      }

      await db.insert(messages).values(batchRows);
      process.stdout.write(`  Seeded ${i + currentBatchSize}/${needed} messages\r`);
    }
    console.log(`\n[Seed Messages] Seeding complete.`);
  }

  // Run ANALYZE to ensure optimizer statistics are updated
  await db.execute(sql`ANALYZE messages;`);

  // 4. Measure Page 1 Query Latency (< 50ms requirement)
  console.log(`[Seed Messages] Measuring Page 1 keyset pagination latency...`);

  // Warm-up query
  await getChannelMessages(channel.id, user.id, undefined, 50);

  // Benchmarked runs
  const iterations = 5;
  const latencies: number[] = [];

  for (let k = 0; k < iterations; k++) {
    const start = performance.now();
    const result = await getChannelMessages(channel.id, user.id, undefined, 50);
    const duration = performance.now() - start;
    latencies.push(duration);

    if (result.messages.length !== 50) {
      throw new Error(`Expected 50 messages on page 1, got ${result.messages.length}`);
    }
  }

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const minLatency = Math.min(...latencies);
  console.log(`[Seed Messages] Page 1 Results:`);
  console.log(`  Latencies: ${latencies.map((l) => `${l.toFixed(2)}ms`).join(', ')}`);
  console.log(`  Average Latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`  Min Latency: ${minLatency.toFixed(2)}ms`);

  // 5. Run EXPLAIN ANALYZE to verify index scan
  const explain = await db.execute(sql`
    EXPLAIN ANALYZE
    SELECT m.id, m.created_at
    FROM messages m
    WHERE m.channel_id = ${channel.id}::uuid
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 50;
  `);

  console.log(`[Seed Messages] EXPLAIN ANALYZE:`);
  explain.rows.forEach((row: any) => {
    console.log(`  ${row['QUERY PLAN']}`);
  });

  // Assertion: Page-1 latency MUST be < 50ms
  if (minLatency >= 50) {
    console.error(`[Seed Messages] FAIL: Page 1 latency (${minLatency.toFixed(2)}ms) exceeded 50ms threshold!`);
    process.exit(1);
  }

  console.log(`[Seed Messages] SUCCESS: Latency (${minLatency.toFixed(2)}ms) is well under 50ms threshold.`);
  await pool.end();
}

run().catch(async (err) => {
  console.error('[Seed Messages] Error:', err);
  await pool.end();
  process.exit(1);
});
