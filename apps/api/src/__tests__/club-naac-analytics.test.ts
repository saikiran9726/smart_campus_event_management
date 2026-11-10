import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClubMemberRole, EventStatus, RegistrationStatus, TicketStatus, UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { clubMembers, clubs, events, registrations, reviews, tickets, users } from '../db/schema';
import { buildServer } from '../server';

describe('Area 4: Club-Wide NAAC Analytics & Metrics', () => {
  const server = buildServer();
  const ts = Date.now();

  let adminUser: any;
  let clubOwner: any;
  let facultyCoord: any;
  let regularStudent: any;
  let testClub: any;
  let event1: any;
  let event2: any;

  beforeAll(async () => {
    await server.ready();

    // 1. Admin
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_naac_admin_${ts}`,
        email: `naac_admin_${ts}@campus.edu`,
        fullName: 'NAAC Admin',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin;

    // 2. Faculty Coordinator
    const [faculty] = await db
      .insert(users)
      .values({
        clerkId: `clerk_naac_fac_${ts}`,
        email: `naac_fac_${ts}@campus.edu`,
        fullName: 'Prof. Faculty Advisor',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyCoord = faculty;

    // 3. Club Owner
    const [owner] = await db
      .insert(users)
      .values({
        clerkId: `clerk_naac_owner_${ts}`,
        email: `naac_owner_${ts}@campus.edu`,
        fullName: 'Club Lead',
        role: UserRole.ORGANIZER,
      })
      .returning();
    clubOwner = owner;

    // 4. Regular Student
    const [student] = await db
      .insert(users)
      .values({
        clerkId: `clerk_naac_student_${ts}`,
        email: `naac_student_${ts}@campus.edu`,
        fullName: 'Student Attendee',
        role: UserRole.STUDENT,
      })
      .returning();
    regularStudent = student;

    // 5. Create Test Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `NAAC Coding Society ${ts}`,
        slug: `naac-coding-${ts}`,
        description: 'NAAC test club description',
        facultyCoordinatorId: facultyCoord.id,
      })
      .returning();
    testClub = club;

    // 6. Add club membership for owner
    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: clubOwner.id,
      role: ClubMemberRole.OWNER,
    });

    // 7. Event 1 (Academic Year 2024-25: September 2024)
    const [ev1] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Autumn Hackathon ${ts}`,
        slug: `autumn-hack-${ts}`,
        description: 'Autumn Hackathon description',
        category: 'Technical',
        status: EventStatus.PUBLISHED,
        startAt: new Date('2024-09-15T09:00:00.000Z'),
        endAt: new Date('2024-09-15T18:00:00.000Z'),
        registrationOpensAt: new Date('2024-09-01T09:00:00.000Z'),
        registrationClosesAt: new Date('2024-09-14T18:00:00.000Z'),
        capacity: 100,
        remainingCapacity: 100,
        pricePaise: 0,
        isPaid: false,
      })
      .returning();
    event1 = ev1;

    // 8. Event 2 (Academic Year 2025-26: October 2025)
    const [ev2] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Spring Tech Summit ${ts}`,
        slug: `spring-summit-${ts}`,
        description: 'Spring Tech Summit description',
        category: 'Technical',
        status: EventStatus.PUBLISHED,
        startAt: new Date('2025-10-20T09:00:00.000Z'),
        endAt: new Date('2025-10-20T18:00:00.000Z'),
        registrationOpensAt: new Date('2025-10-01T09:00:00.000Z'),
        registrationClosesAt: new Date('2025-10-19T18:00:00.000Z'),
        capacity: 200,
        remainingCapacity: 200,
        pricePaise: 0,
        isPaid: false,
      })
      .returning();
    event2 = ev2;

    // 9. Create 3 CSE students (>=3 cohort) and 1 EEE student (<3 cohort) for Event 1
    for (let i = 1; i <= 3; i++) {
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_cse_${i}_${ts}`,
          email: `cse_${i}_${ts}@campus.edu`,
          fullName: `CSE Student ${i}`,
          role: UserRole.STUDENT,
          department: 'Computer Science',
        })
        .returning();

      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: event1.id,
          userId: u!.id,
          status: RegistrationStatus.CONFIRMED,
        })
        .returning();

      await db.insert(tickets).values({
        eventId: event1.id,
        userId: u!.id,
        registrationId: reg!.id,
        token: `tkn_cse_${i}_${ts}`.slice(0, 32).padEnd(32, '0'),
        status: TicketStatus.CHECKED_IN,
        checkedInAt: new Date('2024-09-15T09:10:00.000Z'),
      });
    }

    // 1 EEE student for Event 1
    const [eeeUser] = await db
      .insert(users)
      .values({
        clerkId: `clerk_eee_1_${ts}`,
        email: `eee_1_${ts}@campus.edu`,
        fullName: 'EEE Student 1',
        role: UserRole.STUDENT,
        department: 'Electrical Engineering',
      })
      .returning();

    const [eeeReg] = await db
      .insert(registrations)
      .values({
        eventId: event1.id,
        userId: eeeUser!.id,
        status: RegistrationStatus.CONFIRMED,
      })
      .returning();

    await db.insert(tickets).values({
      eventId: event1.id,
      userId: eeeUser!.id,
      registrationId: eeeReg!.id,
      token: `tkn_eee_1_${ts}`.slice(0, 32).padEnd(32, '0'),
      status: TicketStatus.CHECKED_IN,
      checkedInAt: new Date('2024-09-15T09:15:00.000Z'),
    });

    // Add 1 review for Event 1
    await db.insert(reviews).values({
      eventId: event1.id,
      userId: eeeUser!.id,
      stars: 5,
      clubStars: 4,
      comment: 'Outstanding workshop!',
      verified: true,
      showName: true,
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('enforces RBAC on GET /clubs/:clubId/analytics/naac', async () => {
    // 1. Unauthenticated -> 401
    const unauth = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/analytics/naac`,
    });
    expect(unauth.statusCode).toBe(401);

    // 2. Regular unauthorized student -> 403
    const forbidden = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/analytics/naac`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': regularStudent.id,
      },
    });
    expect(forbidden.statusCode).toBe(403);

    // 3. Faculty Coordinator -> 200
    const facultyRes = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/analytics/naac`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': facultyCoord.id,
      },
    });
    expect(facultyRes.statusCode).toBe(200);

    // 4. Club Owner -> 200
    const ownerRes = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/analytics/naac`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': clubOwner.id,
      },
    });
    expect(ownerRes.statusCode).toBe(200);

    // 5. Admin -> 200
    const adminRes = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/analytics/naac`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': adminUser.id,
      },
    });
    expect(adminRes.statusCode).toBe(200);
  });

  it('aggregates NAAC metrics and enforces privacy suppression (< 3)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/analytics/naac?academicYear=2024-25`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': clubOwner.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    expect(data.academicYear).toBe('2024-25');
    expect(data.club.id).toBe(testClub.id);
    expect(data.eventsCount).toBe(1);
    expect(data.totalRegistered).toBe(4);
    expect(data.totalAttended).toBe(4);
    expect(data.overallAttendanceRate).toBe(100);

    // Review metrics
    expect(data.ratings.averageEventRating).toBe(5);
    expect(data.ratings.averageClubRating).toBe(4);
    expect(data.ratings.reviewCount).toBe(1);

    // Demographics privacy rule:
    // Computer Science had 3 attendees -> count: 3, displayLabel: "3"
    // Electrical Engineering had 1 attendee (< 3) -> suppressed into "Other Cohorts"
    const cseBucket = data.demographics.buckets.find((b: any) => b.department === 'Computer Science');
    expect(cseBucket).toBeDefined();
    expect(cseBucket.count).toBe(3);
    expect(cseBucket.displayLabel).toBe('3');

    const otherBucket = data.demographics.buckets.find((b: any) => b.department === 'Other Cohorts');
    expect(otherBucket).toBeDefined();
    expect(otherBucket.count).toBeNull();
    expect(otherBucket.displayLabel).toContain('< 3');
  });

  it('filters accurately by Academic Year', async () => {
    // 2025-26 has Event 2 with 0 registrations
    const res = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/analytics/naac?academicYear=2025-26`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': adminUser.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    expect(data.academicYear).toBe('2025-26');
    expect(data.eventsCount).toBe(1);
    expect(data.totalRegistered).toBe(0);
    expect(data.totalAttended).toBe(0);
    expect(data.overallAttendanceRate).toBe(0);
  });
});
