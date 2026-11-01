import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  ProposalStatus,
  RegistrationStatus,
  TicketStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  budgetAllocations,
  certificates,
  clubMembers,
  clubs,
  eventProposals,
  events,
  expenseItems,
  odLetters,
  registrations,
  tickets,
  users,
  venues,
} from '../db/schema';
import { buildServer } from '../server';

describe('Prompt 25: Exhaustive GET Endpoints Integration Suite (Real DB, server.inject)', () => {
  const server = buildServer();

  let adminUser: any;
  let organizerUser: any;
  let facultyUser: any;
  let studentUser: any;
  let testClub: any;
  let testVenue: any;
  let testEvent: any;
  let testRegistration: any;
  let testTicket: any;
  let testCert: any;
  let testOd: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Setup Admin
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_admin_${ts}`,
        email: `admin_${ts}@campus.edu`,
        fullName: 'Admin User',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin;

    // 2. Setup Faculty
    const [fac] = await db
      .insert(users)
      .values({
        clerkId: `clerk_fac_${ts}`,
        email: `faculty_${ts}@campus.edu`,
        fullName: 'Dr. Faculty Coordinator',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyUser = fac;

    // 3. Setup Organizer
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_${ts}`,
        email: `organizer_${ts}@campus.edu`,
        fullName: 'Organizer Lead',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    // 4. Setup Student
    const [stu] = await db
      .insert(users)
      .values({
        clerkId: `clerk_stu_${ts}`,
        email: `student_${ts}@campus.edu`,
        fullName: 'Student Attendee',
        role: UserRole.STUDENT,
        rollNumber: `22CS${ts.toString().slice(-4)}`,
        department: 'Computer Science',
      })
      .returning();
    studentUser = stu;

    // 5. Setup Club & Memberships
    const [c] = await db
      .insert(clubs)
      .values({
        name: `Robotics Club ${ts}`,
        slug: `robotics-${ts}`,
        description: 'Building autonomous robots and IoT devices.',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = c;

    await db.insert(clubMembers).values([
      { clubId: testClub.id, userId: organizerUser.id, role: ClubMemberRole.OWNER },
      { clubId: testClub.id, userId: studentUser.id, role: ClubMemberRole.MEMBER },
    ]);

    // 6. Setup Venue
    const [v] = await db
      .insert(venues)
      .values({
        name: `Auditorium Prime ${ts}`,
        capacity: 500,
        locationText: 'Main Academic Block 3F',
        mapUrl: 'https://maps.google.com',
      })
      .returning();
    testVenue = v;

    // 7. Setup Event
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Campus AI Summit ${ts}`,
        slug: `ai-summit-${ts}`,
        description: 'Annual gathering of campus AI researchers.',
        status: EventStatus.PUBLISHED,
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 172800000),
        registrationOpensAt: new Date(),
        registrationClosesAt: new Date(Date.now() + 86400000),
        capacity: 100,
        remainingCapacity: 99,
        pricePaise: 0,
        isPaid: false,
        isCompetition: true,
        category: 'Tech',
      })
      .returning();
    testEvent = ev;

    // 8. Setup Registration & Ticket
    const [reg] = await db
      .insert(registrations)
      .values({
        eventId: testEvent.id,
        userId: studentUser.id,
        status: RegistrationStatus.CONFIRMED,
      })
      .returning();
    testRegistration = reg;

    const [tkt] = await db
      .insert(tickets)
      .values({
        registrationId: testRegistration.id,
        eventId: testEvent.id,
        userId: studentUser.id,
        token: `ev_tok_${ts.toString().slice(-10)}_${Math.random().toString(36).substring(2, 17)}`,
        status: TicketStatus.CHECKED_IN,
        checkedInAt: new Date(),
      })
      .returning();
    testTicket = tkt;

    // 9. Setup Certificate
    const [cert] = await db
      .insert(certificates)
      .values({
        eventId: testEvent.id,
        userId: studentUser.id,
        kind: 'PARTICIPATION',
        issuedAt: new Date(),
      })
      .returning();
    testCert = cert;

    // 10. Setup OD Letter
    const [od] = await db
      .insert(odLetters)
      .values({
        eventId: testEvent.id,
        userId: studentUser.id,
        serial: `OD-${ts}-TEST`,
        signature: 'deadbeefcafe0000111122223333444455556666777788889999aaaabbbbcccc',
        issuedAt: new Date(),
      })
      .returning();
    testOd = od;

    // 11. Setup Proposal & Budget Allocation & Expense
    await db.insert(eventProposals).values({
      clubId: testClub.id,
      proposedBy: organizerUser.id,
      facultyId: facultyUser.id,
      title: 'Spring Robotics Workshop Proposal',
      description: 'Intro to microcontrollers and sensors.',
      expectedAttendance: 50,
      venueId: testVenue.id,
      startAt: new Date(Date.now() + 86400000 * 5),
      endAt: new Date(Date.now() + 86400000 * 6),
      status: ProposalStatus.PENDING,
    });

    const [alloc] = await db
      .insert(budgetAllocations)
      .values({
        clubId: testClub.id,
        category: 'Workshops',
        allocatedPaise: 500000,
      })
      .returning();

    await db.insert(expenseItems).values({
      allocationId: alloc!.id,
      amountPaise: 15000,
      category: 'Electronics Hardware',
      description: 'Arduino boards and sensors',
      receiptKey: 'receipts/test.pdf',
    });
  });

  afterAll(async () => {
    await server.close();
  });

  // --- Student / Public GET Endpoints ---
  it('GET /events returns event feed with items array', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/events',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /events/:slug returns single event details', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events/${testEvent.slug}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.event).toBeDefined();
    expect(body.event.id).toBe(testEvent.id);
  });

  it('GET /venues returns list of venues (sorted, auth required)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/venues',
      headers: { 'x-test-user-id': studentUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.venues).toBeDefined();
    expect(Array.isArray(body.venues)).toBe(true);
  });

  it('GET /av-resources returns list of AV resources (auth required)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/av-resources',
      headers: { 'x-test-user-id': studentUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resources).toBeDefined();
    expect(Array.isArray(body.resources)).toBe(true);
  });

  it('GET /me returns current user profile and role', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': studentUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(studentUser.id);
  });

  it('GET /me/passport returns student event passport', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/me/passport',
      headers: { 'x-test-user-id': studentUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.passport).toBeDefined();
  });

  it('GET /public/verify/cert/:id returns valid certificate details', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/verify/cert/${testCert.id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(testCert.id);
    expect(body.holderName).toBe('Student Attendee');
  });

  it('GET /public/verify/certificate/:id alias works identically', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/verify/certificate/${testCert.id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(testCert.id);
  });

  it('GET /public/verify/od/:serial returns OD verification data', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/verify/od/${testOd.serial}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.serial).toBe(testOd.serial);
    expect(body.studentName).toBe('Student Attendee');
  });

  // --- Organizer GET Endpoints ---
  it('GET /clubs/me returns organizer club memberships', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/clubs/me',
      headers: { 'x-test-user-id': organizerUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.clubs).toBeDefined();
    expect(body.clubs.some((cl: any) => cl.id === testClub.id)).toBe(true);
  });

  it('GET /clubs/:id/events returns club events', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/events`,
      headers: { 'x-test-user-id': organizerUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.events).toBeDefined();
    expect(body.events.length).toBeGreaterThan(0);
  });

  it('GET /clubs/:id/members returns members list', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/members`,
      headers: { 'x-test-user-id': organizerUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.members).toBeDefined();
    expect(body.members.length).toBeGreaterThan(0);
  });

  it('GET /clubs/:id/budget returns club ledger overview', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/clubs/${testClub.id}/budget`,
      headers: { 'x-test-user-id': organizerUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalAllocatedPaise).toBeDefined();
  });

  it('GET /events/:id/teams returns teams list for event organizer', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events/${testEvent.id}/teams`,
      headers: { 'x-test-user-id': organizerUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.teams).toBeDefined();
  });

  // --- Faculty GET Endpoints ---
  it('GET /faculty/proposals returns pending proposal list', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/faculty/proposals',
      headers: { 'x-test-user-id': facultyUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toBeDefined();
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('GET /faculty/pending-expenses returns pending expense queue', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/faculty/pending-expenses',
      headers: { 'x-test-user-id': facultyUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toBeDefined();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].category).toBe('Electronics Hardware');
  });

  // --- Admin GET Endpoints ---
  it('GET /admin/analytics/campus returns campus-wide metrics for ADMIN', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/admin/analytics/campus',
      headers: { 'x-test-user-id': adminUser.id },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.overview).toBeDefined();
    expect(body.overview.totalEvents).toBeDefined();
  });
});
