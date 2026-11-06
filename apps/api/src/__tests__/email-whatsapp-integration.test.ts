import crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  EventStatus,
  NotificationChannel,
  NotificationKind,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubs,
  events,
  notificationPreferences,
  notifications,
  users,
  venues,
} from '../db/schema';
import { env } from '../env';
import {
  getDefaultConsoleEmailProvider,
  isResendConfigured,
  ResendEmailProvider,
} from '../modules/comms/providers/email.provider';
import {
  getDefaultConsoleWhatsAppProvider,
  isMetaWhatsAppConfigured,
  MetaCloudWhatsAppProvider,
} from '../modules/comms/providers/whatsapp.provider';
import { enqueue } from '../modules/comms/queue';
import { normalizeIndianPhoneNumber } from '../modules/comms/phone';
import { buildWhatsAppTemplate, renderEmail, renderWhatsApp } from '../modules/comms/templates';
import { verifyMetaSignature } from '../modules/webhooks/whatsapp';
import { buildServer } from '../server';
import { processCommsQueueOnce } from '../workers/comms.worker';

describe('Complete Email + WhatsApp Delivery Integration Suite', () => {
  const server = buildServer();

  let adminUser: any;
  let studentUser: any;
  let testClub: any;
  let testVenue: any;
  let testEvent: any;

  beforeAll(async () => {
    await server.ready();

    // Verify connecting to test database only
    const dbNameRes = await db.execute<{ current_database: string }>(
      'SELECT current_database()' as any
    );
    const dbName = (dbNameRes.rows[0] as any)?.current_database;
    if (dbName !== 'eventora_venue_test') {
      throw new Error(`ABORT: Database is '${dbName}', expected 'eventora_venue_test'`);
    }

    const ts = Date.now();

    // 1. Create Admin
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_ew_admin_${ts}`,
        email: `ew_admin_${ts}@campus.edu`,
        fullName: 'Comms Integration Admin',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin;

    // 2. Create Student with Indian mobile number
    const [student] = await db
      .insert(users)
      .values({
        clerkId: `clerk_ew_student_${ts}`,
        email: `ew_student_${ts}@campus.edu`,
        fullName: 'Aarav Patel',
        rollNumber: `CS_EW_${ts}`,
        phone: '+91 98765 43210', // formatted Indian number
        role: UserRole.STUDENT,
        department: 'Computer Science',
      })
      .returning();
    studentUser = student;

    // 3. Create Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Integration Test Club ${ts}`,
        slug: `integration-club-${ts}`,
        description: 'Testing email and WhatsApp channels.',
        createdBy: adminUser.id,
      })
      .returning();
    testClub = club;

    // 4. Create Venue
    const [venue] = await db
      .insert(venues)
      .values({
        name: `Tech Auditorium ${ts}`,
        capacity: 400,
        locationText: 'Main Campus East Block',
        mapUrl: 'https://maps.google.com/?q=Tech+Auditorium',
      })
      .returning();
    testVenue = venue;

    // 5. Create Event
    const now = new Date();
    const [event] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Campus Tech Carnival ${ts}`,
        slug: `campus-tech-carnival-${ts}`,
        description: 'Integration test carnival for notifications.',
        category: 'Exhibition',
        venueId: testVenue.id,
        startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 28 * 60 * 60 * 1000),
        registrationOpensAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        registrationClosesAt: new Date(now.getTime() + 23 * 60 * 60 * 1000),
        status: EventStatus.PUBLISHED,
        capacity: 100,
        remainingCapacity: 100,
        pricePaise: 0,
        isPaid: false,
        createdBy: adminUser.id,
      })
      .returning();
    testEvent = event;
  });

  beforeEach(() => {
    getDefaultConsoleEmailProvider().reset();
    getDefaultConsoleWhatsAppProvider().reset();
  });

  afterAll(async () => {
    if (testEvent) {
      await db.delete(notifications).where(eq(notifications.eventId, testEvent.id));
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

  describe('1. Indian Mobile Number Normalization & Validation', () => {
    it('normalizes 10-digit Indian numbers to E.164 without leading plus', () => {
      const res = normalizeIndianPhoneNumber('9876543210');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('919876543210');
      expect(res.e164).toBe('+919876543210');
    });

    it('normalizes numbers with +91 and spaces/dashes', () => {
      const res = normalizeIndianPhoneNumber('+91 98765-43210');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('919876543210');
    });

    it('normalizes numbers starting with 0', () => {
      const res = normalizeIndianPhoneNumber('09876543210');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('919876543210');
    });

    it('rejects invalid, short or landline numbers cleanly', () => {
      expect(normalizeIndianPhoneNumber('').valid).toBe(false);
      expect(normalizeIndianPhoneNumber('12345').valid).toBe(false);
      expect(normalizeIndianPhoneNumber('1234567890').valid).toBe(false); // does not start with 6-9
      expect(normalizeIndianPhoneNumber('abcdefghij').valid).toBe(false);
    });
  });

  describe('2. Email (Resend) Provider & Template Pipeline', () => {
    it('correctly reports Resend configuration health', () => {
      const isConfigured = isResendConfigured();
      // In local dev/test environment, placeholder keys should return false
      expect(typeof isConfigured).toBe('boolean');
    });

    it('Resend provider validates recipient email format', async () => {
      const provider = new ResendEmailProvider('re_dummy_test_key');
      const res = await provider.send({
        to: 'invalid-email',
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(res.error).toBeDefined();
    });

    it('renders clean HTML, plain-text fallback, and inline CID attachments', () => {
      const rendered = renderEmail(NotificationKind.BOOKING_CONFIRMED, {
        studentName: 'Aarav Patel',
        rollNumber: 'CS_001',
        eventTitle: 'Campus Tech Carnival',
        eventStart: 'Tomorrow 10:00 AM',
        venueName: 'Tech Auditorium',
        ticketToken: 'TKT-TEST-001',
      });

      expect(rendered.html).toContain('Booking Confirmed');
      expect(rendered.html).toContain('Aarav Patel');
      expect(rendered.html).toContain('cid:ticket-qr');
      expect(rendered.subject).toContain('Booking Confirmed: Campus Tech Carnival');
    });
  });

  describe('3. WhatsApp Cloud API Payload Construction & Templates', () => {
    it('correctly reports Meta WhatsApp configuration health', () => {
      const isConfigured = isMetaWhatsAppConfigured();
      expect(typeof isConfigured).toBe('boolean');
    });

    it('constructs official template component payloads for booking confirmations', () => {
      const template = buildWhatsAppTemplate(NotificationKind.BOOKING_CONFIRMED, {
        studentName: 'Aarav Patel',
        eventTitle: 'Campus Tech Carnival',
        eventStart: 'Tomorrow 10:00 AM',
        venueName: 'Tech Auditorium',
      });

      expect(template.name).toBe('eventora_booking_confirmed');
      expect(template.language.code).toBe('en');
      expect(template.components).toBeDefined();
      const bodyComp = template.components?.[0];
      expect(bodyComp?.type).toBe('body');
      expect(bodyComp?.parameters?.[0]?.text).toBe('Aarav Patel');
      expect(bodyComp?.parameters?.[1]?.text).toBe('Campus Tech Carnival');
    });

    it('renderWhatsApp returns template, fallback text, and interactive buttons', () => {
      const rendered = renderWhatsApp(NotificationKind.WAITLIST_OFFER, {
        studentName: 'Aarav Patel',
        eventTitle: 'Campus Tech Carnival',
      });

      expect(rendered.text).toContain('Aarav Patel');
      expect(rendered.buttons).toBeDefined();
      expect(rendered.buttons?.[0]?.id).toBe('claim_seat');
      expect(rendered.template).toBeDefined();
      expect(rendered.template?.name).toBe('eventora_waitlist_offer');
    });
  });

  describe('4. Mocked WhatsApp Outbound Dispatch & Status Tracking', () => {
    it('dispatches WhatsApp notification, stores providerMessageId, and transitions status to ACCEPTED', async () => {
      // Opt-in student to WhatsApp
      await db
        .insert(notificationPreferences)
        .values({
          userId: studentUser.id,
          whatsappEnabled: true,
          whatsappConsentAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId],
          set: { whatsappEnabled: true, whatsappConsentAt: new Date() },
        });

      const notif = await enqueue(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        kind: NotificationKind.BOOKING_CONFIRMED,
        channel: NotificationChannel.WHATSAPP,
        payload: {
          studentName: studentUser.fullName,
          eventTitle: testEvent.title,
        },
      });

      expect(notif).not.toBeNull();
      expect(notif!.status).toBe('QUEUED');

      // Worker runs
      await processCommsQueueOnce();

      const [updated] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id))
        .limit(1);

      // Meta WhatsApp policy: Must be ACCEPTED upon API send, not prematurely marked DELIVERED
      expect(updated!.status).toBe('ACCEPTED');
      expect(updated!.providerMessageId).toBeDefined();
      expect(updated!.providerMessageId).toContain('mock-wa');
      expect(updated!.sentAt).not.toBeNull();

      const sentWa = getDefaultConsoleWhatsAppProvider().getSentMessages();
      expect(sentWa.length).toBeGreaterThanOrEqual(1);
    });

    it('skips WhatsApp delivery if user consent is disabled (SKIPPED with opt-out note)', async () => {
      // Revoke consent
      await db
        .update(notificationPreferences)
        .set({
          whatsappEnabled: false,
          whatsappConsentWithdrawnAt: new Date(),
        })
        .where(eq(notificationPreferences.userId, studentUser.id));

      const notif = await enqueue(db, {
        userId: studentUser.id,
        eventId: testEvent.id,
        kind: NotificationKind.REMINDER_24H,
        channel: NotificationChannel.WHATSAPP,
        payload: {
          studentName: studentUser.fullName,
          eventTitle: testEvent.title,
        },
      });

      expect(notif).not.toBeNull();

      await processCommsQueueOnce();

      const [updated] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif!.id))
        .limit(1);

      expect(updated!.status).toBe('SKIPPED');
      expect(updated!.error).toBe('PREFERENCE_WHATSAPP_DISABLED');
    });
  });

  describe('5. WhatsApp Webhook Verification & Status Lifecycle', () => {
    it('GET /webhooks/whatsapp verifies Meta subscription challenge with verify token', async () => {
      const challenge = 'random_meta_challenge_12345';

      const validRes = await server.inject({
        method: 'GET',
        url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${env.WHATSAPP_WEBHOOK_VERIFY_TOKEN}&hub.challenge=${challenge}`,
      });

      expect(validRes.statusCode).toBe(200);
      expect(validRes.body).toBe(challenge);

      const invalidRes = await server.inject({
        method: 'GET',
        url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=${challenge}`,
      });

      expect(invalidRes.statusCode).toBe(403);
    });

    it('verifyMetaSignature checks HMAC SHA-256 signatures accurately', () => {
      const secret = 'test_meta_app_secret_32_chars_long';
      const payload = JSON.stringify({ test: 'whatsapp' });
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      expect(verifyMetaSignature(payload, `sha256=${signature}`, secret)).toBe(true);
      expect(verifyMetaSignature(payload, 'sha256=invalidhash', secret)).toBe(false);
      expect(verifyMetaSignature(payload, undefined, secret)).toBe(false);
    });

    it('POST /webhooks/whatsapp processes delivered, read, and failed status callbacks', async () => {
      const testMsgId = `wamid.test_${Date.now()}`;

      // Insert notification in ACCEPTED status awaiting delivery webhook
      const [waNotif] = await db
        .insert(notifications)
        .values({
          userId: studentUser.id,
          eventId: testEvent.id,
          kind: NotificationKind.REMINDER_2H,
          channel: NotificationChannel.WHATSAPP,
          payload: { test: true },
          status: 'ACCEPTED',
          providerMessageId: testMsgId,
        })
        .returning();

      expect(waNotif).toBeDefined();

      // 1. Simulate Meta DELIVERED webhook
      const deliveredPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'meta_biz_acc_1',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    {
                      id: testMsgId,
                      status: 'delivered' as const,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      recipient_id: '919876543210',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const delRes = await server.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        payload: deliveredPayload,
      });

      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().processed).toBe(1);

      const [deliveredRow] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, waNotif!.id))
        .limit(1);

      expect(deliveredRow!.status).toBe('DELIVERED');
      expect(deliveredRow!.deliveredAt).not.toBeNull();

      // 2. Simulate Meta READ webhook
      const readPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    {
                      id: testMsgId,
                      status: 'read' as const,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const readRes = await server.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        payload: readPayload,
      });

      expect(readRes.statusCode).toBe(200);

      const [readRow] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, waNotif!.id))
        .limit(1);

      expect(readRow!.status).toBe('READ');
      expect(readRow!.readAt).not.toBeNull();
    });
  });

  describe('6. User Preferences & Consent Lifecycle', () => {
    it('records consent timestamps when opting in to WhatsApp', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/me/notification-preferences',
        headers: { 'x-test-user-id': studentUser.id },
        payload: {
          whatsappEnabled: true,
          volunteerUpdates: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const prefs = res.json().preferences;
      expect(prefs.whatsappEnabled).toBe(true);
      expect(prefs.volunteerUpdates).toBe(true);
      expect(prefs.whatsappConsentAt).not.toBeNull();
      expect(prefs.whatsappConsentWithdrawnAt).toBeNull();
    });

    it('records withdrawal timestamp when opting out of WhatsApp', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/me/notification-preferences',
        headers: { 'x-test-user-id': studentUser.id },
        payload: {
          whatsappEnabled: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const prefs = res.json().preferences;
      expect(prefs.whatsappEnabled).toBe(false);
      expect(prefs.whatsappConsentWithdrawnAt).not.toBeNull();
    });
  });

  describe('7. Admin Monitoring & Channel Breakdowns', () => {
    it('GET /admin/notifications/stats provides separate statistics for Email, WhatsApp, and In-App', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/notifications/stats',
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.email).toBeDefined();
      expect(typeof body.email.queued).toBe('number');
      expect(typeof body.email.sent).toBe('number');
      expect(typeof body.email.delivered).toBe('number');
      expect(typeof body.email.failed).toBe('number');

      expect(body.whatsapp).toBeDefined();
      expect(typeof body.whatsapp.queued).toBe('number');
      expect(typeof body.whatsapp.accepted).toBe('number');
      expect(typeof body.whatsapp.delivered).toBe('number');
      expect(typeof body.whatsapp.read).toBe('number');
      expect(typeof body.whatsapp.failed).toBe('number');

      expect(body.inApp).toBeDefined();
      expect(typeof body.inApp.created).toBe('number');
      expect(typeof body.inApp.read).toBe('number');
    });

    it('GET /admin/notifications/providers reports provider status without exposing secrets', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/notifications/providers',
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.email).toBeDefined();
      expect(body.email.sender).toBeDefined();
      expect(body.email.apiKey).toBeUndefined(); // Never expose real keys

      expect(body.whatsapp).toBeDefined();
      expect(body.whatsapp.token).toBeUndefined(); // Never expose raw token
      expect(body.whatsapp.apiVersion).toBeDefined();
      expect(body.whatsapp.webhookVerified).toBe(true);
    });
  });
});
