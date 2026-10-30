import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import jsQR from 'jsqr';
import sharp from 'sharp';
import {
  ClubMemberRole,
  EventStatus,
  PaymentStatus,
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
  registrations,
  scannerPasskeys,
  tickets,
  users,
} from '../db/schema';
import { createPasskey, unlockScanner } from '../modules/passkeys/service';
import { issueTicket } from '../modules/tickets/service';
import { buildServer } from '../server';

describe('Gate, Tickets, Passkeys & Least-Privilege Route Guard Suite', () => {
  const server = buildServer();

  let organizerUser: any;
  let attendeeUser1: any;
  let attendeeUser2: any;
  let walkinUser: any;
  let unregisteredUser: any;
  let testClub: any;
  let liveEvent1: any;
  let liveEvent2: any;
  let reg1: any;
  let ticket1: any;
  let reg2: any;
  let ticket2: any;
  let passkey1: any;
  let scannerSessionToken: string;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create Users
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_gate_org_${ts}`,
        email: `gate_org_${ts}@campus.edu`,
        fullName: 'Gate Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [std1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_gate_std1_${ts}`,
        email: `gate_std1_${ts}@campus.edu`,
        fullName: 'Alice Attendee',
        rollNumber: `ROLL1_${ts}`,
        role: UserRole.STUDENT,
        department: 'Computer Science',
      })
      .returning();
    attendeeUser1 = std1;

    const [std2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_gate_std2_${ts}`,
        email: `gate_std2_${ts}@campus.edu`,
        fullName: 'Bob Attendee',
        rollNumber: `ROLL2_${ts}`,
        role: UserRole.STUDENT,
        department: 'Electronics',
      })
      .returning();
    attendeeUser2 = std2;

    const [walkin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_gate_walkin_${ts}`,
        email: `gate_walkin_${ts}@campus.edu`,
        fullName: 'Charlie Walkin',
        rollNumber: `WALK_${ts}`,
        role: UserRole.STUDENT,
        department: 'Mechanical',
      })
      .returning();
    walkinUser = walkin;

    const [unreg] = await db
      .insert(users)
      .values({
        clerkId: `clerk_gate_unreg_${ts}`,
        email: `gate_unreg_${ts}@campus.edu`,
        fullName: 'Diana Unregistered',
        rollNumber: `UNREG_${ts}`,
        role: UserRole.STUDENT,
      })
      .returning();
    unregisteredUser = unreg;

    // 2. Create Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Gate Club ${ts}`,
        slug: `gate-club-${ts}`,
        description: 'Gate scanning test club.',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Create Events
    const now = new Date();
    const [ev1] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Campus Hackathon ${ts}`,
        slug: `campus-hackathon-${ts}`,
        description: 'Annual campus hackathon.',
        category: 'Hackathon',
        startAt: new Date(now.getTime() - 1800000), // 30 min ago (LIVE)
        endAt: new Date(now.getTime() + 86400000),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        status: EventStatus.LIVE,
        capacity: 10,
        remainingCapacity: 10,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizerUser.id,
      })
      .returning();
    liveEvent1 = ev1;

    const [ev2] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Campus Seminar ${ts}`,
        slug: `campus-seminar-${ts}`,
        description: 'Campus seminar.',
        category: 'Seminar',
        startAt: new Date(now.getTime() + 3600000),
        endAt: new Date(now.getTime() + 7200000),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        status: EventStatus.LIVE,
        capacity: 10,
        remainingCapacity: 10,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizerUser.id,
      })
      .returning();
    liveEvent2 = ev2;

    // 4. Create Registrations & Issue Tickets
    const [r1] = await db
      .insert(registrations)
      .values({
        eventId: liveEvent1.id,
        userId: attendeeUser1.id,
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.NOT_REQUIRED,
      })
      .returning();
    reg1 = r1;
    ticket1 = await issueTicket(db, reg1);

    const [r2] = await db
      .insert(registrations)
      .values({
        eventId: liveEvent2.id,
        userId: attendeeUser2.id,
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.NOT_REQUIRED,
      })
      .returning();
    reg2 = r2;
    ticket2 = await issueTicket(db, reg2);

    // 5. Create Passkey for Event 1 & Unlock Scanner Session
    passkey1 = await createPasskey({
      eventId: liveEvent1.id,
      label: 'Main Gate Gatekeepers',
      ttlHours: 8,
      userId: organizerUser.id,
    });

    const unlockRes = await unlockScanner({
      ip: '127.0.0.1',
      code: passkey1.code,
      volunteerName: 'Volunteer Vinay',
      eventId: liveEvent1.id,
    });

    scannerSessionToken = unlockRes.token;
  });

  afterAll(async () => {
    await server.close();
  });

  // --- SUITE 1: TICKET FETCH & QR CODE RENDERING ---
  describe('Ticket Service & QR Code Delivery', () => {
    it('allows attendee to view their ticket metadata and token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/tickets/${reg1.id}`,
        headers: { 'x-test-user-id': attendeeUser1.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ticket.token).toBe(ticket1.token);
      expect(body.ticket.status).toBe(TicketStatus.VALID);
      expect(body.event.id).toBe(liveEvent1.id);
    });

    it('rejects another student from viewing someone else’s ticket', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/tickets/${reg1.id}`,
        headers: { 'x-test-user-id': attendeeUser2.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it('renders high-contrast QR PNG and decodes exactly to 32-char token via jsQR + sharp', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/tickets/${reg1.id}/qr.png`,
        headers: { 'x-test-user-id': attendeeUser1.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('private, no-store');

      const pngBuffer = res.rawPayload;
      expect(pngBuffer.length).toBeGreaterThan(1000);

      // Decode with sharp + jsQR
      const image = sharp(pngBuffer);
      const metadata = await image.metadata();
      expect(metadata.width).toBe(600);
      expect(metadata.height).toBe(600);

      const raw = await image.ensureAlpha().raw().toBuffer();
      const decoded = jsQR(
        new Uint8ClampedArray(raw),
        metadata.width!,
        metadata.height!
      );

      expect(decoded).not.toBeNull();
      expect(decoded!.data).toBe(ticket1.token);
      expect(decoded!.data.length).toBe(32);
      expect(decoded!.data.startsWith('ev_tok_')).toBe(true);
    });

    it('renders clean QR SVG markup', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/tickets/${reg1.id}/qr.svg`,
        headers: { 'x-test-user-id': attendeeUser1.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('image/svg+xml');
      expect(res.body).toContain('<svg');
    });
  });

  // --- SUITE 2: PASSKEYS MANAGEMENT & UNLOCK ---
  describe('Passkey Management & Session Unlock', () => {
    it('allows event organizer to create passkeys and view setup QR', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: `/events/${liveEvent1.id}/passkeys`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: { label: 'East Wing Scanner' },
      });

      expect(createRes.statusCode).toBe(201);
      const passkey = createRes.json();
      expect(passkey.code).toMatch(/^SCAN-[A-Z0-9]{6}$/);

      const qrRes = await server.inject({
        method: 'GET',
        url: `/events/${liveEvent1.id}/passkeys/${passkey.id}/setup-qr.png`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(qrRes.statusCode).toBe(200);
      expect(qrRes.headers['content-type']).toBe('image/png');
    });

    it('rejects public scanner unlock with invalid passkey code', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/public/scanner/unlock',
        payload: {
          code: 'SCAN-INVALID',
          volunteerName: 'Intruder',
          turnstileToken: 'test-pass',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('TOKEN_INVALID');
    });

    it('unlocks scanner session with valid passkey code via public unlock endpoint', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/public/scanner/unlock',
        payload: {
          code: passkey1.code,
          volunteerName: 'Public Volunteer',
          turnstileToken: 'test-pass',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.token).toBeDefined();
      expect(data.eventId).toBe(liveEvent1.id);
      expect(data.volunteerName).toBe('Public Volunteer');
    });
  });

  // --- SUITE 3: GATE SCANNING & CONCURRENCY ---
  describe('Gate Scanning & Check-In Concurrency', () => {
    it('returns GREEN on first scan of a valid ticket', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: ticket1.token,
          mode: 'GATE',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result).toBe('GREEN');
      expect(body.code).toBe('CHECKED_IN');
      expect(body.attendee.rollNumber).toBe(attendeeUser1.rollNumber);
      expect(body.ticket.id).toBe(ticket1.id);
    });

    it('returns RED with previous check-in timestamp when scanning the same ticket again', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: ticket1.token,
          mode: 'GATE',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result).toBe('RED');
      expect(body.code).toBe('ALREADY_CHECKED_IN');
      expect(body.scannedAt).toBeDefined();
    });

    it('executes 100 simultaneous scans on the same ticket: exactly 1 GREEN and 99 RED', async () => {
      // Create a fresh registration and ticket for concurrent test
      const [concUser] = await db
        .insert(users)
        .values({
          clerkId: `clerk_conc_${Date.now()}`,
          email: `conc_${Date.now()}@campus.edu`,
          fullName: 'Concurrency Competitor',
          rollNumber: `CONC_${Date.now()}`,
          role: UserRole.STUDENT,
        })
        .returning();

      const [concReg] = await db
        .insert(registrations)
        .values({
          eventId: liveEvent1.id,
          userId: concUser!.id,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.NOT_REQUIRED,
        })
        .returning();

      const concTicket = await issueTicket(db, concReg!);

      // Launch 100 simultaneous scan requests
      const promises = Array.from({ length: 100 }, () =>
        server.inject({
          method: 'POST',
          url: '/gate/scan',
          headers: { 'x-test-user-id': organizerUser.id }, // organizer has gate auth
          payload: {
            eventId: liveEvent1.id,
            token: concTicket.token,
            mode: 'GATE',
          },
        })
      );

      const responses = await Promise.all(promises);

      const greenResults = responses.filter((r) => r.json().result === 'GREEN');
      const redResults = responses.filter((r) => r.json().result === 'RED');

      expect(greenResults.length).toBe(1);
      expect(redResults.length).toBe(99);
    });

    it('returns YELLOW WRONG_EVENT when scanning a ticket belonging to another event', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          eventId: liveEvent1.id,
          token: ticket2.token, // ticket2 belongs to event 2
          mode: 'GATE',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result).toBe('YELLOW');
      expect(body.code).toBe('WRONG_EVENT');
    });

    it('returns YELLOW INVALID_TOKEN immediately on malformed garbage token without DB read', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          eventId: liveEvent1.id,
          token: 'not_a_valid_token_string',
          mode: 'GATE',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result).toBe('YELLOW');
      expect(body.code).toBe('INVALID_TOKEN');
    });

    it('enforces scan rate limiting of 20 scans per second', async () => {
      const testIp = 'test-rate-limit-ip-1';
      // Execute 20 scans
      for (let i = 0; i < 20; i++) {
        await server.inject({
          method: 'POST',
          url: '/gate/scan',
          headers: { 'x-test-user-id': organizerUser.id },
          remoteAddress: testIp,
          payload: {
            eventId: liveEvent1.id,
            token: 'garbage-rate-test',
            mode: 'GATE',
          },
        });
      }

      // The 21st scan must be rate limited (429)
      const res21 = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { 'x-test-user-id': organizerUser.id },
        remoteAddress: testIp,
        payload: {
          eventId: liveEvent1.id,
          token: 'garbage-rate-test',
          mode: 'GATE',
        },
      });

      expect(res21.statusCode).toBe(429);
      expect(res21.json().error.code).toBe('RATE_LIMITED');
    });
  });

  // --- SUITE 4: MULTI-TOKEN COUNTERS (MEAL & KIT REDEMPTIONS) ---
  describe('Multi-Token Meal & Kit Counters', () => {
    let mealUser: any;
    let mealReg: any;
    let mealTicket: any;

    beforeAll(async () => {
      const ts = Date.now();
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_meal_${ts}`,
          email: `meal_${ts}@campus.edu`,
          fullName: 'Meal Attendee',
          rollNumber: `MEAL_${ts}`,
          role: UserRole.STUDENT,
        })
        .returning();
      mealUser = u;

      const [r] = await db
        .insert(registrations)
        .values({
          eventId: liveEvent1.id,
          userId: mealUser.id,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.NOT_REQUIRED,
        })
        .returning();
      mealReg = r;
      mealTicket = await issueTicket(db, mealReg);
    });

    it('returns YELLOW NOT_CHECKED_IN when redeeming MEAL prior to gate check-in', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: mealTicket.token,
          mode: 'MEAL',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result).toBe('YELLOW');
      expect(body.code).toBe('NOT_CHECKED_IN');
    });

    it('checks in ticket at gate, then redeems MEAL -> GREEN', async () => {
      // 1. Gate check-in
      const gateRes = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: mealTicket.token,
          mode: 'GATE',
        },
      });
      expect(gateRes.json().result).toBe('GREEN');

      // 2. MEAL redemption
      const mealRes = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: mealTicket.token,
          mode: 'MEAL',
        },
      });

      expect(mealRes.statusCode).toBe(200);
      const body = mealRes.json();
      expect(body.result).toBe('GREEN');
      expect(body.code).toBe('REDEEMED');
      expect(body.kind).toBe('MEAL');
    });

    it('returns RED ALREADY_REDEEMED when scanning MEAL a second time', async () => {
      const mealRes2 = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: mealTicket.token,
          mode: 'MEAL',
        },
      });

      expect(mealRes2.statusCode).toBe(200);
      const body = mealRes2.json();
      expect(body.result).toBe('RED');
      expect(body.code).toBe('ALREADY_REDEEMED');
    });

    it('KIT scan succeeds independently of MEAL -> GREEN then RED', async () => {
      // 1. First KIT scan -> GREEN
      const kitRes1 = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: mealTicket.token,
          mode: 'KIT',
        },
      });

      expect(kitRes1.statusCode).toBe(200);
      expect(kitRes1.json().result).toBe('GREEN');
      expect(kitRes1.json().kind).toBe('KIT');

      // 2. Second KIT scan -> RED
      const kitRes2 = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: mealTicket.token,
          mode: 'KIT',
        },
      });

      expect(kitRes2.statusCode).toBe(200);
      expect(kitRes2.json().result).toBe('RED');
      expect(kitRes2.json().code).toBe('ALREADY_REDEEMED');
    });
  });

  // --- SUITE 5: STUDENT LOOKUP & MANUAL CHECK-IN ---
  describe('Student Directory Lookup & Manual Check-in', () => {
    it('returns student registration & check-in details via roll number lookup', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/gate/lookup?eventId=${liveEvent1.id}&rollNumber=${attendeeUser1.rollNumber}`,
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.registered).toBe(true);
      expect(data.checkedIn).toBe(true);
      expect(data.rollNumber).toBe(attendeeUser1.rollNumber);
    });

    it('returns registered: false for unregistered student roll number', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/gate/lookup?eventId=${liveEvent1.id}&rollNumber=${unregisteredUser.rollNumber}`,
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.registered).toBe(false);
      expect(data.checkedIn).toBe(false);
    });

    it('manually checks in a valid registered student by roll number', async () => {
      const ts = Date.now();
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_man_${ts}`,
          email: `man_${ts}@campus.edu`,
          fullName: 'Manual Attendee',
          rollNumber: `MAN_${ts}`,
          role: UserRole.STUDENT,
        })
        .returning();

      const [r] = await db
        .insert(registrations)
        .values({
          eventId: liveEvent1.id,
          userId: u!.id,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.NOT_REQUIRED,
        })
        .returning();

      await issueTicket(db, r!);

      const res = await server.inject({
        method: 'POST',
        url: '/gate/manual-checkin',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          rollNumber: u!.rollNumber,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('CHECKED_IN');
      expect(res.json().student.rollNumber).toBe(u!.rollNumber);

      // Attempting second manual check-in returns 409
      const secondRes = await server.inject({
        method: 'POST',
        url: '/gate/manual-checkin',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          rollNumber: u!.rollNumber,
        },
      });
      expect(secondRes.statusCode).toBe(409);
    });
  });

  // --- SUITE 6: SPOT WALK-IN REGISTRATION ---
  describe('Spot Walk-In Registration', () => {
    it('registers an attendee on the spot during a LIVE event, decrementing capacity and checking them in', async () => {
      const beforeEvent = await db
        .select({ remaining: events.remainingCapacity })
        .from(events)
        .where(eq(events.id, liveEvent1.id))
        .limit(1);

      const beforeCap = beforeEvent[0]!.remaining;

      const res = await server.inject({
        method: 'POST',
        url: '/gate/spot-register',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          rollNumber: walkinUser.rollNumber,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.status).toBe('CHECKED_IN');
      expect(data.student.rollNumber).toBe(walkinUser.rollNumber);
      expect(data.ticketId).toBeDefined();

      const afterEvent = await db
        .select({ remaining: events.remainingCapacity })
        .from(events)
        .where(eq(events.id, liveEvent1.id))
        .limit(1);

      expect(afterEvent[0]!.remaining).toBe(beforeCap - 1);
    });

    it('returns 404 when spot registering an unknown roll number', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/gate/spot-register',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          rollNumber: 'NON_EXISTENT_ROLL_9999',
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 409 SOLD_OUT when spot registering for an event with 0 remaining capacity', async () => {
      // Set remaining capacity to 0
      await db
        .update(events)
        .set({ remainingCapacity: 0 })
        .where(eq(events.id, liveEvent1.id));

      const res = await server.inject({
        method: 'POST',
        url: '/gate/spot-register',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          rollNumber: unregisteredUser.rollNumber,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('SOLD_OUT');

      // Restore capacity
      await db
        .update(events)
        .set({ remainingCapacity: 5 })
        .where(eq(events.id, liveEvent1.id));
    });
  });

  // --- SUITE 7: PASSKEY REVOCATION & INSTANT SESSION INVALIDATION ---
  describe('Passkey Revocation', () => {
    it('revoking a passkey immediately invalidates existing scanner sessions', async () => {
      // Revoke passkey1
      const revokeRes = await server.inject({
        method: 'DELETE',
        url: `/events/${liveEvent1.id}/passkeys/${passkey1.id}`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(revokeRes.statusCode).toBe(200);

      // Attempting to scan using the revoked session token returns 401 UNAUTHENTICATED
      const scanRes = await server.inject({
        method: 'POST',
        url: '/gate/scan',
        headers: { Authorization: `Bearer ${scannerSessionToken}` },
        payload: {
          eventId: liveEvent1.id,
          token: ticket1.token,
          mode: 'GATE',
        },
      });

      expect(scanRes.statusCode).toBe(401);
      expect(scanRes.json().error.message).toContain('revoked');
    });
  });

  // --- SUITE 8: GATE STATS & INSIGHTS ---
  describe('Gate Statistics', () => {
    it('returns accurate checkedIn, remaining, mealsRedeemed, and kitsRedeemed counts', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/gate/stats?eventId=${liveEvent1.id}`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const stats = res.json();
      expect(stats.checkedIn).toBeGreaterThan(0);
      expect(stats.mealsRedeemed).toBe(1);
      expect(stats.kitsRedeemed).toBe(1);
      expect(stats.totalCapacity).toBe(10);
    });
  });

  // --- SUITE 9: LEAST-PRIVILEGE ROUTE GUARD EXHAUSTIVE CHECK ---
  describe('Least-Privilege Route Guard Exhaustive Check', () => {
    it('asserts scanner token receives 403 FORBIDDEN on all non-scanner/non-gate routes', async () => {
      // Create a fresh active passkey and scanner token
      const freshPasskey = await createPasskey({
        eventId: liveEvent2.id,
        label: 'Route Guard Probe Scanner',
        ttlHours: 4,
        userId: organizerUser.id,
      });

      const freshUnlock = await unlockScanner({
        ip: '127.0.0.1',
        code: freshPasskey.code,
        volunteerName: 'Route Guard Probe',
        eventId: liveEvent2.id,
      });

      const probeToken = freshUnlock.token;

      // Sample of diverse critical non-scanner endpoints across the system:
      const testRoutes = [
        { method: 'GET', url: `/events/${liveEvent2.id}/form/responses` },
        { method: 'GET', url: '/users/me' },
        { method: 'POST', url: `/events/${liveEvent2.id}/registrations` },
        { method: 'GET', url: '/clubs' },
        { method: 'POST', url: '/proposals' },
        { method: 'POST', url: `/events/${liveEvent2.id}/form/questions` },
        { method: 'POST', url: `/events/${liveEvent2.id}/passkeys` },
      ] as const;

      for (const route of testRoutes) {
        const res = await server.inject({
          method: route.method,
          url: route.url,
          headers: { Authorization: `Bearer ${probeToken}` },
          payload: {},
        });

        expect(
          res.statusCode,
          `Route ${route.method} ${route.url} did not reject scanner token with 403`
        ).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      }
    });
  });
});
