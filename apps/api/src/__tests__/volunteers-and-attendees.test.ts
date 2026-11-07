import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  PaymentStatus,
  QuestionType,
  RegistrationStatus,
  ScanMode,
  ScanResult,
  TicketStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubMembers,
  clubs,
  events,
  eventVolunteers,
  formQuestions,
  registrations,
  tickets,
  users,
  volunteerInvitations,
} from '../db/schema';
import { issueTicket } from '../modules/tickets/service';
import { buildServer } from '../server';

describe('Volunteer Management, Gate Assignment & Attendee Directory Operations Suite', () => {
  const server = buildServer();

  let adminUser: any;
  let organizerUser: any;
  let otherOrganizer: any;
  let volunteerUser: any;
  let attendeeUser: any;
  let secondAttendee: any;
  let testClub: any;
  let testEvent: any;
  let otherEvent: any;
  let attendeeTicket: any;
  let volunteerAssignment: any;
  let invitationToken: string;
  let volunteerScannerToken: string;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Admin User
    const [adm] = await db
      .insert(users)
      .values({
        clerkId: `clerk_adm_vol_${ts}`,
        email: `adm_vol_${ts}@campus.edu`,
        fullName: 'Admin Supervisor',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = adm;

    // 2. Organizer User
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_vol_${ts}`,
        email: `org_vol_${ts}@campus.edu`,
        fullName: 'Lead Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    // 3. Other Organizer (for isolation tests)
    const [otherOrg] = await db
      .insert(users)
      .values({
        clerkId: `clerk_other_org_${ts}`,
        email: `other_org_${ts}@campus.edu`,
        fullName: 'Unrelated Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    otherOrganizer = otherOrg;

    // 4. Volunteer User (Student)
    const [vol] = await db
      .insert(users)
      .values({
        clerkId: `clerk_vol_duty_${ts}`,
        email: `vol_duty_${ts}@campus.edu`,
        fullName: 'Sam Volunteer',
        rollNumber: `VOL_${ts}`,
        role: UserRole.STUDENT,
        department: 'Information Technology',
      })
      .returning();
    volunteerUser = vol;

    // 5. Attendees
    const [att1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_att1_${ts}`,
        email: `=cmd|' /C calc'!A0_${ts}@campus.edu`, // CWE-1236 injection attempt in email
        fullName: '+Alice FormulaInjection',          // CWE-1236 injection attempt in name
        rollNumber: `@ROLL_INJ_${ts}`,                 // CWE-1236 injection attempt in roll
        role: UserRole.STUDENT,
        department: 'Computer Science',
      })
      .returning();
    attendeeUser = att1;

    const [att2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_att2_${ts}`,
        email: `bob_safe_${ts}@campus.edu`,
        fullName: 'Bob Attendee',
        rollNumber: `ROLL_BOB_${ts}`,
        role: UserRole.STUDENT,
        department: 'Electronics',
      })
      .returning();
    secondAttendee = att2;

    // 6. Club and Events
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Operations Club ${ts}`,
        slug: `ops-club-${ts}`,
        description: 'Operations Test Club',
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: club!.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    const now = new Date();
    const [ev1] = await db
      .insert(events)
      .values({
        clubId: club!.id,
        title: `Campus Hackathon 2026 ${ts}`,
        slug: `hackathon-2026-${ts}`,
        description: 'Elite 24hr Hackathon',
        category: 'Hackathon',
        status: EventStatus.LIVE,
        capacity: 100,
        remainingCapacity: 98,
        pricePaise: 0,
        startAt: new Date(now.getTime() - 3600000),
        endAt: new Date(now.getTime() + 86400000),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
      })
      .returning();
    testEvent = ev1;

    const [ev2] = await db
      .insert(events)
      .values({
        clubId: club!.id,
        title: `Unrelated Workshop ${ts}`,
        slug: `workshop-${ts}`,
        description: 'Separate event',
        category: 'Workshop',
        status: EventStatus.LIVE,
        capacity: 50,
        remainingCapacity: 50,
        pricePaise: 0,
        startAt: new Date(now.getTime() - 3600000),
        endAt: new Date(now.getTime() + 86400000),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
      })
      .returning();
    otherEvent = ev2;

    // 7. Questions
    await db.insert(formQuestions).values({
      eventId: testEvent.id,
      label: 'T-Shirt Size',
      type: QuestionType.SINGLE_SELECT,
      position: 1,
      options: ['S', 'M', 'L', 'XL'],
    });

    // 8. Registrations & Tickets
    const [r1] = await db
      .insert(registrations)
      .values({
        eventId: testEvent.id,
        userId: attendeeUser.id,
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.SUCCEEDED,
      })
      .returning();

    attendeeTicket = await issueTicket(db, {
      id: r1!.id,
      eventId: testEvent.id,
      userId: attendeeUser.id,
    });

    await db.insert(registrations).values({
      eventId: testEvent.id,
      userId: secondAttendee.id,
      status: RegistrationStatus.WAITLISTED,
      paymentStatus: PaymentStatus.PENDING,
    });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Authoritative Attendee Directory & Search / Filters', () => {
    it('fetches attendee list with live statistics and ticket joins', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form/responses`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.items.length).toBe(2);

      // Verify authoritative stats
      expect(body.stats).toBeDefined();
      expect(body.stats.total).toBe(2);
      expect(body.stats.confirmed).toBe(1);
      expect(body.stats.waitlisted).toBe(1);
      expect(body.stats.pendingPayments).toBe(1);
      expect(body.stats.checkedIn).toBe(0);
      expect(body.stats.remainingCapacity).toBe(98);

      // Verify joined ticket details
      const confirmedItem = body.items.find((i: any) => i.status === 'CONFIRMED');
      expect(confirmedItem.ticket).toBeDefined();
      expect(confirmedItem.ticket.token).toBe(attendeeTicket.token);
      expect(confirmedItem.ticket.status).toBe(TicketStatus.VALID);
      expect(confirmedItem.studentName).toBe('+Alice FormulaInjection');
    });

    it('filters attendees by search query `q`', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees?q=Bob`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].studentName).toBe('Bob Attendee');
    });

    it('filters attendees by registration status', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees?status=WAITLISTED`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].status).toBe(RegistrationStatus.WAITLISTED);
    });

    it('enforces organizer permissions (unauthorized user gets 403)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees`,
        headers: { 'x-test-user-id': otherOrganizer.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it('neutralizes formula injection in CSV export (CWE-1236)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees/csv`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');

      const csv = res.body;
      // Formula triggers (=, +, @) must be prepended with a single quote
      expect(csv).toContain("'+Alice FormulaInjection");
      expect(csv).toContain("'@ROLL_INJ_");
      expect(csv).toContain("'=cmd|");
    });
  });

  describe('2. Volunteer Duty Provisioning & Local Activation', () => {
    it('admin assigns a volunteer to an event and receives an activation token', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/admin/volunteers',
        headers: { 'x-test-user-id': adminUser.id },
        payload: {
          eventId: testEvent.id,
          email: volunteerUser.email,
          fullName: volunteerUser.fullName,
          rollNumber: volunteerUser.rollNumber,
          gate: 'East Gate Station 1',
          role: 'SCANNER',
          notes: 'Report to Gate 1 by 8:00 AM sharp.',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.volunteer).toBeDefined();
      expect(body.volunteer.gate).toBe('East Gate Station 1');
      expect(body.volunteer.role).toBe('SCANNER');
      expect(body.volunteer.status).toBe('ACTIVE');
      expect(body.invitationToken).toMatch(/^VOL-[A-F0-9]+/);

      volunteerAssignment = body.volunteer;
      invitationToken = body.invitationToken;
    });

    it('activates invitation token offline without email delivery', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/volunteers/activate',
        payload: {
          token: invitationToken,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.volunteer.status).toBe('ACTIVE');
      expect(body.event.title).toBe(testEvent.title);
    });

    it('rejects already accepted activation tokens with 404', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/volunteers/activate',
        payload: {
          token: invitationToken,
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('admin can list and search assigned volunteers', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/admin/volunteers?eventId=${testEvent.id}`,
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeGreaterThanOrEqual(1);
      const vol = body.items.find((v: any) => v.userId === volunteerUser.id);
      expect(vol).toBeDefined();
      expect(vol.gate).toBe('East Gate Station 1');
    });
  });

  describe('3. Volunteer Self-Service & Ticket Scanning Workflow', () => {
    it('volunteer sees only their assigned events on their dashboard', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/me/volunteer-assignments',
        headers: { 'x-test-user-id': volunteerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.assignments.length).toBe(1);
      expect(body.assignments[0].eventId).toBe(testEvent.id);
      expect(body.assignments[0].gate).toBe('East Gate Station 1');
      expect(body.assignments[0].checkedInCount).toBe(0);
      expect(body.assignments[0].myScanCount).toBe(0);
    });

    it('volunteer launches a scanner session for their assigned event', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/me/volunteer-assignments/${volunteerAssignment.id}/scanner-session`,
        headers: { 'x-test-user-id': volunteerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.token).toBeDefined();
      expect(body.eventId).toBe(testEvent.id);
      expect(body.gate).toBe('East Gate Station 1');

      volunteerScannerToken = body.token;
    });

    it('resolves authoritative event context via GET /gate/context using scanner token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/gate/context',
        headers: {
          authorization: `Bearer ${volunteerScannerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.eventId).toBe(testEvent.id);
      expect(body.eventTitle).toBe(testEvent.title);
      expect(body.type).toBe('VOLUNTEER');
      expect(body.volunteerName).toBe(volunteerUser.fullName);
    });

    it('volunteer scans student QR ticket and performs atomic check-in', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: {
          authorization: `Bearer ${volunteerScannerToken}`,
        },
        payload: {
          eventId: testEvent.id,
          token: attendeeTicket.token,
          mode: 'GATE',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result).toBe(ScanResult.GREEN);
      expect(body.code).toBe('CHECKED_IN');
      expect(body.attendee.fullName).toBe('+Alice FormulaInjection');

      // Verify database ticket status
      const [updatedTicket] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, attendeeTicket.id));
      expect(updatedTicket?.status).toBe(TicketStatus.CHECKED_IN);
      expect(updatedTicket?.checkedInBy).toBe(volunteerUser.id);
    });

    it('second scan of the same ticket returns ALREADY_CHECKED_IN (atomic duplicate protection)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: {
          authorization: `Bearer ${volunteerScannerToken}`,
        },
        payload: {
          eventId: testEvent.id,
          token: attendeeTicket.token,
          mode: 'GATE',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result).toBe(ScanResult.RED);
      expect(body.code).toBe('ALREADY_CHECKED_IN');
    });

    it('volunteer scanner token is strictly rejected for another event (cross-event isolation)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: {
          authorization: `Bearer ${volunteerScannerToken}`,
        },
        payload: {
          eventId: otherEvent.id,
          token: attendeeTicket.token,
          mode: 'GATE',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('records volunteer identity in scan audit logs', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/admin/volunteers/activity?eventId=${testEvent.id}`,
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeGreaterThanOrEqual(1);

      const greenLog = body.logs.find(
        (l: any) => l.scannerUserId === volunteerUser.id && l.result === ScanResult.GREEN
      );
      expect(greenLog).toBeDefined();
      expect(greenLog.scannerName).toBe('Sam Volunteer');
      expect(greenLog.mode).toBe(ScanMode.GATE);

      const redLog = body.logs.find(
        (l: any) => l.scannerUserId === volunteerUser.id && l.result === ScanResult.RED
      );
      expect(redLog).toBeDefined();
    });
  });

  describe('4. Spot Walk-in and Reassignment Lifecycle', () => {
    it('volunteer performs spot walk-in admission', async () => {
      const ts = Date.now();
      const [walkin] = await db
        .insert(users)
        .values({
          clerkId: `clerk_walkin_${ts}`,
          email: `walkin_${ts}@campus.edu`,
          fullName: 'Wendy Walkin',
          rollNumber: `WALK_${ts}`,
          role: UserRole.STUDENT,
        })
        .returning();

      const res = await server.inject({
        method: 'POST',
        url: '/gate/spot-register',
        headers: {
          authorization: `Bearer ${volunteerScannerToken}`,
        },
        payload: {
          eventId: testEvent.id,
          rollNumber: walkin!.rollNumber!,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('CHECKED_IN');
      expect(body.student.fullName).toBe('Wendy Walkin');
    });

    it('admin reassigns volunteer duty gate and operational role', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/volunteers/${volunteerAssignment.id}`,
        headers: { 'x-test-user-id': adminUser.id },
        payload: {
          gate: 'VIP West Gate',
          role: 'REGISTRATION',
          notes: 'Moved to VIP check-in station.',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.volunteer.gate).toBe('VIP West Gate');
      expect(body.volunteer.role).toBe('REGISTRATION');
    });

    it('admin revokes volunteer assignment', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/admin/volunteers/${volunteerAssignment.id}`,
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.volunteer.status).toBe('REVOKED');

      // Revoked volunteer no longer sees the event in active assignments
      const meRes = await server.inject({
        method: 'GET',
        url: '/me/volunteer-assignments',
        headers: { 'x-test-user-id': volunteerUser.id },
      });

      expect(meRes.statusCode).toBe(200);
      expect(meRes.json().assignments.length).toBe(0);
    });
  });
});
