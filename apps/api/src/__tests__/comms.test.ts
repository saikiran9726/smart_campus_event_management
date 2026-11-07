import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import jsQR from 'jsqr';
import sharp from 'sharp';
import {
  ClubMemberRole,
  EventStatus,
  NotificationChannel,
  NotificationKind,
  PaymentStatus,
  RegistrationStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubMembers,
  clubs,
  events,
  notifications,
  registrations,
  tickets,
  users,
  venues,
} from '../db/schema';
import {
  getDefaultConsoleEmailProvider,
  getDefaultConsoleWhatsAppProvider,
} from '../modules/comms/providers';
import { enqueue, notifyBookingConfirmed } from '../modules/comms/queue';
import { issueTicket } from '../modules/tickets/service';
import { buildServer } from '../server';
import { processCommsQueueOnce } from '../workers/comms.worker';
import { runRemindersSweepOnce } from '../workers/reminders.worker';

describe('Comms Module, Providers, Templates, ICS, & Workers Suite', () => {
  const server = buildServer();

  let adminUser: any;
  let organizerUser: any;
  let studentWithPhone: any;
  let studentNoPhone: any;
  let testClub: any;
  let testVenue: any;
  let upcomingEvent: any;

  beforeAll(async () => {
    await server.ready();
    await db.delete(notifications);

    const ts = Date.now();

    // 1. Create Users
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_comms_admin_${ts}`,
        email: `comms_admin_${ts}@campus.edu`,
        fullName: 'Comms Admin',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin;

    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_comms_org_${ts}`,
        email: `comms_org_${ts}@campus.edu`,
        fullName: 'Comms Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [std1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_comms_std1_${ts}`,
        email: `comms_std1_${ts}@campus.edu`,
        fullName: 'Rohit Sharma',
        rollNumber: `CS_2026_${ts}`,
        phone: '+919876543210',
        role: UserRole.STUDENT,
        department: 'Computer Science',
      })
      .returning();
    studentWithPhone = std1;

    const [std2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_comms_std2_${ts}`,
        email: `comms_std2_${ts}@campus.edu`,
        fullName: 'Priya Patel',
        rollNumber: `EC_2026_${ts}`,
        phone: null, // No phone number!
        role: UserRole.STUDENT,
        department: 'Electronics',
      })
      .returning();
    studentNoPhone = std2;

    // 2. Create Venue
    const [venue] = await db
      .insert(venues)
      .values({
        name: `Auditorium Prime ${ts}`,
        locationText: 'Main Academic Block, Level 2',
        capacity: 500,
        mapUrl: 'https://maps.google.com/?q=Campus+Main+Auditorium',
      })
      .returning();
    testVenue = venue;

    // 3. Create Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Tech Innovators ${ts}`,
        slug: `tech-innovators-${ts}`,
        description: 'Technology and hackathon organizers.',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 4. Create Event
    const now = new Date();
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        venueId: testVenue.id,
        title: `AI & Cloud Summit ${ts}`,
        slug: `ai-cloud-summit-${ts}`,
        description: 'Annual campus flagship technology conference.',
        category: 'Conference',
        startAt: new Date(now.getTime() + 24 * 3600 * 1000), // starts in exactly 24 hours
        endAt: new Date(now.getTime() + 28 * 3600 * 1000),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 100,
        remainingCapacity: 100,
        pricePaise: 0,
        isPaid: false,
        notes: {
          gates: 'Gate 3 & North Entry',
          rules: ['Strictly no outside beverages', 'Carry student ID card'],
          requiredIdProofs: 'Valid College RFID Card',
          parking: 'South Campus Parking Bay B',
        },
        createdBy: organizerUser.id,
      })
      .returning();
    upcomingEvent = ev;
  });

  beforeEach(async () => {
    await db.delete(notifications);
    getDefaultConsoleEmailProvider().clearSentEmails();
    getDefaultConsoleWhatsAppProvider().clearSentMessages();
    getDefaultConsoleEmailProvider().setFailNext(0);
    getDefaultConsoleWhatsAppProvider().setFailNext(0);
  });

  afterAll(async () => {
    await server.close();
  });

  // --- SUITE 1: BOOKING CONFIRMATION, .ICS & INLINE QR DECODING ---
  describe('Booking Confirmation, Calendar .ics & Inline QR', () => {
    it('confirming a free registration produces one email with a .ics attachment containing BEGIN:VEVENT and two BEGIN:VALARM, and an inline QR decoded to the ticket token', async () => {
      // 1. Create registration and ticket
      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: upcomingEvent.id,
          userId: studentWithPhone.id,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.NOT_REQUIRED,
        })
        .returning();

      const ticket = await issueTicket(db, reg!);

      // 2. Trigger notifyBookingConfirmed hook
      await notifyBookingConfirmed(db, reg!.id);

      // 3. Process the comms queue
      const processedCount = await processCommsQueueOnce();
      expect(processedCount).toBeGreaterThanOrEqual(2); // Email + WhatsApp

      // 4. Verify Email output
      const sentEmails = getDefaultConsoleEmailProvider().getSentEmails();
      const email = sentEmails.find((e) => e.to === studentWithPhone.email);
      expect(email).toBeDefined();
      expect(email!.subject).toContain('Booking Confirmed');
      expect(email!.html).toContain(studentWithPhone.fullName);
      expect(email!.html).toContain(studentWithPhone.rollNumber);
      expect(email!.html).toContain(upcomingEvent.title);
      expect(email!.html).toContain('cid:ticket-qr');

      // Verify .ics calendar attachment
      const icsAttachment = email!.attachments?.find((a) =>
        a.filename.endsWith('.ics')
      );
      expect(icsAttachment).toBeDefined();
      const icsContent = icsAttachment!.content.toString();
      expect(icsContent).toContain('BEGIN:VCALENDAR');
      expect(icsContent).toContain('BEGIN:VEVENT');
      expect(icsContent).toContain('END:VEVENT');

      // Assert exactly two VALARM blocks
      const valarmMatches = icsContent.match(/BEGIN:VALARM/g);
      expect(valarmMatches).not.toBeNull();
      expect(valarmMatches!.length).toBe(2);
      expect(icsContent).toContain('TRIGGER:-PT24H');
      expect(icsContent).toContain('TRIGGER:-PT2H');

      // Verify inline QR PNG attachment
      const qrAttachment = email!.attachments?.find(
        (a) => a.cid === 'ticket-qr'
      );
      expect(qrAttachment).toBeDefined();
      expect(qrAttachment!.contentType).toBe('image/png');

      const qrBuffer = Buffer.isBuffer(qrAttachment!.content)
        ? qrAttachment!.content
        : Buffer.from(qrAttachment!.content);

      // Decode the QR PNG using sharp and jsQR
      const image = sharp(qrBuffer);
      const metadata = await image.metadata();
      const raw = await image.ensureAlpha().raw().toBuffer();
      const decoded = jsQR(
        new Uint8ClampedArray(raw),
        metadata.width!,
        metadata.height!
      );

      expect(decoded).not.toBeNull();
      expect(decoded!.data).toBe(ticket.token);
      expect(decoded!.data.length).toBe(32);

      // 5. Verify WhatsApp output
      const sentMessages = getDefaultConsoleWhatsAppProvider().getSentMessages();
      const wa = sentMessages.find(
        (m) => m.toPhone.replace(/[^0-9]/g, '') === '919876543210'
      );
      expect(wa).toBeDefined();
      expect(wa!.text).toContain(upcomingEvent.title);
      expect(wa!.text).toContain(studentWithPhone.rollNumber);
      expect(wa!.text).toContain(`/tickets/${reg!.id}/qr.png`);
    });
  });

  // --- SUITE 2: SILENT SKIPPING ON USERS WITHOUT PHONE ---
  describe('Silent WhatsApp Handling for Users Without Phone', () => {
    it('user without phone does not throw; WhatsApp notification status marked SENT with error NO_PHONE', async () => {
      // 1. Create registration for student without phone
      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: upcomingEvent.id,
          userId: studentNoPhone.id,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.NOT_REQUIRED,
        })
        .returning();

      await issueTicket(db, reg!);

      // Enqueue WhatsApp notification specifically
      const notif = await enqueue(db, {
        userId: studentNoPhone.id,
        eventId: upcomingEvent.id,
        kind: NotificationKind.BOOKING_CONFIRMED,
        channel: NotificationChannel.WHATSAPP,
        payload: {
          eventTitle: upcomingEvent.title,
          studentName: studentNoPhone.fullName,
          rollNumber: studentNoPhone.rollNumber,
        },
      });

      expect(notif).toBeDefined();

      // 2. Process queue: must not throw
      await expect(processCommsQueueOnce()).resolves.not.toThrow();

      // 3. Inspect database status for that notification
      const [updated] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id))
        .limit(1);

      expect(['SENT', 'SKIPPED']).toContain(updated!.status);
      expect(updated!.error).toBe('NO_PHONE');
      expect(updated!.sentAt).not.toBeNull();

      // Ensure no message was dispatched to WhatsApp provider
      const sentMessages = getDefaultConsoleWhatsAppProvider().getSentMessages();
      expect(sentMessages.length).toBe(0);
    });
  });

  // --- SUITE 3: REMINDER SCHEDULER IDEMPOTENCY & DEDUPLICATION ---
  describe('Reminder Scheduler Deduplication & Dedupe Unique Constraint', () => {
    it('the 24h reminder is enqueued exactly once even if the scheduler runs three times', async () => {
      // 1. Create a confirmed registration for studentWithPhone on upcomingEvent (which starts in 24h)
      // Delete any previous notification rows for this combination to start clean
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.userId, studentWithPhone.id),
            eq(notifications.eventId, upcomingEvent.id),
            eq(notifications.kind, NotificationKind.REMINDER_24H)
          )
        );

      // 2. Run scheduler sweep 3 times sequentially
      const run1 = await runRemindersSweepOnce();
      const run2 = await runRemindersSweepOnce();
      const run3 = await runRemindersSweepOnce();

      // First run enqueues; subsequent runs find rows deduplicated
      expect(run1.reminders24h).toBeGreaterThanOrEqual(1);
      expect(run2.reminders24h).toBe(0);
      expect(run3.reminders24h).toBe(0);

      // 3. Verify exactly 1 EMAIL and 1 WHATSAPP reminder exist in DB
      const emailReminders = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, studentWithPhone.id),
            eq(notifications.eventId, upcomingEvent.id),
            eq(notifications.kind, NotificationKind.REMINDER_24H),
            eq(notifications.channel, NotificationChannel.EMAIL)
          )
        );

      expect(emailReminders.length).toBe(1);

      const waReminders = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, studentWithPhone.id),
            eq(notifications.eventId, upcomingEvent.id),
            eq(notifications.kind, NotificationKind.REMINDER_24H),
            eq(notifications.channel, NotificationChannel.WHATSAPP)
          )
        );

      expect(waReminders.length).toBe(1);
    });
  });

  // --- SUITE 4: EXPONENTIAL BACKOFF & FAILURE RETRIES ---
  describe('Provider Failure Backoff and Terminal Failure', () => {
    it('provider failure retries with backoff and marks status FAILED after 5 failed attempts', async () => {
      // 1. Enqueue a dedicated test notification
      const [notif] = await db
        .insert(notifications)
        .values({
          userId: studentWithPhone.id,
          eventId: upcomingEvent.id,
          kind: NotificationKind.STRIKE_NOTICE,
          channel: NotificationChannel.EMAIL,
          payload: {
            studentName: studentWithPhone.fullName,
            rollNumber: studentWithPhone.rollNumber,
            strikeCount: 2,
            reason: 'Unexcused no-show for Workshop',
            cooldownUntil: new Date(Date.now() + 86400000).toISOString(),
          },
          status: 'QUEUED',
          attempts: 0,
          runAt: new Date(Date.now() - 5000), // due right now
        })
        .returning();

      // 2. Configure mock provider to fail
      getDefaultConsoleEmailProvider().setFailNext(10, 'Provider gateway timeout error');

      // Attempt 1: Backoff to 1 minute
      await processCommsQueueOnce();
      let [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id));
      expect(row!.status).toBe('QUEUED');
      expect(row!.attempts).toBe(1);
      expect(row!.error).toBe('Provider gateway timeout error');

      // Fast-forward runAt to test Attempt 2: Backoff to 5 minutes
      await db
        .update(notifications)
        .set({ runAt: new Date(Date.now() - 5000) })
        .where(eq(notifications.id, notif!.id));

      await processCommsQueueOnce();
      [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id));
      expect(row!.status).toBe('QUEUED');
      expect(row!.attempts).toBe(2);

      // Fast-forward to test Attempt 3: Backoff to 30 minutes
      await db
        .update(notifications)
        .set({ runAt: new Date(Date.now() - 5000) })
        .where(eq(notifications.id, notif!.id));

      await processCommsQueueOnce();
      [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id));
      expect(row!.status).toBe('QUEUED');
      expect(row!.attempts).toBe(3);

      // Fast-forward to test Attempt 4
      await db
        .update(notifications)
        .set({ runAt: new Date(Date.now() - 5000) })
        .where(eq(notifications.id, notif!.id));

      await processCommsQueueOnce();
      [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id));
      expect(row!.status).toBe('QUEUED');
      expect(row!.attempts).toBe(4);

      // Fast-forward to test Attempt 5: Exhausted -> FAILED
      await db
        .update(notifications)
        .set({ runAt: new Date(Date.now() - 5000) })
        .where(eq(notifications.id, notif!.id));

      await processCommsQueueOnce();
      [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id));
      expect(row!.status).toBe('FAILED');
      expect(row!.attempts).toBe(5);
      expect(row!.error).toBe('Provider gateway timeout error');
    });
  });

  // --- SUITE 5: WAITLIST OFFER CLAIM LINK & TIMESTAMPS ---
  describe('Waitlist Offer Template & Single-Click Claim Link', () => {
    it('claim link contains the registration id and the offer expiry timestamp', async () => {
      const regId = 'a1b2c3d4-e5f6-4a1b-8c2d-9e0f1a2b3c4d';
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
      const formattedExpiry = expiresAt.toLocaleString('en-US', {
        timeStyle: 'short',
        dateStyle: 'medium',
      });

      const notif = await enqueue(db, {
        userId: studentWithPhone.id,
        eventId: upcomingEvent.id,
        kind: NotificationKind.WAITLIST_OFFER,
        channel: NotificationChannel.EMAIL,
        payload: {
          studentName: studentWithPhone.fullName,
          eventTitle: upcomingEvent.title,
          registrationId: regId,
          claimUrl: `http://localhost:5173/claim/${regId}`,
          expiresAt: expiresAt.toISOString(),
          formattedExpiry,
          minutesRemaining: 15,
        },
      });

      // Force due date to now and process
      await db
        .update(notifications)
        .set({ runAt: new Date(Date.now() - 1000) })
        .where(eq(notifications.id, notif!.id));

      await processCommsQueueOnce();

      const sentEmails = getDefaultConsoleEmailProvider().getSentEmails();
      const offerEmail = sentEmails.find(
        (e) => e.to === studentWithPhone.email && e.subject.includes('Confirmed Seat Available')
      );

      expect(offerEmail).toBeDefined();
      expect(offerEmail!.html).toContain(`/claim/${regId}`);
      expect(offerEmail!.html).toContain('15 Minutes');
      expect(offerEmail!.html).toContain(formattedExpiry);
    });
  });

  // --- SUITE 6: ADMIN NOTIFICATIONS AUDIT & RETRY ENDPOINTS ---
  describe('Admin Notifications Endpoints', () => {
    it('allows system admin to list notifications filtered by status', async () => {
      // Seed a failed notification for audit filter check
      await db.insert(notifications).values({
        userId: studentWithPhone.id,
        eventId: upcomingEvent.id,
        kind: NotificationKind.STRIKE_NOTICE,
        channel: NotificationChannel.EMAIL,
        payload: { test: true },
        status: 'FAILED',
        attempts: 5,
        error: 'Audit test simulated gateway failure',
      });

      const res = await server.inject({
        method: 'GET',
        url: '/admin/notifications?status=FAILED',
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(Array.isArray(data.notifications)).toBe(true);
      expect(data.notifications.length).toBeGreaterThan(0);
      expect(data.notifications[0].status).toBe('FAILED');
    });

    it('rejects regular student from accessing admin notifications endpoint', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/notifications',
        headers: { 'x-test-user-id': studentWithPhone.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it('allows system admin to reset a FAILED notification to QUEUED for retry', async () => {
      // Insert a dedicated failed notification to retry
      const [failed] = await db
        .insert(notifications)
        .values({
          userId: studentWithPhone.id,
          eventId: upcomingEvent.id,
          kind: NotificationKind.STRIKE_NOTICE,
          channel: NotificationChannel.EMAIL,
          payload: { test: true },
          status: 'FAILED',
          attempts: 5,
          error: 'Simulated gateway error for retry',
        })
        .returning();

      expect(failed).toBeDefined();

      const retryRes = await server.inject({
        method: 'POST',
        url: `/admin/notifications/${failed!.id}/retry`,
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(retryRes.statusCode).toBe(200);
      expect(retryRes.json().success).toBe(true);

      const [updated] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, failed!.id))
        .limit(1);

      expect(updated!.status).toBe('QUEUED');
      expect(updated!.attempts).toBe(0);
      expect(updated!.error).toBeNull();
    });
  });
});
