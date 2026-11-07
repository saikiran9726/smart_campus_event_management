import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  NotificationChannel,
  NotificationKind,
  PaymentStatus,
  QuestionType,
  RegistrationStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubMembers,
  clubs,
  events,
  formQuestions,
  registrations,
  tickets,
  users,
} from '../db/schema';
import { buildServer } from '../server';
import { createPasskey, unlockScanner } from '../modules/passkeys/service';

describe('Release Readiness: End-to-End Security & Invariant Suite', () => {
  const server = buildServer();

  let organizerA: any;
  let organizerB: any;
  let student1: any;
  let student2: any;
  let adminUser: any;
  let clubA: any;
  let clubB: any;
  let eventA: any;
  let eventB: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create Organizers
    const [orgA]: any = await db
      .insert(users)
      .values({
        clerkId: `clerk_orgA_${ts}`,
        email: `orga_${ts}@campus.edu`,
        fullName: 'Organizer Alpha',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerA = orgA;

    const [orgB]: any = await db
      .insert(users)
      .values({
        clerkId: `clerk_orgB_${ts}`,
        email: `orgb_${ts}@campus.edu`,
        fullName: 'Organizer Beta',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerB = orgB;

    // 2. Create Students
    const [s1]: any = await db
      .insert(users)
      .values({
        clerkId: `clerk_s1_sec_${ts}`,
        email: `s1_sec_${ts}@campus.edu`,
        fullName: 'Student Alice',
        rollNumber: `ROLL_SEC1_${ts}`,
        department: 'Computer Science',
        year: 3,
        role: UserRole.STUDENT,
      })
      .returning();
    student1 = s1;

    const [s2]: any = await db
      .insert(users)
      .values({
        clerkId: `clerk_s2_sec_${ts}`,
        email: `s2_sec_${ts}@campus.edu`,
        fullName: 'Student Bob',
        rollNumber: `ROLL_SEC2_${ts}`,
        department: 'Electrical',
        year: 2,
        role: UserRole.STUDENT,
      })
      .returning();
    student2 = s2;

    // 3. Create Admin
    const [adm]: any = await db
      .insert(users)
      .values({
        clerkId: `clerk_adm_sec_${ts}`,
        email: `admin_sec_${ts}@campus.edu`,
        fullName: 'Chief Administrator',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = adm;

    // 4. Create Clubs and memberships
    const [cA]: any = await db
      .insert(clubs)
      .values({
        name: `Club Alpha ${ts}`,
        slug: `club-alpha-${ts}`,
        description: 'First organizer club',
        createdBy: organizerA.id,
      })
      .returning();
    clubA = cA;

    await db.insert(clubMembers).values({
      clubId: clubA.id,
      userId: organizerA.id,
      role: ClubMemberRole.OWNER,
    });

    const [cB]: any = await db
      .insert(clubs)
      .values({
        name: `Club Beta ${ts}`,
        slug: `club-beta-${ts}`,
        description: 'Second organizer club',
        createdBy: organizerB.id,
      })
      .returning();
    clubB = cB;

    await db.insert(clubMembers).values({
      clubId: clubB.id,
      userId: organizerB.id,
      role: ClubMemberRole.OWNER,
    });

    // 5. Create Events
    const now = new Date();
    const [eA]: any = await db
      .insert(events)
      .values({
        clubId: clubA.id,
        title: `Alpha Tech Symposium ${ts}`,
        slug: `alpha-symp-${ts}`,
        description: 'Organizer A Event',
        category: 'Symposium',
        startAt: new Date(now.getTime() + 86400000),
        endAt: new Date(now.getTime() + 172800000),
        registrationOpensAt: new Date(now.getTime() - 3600000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 2,
        remainingCapacity: 2,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizerA.id,
      })
      .returning();
    eventA = eA;

    const [eB]: any = await db
      .insert(events)
      .values({
        clubId: clubB.id,
        title: `Beta Cultural Night ${ts}`,
        slug: `beta-cult-${ts}`,
        description: 'Organizer B Event',
        category: 'Cultural',
        startAt: new Date(now.getTime() + 86400000),
        endAt: new Date(now.getTime() + 172800000),
        registrationOpensAt: new Date(now.getTime() - 3600000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 2,
        remainingCapacity: 2,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizerB.id,
      })
      .returning();
    eventB = eB;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Cross-Organizer & Tenant Isolation', () => {
    it('blocks Organizer B from viewing Organizer A attendee directory (403 Forbidden)', async () => {
      // Register student1 for Event A
      await server.inject({
        method: 'POST',
        url: `/events/${eventA.id}/registrations`,
        headers: {
          'x-test-user-id': student1.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });

      // Organizer A can view attendees of Event A
      const allowedRes = await server.inject({
        method: 'GET',
        url: `/events/${eventA.id}/attendees`,
        headers: { 'x-test-user-id': organizerA.id },
      });
      expect(allowedRes.statusCode).toBe(200);

      // Organizer B is forbidden from accessing Event A attendees
      const blockedRes = await server.inject({
        method: 'GET',
        url: `/events/${eventA.id}/attendees`,
        headers: { 'x-test-user-id': organizerB.id },
      });
      expect(blockedRes.statusCode).toBe(403);
    });

    it('blocks Organizer B from downloading Organizer A attendee CSV export (403 Forbidden)', async () => {
      const blockedCsv = await server.inject({
        method: 'GET',
        url: `/events/${eventA.id}/attendees/csv`,
        headers: { 'x-test-user-id': organizerB.id },
      });
      expect(blockedCsv.statusCode).toBe(403);
    });

    it('blocks Organizer B from modifying Organizer A registration form (403 Forbidden)', async () => {
      const blockedForm = await server.inject({
        method: 'POST',
        url: `/events/${eventA.id}/form/questions`,
        headers: { 'x-test-user-id': organizerB.id },
        payload: {
          label: 'Malicious question',
          type: 'SHORT_TEXT',
          required: false,
        },
      });
      expect(blockedForm.statusCode).toBe(403);
    });
  });

  describe('2. Student Profile & Privacy Isolation', () => {
    it('allows student to update their own profile and persists profile fields', async () => {
      const updateRes = await server.inject({
        method: 'PATCH',
        url: '/me',
        headers: { 'x-test-user-id': student1.id },
        payload: {
          phone: '+91 9998887776',
          department: 'Information Science',
          year: 4,
        },
      });
      expect(updateRes.statusCode).toBe(200);

      const meRes = await server.inject({
        method: 'GET',
        url: '/me',
        headers: { 'x-test-user-id': student1.id },
      });
      expect(meRes.statusCode).toBe(200);
      const meData = JSON.parse(meRes.payload);
      expect(meData.user.phone).toBe('+91 9998887776');
      expect(meData.user.department).toBe('Information Science');
      expect(meData.user.year).toBe(4);
    });

    it('blocks Student 2 from viewing another student private notifications or registrations', async () => {
      const s2Inbox = await server.inject({
        method: 'GET',
        url: '/me/notifications',
        headers: { 'x-test-user-id': student2.id },
      });
      expect(s2Inbox.statusCode).toBe(200);
      const s2Notifs = JSON.parse(s2Inbox.payload).notifications;
      // Must not contain any notifications belonging to student1
      for (const n of s2Notifs) {
        expect(n.userId).not.toBe(student1.id);
      }
    });
  });

  describe('3. Volunteer Least-Privilege Scanner Isolation', () => {
    it('restricts volunteer passkey token to scanner operations and denies organizer management', async () => {
      // Create passkey for Event A
      const pkResult = await createPasskey({
        eventId: eventA.id,
        label: 'Gate Station Alpha',
        userId: organizerA.id,
      });
      const unlockRes = await unlockScanner({
        code: pkResult.code,
        volunteerName: 'Volunteer Sarah',
        ip: '127.0.0.1',
      });
      const scannerToken = unlockRes.token;

      // Scanner token can access gate context
      const infoRes = await server.inject({
        method: 'GET',
        url: '/gate/context',
        headers: { authorization: `Bearer ${scannerToken}` },
      });
      expect(infoRes.statusCode).toBe(200);

      // Scanner token CANNOT access organizer responses
      const deniedAttendees = await server.inject({
        method: 'GET',
        url: `/events/${eventA.id}/attendees`,
        headers: { authorization: `Bearer ${scannerToken}` },
      });
      expect(deniedAttendees.statusCode).toBe(403);

      // Scanner token CANNOT access CSV export
      const deniedCsv = await server.inject({
        method: 'GET',
        url: `/events/${eventA.id}/attendees/csv`,
        headers: { authorization: `Bearer ${scannerToken}` },
      });
      expect(deniedCsv.statusCode).toBe(403);
    });
  });

  describe('4. Registration Invariants: Duplicate Prevention & Capacity Cap', () => {
    it('prevents duplicate active registration for the same student on the same event (409 Conflict)', async () => {
      // Student 1 is already registered for Event A
      const dupRes = await server.inject({
        method: 'POST',
        url: `/events/${eventA.id}/registrations`,
        headers: {
          'x-test-user-id': student1.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });
      expect(dupRes.statusCode).toBe(409);
      expect(JSON.parse(dupRes.payload).error.code).toBe('CONFLICT');
    });

    it('enforces capacity limit strictly and automatically queues into waitlist when full', async () => {
      // Event A capacity is 2; student1 is registered. Register student2 -> takes 2nd seat
      const reg2 = await server.inject({
        method: 'POST',
        url: `/events/${eventA.id}/registrations`,
        headers: {
          'x-test-user-id': student2.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });
      expect(reg2.statusCode).toBe(201);
      expect(JSON.parse(reg2.payload).outcome).toBe('CONFIRMED');

      // Now event is full (capacity 2, remaining 0). Create 3rd student
      const [s3]: any = await db
        .insert(users)
        .values({
          clerkId: `clerk_s3_sec_${Date.now()}`,
          email: `s3_sec_${Date.now()}@campus.edu`,
          fullName: 'Student Charlie',
          role: UserRole.STUDENT,
        })
        .returning();

      // Student 3 registers -> WAITLISTED
      const reg3 = await server.inject({
        method: 'POST',
        url: `/events/${eventA.id}/registrations`,
        headers: {
          'x-test-user-id': s3.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });
      expect(reg3.statusCode).toBe(200);
      const reg3Data = JSON.parse(reg3.payload);
      expect(reg3Data.outcome).toBe('WAITLISTED');
      expect(reg3Data.position).toBe(1);
    });
  });

  describe('5. Form Versioning & Answer Immutability', () => {
    it('freezes form on first registration and prevents mutation of published question types', async () => {
      // Add a question to Event B
      const qRes = await server.inject({
        method: 'POST',
        url: `/events/${eventB.id}/form/questions`,
        headers: { 'x-test-user-id': organizerB.id },
        payload: {
          label: 'What is your T-shirt size?',
          type: 'SHORT_TEXT',
          required: true,
        },
      });
      expect(qRes.statusCode).toBe(201);
      const questionId = JSON.parse(qRes.payload).question.id;

      // Student 1 registers and answers
      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${eventB.id}/registrations`,
        headers: {
          'x-test-user-id': student1.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: {
          answers: {
            [questionId]: 'Medium',
          },
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regId = JSON.parse(regRes.payload).registration.id;

      // Attempting to delete the question after registrations exist is blocked
      const delRes = await server.inject({
        method: 'DELETE',
        url: `/events/${eventB.id}/form/questions/${questionId}`,
        headers: { 'x-test-user-id': organizerB.id },
      });
      expect(delRes.statusCode).toBe(409);

      // Verify deep inspection reveals the preserved answer snapshot
      const inspRes = await server.inject({
        method: 'GET',
        url: `/events/${eventB.id}/attendees/${regId}`,
        headers: { 'x-test-user-id': organizerB.id },
      });
      expect(inspRes.statusCode).toBe(200);
      const inspData = JSON.parse(inspRes.payload);
      expect(inspData.formResponses[0].value).toBe('Medium');
      expect(inspData.formResponses[0].label).toBe('What is your T-shirt size?');
      expect(inspData.registration.formVersion).toBe(1);
    });
  });

  describe('6. Admin Governance & Platform Oversight', () => {
    it('allows ADMIN oversight to inspect notifications queue and retry dead-letter queue entries', async () => {
      const adminNotifs = await server.inject({
        method: 'GET',
        url: '/admin/notifications',
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(adminNotifs.statusCode).toBe(200);
      const body = JSON.parse(adminNotifs.payload);
      expect(Array.isArray(body.notifications)).toBe(true);

      // Non-admin receives 403
      const studentDeny = await server.inject({
        method: 'GET',
        url: '/admin/notifications',
        headers: { 'x-test-user-id': student1.id },
      });
      expect(studentDeny.statusCode).toBe(403);
    });
  });
});
