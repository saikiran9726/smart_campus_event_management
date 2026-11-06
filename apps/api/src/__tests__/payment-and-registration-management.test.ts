import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  NotificationChannel,
  NotificationKind,
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
  notifications,
  payments,
  registrations,
  tickets,
  users,
  waitlistEntries,
} from '../db/schema';
import {
  handleSandboxWebhook,
  signSandboxWebhookPayload,
  verifySandboxWebhookSignature,
} from '../modules/payments/service';
import { buildServer } from '../server';

describe('Payment, Approvals, Cancellations, Waitlist & Notifications Suite', () => {
  const server = buildServer();

  let organizerUser: any;
  let student1: any;
  let student2: any;
  let student3: any;
  let testClub: any;

  function regHeaders(userId: string) {
    return {
      'x-test-user-id': userId,
      'cf-turnstile-response': 'test-pass',
    };
  }

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create Organizer and Students
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_mgmt_${ts}`,
        email: `org_mgmt_${ts}@campus.edu`,
        fullName: 'Professor Albus',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [s1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_s1_mgmt_${ts}`,
        email: `s1_mgmt_${ts}@campus.edu`,
        fullName: 'Student Alice',
        rollNumber: `ROLL_S1_${ts}`,
        department: 'Computer Science',
        year: 3,
        role: UserRole.STUDENT,
      })
      .returning();
    student1 = s1;

    const [s2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_s2_mgmt_${ts}`,
        email: `s2_mgmt_${ts}@campus.edu`,
        fullName: 'Student Bob',
        rollNumber: `ROLL_S2_${ts}`,
        department: 'Electrical Engineering',
        year: 2,
        role: UserRole.STUDENT,
      })
      .returning();
    student2 = s2;

    const [s3] = await db
      .insert(users)
      .values({
        clerkId: `clerk_s3_mgmt_${ts}`,
        email: `s3_mgmt_${ts}@campus.edu`,
        fullName: 'Student Charlie',
        rollNumber: `ROLL_S3_${ts}`,
        department: 'Mechanical Engineering',
        year: 4,
        role: UserRole.STUDENT,
      })
      .returning();
    student3 = s3;

    // 2. Create Club & Organizer Membership
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Tech Ops Society ${ts}`,
        slug: `tech-ops-${ts}`,
        description: 'Operations and management test club',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Payment Safety & Strict Test Mode', () => {
    it('disallows live credentials/extraneous parameters in sandbox checkout', async () => {
      const now = new Date();
      const [paidEvent]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Strict Sandbox Paid Event ${Date.now()}`,
          slug: `strict-sbx-${Date.now()}`,
          description: 'Testing strict sandbox mode',
          category: 'Workshop',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 10,
          remainingCapacity: 10,
          pricePaise: 50000, // Rs. 500
          isPaid: true,
          createdBy: organizerUser.id,
        })
        .returning();

      // Register student1
      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${paidEvent.id}/registrations`,
        headers: regHeaders(student1.id),
        payload: { answers: {} },
      });
      expect(regRes.statusCode).toBe(201);
      const regData = JSON.parse(regRes.payload);
      expect(regData.outcome).toBe('PAYMENT_REQUIRED');
      expect(regData.registration.paymentStatus).toBe(PaymentStatus.PENDING);

      // Attempt checkout with extraneous/forbidden financial parameters
      const invalidCheckout = await server.inject({
        method: 'POST',
        url: `/registrations/${regData.registration.id}/sandbox-checkout`,
        headers: { 'x-test-user-id': student1.id },
        payload: {
          simulate: 'SUCCESS',
          cardNumber: '4111222233334444', // Strictly forbidden
          cvv: '123',
        },
      });
      expect(invalidCheckout.statusCode).toBe(400);
    });

    it('simulates sandbox payment SUCCESS atomically with ledger charge, ticket, and notification', async () => {
      const now = new Date();
      const [paidEvent]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Sandbox Checkout Success Event ${Date.now()}`,
          slug: `sbx-succ-${Date.now()}`,
          description: 'Testing successful sandbox checkout',
          category: 'Conference',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 5,
          remainingCapacity: 5,
          pricePaise: 25000, // Rs. 250
          isPaid: true,
          createdBy: organizerUser.id,
        })
        .returning();

      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${paidEvent.id}/registrations`,
        headers: regHeaders(student1.id),
        payload: { answers: {} },
      });
      const regId = JSON.parse(regRes.payload).registration.id;

      // Execute simulated checkout success
      const checkoutRes = await server.inject({
        method: 'POST',
        url: `/registrations/${regId}/sandbox-checkout`,
        headers: { 'x-test-user-id': student1.id },
        payload: { simulate: 'SUCCESS' },
      });
      expect(checkoutRes.statusCode).toBe(200);
      const checkoutBody = JSON.parse(checkoutRes.payload);
      expect(checkoutBody.outcome).toBe('SUCCEEDED');
      expect(checkoutBody.payment.status).toBe(PaymentStatus.SUCCEEDED);
      expect(checkoutBody.ticket).toBeDefined();

      // Verify running balance ledger entry
      const [ledger]: any = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.paymentId, checkoutBody.payment.id));
      expect(ledger).toBeDefined();
      expect(ledger.kind).toBe('CHARGE');
      expect(ledger.amountPaise).toBe(25000);
      expect(ledger.balanceAfterPaise).toBe(25000);

      // Verify payment success notification
      const notifs: any = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, student1.id),
            eq(notifications.kind, NotificationKind.PAYMENT_SUCCESS)
          )
        );
      expect(notifs.length).toBeGreaterThanOrEqual(1);
      const inAppNotif = notifs.find((n: any) => n.channel === NotificationChannel.IN_APP);
      expect(inAppNotif).toBeDefined();

      // Test idempotency: calling checkout again returns existing outcome without duplicate charges
      const secondCheckout = await server.inject({
        method: 'POST',
        url: `/registrations/${regId}/sandbox-checkout`,
        headers: { 'x-test-user-id': student1.id },
        payload: { simulate: 'SUCCESS' },
      });
      expect(secondCheckout.statusCode).toBe(200);

      const allLedgers = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.paymentId, checkoutBody.payment.id));
      expect(allLedgers.length).toBe(1); // Idempotent: no double-charging
    });

    it('simulates sandbox payment FAILURE and releases held reservation', async () => {
      const now = new Date();
      const [paidEvent]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Sandbox Checkout Failure Event ${Date.now()}`,
          slug: `sbx-fail-${Date.now()}`,
          description: 'Testing failed sandbox checkout',
          category: 'Hackathon',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 2,
          remainingCapacity: 2,
          pricePaise: 30000,
          isPaid: true,
          createdBy: organizerUser.id,
        })
        .returning();

      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${paidEvent.id}/registrations`,
        headers: regHeaders(student2.id),
        payload: { answers: {} },
      });
      const regId = JSON.parse(regRes.payload).registration.id;

      // Event remaining capacity should be decremented to 1
      const [eventDuringHold]: any = await db
        .select()
        .from(events)
        .where(eq(events.id, paidEvent.id));
      expect(eventDuringHold.remainingCapacity).toBe(1);

      // Simulate failure
      const checkoutRes = await server.inject({
        method: 'POST',
        url: `/registrations/${regId}/sandbox-checkout`,
        headers: { 'x-test-user-id': student2.id },
        payload: { simulate: 'FAILURE' },
      });
      expect(checkoutRes.statusCode).toBe(402);

      // Registration is CANCELLED and remaining capacity restored
      const [regAfter]: any = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, regId));
      expect(regAfter.status).toBe(RegistrationStatus.CANCELLED);
      expect(regAfter.paymentStatus).toBe(PaymentStatus.FAILED);

      const [eventAfter]: any = await db
        .select()
        .from(events)
        .where(eq(events.id, paidEvent.id));
      expect(eventAfter.remainingCapacity).toBe(2);
    });

    it('verifies HMAC-SHA256 signature for sandbox webhook', async () => {
      const payload = JSON.stringify({
        paymentId: 'fake-payment-id',
        simulate: 'SUCCESS',
      });
      const validSig = signSandboxWebhookPayload(payload);
      expect(verifySandboxWebhookSignature(payload, validSig)).toBe(true);
      expect(verifySandboxWebhookSignature(payload, 'invalid-signature')).toBe(false);
    });
  });

  describe('2. Organizer Approvals & Rejections Workflow', () => {
    it('enforces manual approval when approvalRequired=true and issues ticket only after organizer approves', async () => {
      const now = new Date();
      const [approvalEvent]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Manual Approval Event ${Date.now()}`,
          slug: `manual-appr-${Date.now()}`,
          description: 'Requires faculty/organizer approval',
          category: 'Seminar',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 10,
          remainingCapacity: 10,
          pricePaise: 0,
          isPaid: false,
          approvalRequired: true, // Manual approval required
          createdBy: organizerUser.id,
        })
        .returning();

      // Student registers
      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${approvalEvent.id}/registrations`,
        headers: regHeaders(student1.id),
        payload: { answers: {} },
      });
      expect(regRes.statusCode).toBe(201);
      const regData = JSON.parse(regRes.payload);
      expect(regData.registration.approvalStatus).toBe('PENDING');
      expect(regData.ticket).toBeUndefined(); // Ticket NOT issued yet

      // Verify no ticket issued in database
      const [ticketBefore]: any = await db
        .select()
        .from(tickets)
        .where(eq(tickets.registrationId, regData.registration.id));
      expect(ticketBefore).toBeUndefined();

      // Organizer approves registration
      const approveRes = await server.inject({
        method: 'POST',
        url: `/events/${approvalEvent.id}/registrations/${regData.registration.id}/approve`,
        headers: { 'x-test-user-id': organizerUser.id },
      });
      expect(approveRes.statusCode).toBe(200);
      const approveData = JSON.parse(approveRes.payload);
      expect(approveData.registration.approvalStatus).toBe('APPROVED');
      expect(approveData.registration.reviewedBy).toBe(organizerUser.id);
      expect(approveData.registration.reviewedAt).toBeDefined();
      expect(approveData.ticket).toBeDefined(); // Ticket issued now!

      // Verify in-app notification delivered
      const [approvalNotif]: any = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, student1.id),
            eq(notifications.kind, NotificationKind.REGISTRATION_APPROVED),
            eq(notifications.channel, NotificationChannel.IN_APP)
          )
        );
      expect(approvalNotif).toBeDefined();
      expect(approvalNotif.status).toBe('SENT');
    });

    it('allows organizer to reject registration with reason, releasing capacity and voiding ticket', async () => {
      const now = new Date();
      const [event]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Rejection Test Event ${Date.now()}`,
          slug: `reject-test-${Date.now()}`,
          description: 'Testing organizer rejection',
          category: 'Competition',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 5,
          remainingCapacity: 5,
          pricePaise: 0,
          isPaid: false,
          approvalRequired: true,
          createdBy: organizerUser.id,
        })
        .returning();

      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${event.id}/registrations`,
        headers: regHeaders(student2.id),
        payload: { answers: {} },
      });
      const regId = JSON.parse(regRes.payload).registration.id;

      // Organizer rejects registration
      const rejectRes = await server.inject({
        method: 'POST',
        url: `/events/${event.id}/registrations/${regId}/reject`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: { reason: 'Prerequisites not met' },
      });
      expect(rejectRes.statusCode).toBe(200);
      const rejectData = JSON.parse(rejectRes.payload);
      expect(rejectData.registration.approvalStatus).toBe('REJECTED');
      expect(rejectData.registration.status).toBe(RegistrationStatus.CANCELLED);
      expect(rejectData.registration.rejectionReason).toBe('Prerequisites not met');
      expect(rejectData.registration.reviewedBy).toBe(organizerUser.id);

      // Verify seat capacity was restored
      const [updatedEvent]: any = await db
        .select()
        .from(events)
        .where(eq(events.id, event.id));
      expect(updatedEvent.remainingCapacity).toBe(5);

      // Verify rejection notification sent
      const [rejectNotif]: any = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, student2.id),
            eq(notifications.kind, NotificationKind.REGISTRATION_REJECTED)
          )
        );
      expect(rejectNotif).toBeDefined();
    });
  });

  describe('3. Cancellations & Test Refund Status', () => {
    it('enforces cancellation deadline for student cancellation requests', async () => {
      const now = new Date();
      const pastDeadline = new Date(now.getTime() - 60000); // 1 minute ago

      const [deadlineEvent]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Cancellation Deadline Event ${Date.now()}`,
          slug: `canc-dl-${Date.now()}`,
          description: 'Event with expired cancellation deadline',
          category: 'Cultural',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          cancellationDeadline: pastDeadline, // Expired!
          status: EventStatus.PUBLISHED,
          capacity: 10,
          remainingCapacity: 10,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      // Register student
      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${deadlineEvent.id}/registrations`,
        headers: regHeaders(student3.id),
        payload: { answers: {} },
      });
      const regId = JSON.parse(regRes.payload).registration.id;

      // Student tries to cancel after cancellation deadline -> 400
      const studentCancel = await server.inject({
        method: 'POST',
        url: `/registrations/${regId}/cancel`,
        headers: { 'x-test-user-id': student3.id },
        payload: { reason: 'Can no longer attend' },
      });
      expect(studentCancel.statusCode).toBe(400);
      expect(JSON.parse(studentCancel.payload).error.message).toContain('Cancellation deadline has passed');

      // Organizer CAN override and cancel past deadline
      const organizerCancel = await server.inject({
        method: 'POST',
        url: `/events/${deadlineEvent.id}/registrations/${regId}/cancel`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: { reason: 'Organizer approved exceptional cancellation' },
      });
      expect(organizerCancel.statusCode).toBe(200);

      const [cancelledReg]: any = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, regId));
      expect(cancelledReg.status).toBe(RegistrationStatus.CANCELLED);
      expect(cancelledReg.cancellationReason).toBe('Organizer approved exceptional cancellation');
    });

    it('cancels paid registration on-time and processes test refund into ledger', async () => {
      const now = new Date();
      const futureDeadline = new Date(now.getTime() + 3600000); // 1 hour in future

      const [paidEvent]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Refundable Paid Event ${Date.now()}`,
          slug: `refund-event-${Date.now()}`,
          description: 'Testing full refund workflow',
          category: 'Symposium',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          cancellationDeadline: futureDeadline,
          status: EventStatus.PUBLISHED,
          capacity: 5,
          remainingCapacity: 5,
          pricePaise: 40000, // Rs. 400
          isPaid: true,
          createdBy: organizerUser.id,
        })
        .returning();

      // Register and pay
      const regRes = await server.inject({
        method: 'POST',
        url: `/events/${paidEvent.id}/registrations`,
        headers: regHeaders(student1.id),
        payload: { answers: {} },
      });
      const regId = JSON.parse(regRes.payload).registration.id;

      await server.inject({
        method: 'POST',
        url: `/registrations/${regId}/sandbox-checkout`,
        headers: { 'x-test-user-id': student1.id },
        payload: { simulate: 'SUCCESS' },
      });

      // Verify ticket is valid
      const [ticketBefore]: any = await db
        .select()
        .from(tickets)
        .where(eq(tickets.registrationId, regId));
      expect(ticketBefore.status).toBe(TicketStatus.VALID);

      // Student cancels registration before deadline
      const cancelRes = await server.inject({
        method: 'POST',
        url: `/registrations/${regId}/cancel`,
        headers: { 'x-test-user-id': student1.id },
        payload: { reason: 'Schedule conflict' },
      });
      expect(cancelRes.statusCode).toBe(200);

      // Ticket should be VOID
      const [ticketAfter]: any = await db
        .select()
        .from(tickets)
        .where(eq(tickets.registrationId, regId));
      expect(ticketAfter.status).toBe(TicketStatus.VOID);

      // Registration paymentStatus should be REFUNDED
      const [regAfter]: any = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, regId));
      expect(regAfter.status).toBe(RegistrationStatus.CANCELLED);
      expect(regAfter.paymentStatus).toBe(PaymentStatus.REFUNDED);

      // Ledger must contain REFUND entry with zeroed running balance
      const [refundLedger]: any = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.kind, 'REFUND'))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(1);
      expect(refundLedger).toBeDefined();
      expect(refundLedger.amountPaise).toBe(-40000);
      expect(refundLedger.balanceAfterPaise).toBe(0);

      // Cancellation notification sent
      const [cancelNotif]: any = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, student1.id),
            eq(notifications.kind, NotificationKind.REGISTRATION_CANCELLED)
          )
        );
      expect(cancelNotif).toBeDefined();
    });
  });

  describe('4. Deterministic Waitlist & Promotion on Cancellation', () => {
    it('manages capacity limits, queues waitlist in deterministic FIFO order, and automatically promotes upon cancellation', async () => {
      const now = new Date();
      const [fullEvent]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Waitlist FIFO Event ${Date.now()}`,
          slug: `wl-fifo-${Date.now()}`,
          description: 'Capacity 1 event to test FIFO waitlist promotion',
          category: 'Coding',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 1, // Only 1 seat!
          remainingCapacity: 1,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      // Student 1 grabs the only seat -> CONFIRMED
      const reg1 = await server.inject({
        method: 'POST',
        url: `/events/${fullEvent.id}/registrations`,
        headers: regHeaders(student1.id),
        payload: { answers: {} },
      });
      expect(JSON.parse(reg1.payload).outcome).toBe('CONFIRMED');

      // Student 2 registers -> WAITLISTED at position 1
      const reg2 = await server.inject({
        method: 'POST',
        url: `/events/${fullEvent.id}/registrations`,
        headers: regHeaders(student2.id),
        payload: { answers: {} },
      });
      const reg2Data = JSON.parse(reg2.payload);
      expect(reg2Data.outcome).toBe('WAITLISTED');
      expect(reg2Data.position).toBe(1);

      // Student 3 registers -> WAITLISTED at position 2
      const reg3 = await server.inject({
        method: 'POST',
        url: `/events/${fullEvent.id}/registrations`,
        headers: regHeaders(student3.id),
        payload: { answers: {} },
      });
      const reg3Data = JSON.parse(reg3.payload);
      expect(reg3Data.outcome).toBe('WAITLISTED');
      expect(reg3Data.position).toBe(2);

      // Student 1 cancels their registration
      const s1RegId = JSON.parse(reg1.payload).registration.id;
      const cancelRes = await server.inject({
        method: 'POST',
        url: `/registrations/${s1RegId}/cancel`,
        headers: { 'x-test-user-id': student1.id },
      });
      expect(cancelRes.statusCode).toBe(200);

      // FIFO Check: Student 2 (first in line) must now be promoted to OFFERED
      const [s2RegAfter]: any = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, reg2Data.registration.id));
      expect(s2RegAfter.status).toBe(RegistrationStatus.OFFERED);
      expect(s2RegAfter.offerExpiresAt).toBeDefined();

      // Student 3 must still be WAITLISTED
      const [s3RegAfter]: any = await db
        .select()
        .from(registrations)
        .where(eq(registrations.id, reg3Data.registration.id));
      expect(s3RegAfter.status).toBe(RegistrationStatus.WAITLISTED);

      // Student 2 received waitlist offer notification (IN_APP and EMAIL)
      const [wlNotif]: any = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, student2.id),
            eq(notifications.kind, NotificationKind.WAITLIST_OFFER),
            eq(notifications.channel, NotificationChannel.IN_APP)
          )
        );
      expect(wlNotif).toBeDefined();

      // Student 2 claims the offer within window
      const claimRes = await server.inject({
        method: 'POST',
        url: `/registrations/${reg2Data.registration.id}/claim-offer`,
        headers: { 'x-test-user-id': student2.id },
      });
      expect(claimRes.statusCode).toBe(200);
      const claimData = JSON.parse(claimRes.payload);
      expect(claimData.outcome).toBe('CONFIRMED');
      expect(claimData.ticket).toBeDefined();
    });
  });

  describe('5. In-App Notifications & Organizer Alerts', () => {
    it('allows student to fetch in-app notifications independently of external email and mark as read', async () => {
      // Fetch student1 notifications
      const inboxRes = await server.inject({
        method: 'GET',
        url: '/me/notifications',
        headers: { 'x-test-user-id': student1.id },
      });
      expect(inboxRes.statusCode).toBe(200);
      const inboxData = JSON.parse(inboxRes.payload);
      expect(Array.isArray(inboxData.notifications)).toBe(true);
      expect(inboxData.notifications.length).toBeGreaterThan(0);

      const targetNotif = inboxData.notifications[0];

      // Mark single notification as read
      const readRes = await server.inject({
        method: 'POST',
        url: `/me/notifications/${targetNotif.id}/read`,
        headers: { 'x-test-user-id': student1.id },
      });
      expect(readRes.statusCode).toBe(200);
      expect(JSON.parse(readRes.payload).notification.status).toBe('READ');

      // Mark all as read
      const readAllRes = await server.inject({
        method: 'POST',
        url: '/me/notifications/read-all',
        headers: { 'x-test-user-id': student1.id },
      });
      expect(readAllRes.statusCode).toBe(200);

      // Query with unreadOnly=true -> should return empty
      const unreadRes = await server.inject({
        method: 'GET',
        url: '/me/notifications?unreadOnly=true',
        headers: { 'x-test-user-id': student1.id },
      });
      expect(JSON.parse(unreadRes.payload).notifications.length).toBe(0);
    });

    it('allows organizer to broadcast alerts to all confirmed attendees of an event', async () => {
      const now = new Date();
      const [alertEvent]: any = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Broadcast Alert Event ${Date.now()}`,
          slug: `bcast-${Date.now()}`,
          description: 'Testing organizer alerts',
          category: 'Keynote',
          startAt: new Date(now.getTime() + 86400000),
          endAt: new Date(now.getTime() + 172800000),
          registrationOpensAt: new Date(now.getTime() - 3600000),
          registrationClosesAt: new Date(now.getTime() + 86400000),
          status: EventStatus.PUBLISHED,
          capacity: 10,
          remainingCapacity: 10,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      // Confirm student1 and student2
      await server.inject({
        method: 'POST',
        url: `/events/${alertEvent.id}/registrations`,
        headers: regHeaders(student1.id),
        payload: { answers: {} },
      });
      await server.inject({
        method: 'POST',
        url: `/events/${alertEvent.id}/registrations`,
        headers: regHeaders(student2.id),
        payload: { answers: {} },
      });

      // Organizer broadcasts alert
      const broadcastRes = await server.inject({
        method: 'POST',
        url: `/events/${alertEvent.id}/broadcast`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Room Change Notice',
          message: 'The keynote has moved to Auditorium B.',
        },
      });
      expect(broadcastRes.statusCode).toBe(200);
      expect(JSON.parse(broadcastRes.payload).deliveredCount).toBe(2);

      // Verify both student1 and student2 received the in-app alert
      const [s1Alert]: any = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, student1.id),
            eq(notifications.eventId, alertEvent.id),
            eq(notifications.kind, NotificationKind.ORGANIZER_ALERT)
          )
        );
      expect(s1Alert).toBeDefined();

      const [s2Alert]: any = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, student2.id),
            eq(notifications.eventId, alertEvent.id),
            eq(notifications.kind, NotificationKind.ORGANIZER_ALERT)
          )
        );
      expect(s2Alert).toBeDefined();
    });
  });
});
