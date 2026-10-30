process.env.NODE_ENV = 'test';

import { eq } from 'drizzle-orm';
import { EventStatus, UserRole } from '@eventora/shared';
import { db, pool } from '../apps/api/src/db/client';
import { clubs, events, registrations, users, waitlistEntries } from '../apps/api/src/db/schema';
import { buildServer } from '../apps/api/src/server';

async function runHeadlessConcurrency(): Promise<void> {
  const server = buildServer();
  await server.ready();

  const timestamp = Date.now();
  const eventSlug = `viva-concurrency-${timestamp}`;

  const [club] = await db.select({ id: clubs.id }).from(clubs).limit(1);
  const clubId = club ? club.id : '00000000-0000-0000-0000-000000000001';

  // 1. Create test event with capacity = 1
  const createRes = await server.inject({
    method: 'POST',
    url: '/events',
    headers: {
      'x-test-user-id': 'user_admin_001',
    },
    payload: {
      clubId,
      title: 'Viva Concurrency 1-Seat Rush',
      slug: eventSlug,
      capacity: 1,
      startAt: new Date(Date.now() + 86400000).toISOString(),
      endAt: new Date(Date.now() + 172800000).toISOString(),
      category: 'Tech',
    },
  });

  if (createRes.statusCode !== 201) {
    console.error('Failed to create test event:', createRes.body);
    process.exit(1);
  }

  const { event } = JSON.parse(createRes.body);
  const eventId = event.id;

  // Publish event
  await db
    .update(events)
    .set({
      status: EventStatus.PUBLISHED,
      registrationOpensAt: new Date(Date.now() - 3600000),
      registrationClosesAt: new Date(Date.now() + 86400000),
    })
    .where(eq(events.id, eventId));

  // 2. Seed 10 distinct users for the concurrency trial
  const trialCount = 10;
  const userIds: string[] = [];
  for (let i = 0; i < trialCount; i++) {
    const [u] = await db
      .insert(users)
      .values({
        clerkId: `clerk_viva_user_${timestamp}_${i}`,
        email: `viva_${timestamp}_${i}@campus.edu`,
        fullName: `Viva Racer ${i}`,
        role: UserRole.STUDENT,
      })
      .returning();
    userIds.push(u!.id);
  }

  // Fire 10 simultaneous registration requests
  const promises = userIds.map((userId) =>
    server.inject({
      method: 'POST',
      url: `/events/${eventId}/registrations`,
      headers: {
        'x-test-user-id': userId,
        'cf-turnstile-response': 'test-pass',
      },
      payload: {
        answers: {},
      },
    })
  );

  const responses = await Promise.all(promises);

  // 3. Query DB state directly
  const [eventRow] = await db
    .select({
      capacity: events.capacity,
      remainingCapacity: events.remainingCapacity,
    })
    .from(events)
    .where(eq(events.id, eventId));

  const allRegs = await db
    .select({
      id: registrations.id,
      status: registrations.status,
    })
    .from(registrations)
    .where(eq(registrations.eventId, eventId));

  const confirmedCount = allRegs.filter((r) => r.status === 'CONFIRMED').length;
  const waitlistedCount = allRegs.filter((r) => r.status === 'WAITLISTED').length;
  const remaining = eventRow ? eventRow.remainingCapacity : 0;

  console.log(`[+] Concurrency Trial Complete:`);
  console.log(`--------------------------------------------------`);
  console.log(`Simultaneous Requests:    ${trialCount}`);
  console.log(`Confirmed Registrations:  ${confirmedCount}`);
  console.log(`Waitlisted Registrations: ${waitlistedCount}`);
  console.log(`Remaining Capacity:       ${remaining}`);
  console.log(`--------------------------------------------------`);
  console.log(`concurrency result with exactly 1 confirmed and remaining capacity 0.`);

  await server.close();
  await pool.end();

  if (confirmedCount === 1 && remaining === 0) {
    process.exit(0);
  } else {
    console.error(`[-] Invariant failed: expected confirmed=1, remaining=0`);
    process.exit(1);
  }
}

void runHeadlessConcurrency();
