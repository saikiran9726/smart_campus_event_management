import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  TicketStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubMembers,
  clubs,
  events,
  ledgerEntries,
  payments,
  registrations,
  tickets,
  users,
  waitlistEntries,
} from '../db/schema';
import { sandboxCheckoutSchema } from '../modules/payments/service';
import { processEventStrikes, sweepEventStrikes } from '../modules/strikes/service';
import { runOfferExpirySweepOnce } from '../workers/offer-expiry.worker';
import { buildServer } from '../server';

describe('ACID Seat Reservation & Concurrency Engine (10 Repeated Trials)', () => {
  const server = buildServer();

  let organizerUser: any;
  let testClub: any;
  const participantUsers: any[] = [];

  beforeAll(async () => {
    await server.ready();

    const timestamp = Date.now();

    // 1. Create Organizer
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_conc_${timestamp}`,
        email: `org_conc_${timestamp}@campus.edu`,
        fullName: 'Concurrency Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    // 2. Create Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Concurrency Club ${timestamp}`,
        slug: `conc-club-${timestamp}`,
        description: 'Stress testing atomic reservations.',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Pre-create 25 distinct student participants
    for (let i = 1; i <= 25; i++) {
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_conc_student_${timestamp}_${i}`,
          email: `conc_student_${timestamp}_${i}@campus.edu`,
          fullName: `Concurrency Student ${i}`,
          rollNumber: `ROLL_CONC_${timestamp}_${i}`,
          role: UserRole.STUDENT,
        })
        .returning();
      participantUsers.push(u);
    }
  });

  afterAll(async () => {
    await server.close();
  });

  // 10 Repeated Trials of 25 simultaneous registrations for capacity = 1
  for (let trial = 1; trial <= 10; trial++) {
    it(`Trial ${trial} of 10: 25 simultaneous registrations for capacity=1 yields exactly 1 CONFIRMED, 24 WAITLISTED (positions 1..24, remaining=0)`, async () => {
      const now = new Date();
      const trialTimestamp = Date.now() + trial;

      // Create an event with capacity = 1
      const [trialEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Flash Reservation Event Trial ${trial}`,
          slug: `flash-event-trial-${trial}-${trialTimestamp}`,
          description: 'Single capacity flash registration trial.',
          category: 'Hackathon',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000), // Open
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 1,
          remainingCapacity: 1,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      expect(trialEvent).toBeDefined();

      // Fire 25 simultaneous registrations from 25 distinct users
      const responses = await Promise.all(
        participantUsers.map((u) =>
          server.inject({
            method: 'POST',
            url: `/events/${trialEvent!.id}/registrations`,
            headers: {
              'x-test-user-id': u.id,
              'cf-turnstile-response': 'test-pass',
            },
            payload: {
              answers: {},
              turnstileToken: 'test-pass',
            },
          })
        )
      );

      // Verify responses
      const confirmed = responses.filter((r) => r.statusCode === 201);
      const waitlisted = responses.filter((r) => r.statusCode === 200);

      expect(confirmed).toHaveLength(1);
      expect(waitlisted).toHaveLength(24);

      const confirmedBody = JSON.parse(confirmed[0]!.body);
      expect(confirmedBody.outcome).toBe('CONFIRMED');
      expect(confirmedBody.ticket).toBeDefined();

      // Check waitlist positions: exactly 1..24 with zero duplicates
      const positions = waitlisted
        .map((r) => JSON.parse(r.body).position as number)
        .sort((a, b) => a - b);

      const expectedPositions = Array.from({ length: 24 }, (_, i) => i + 1);
      expect(positions).toEqual(expectedPositions);

      // Verify database state: remainingCapacity must be exactly 0, never negative
      const [ev] = await db
        .select()
        .from(events)
        .where(eq(events.id, trialEvent!.id));

      expect(ev).toBeDefined();
      expect(ev!.remainingCapacity).toBe(0);

      // Verify registrations count in database
      const dbRegs = await db
        .select()
        .from(registrations)
        .where(eq(registrations.eventId, trialEvent!.id));
      expect(dbRegs).toHaveLength(25);

      const confirmedDbRegs = dbRegs.filter(
        (r) => r.status === RegistrationStatus.CONFIRMED
      );
      const waitlistedDbRegs = dbRegs.filter(
        (r) => r.status === RegistrationStatus.WAITLISTED
      );
      expect(confirmedDbRegs).toHaveLength(1);
      expect(waitlistedDbRegs).toHaveLength(24);
    });
  }

  describe('Waitlist Promotion & Offer Expiry Worker Lifecycle', () => {
    let promoEvent: any;
    let confirmedReg: any;
    let waitlistUser1: any;
    let waitlistUser2: any;
    let waitlistReg1: any;
    let waitlistReg2: any;

    beforeAll(async () => {
      const now = new Date();
      const ts = Date.now();

      const [ev] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Promotion Lifecycle Event ${ts}`,
          slug: `promo-event-${ts}`,
          description: 'Testing promotion to Person #2 on Person #1 expiry.',
          category: 'Workshop',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 1,
          remainingCapacity: 1,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();
      promoEvent = ev;

      waitlistUser1 = participantUsers[1];
      waitlistUser2 = participantUsers[2];

      // 1. Confirmed user registers first
      const res0 = await server.inject({
        method: 'POST',
        url: `/events/${promoEvent.id}/registrations`,
        headers: {
          'x-test-user-id': participantUsers[0].id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });
      expect(res0.statusCode).toBe(201);
      confirmedReg = JSON.parse(res0.body).registration;

      // 2. User 1 registers -> waitlisted pos 1
      const res1 = await server.inject({
        method: 'POST',
        url: `/events/${promoEvent.id}/registrations`,
        headers: {
          'x-test-user-id': waitlistUser1.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });
      expect(res1.statusCode).toBe(200);
      waitlistReg1 = JSON.parse(res1.body).registration;

      // 3. User 2 registers -> waitlisted pos 2
      const res2 = await server.inject({
        method: 'POST',
        url: `/events/${promoEvent.id}/registrations`,
        headers: {
          'x-test-user-id': waitlistUser2.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });
      expect(res2.statusCode).toBe(200);
      waitlistReg2 = JSON.parse(res2.body).registration;
    });

    it('cancelling the confirmed registration promotes Person #1 to OFFERED (~20m expiry)', async () => {
      const cancelRes = await server.inject({
        method: 'POST',
        url: `/registrations/${confirmedReg.id}/cancel`,
        headers: { 'x-test-user-id': participantUsers[0].id },
      });
      expect(cancelRes.statusCode).toBe(200);

      // Check Person #1 is now OFFERED
      const [reg1] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, waitlistReg1.id));
      expect(reg1?.status).toBe(RegistrationStatus.OFFERED);
      expect(reg1?.offeredAt).toBeDefined();
      expect(reg1?.offerExpiresAt).toBeDefined();

      const diffMinutes =
        (reg1!.offerExpiresAt!.getTime() - reg1!.offeredAt!.getTime()) / 60000;
      expect(Math.round(diffMinutes)).toBe(20);

      // Capacity should remain 0 while seat is offered
      const [ev] = await db
        .select()
        .from(events)
        .where(eq(events.id, promoEvent.id));
      expect(ev?.remainingCapacity).toBe(0);
    });

    it('force expiry on Person #1 and sweep: Person #1 becomes EXPIRED and Person #2 becomes OFFERED', async () => {
      // Force expiry in database for Person #1
      await db
        .update(registrations)
        .set({
          offerExpiresAt: new Date(Date.now() - 60000), // 1 min ago
        })
        .where(eq(registrations.id, waitlistReg1.id));

      // Run offer expiry worker once
      const processedCount = await runOfferExpirySweepOnce();
      expect(processedCount).toBeGreaterThanOrEqual(1);

      // Assert Person #1 is EXPIRED
      const [reg1] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, waitlistReg1.id));
      expect(reg1?.status).toBe(RegistrationStatus.EXPIRED);

      // Assert Person #2 is now OFFERED
      const [reg2] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, waitlistReg2.id));
      expect(reg2?.status).toBe(RegistrationStatus.OFFERED);
      expect(reg2?.offeredAt).toBeDefined();
    });

    it('Person #1 claiming after expiry returns 410 OFFER_EXPIRED', async () => {
      const claimRes = await server.inject({
        method: 'POST',
        url: `/registrations/${waitlistReg1.id}/claim-offer`,
        headers: { 'x-test-user-id': waitlistUser1.id },
      });

      expect(claimRes.statusCode).toBe(410);
      const json = JSON.parse(claimRes.body);
      expect(json.error.code).toBe('OFFER_EXPIRED');
    });

    it('Person #2 claiming within valid offer window succeeds with 200/201 CONFIRMED and ticket', async () => {
      const claimRes = await server.inject({
        method: 'POST',
        url: `/registrations/${waitlistReg2.id}/claim-offer`,
        headers: { 'x-test-user-id': waitlistUser2.id },
      });

      expect([200, 201]).toContain(claimRes.statusCode);
      const json = JSON.parse(claimRes.body);
      expect(json.outcome).toBe('CONFIRMED');
      expect(json.ticket).toBeDefined();

      const [reg2] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, waitlistReg2.id));
      expect(reg2?.status).toBe(RegistrationStatus.CONFIRMED);
    });
  });

  describe('Strike Engine & Cooldown Enforcement', () => {
    let strikeUser: any;

    beforeAll(async () => {
      const ts = Date.now();
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_strike_test_${ts}`,
          email: `strike_test_${ts}@campus.edu`,
          fullName: 'Strike Test Student',
          role: UserRole.STUDENT,
        })
        .returning();
      strikeUser = u;
    });

    it('two consecutive NO_SHOW cycles set cooldown_until ~30 days, registration returns COOLDOWN_ACTIVE', async () => {
      const ts = Date.now();

      // --- Cycle 1: Event 1 (ended 40 mins ago, user did not check in) ---
      const [ev1] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Strike Cycle 1 Event ${ts}`,
          slug: `strike-ev1-${ts}`,
          description: 'Testing strike cycle 1.',
          category: 'Talk',
          startAt: new Date(Date.now() - 3600000 * 2),
          endAt: new Date(Date.now() - 40 * 60 * 1000), // Ended 40m ago
          registrationOpensAt: new Date(Date.now() - 86400000),
          registrationClosesAt: new Date(Date.now() - 3600000),
          status: EventStatus.PUBLISHED,
          capacity: 50,
          remainingCapacity: 49,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      const [reg1] = await db
        .insert(registrations)
        .values({
          eventId: ev1!.id,
          userId: strikeUser.id,
          status: RegistrationStatus.CONFIRMED,
        })
        .returning();

      await db.insert(tickets).values({
        registrationId: reg1!.id,
        eventId: ev1!.id,
        userId: strikeUser.id,
        token: `ev_tok_strike_cycle1_${ts}`.padEnd(32, 'x').slice(0, 32),
        status: TicketStatus.VALID, // Not checked in!
      });

      // Run strike sweep on ev1
      await sweepEventStrikes();

      const [userAfterCycle1] = await db
        .select()
        .from(users)
        .where(eq(users.id, strikeUser.id));

      expect(userAfterCycle1?.strikeCount).toBe(1);
      expect(userAfterCycle1?.consecutiveNoShows).toBe(1);
      expect(userAfterCycle1?.cooldownUntil).toBeNull();

      // --- Cycle 2: Event 2 (ended 40 mins ago, user did not check in again) ---
      const [ev2] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Strike Cycle 2 Event ${ts}`,
          slug: `strike-ev2-${ts}`,
          description: 'Testing strike cycle 2.',
          category: 'Talk',
          startAt: new Date(Date.now() - 3600000 * 2),
          endAt: new Date(Date.now() - 40 * 60 * 1000),
          registrationOpensAt: new Date(Date.now() - 86400000),
          registrationClosesAt: new Date(Date.now() - 3600000),
          status: EventStatus.PUBLISHED,
          capacity: 50,
          remainingCapacity: 49,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      const [reg2] = await db
        .insert(registrations)
        .values({
          eventId: ev2!.id,
          userId: strikeUser.id,
          status: RegistrationStatus.CONFIRMED,
        })
        .returning();

      await db.insert(tickets).values({
        registrationId: reg2!.id,
        eventId: ev2!.id,
        userId: strikeUser.id,
        token: `ev_tok_strike_cycle2_${ts}`.padEnd(32, 'x').slice(0, 32),
        status: TicketStatus.VALID,
      });

      // Run strike sweep on ev2
      await sweepEventStrikes();

      const [userAfterCycle2] = await db
        .select()
        .from(users)
        .where(eq(users.id, strikeUser.id));

      expect(userAfterCycle2?.strikeCount).toBe(2);
      expect(userAfterCycle2?.consecutiveNoShows).toBe(2);
      expect(userAfterCycle2?.cooldownUntil).not.toBeNull();

      const daysRemaining =
        (userAfterCycle2!.cooldownUntil!.getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);
      expect(Math.round(daysRemaining)).toBe(30);

      // Now attempt registration while under cooldown -> 403 COOLDOWN_ACTIVE
      const [futureEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Future Registration Event ${ts}`,
          slug: `future-ev-${ts}`,
          description: 'Testing cooldown refusal.',
          category: 'Workshop',
          startAt: new Date(Date.now() + 86400000),
          endAt: new Date(Date.now() + 172800000),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 50,
          remainingCapacity: 50,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      const attemptRes = await server.inject({
        method: 'POST',
        url: `/events/${futureEvent!.id}/registrations`,
        headers: {
          'x-test-user-id': strikeUser.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });

      expect(attemptRes.statusCode).toBe(403);
      const json = JSON.parse(attemptRes.body);
      expect(json.error.code).toBe('COOLDOWN_ACTIVE');
    });

    it('attending an event (CHECKED_IN) resets consecutive_no_shows counter to 0', async () => {
      const ts = Date.now();

      // Create a user with 1 prior no-show
      const [attendee] = await db
        .insert(users)
        .values({
          clerkId: `clerk_reset_att_${ts}`,
          email: `reset_att_${ts}@campus.edu`,
          fullName: 'Reset Attendee',
          strikeCount: 1,
          consecutiveNoShows: 1,
          role: UserRole.STUDENT,
        })
        .returning();

      const [ev] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Checked In Event ${ts}`,
          slug: `checked-in-ev-${ts}`,
          description: 'Testing counter reset upon check-in.',
          category: 'Seminar',
          startAt: new Date(Date.now() - 3600000 * 2),
          endAt: new Date(Date.now() - 40 * 60 * 1000),
          registrationOpensAt: new Date(Date.now() - 86400000),
          registrationClosesAt: new Date(Date.now() - 3600000),
          status: EventStatus.PUBLISHED,
          capacity: 50,
          remainingCapacity: 49,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: ev!.id,
          userId: attendee!.id,
          status: RegistrationStatus.CONFIRMED,
        })
        .returning();

      // Marked as CHECKED_IN
      await db.insert(tickets).values({
        registrationId: reg!.id,
        eventId: ev!.id,
        userId: attendee!.id,
        token: `ev_tok_checkedin_${ts}`.padEnd(32, 'y').slice(0, 32),
        status: TicketStatus.CHECKED_IN,
        checkedInAt: new Date(Date.now() - 50 * 60 * 1000),
      });

      await sweepEventStrikes();

      const [userAfter] = await db
        .select()
        .from(users)
        .where(eq(users.id, attendee!.id));

      expect(userAfter?.consecutiveNoShows).toBe(0);
      expect(userAfter?.strikeCount).toBe(1); // strike count preserved, consecutive reset
    });
  });

  describe('Sandbox Payments & Schema Strictness', () => {
    let paidEvent: any;
    let payingUser: any;
    let paidReg: any;

    beforeAll(async () => {
      const ts = Date.now();
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_pay_student_${ts}`,
          email: `pay_student_${ts}@campus.edu`,
          fullName: 'Paying Student',
          role: UserRole.STUDENT,
        })
        .returning();
      payingUser = u;

      const [ev] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Paid Flagship Summit ${ts}`,
          slug: `paid-summit-${ts}`,
          description: 'Testing paid reservations and sandbox gateway.',
          category: 'Conference',
          startAt: new Date(Date.now() + 86400000),
          endAt: new Date(Date.now() + 172800000),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 1,
          remainingCapacity: 1,
          pricePaise: 49900, // ₹499.00
          isPaid: true,
          createdBy: organizerUser.id,
        })
        .returning();
      paidEvent = ev;

      // Register -> PAYMENT_REQUIRED, holds seat
      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${paidEvent.id}/registrations`,
        headers: {
          'x-test-user-id': payingUser.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });

      expect(regRes.statusCode).toBe(201);
      const json = JSON.parse(regRes.body);
      expect(json.outcome).toBe('PAYMENT_REQUIRED');
      paidReg = json.registration;
    });

    it('request schema strictly rejects unknown financial properties like cardNumber', () => {
      expect(() =>
        sandboxCheckoutSchema.parse({
          simulate: 'SUCCESS',
          cardNumber: '4111222233334444',
        })
      ).toThrow();

      expect(() =>
        sandboxCheckoutSchema.parse({
          simulate: 'SUCCESS',
          upiId: 'student@okhdfcbank',
        })
      ).toThrow();

      expect(() =>
        sandboxCheckoutSchema.parse({
          simulate: 'SUCCESS',
          bankAccount: '1234567890',
        })
      ).toThrow();
    });

    it('sandbox checkout with FAILURE releases the seat back to capacity', async () => {
      const checkoutRes = await server.inject({
        method: 'POST',
        url: `/registrations/${paidReg.id}/sandbox-checkout`,
        headers: { 'x-test-user-id': payingUser.id },
        payload: {
          simulate: 'FAILURE',
        },
      });

      expect(checkoutRes.statusCode).toBe(402);
      const json = JSON.parse(checkoutRes.body);
      expect(json.outcome).toBe('FAILED');

      // Assert registration cancelled
      const [regAfter] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, paidReg.id));
      expect(regAfter?.paymentStatus).toBe(PaymentStatus.FAILED);
      expect(regAfter?.status).toBe(RegistrationStatus.CANCELLED);

      // Assert seat capacity released back to 1
      const [evAfter] = await db
        .select()
        .from(events)
        .where(eq(events.id, paidEvent.id));
      expect(evAfter?.remainingCapacity).toBe(1);
    });

    it('sandbox checkout with SUCCESS confirms registration, issues ticket, and logs ledger entry', async () => {
      // Re-register paying user for the released seat
      const reRegRes = await server.inject({
        method: 'POST',
        url: `/events/${paidEvent.id}/registrations`,
        headers: {
          'x-test-user-id': payingUser.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });
      expect(reRegRes.statusCode).toBe(201);
      const newReg = JSON.parse(reRegRes.body).registration;

      // Checkout with SUCCESS
      const checkoutRes = await server.inject({
        method: 'POST',
        url: `/registrations/${newReg.id}/sandbox-checkout`,
        headers: { 'x-test-user-id': payingUser.id },
        payload: {
          simulate: 'SUCCESS',
        },
      });

      expect(checkoutRes.statusCode).toBe(200);
      const json = JSON.parse(checkoutRes.body);
      expect(json.outcome).toBe('SUCCEEDED');
      expect(json.ticket).toBeDefined();

      // Verify payment and ledger
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.registrationId, newReg.id));
      expect(payment?.status).toBe(PaymentStatus.SUCCEEDED);

      const [ledger] = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.paymentId, payment!.id));
      expect(ledger?.kind).toBe('CHARGE');
      expect(ledger?.amountPaise).toBe(49900);
      expect(ledger?.balanceAfterPaise).toBe(49900);

      // Now cancel the confirmed paid registration -> creates REFUND ledger entry
      const cancelRes = await server.inject({
        method: 'POST',
        url: `/registrations/${newReg.id}/cancel`,
        headers: { 'x-test-user-id': payingUser.id },
      });
      expect(cancelRes.statusCode).toBe(200);

      const refundEntries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.paymentId, payment!.id))
        .orderBy(asc(ledgerEntries.createdAt));

      expect(refundEntries).toHaveLength(2);
      expect(refundEntries[1]?.kind).toBe('REFUND');
      expect(refundEntries[1]?.amountPaise).toBe(-49900);
      expect(refundEntries[1]?.balanceAfterPaise).toBe(0);
    });
  });
});
