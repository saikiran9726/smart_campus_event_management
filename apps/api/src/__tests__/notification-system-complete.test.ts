import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  EventStatus,
  NotificationChannel,
  NotificationKind,
  PaymentStatus,
  RegistrationStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubs,
  events,
  notificationPreferences,
  notifications,
  registrations,
  users,
  venues,
} from '../db/schema';
import {
  getDefaultConsoleEmailProvider,
} from '../modules/comms/providers';
import {
  enqueue,
  notifyInApp,
  notifyPaymentFailed,
  notifyPaymentSuccess,
} from '../modules/comms/queue';
import { renderEmail, renderWhatsApp } from '../modules/comms/templates';
import { buildServer } from '../server';
import { processCommsQueueOnce } from '../workers/comms.worker';
import {
  runPendingPaymentRemindersSweepOnce,
  runRemindersSweepOnce,
} from '../workers/reminders.worker';

describe('Complete Notification, Email Delivery & Automated Reminder Engine Suite', () => {
  const server = buildServer();

  let adminUser: any;
  let studentUser: any;
  let testClub: any;
  let testVenue: any;
  let testEvent: any;

  beforeAll(async () => {
    await server.ready();

    // Verify connecting to test database (strictly reject production)
    const dbNameRes = await db.execute<{ current_database: string }>(
      'SELECT current_database()' as any
    );
    const dbName = (dbNameRes.rows[0] as any)?.current_database;
    const isTestDb = ['eventora_venue_test', 'eventora_test'].includes(dbName) || (dbName && dbName.endsWith('_test'));
    if (!isTestDb || dbName === 'eventora') {
      throw new Error(`ABORT: Running tests against prohibited database '${dbName}', expected isolated test database`);
    }

    const ts = Date.now();

    // 1. Create Admin
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_notif_admin_${ts}`,
        email: `notif_admin_${ts}@campus.edu`,
        fullName: 'Notification Admin',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin;

    // 2. Create Student
    const [student] = await db
      .insert(users)
      .values({
        clerkId: `clerk_notif_student_${ts}`,
        email: `notif_student_${ts}@campus.edu`,
        fullName: 'Kiran Verma',
        rollNumber: `CS_${ts}`,
        phone: '+919988776655',
        role: UserRole.STUDENT,
        department: 'Computer Science',
      })
      .returning();
    studentUser = student;

    // 3. Create Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Notification Test Club ${ts}`,
        slug: `notification-club-${ts}`,
        description: 'Test club for notification engine.',
        createdBy: adminUser.id,
      })
      .returning();
    testClub = club;

    // 4. Create Venue
    const [venue] = await db
      .insert(venues)
      .values({
        name: `Auditorium ${ts}`,
        capacity: 500,
        locationText: 'North Campus Main Block',
        mapUrl: 'https://maps.google.com/?q=Campus+Auditorium',
      })
      .returning();
    testVenue = venue;

    // 5. Create Event
    const now = new Date();
    const [event] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Campus Hackathon ${ts}`,
        slug: `campus-hackathon-${ts}`,
        description: 'Annual campus flagship hackathon.',
        category: 'Hackathon',
        venueId: testVenue.id,
        startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // starts in 24 hours
        endAt: new Date(now.getTime() + 28 * 60 * 60 * 1000),
        registrationOpensAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        registrationClosesAt: new Date(now.getTime() + 23 * 60 * 60 * 1000),
        status: EventStatus.PUBLISHED,
        capacity: 100,
        remainingCapacity: 100,
        pricePaise: 0,
        isPaid: false,
        createdBy: adminUser.id,
        notes: {
          gates: 'Gate 2',
          rules: ['Carry College ID'],
        },
      })
      .returning();
    testEvent = event;
  });

  beforeEach(() => {
    getDefaultConsoleEmailProvider().reset();
  });

  afterAll(async () => {
    // Clean up created test entities
    if (testEvent) {
      await db.delete(notifications).where(eq(notifications.eventId, testEvent.id));
      await db.delete(registrations).where(eq(registrations.eventId, testEvent.id));
      await db.delete(events).where(eq(events.id, testEvent.id));
    }
    if (testVenue) {
      await db.delete(venues).where(eq(venues.id, testVenue.id));
    }
    if (testClub) {
      await db.delete(clubs).where(eq(clubs.id, testClub.id));
    }
    if (studentUser) {
      await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, studentUser.id));
      await db.delete(notifications).where(eq(notifications.userId, studentUser.id));
      await db.delete(users).where(eq(users.id, studentUser.id));
    }
    if (adminUser) {
      await db.delete(notifications).where(eq(notifications.userId, adminUser.id));
      await db.delete(users).where(eq(users.id, adminUser.id));
    }
    await server.close();
  });

  describe('1. Handlebars Templates Coverage', () => {
    const allKinds = [
      NotificationKind.BOOKING_CONFIRMED,
      NotificationKind.REMINDER_24H,
      NotificationKind.REMINDER_2H,
      NotificationKind.WAITLIST_OFFER,
      NotificationKind.FACULTY_APPROVAL,
      NotificationKind.STRIKE_NOTICE,
      NotificationKind.REGISTRATION_APPROVED,
      NotificationKind.REGISTRATION_REJECTED,
      NotificationKind.REGISTRATION_CANCELLED,
      NotificationKind.PAYMENT_SUCCESS,
      NotificationKind.PAYMENT_FAILED,
      NotificationKind.TEAM_INVITATION,
      NotificationKind.ORGANIZER_ALERT,
    ];

    it('successfully compiles and renders responsive email HTML and subjects for all kinds', () => {
      const mockData = {
        studentName: 'Kiran Verma',
        rollNumber: 'CS_001',
        eventTitle: 'Campus Hackathon',
        eventStart: 'Tomorrow at 10:00 AM',
        venueName: 'Main Auditorium',
        ticketToken: 'EVT-TEST-TOKEN',
        amount: 250,
        teamName: 'CyberKnights',
        inviterName: 'Rohit Sharma',
        reviewerName: 'Prof. Rao',
        reason: 'Eligibility criteria not met',
        title: 'Emergency Room Change',
        message: 'The event has been relocated to Hall B.',
      };

      for (const kind of allKinds) {
        const { subject, html } = renderEmail(kind, mockData);
        expect(subject).toBeDefined();
        expect(subject.length).toBeGreaterThan(5);
        expect(html).toBeDefined();
        expect(html).toContain('<!DOCTYPE html>');
        expect(html.length).toBeGreaterThan(100);
      }
    });

    it('successfully compiles and renders WhatsApp text for all kinds', () => {
      const mockData = {
        studentName: 'Kiran Verma',
        eventTitle: 'Campus Hackathon',
        amount: 250,
        teamName: 'CyberKnights',
        inviterName: 'Rohit Sharma',
        title: 'Important Update',
        message: 'Gates will open at 9:30 AM.',
      };

      for (const kind of allKinds) {
        const { text } = renderWhatsApp(kind, mockData);
        expect(text).toBeDefined();
        expect(text.length).toBeGreaterThan(10);
      }
    });
  });

  describe('2. Queue Deduplication & Idempotency', () => {
    it('prevents duplicate enqueueing of the same (userId, eventId, kind, channel)', async () => {
      const first = await enqueue(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        kind: NotificationKind.REGISTRATION_APPROVED,
        channel: NotificationChannel.EMAIL,
        payload: { studentName: studentUser.fullName, eventTitle: testEvent.title },
      });

      expect(first).not.toBeNull();

      // Second identical enqueue must resolve gracefully without error (returns null due to onConflictDoNothing)
      const duplicate = await enqueue(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        kind: NotificationKind.REGISTRATION_APPROVED,
        channel: NotificationChannel.EMAIL,
        payload: { studentName: studentUser.fullName, eventTitle: testEvent.title },
      });

      expect(duplicate).toBeNull();
    });
  });

  describe('3. Worker Recovery, Backoff & DLQ', () => {
    it('processes queued email and delivers via email provider', async () => {
      // Enqueue fresh notification
      await enqueue(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        kind: NotificationKind.TEAM_INVITATION,
        channel: NotificationChannel.EMAIL,
        payload: { teamName: 'AlphaTech', inviterName: 'Kiran' },
      });

      const processedCount = await processCommsQueueOnce();
      expect(processedCount).toBeGreaterThanOrEqual(1);

      const sentEmails = getDefaultConsoleEmailProvider().getSentEmails();
      expect(sentEmails.some((e) => e.to === studentUser.email)).toBe(true);
    });

    it('schedules retry with backoff on error, and marks FAILED once exhausted (DLQ)', async () => {
      const [failingNotif] = await db
        .insert(notifications)
        .values({
          userId: studentUser.id,
          eventId: testEvent.id,
          kind: NotificationKind.ORGANIZER_ALERT,
          channel: NotificationChannel.EMAIL,
          payload: { title: 'Test Alert', message: 'Hello' },
          status: 'QUEUED',
          attempts: 4, // 4 prior failures
          runAt: new Date(Date.now() - 1000), // due immediately
        })
        .returning();

      getDefaultConsoleEmailProvider().setFailNext('Simulated SMTP Timeout');

      await processCommsQueueOnce();

      const [updated] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, failingNotif!.id))
        .limit(1);

      expect(updated!.status).toBe('FAILED');
      expect(updated!.attempts).toBe(5);
      expect(updated!.error).toContain('Simulated SMTP Timeout');
    });
  });

  describe('4. In-App Notification Center API', () => {
    it('stores in-app notification with SENT status and payload', async () => {
      const inApp = await notifyInApp(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        kind: NotificationKind.BOOKING_CONFIRMED,
        title: 'Seat Confirmed',
        message: 'Your seat for Hackathon is confirmed.',
      });

      expect(inApp).not.toBeNull();
      expect(inApp!.status).toBe('SENT');
      expect(inApp!.channel).toBe(NotificationChannel.IN_APP);
    });

    it('GET /me/notifications returns notifications list and unread count', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/me/notifications',
        headers: { 'x-test-user-id': studentUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.notifications)).toBe(true);
      expect(body.unreadCount).toBeGreaterThanOrEqual(1);
    });

    it('POST /me/notifications/:id/read marks notification as READ', async () => {
      const [unread] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, studentUser.id),
            eq(notifications.channel, NotificationChannel.IN_APP)
          )
        )
        .limit(1);

      expect(unread).toBeDefined();

      const readRes = await server.inject({
        method: 'POST',
        url: `/me/notifications/${unread!.id}/read`,
        headers: { 'x-test-user-id': studentUser.id },
      });

      expect(readRes.statusCode).toBe(200);

      const [after] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, unread!.id))
        .limit(1);

      expect(after!.status).toBe('READ');
    });

    it('POST /me/notifications/read-all marks all unread notifications as read', async () => {
      // Insert another unread notification
      await notifyInApp(db, {
        userId: studentUser.id,
        kind: NotificationKind.ORGANIZER_ALERT,
        title: 'Broadcast Announcement',
        message: 'Welcome all students!',
      });

      const readAllRes = await server.inject({
        method: 'POST',
        url: '/me/notifications/read-all',
        headers: { 'x-test-user-id': studentUser.id },
      });

      expect(readAllRes.statusCode).toBe(200);

      const checkRes = await server.inject({
        method: 'GET',
        url: '/me/notifications',
        headers: { 'x-test-user-id': studentUser.id },
      });

      expect(checkRes.json().unreadCount).toBe(0);
    });
  });

  describe('5. User Notification Preferences', () => {
    it('GET /me/notification-preferences returns defaults if not set', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/me/notification-preferences',
        headers: { 'x-test-user-id': studentUser.id },
      });

      expect(res.statusCode).toBe(200);
      const prefs = res.json().preferences;
      expect(prefs.emailEnabled).toBe(true);
      expect(prefs.inAppEnabled).toBe(true);
      expect(prefs.eventReminders).toBe(true);
    });

    it('PATCH /me/notification-preferences updates user preferences', async () => {
      const patchRes = await server.inject({
        method: 'PATCH',
        url: '/me/notification-preferences',
        headers: { 'x-test-user-id': studentUser.id },
        payload: {
          emailEnabled: false, // User turns off emails
          whatsappEnabled: true,
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const updated = patchRes.json().preferences;
      expect(updated.emailEnabled).toBe(false);
      expect(updated.whatsappEnabled).toBe(true);
    });

    it('worker respects preferences: skips email sending when emailEnabled is false', async () => {
      getDefaultConsoleEmailProvider().reset();

      // Clear any prior notification for this student and event
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.userId, studentUser.id),
            eq(notifications.eventId, testEvent.id)
          )
        );

      // Enqueue notification for student whose email preference is disabled
      const notif = await enqueue(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        kind: NotificationKind.ORGANIZER_ALERT,
        channel: NotificationChannel.EMAIL,
        payload: { title: 'No Email Sent', message: 'Test' },
      });

      expect(notif).not.toBeNull();

      await processCommsQueueOnce();

      const [dbNotif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id))
        .limit(1);

      // Should be marked SENT with PREFERENCE_EMAIL_DISABLED note without dispatching email
      expect(dbNotif!.status).toBe('SENT');
      expect(dbNotif!.error).toBe('PREFERENCE_EMAIL_DISABLED');
      expect(getDefaultConsoleEmailProvider().getSentEmails().length).toBe(0);

      // Reset preference back to enabled
      await db
        .update(notificationPreferences)
        .set({ emailEnabled: true })
        .where(eq(notificationPreferences.userId, studentUser.id));
    });
  });

  describe('6. Automated Reminder & Sweeps Engine', () => {
    it('runRemindersSweepOnce sweeps upcoming 24h event and enqueues reminders', async () => {
      // Register student to testEvent
      const [reg] = await db
        .insert(registrations)
        .values({
          userId: studentUser.id,
          eventId: testEvent.id,
          status: RegistrationStatus.CONFIRMED,
        })
        .returning();

      expect(reg).toBeDefined();

      const sweepResult = await runRemindersSweepOnce();
      expect(sweepResult.reminders24h).toBeGreaterThanOrEqual(1);

      // Clean up for subsequent tests
      await db.delete(registrations).where(eq(registrations.id, reg!.id));
    });

    it('runPendingPaymentRemindersSweepOnce notifies students with pending payments', async () => {
      // Create pending registration older than 30 mins
      const [pendingReg] = await db
        .insert(registrations)
        .values({
          userId: studentUser.id,
          eventId: testEvent.id,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PENDING,
          createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 min ago
        })
        .returning();

      expect(pendingReg).toBeDefined();

      const notifiedCount = await runPendingPaymentRemindersSweepOnce();
      expect(notifiedCount).toBeGreaterThanOrEqual(1);

      // Clean up registration
      await db.delete(registrations).where(eq(registrations.id, pendingReg!.id));
    });
  });

  describe('7. Payment Notifications Integration', () => {
    it('notifyPaymentSuccess enqueues email and in-app confirmation', async () => {
      await notifyPaymentSuccess(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        registrationId: 'test-reg-id',
        amount: 500,
        transactionId: 'pay_sim_12345',
      });

      const inApps = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, studentUser.id),
            eq(notifications.kind, NotificationKind.PAYMENT_SUCCESS),
            eq(notifications.channel, NotificationChannel.IN_APP)
          )
        );

      expect(inApps.length).toBeGreaterThanOrEqual(1);
    });

    it('notifyPaymentFailed enqueues email and in-app decline notice', async () => {
      await notifyPaymentFailed(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        registrationId: 'test-reg-id',
        errorReason: 'Card test simulation failure',
      });

      const inApps = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, studentUser.id),
            eq(notifications.kind, NotificationKind.PAYMENT_FAILED),
            eq(notifications.channel, NotificationChannel.IN_APP)
          )
        );

      expect(inApps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('8. Admin Monitoring Stats Endpoint', () => {
    it('GET /admin/notifications/stats returns queue and delivery metrics', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/notifications/stats',
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(res.statusCode).toBe(200);
      const stats = res.json();
      expect(stats.total).toBeDefined();
      expect(typeof stats.queued).toBe('number');
      expect(typeof stats.sent).toBe('number');
      expect(typeof stats.failed).toBe('number');
      expect(typeof stats.read).toBe('number');
      expect(typeof stats.dlq).toBe('number');
    });
  });
});
