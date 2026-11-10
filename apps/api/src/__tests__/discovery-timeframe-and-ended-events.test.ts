import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventStatus, UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { clubs, events, users } from '../db/schema';
import { buildServer } from '../server';

describe('Area 1: Discovery Timeframe Filters & Concluded Event Registration Rejection', () => {
  const server = buildServer();

  const ts = Date.now();
  const testCategory = `Cat_${ts}`;

  let organizer: any;
  let student: any;
  let testClub: any;
  let upcomingEventEarly: any;
  let upcomingEventLate: any;
  let pastEventRecent: any;
  let pastEventOlder: any;

  beforeAll(async () => {
    await server.ready();

    // Create organizer & student
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_disc_${ts}`,
        email: `org_disc_${ts}@campus.edu`,
        fullName: 'Discovery Org',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizer = org;

    const [std] = await db
      .insert(users)
      .values({
        clerkId: `clerk_std_disc_${ts}`,
        email: `std_disc_${ts}@campus.edu`,
        fullName: 'Discovery Student',
        role: UserRole.STUDENT,
      })
      .returning();
    student = std;

    const [clb] = await db
      .insert(clubs)
      .values({
        name: `Timeframe Test Club ${ts}`,
        slug: `timeframe-club-${ts}`,
        description: 'Testing timeframe queries',
      })
      .returning();
    testClub = clb;

    const now = new Date();

    // Past event older (ended 10 days ago)
    const [peOlder] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Past Event Older ${ts}`,
        slug: `past-older-${ts}`,
        description: 'Concluded 10 days ago',
        category: testCategory,
        startAt: new Date(now.getTime() - 86400000 * 12),
        endAt: new Date(now.getTime() - 86400000 * 10),
        registrationOpensAt: new Date(now.getTime() - 86400000 * 15),
        registrationClosesAt: new Date(now.getTime() - 86400000 * 12),
        status: EventStatus.COMPLETED,
        capacity: 100,
        remainingCapacity: 100,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizer.id,
      })
      .returning();
    pastEventOlder = peOlder;

    // Past event recent (ended 2 days ago)
    const [peRecent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Past Event Recent ${ts}`,
        slug: `past-recent-${ts}`,
        description: 'Concluded 2 days ago',
        category: testCategory,
        startAt: new Date(now.getTime() - 86400000 * 3),
        endAt: new Date(now.getTime() - 86400000 * 2),
        registrationOpensAt: new Date(now.getTime() - 86400000 * 5),
        registrationClosesAt: new Date(now.getTime() - 86400000 * 3),
        status: EventStatus.PUBLISHED,
        capacity: 100,
        remainingCapacity: 100,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizer.id,
      })
      .returning();
    pastEventRecent = peRecent;

    // Upcoming event early (starts tomorrow)
    const [ueEarly] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Upcoming Early ${ts}`,
        slug: `up-early-${ts}`,
        description: 'Starts tomorrow',
        category: testCategory,
        startAt: new Date(now.getTime() + 86400000 * 1),
        endAt: new Date(now.getTime() + 86400000 * 2),
        registrationOpensAt: new Date(now.getTime() - 3600000),
        registrationClosesAt: new Date(now.getTime() + 86400000 * 1),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizer.id,
      })
      .returning();
    upcomingEventEarly = ueEarly;

    // Upcoming event late (starts in 5 days)
    const [ueLate] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Upcoming Late ${ts}`,
        slug: `up-late-${ts}`,
        description: 'Starts in 5 days',
        category: testCategory,
        startAt: new Date(now.getTime() + 86400000 * 5),
        endAt: new Date(now.getTime() + 86400000 * 6),
        registrationOpensAt: new Date(now.getTime() - 3600000),
        registrationClosesAt: new Date(now.getTime() + 86400000 * 5),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizer.id,
      })
      .returning();
    upcomingEventLate = ueLate;
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /events?timeframe=upcoming orders ascending by startAt and excludes past events', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events?timeframe=upcoming&category=${testCategory}&limit=50`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids = body.items.map((i: any) => i.id);

    expect(ids).toEqual([upcomingEventEarly.id, upcomingEventLate.id]);
  });

  it('GET /events?timeframe=past orders descending by startAt and excludes upcoming events', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events?timeframe=past&category=${testCategory}&limit=50`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids = body.items.map((i: any) => i.id);

    // Recent past event comes first, then older past event (descending)
    expect(ids).toEqual([pastEventRecent.id, pastEventOlder.id]);

    // Past events must have isPast = true
    const pastItem = body.items.find((i: any) => i.id === pastEventRecent.id);
    expect(pastItem.isPast).toBe(true);
  });

  it('GET /events?timeframe=all includes both upcoming and past events descending', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events?timeframe=all&category=${testCategory}&limit=50`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids = body.items.map((i: any) => i.id);

    // Descending order across all: latest upcoming down to oldest past
    expect(ids).toEqual([
      upcomingEventLate.id,
      upcomingEventEarly.id,
      pastEventRecent.id,
      pastEventOlder.id,
    ]);
  });

  it('rejects registration for an event that has already ended with a clear error', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/events/${pastEventRecent.id}/registrations`,
      headers: {
        'x-test-user-id': student.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errorMessage = body.error?.message || body.message;
    expect(errorMessage).toMatch(/Cannot register for an event that has already ended/i);
  });
});
