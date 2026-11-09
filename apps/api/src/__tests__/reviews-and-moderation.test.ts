import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventStatus, RegistrationStatus, TicketStatus, UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { clubs, events, registrations, reviews, reviewReports, tickets, users } from '../db/schema';
import { buildServer } from '../server';

describe('Area 2: Star Ratings, Public Comments, and Moderation', () => {
  const server = buildServer();
  const ts = Date.now();

  let adminUser: any;
  let regularStudent: any;
  let checkedInStudent: any;
  let testClub: any;
  let concludedEvent: any;
  let ongoingEvent: any;
  let createdReviewId: string;

  beforeAll(async () => {
    await server.ready();

    // 1. Admin user
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_admin_rev_${ts}`,
        email: `admin_rev_${ts}@campus.edu`,
        fullName: 'Admin Reviews',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin;

    // 2. Regular student (not checked in)
    const [std1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_std1_rev_${ts}`,
        email: `std1_rev_${ts}@campus.edu`,
        fullName: 'Unchecked Student',
        role: UserRole.STUDENT,
      })
      .returning();
    regularStudent = std1;

    // 3. Checked-in student
    const [std2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_std2_rev_${ts}`,
        email: `std2_rev_${ts}@campus.edu`,
        fullName: 'Attended Student',
        role: UserRole.STUDENT,
      })
      .returning();
    checkedInStudent = std2;

    // 4. Club
    const [clb] = await db
      .insert(clubs)
      .values({
        name: `Review Club ${ts}`,
        slug: `review-club-${ts}`,
        description: 'Testing reviews and ratings',
      })
      .returning();
    testClub = clb;

    const now = new Date();

    // 5. Concluded event (ended yesterday)
    const [evConcluded] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Concluded Hackathon ${ts}`,
        slug: `concluded-hackathon-${ts}`,
        description: 'Ended yesterday',
        category: 'Technical',
        startAt: new Date(now.getTime() - 86400000 * 2),
        endAt: new Date(now.getTime() - 86400000 * 1),
        registrationOpensAt: new Date(now.getTime() - 86400000 * 10),
        registrationClosesAt: new Date(now.getTime() - 86400000 * 2),
        status: EventStatus.COMPLETED,
        capacity: 100,
        remainingCapacity: 98,
        pricePaise: 0,
        isPaid: false,
        createdBy: adminUser.id,
      })
      .returning();
    concludedEvent = evConcluded;

    // 6. Ongoing event (ends tomorrow)
    const [evOngoing] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Ongoing Workshop ${ts}`,
        slug: `ongoing-workshop-${ts}`,
        description: 'Ends tomorrow',
        category: 'Technical',
        startAt: new Date(now.getTime() - 3600000),
        endAt: new Date(now.getTime() + 86400000),
        registrationOpensAt: new Date(now.getTime() - 86400000 * 2),
        registrationClosesAt: new Date(now.getTime() - 3600000),
        status: EventStatus.LIVE,
        capacity: 100,
        remainingCapacity: 98,
        pricePaise: 0,
        isPaid: false,
        createdBy: adminUser.id,
      })
      .returning();
    ongoingEvent = evOngoing;

    // 7. Register & check in checkedInStudent for concludedEvent
    const [reg] = await db
      .insert(registrations)
      .values({
        eventId: concludedEvent.id,
        userId: checkedInStudent.id,
        status: RegistrationStatus.CONFIRMED,
      })
      .returning();

    if (!reg) throw new Error('Registration creation failed');

    await db.insert(tickets).values({
      eventId: concludedEvent.id,
      userId: checkedInStudent.id,
      registrationId: reg.id,
      token: `token_${ts}_${Math.random().toString(36).slice(2, 10)}`.slice(0, 32).padEnd(32, '0'),
      status: TicketStatus.CHECKED_IN,
      checkedInAt: new Date(now.getTime() - 86400000 * 1.5),
    });

    // Also register & check in for ongoingEvent
    const [regOngoing] = await db
      .insert(registrations)
      .values({
        eventId: ongoingEvent.id,
        userId: checkedInStudent.id,
        status: RegistrationStatus.CONFIRMED,
      })
      .returning();

    if (!regOngoing) throw new Error('Ongoing registration creation failed');

    await db.insert(tickets).values({
      eventId: ongoingEvent.id,
      userId: checkedInStudent.id,
      registrationId: regOngoing.id,
      token: `token_on_${ts}_${Math.random().toString(36).slice(2, 10)}`.slice(0, 32).padEnd(32, '0'),
      status: TicketStatus.CHECKED_IN,
      checkedInAt: new Date(),
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('rejects review if event has not concluded yet', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/events/${ongoingEvent.id}/reviews`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': checkedInStudent.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: {
        stars: 5,
        comment: 'Great so far!',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error?.code || body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects review if attendee was not checked in', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/events/${concludedEvent.id}/reviews`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': regularStudent.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: {
        stars: 5,
        comment: 'I did not attend but want to rate.',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error?.code || body.code).toBe('NOT_CHECKED_IN');
  });

  it('accepts valid review from checked-in attendee for concluded event', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/events/${concludedEvent.id}/reviews`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': checkedInStudent.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: {
        stars: 5,
        comment: 'Phenomenal hackathon! Learned so much.',
        clubStars: 4,
        clubComment: 'The club team organized the logistics very smoothly.',
        showName: true,
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = res.json();
    expect(body.review).toBeDefined();
    expect(body.review.stars).toBe(5);
    expect(body.review.clubStars).toBe(4);
    expect(body.review.comment).toBe('Phenomenal hackathon! Learned so much.');
    createdReviewId = body.review.id;
  });

  it('allows public retrieval of event reviews with histogram', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/events/${concludedEvent.slug}/reviews`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.average).toBe(5);
    expect(body.histogram['5']).toBe(1);
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].comment).toBe('Phenomenal hackathon! Learned so much.');
    expect(body.reviews[0].authorName).toBe('Attended Student');
  });

  it('allows public retrieval of club reviews with club-level histogram', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/clubs/${testClub.slug}/reviews`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.clubAverage).toBe(4);
    expect(body.histogram['4']).toBe(1);
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].clubStars).toBe(4);
  });

  it('allows attendee to report review abuse', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/reviews/${createdReviewId}/report`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': regularStudent.id,
      },
      payload: {
        reason: 'Testing report functionality',
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('allows admin to list reported reviews', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/admin/reviews/reported`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': adminUser.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.reports).toBeDefined();
    const found = body.reports.find((r: any) => r.reviewId === createdReviewId);
    expect(found).toBeDefined();
    expect(found.reason).toBe('Testing report functionality');
  });

  it('allows admin to hide the review, removing it from public endpoints', async () => {
    // Hide
    const hideRes = await server.inject({
      method: 'PATCH',
      url: `/admin/reviews/${createdReviewId}/hide`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': adminUser.id,
      },
      payload: {
        hidden: true,
      },
    });

    expect(hideRes.statusCode).toBe(200);
    expect(hideRes.json().hidden).toBe(true);

    // Verify public event reviews now returns 0 reviews
    const publicRes = await server.inject({
      method: 'GET',
      url: `/public/events/${concludedEvent.slug}/reviews`,
    });

    expect(publicRes.statusCode).toBe(200);
    const publicBody = publicRes.json();
    expect(publicBody.count).toBe(0);
    expect(publicBody.reviews).toHaveLength(0);
  });

  it('allows attendee to delete their own review', async () => {
    // First unhide so it can be deleted
    await server.inject({
      method: 'PATCH',
      url: `/admin/reviews/${createdReviewId}/hide`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': adminUser.id,
      },
      payload: {
        hidden: false,
      },
    });

    const delRes = await server.inject({
      method: 'DELETE',
      url: `/events/${concludedEvent.id}/reviews/me`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': checkedInStudent.id,
      },
    });

    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().success).toBe(true);
  });
});
