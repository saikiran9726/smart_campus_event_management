import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, ne } from 'drizzle-orm';
import { EventStatus, NotificationChannel, NotificationKind, UserRole } from '@eventora/shared';
import { db } from '../db/client';
import {
  auditLogs,
  certificates,
  clubs,
  events,
  users,
} from '../db/schema';
import { buildServer } from '../server';

describe('Admin Governance & Certificate Revocation Integration Suite', () => {
  const server = buildServer();

  let adminUser: typeof users.$inferSelect;
  let studentUser: typeof users.$inferSelect;
  let targetUser: typeof users.$inferSelect;
  let testClub: typeof clubs.$inferSelect;
  let testEvent: typeof events.$inferSelect;
  let testCert: typeof certificates.$inferSelect;

  beforeAll(async () => {
    await server.ready();

    // 1. Provision deterministic users
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: 'test_admin_gov_' + Date.now(),
        email: `admin_gov_${Date.now()}@campus.edu`,
        fullName: 'Campus System Admin',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin!;

    const [student] = await db
      .insert(users)
      .values({
        clerkId: 'test_student_gov_' + Date.now(),
        email: `student_gov_${Date.now()}@campus.edu`,
        fullName: 'Campus Student Attendee',
        role: UserRole.STUDENT,
      })
      .returning();
    studentUser = student!;

    const [target] = await db
      .insert(users)
      .values({
        clerkId: 'test_target_gov_' + Date.now(),
        email: `target_gov_${Date.now()}@campus.edu`,
        fullName: 'Target Member For Promotion',
        role: UserRole.STUDENT,
      })
      .returning();
    targetUser = target!;

    // 2. Provision test club & event
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Gov Test Club ${Date.now()}`,
        slug: `gov-club-${Date.now()}`,
        description: 'Test club for admin governance',
        createdBy: adminUser.id,
      })
      .returning();
    testClub = club!;

    const now = new Date();
    const inTwoHours = new Date(Date.now() + 7200000);
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: 'Gov Test Summit',
        slug: `gov-summit-${Date.now()}`,
        description: 'Summit for verification',
        category: 'WORKSHOP',
        startAt: now,
        endAt: inTwoHours,
        registrationOpensAt: now,
        registrationClosesAt: inTwoHours,
        capacity: 100,
        remainingCapacity: 100,
        status: EventStatus.PUBLISHED,
        createdBy: adminUser.id,
      })
      .returning();
    testEvent = ev!;

    // 3. Issue certificate to target user
    const [cert] = await db
      .insert(certificates)
      .values({
        eventId: testEvent.id,
        userId: targetUser.id,
        kind: 'PARTICIPATION',
      })
      .returning();
    testCert = cert!;
  });

  afterAll(async () => {
    // Cleanup created test entities
    if (testCert) {
      await db.delete(certificates).where(eq(certificates.id, testCert.id));
    }
    if (testEvent) {
      await db.delete(events).where(eq(events.id, testEvent.id));
    }
    if (testClub) {
      await db.delete(clubs).where(eq(clubs.id, testClub.id));
    }
    if (targetUser) {
      await db.delete(users).where(eq(users.id, targetUser.id));
    }
    if (studentUser) {
      await db.delete(users).where(eq(users.id, studentUser.id));
    }
    if (adminUser) {
      await db.delete(users).where(eq(users.id, adminUser.id));
    }

    await server.close();
  });

  describe('1. GET /admin/users', () => {
    it('blocks unauthenticated callers with 401', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/users',
      });
      expect(res.statusCode).toBe(401);
    });

    it('blocks STUDENT callers with 403 FORBIDDEN', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { 'x-test-user-id': studentUser.id },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns paginated users list for ADMIN caller', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/users?page=1&limit=10',
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(3);
      expect(data.page).toBe(1);
    });

    it('filters users by search query q', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/admin/users?q=${encodeURIComponent(targetUser.email)}`,
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.users.length).toBe(1);
      expect(data.users[0].id).toBe(targetUser.id);
    });
  });

  describe('2. PATCH /admin/users/:id/role', () => {
    it('blocks STUDENT callers with 403', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${targetUser.id}/role`,
        headers: { 'x-test-user-id': studentUser.id },
        payload: { role: UserRole.ORGANIZER },
      });
      expect(res.statusCode).toBe(403);
    });

    it('updates role and records audit log for ADMIN caller', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${targetUser.id}/role`,
        headers: { 'x-test-user-id': adminUser.id },
        payload: { role: UserRole.FACULTY },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.user.role).toBe(UserRole.FACULTY);

      // Verify in DB
      const [updated] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUser.id));
      expect(updated!.role).toBe(UserRole.FACULTY);

      // Verify audit log entry
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, targetUser.id));
      expect(audit).toBeDefined();
      expect(audit!.action).toBe('USER_ROLE_UPDATED');
    });
  });

  describe('3. GET /admin/clubs', () => {
    it('returns clubs directory with member and event stats for ADMIN', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/admin/clubs?q=${encodeURIComponent(testClub.slug)}`,
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.clubs.length).toBeGreaterThanOrEqual(1);
      const found = data.clubs.find((c: any) => c.id === testClub.id);
      expect(found).toBeDefined();
      expect(found.eventCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. GET /admin/audit-logs', () => {
    it('returns immutable system audit logs for ADMIN', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/audit-logs?limit=10',
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.logs)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. POST /certificates/:id/revoke', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/certificates/${testCert.id}/revoke`,
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects unauthorized student requests with 403', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/certificates/${testCert.id}/revoke`,
        headers: { 'x-test-user-id': studentUser.id },
        payload: { reason: 'Unauthorized revocation attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows ADMIN to revoke certificate while preserving row in database', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/certificates/${testCert.id}/revoke`,
        headers: { 'x-test-user-id': adminUser.id },
        payload: { reason: 'Revoked due to integrity audit' },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);

      // Verify certificate row is PRESERVED in DB (never deleted to simulate revocation)
      const [foundCert] = await db
        .select()
        .from(certificates)
        .where(eq(certificates.id, testCert.id));
      expect(foundCert).toBeDefined();
      expect(foundCert!.id).toBe(testCert.id);

      // Verify audit log entry exists with persistent actor, timestamp and reason
      const [revocationAudit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, testCert.id));
      expect(revocationAudit).toBeDefined();
      expect(revocationAudit!.action).toBe('CERTIFICATE_REVOKED');
      expect((revocationAudit!.diff as any).revokedBy).toBe(adminUser.id);
      expect((revocationAudit!.diff as any).reason).toBe('Revoked due to integrity audit');

      // Subsequent public verification returns 404 (verification fails)
      const verifyRes = await server.inject({
        method: 'GET',
        url: `/public/verify/cert/${testCert.id}`,
      });
      expect(verifyRes.statusCode).toBe(404);

      // Duplicate revocation attempt returns 409 CONFLICT
      const duplicateRes = await server.inject({
        method: 'POST',
        url: `/certificates/${testCert.id}/revoke`,
        headers: { 'x-test-user-id': adminUser.id },
        payload: { reason: 'Duplicate attempt' },
      });
      expect(duplicateRes.statusCode).toBe(409);
    });
  });

  describe('6. Last Administrator Protection & Privilege Safeguards', () => {
    it('blocks demoting the last active administrator with 403 FORBIDDEN', async () => {
      // Find all current active admins other than adminUser
      const otherAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, UserRole.ADMIN), ne(users.id, adminUser.id)));

      // Temporarily mark other admins as STUDENT to test sole-admin condition
      for (const oa of otherAdmins) {
        await db.update(users).set({ role: UserRole.STUDENT }).where(eq(users.id, oa.id));
      }

      try {
        const res = await server.inject({
          method: 'PATCH',
          url: `/admin/users/${adminUser.id}/role`,
          headers: { 'x-test-user-id': adminUser.id },
          payload: { role: UserRole.STUDENT },
        });

        expect(res.statusCode).toBe(403);
        const data = JSON.parse(res.body);
        expect(data.error.message).toContain('last remaining administrator');
      } finally {
        // Restore other admins
        for (const oa of otherAdmins) {
          await db.update(users).set({ role: UserRole.ADMIN }).where(eq(users.id, oa.id));
        }
      }
    });
  });

  describe('7. DLQ Notification Inspection & Safe Retries', () => {
    let failedNotifId: string;
    let sentNotifId: string;

    beforeAll(async () => {
      const { notifications } = await import('../db/schema');
      const [failed] = await db
        .insert(notifications)
        .values({
          userId: studentUser.id,
          eventId: testEvent.id,
          kind: NotificationKind.REMINDER_24H,
          channel: NotificationChannel.EMAIL,
          payload: { test: true },
          status: 'FAILED',
          attempts: 3,
          error: 'SMTP timeout after 30s',
        })
        .returning();
      failedNotifId = failed!.id;

      const [sent] = await db
        .insert(notifications)
        .values({
          userId: studentUser.id,
          eventId: testEvent.id,
          kind: NotificationKind.BOOKING_CONFIRMED,
          channel: NotificationChannel.EMAIL,
          payload: { test: true },
          status: 'SENT',
          attempts: 1,
        })
        .returning();
      sentNotifId = sent!.id;
    });

    afterAll(async () => {
      const { notifications } = await import('../db/schema');
      if (failedNotifId) {
        await db.delete(notifications).where(eq(notifications.id, failedNotifId));
      }
      if (sentNotifId) {
        await db.delete(notifications).where(eq(notifications.id, sentNotifId));
      }
    });

    it('returns failed notifications for ADMIN in DLQ list', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/notifications?status=FAILED',
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.notifications)).toBe(true);
      const found = data.notifications.find((n: any) => n.id === failedNotifId);
      expect(found).toBeDefined();
      expect(found.error).toBe('SMTP timeout after 30s');
    });

    it('safely resets FAILED notification to QUEUED with audit trail', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/admin/notifications/${failedNotifId}/retry`,
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.notification.status).toBe('QUEUED');
      expect(data.notification.attempts).toBe(0);

      // Verify audit log
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, failedNotifId));
      expect(audit).toBeDefined();
      expect(audit!.action).toBe('NOTIFICATION_RETRY_ENQUEUED');
    });

    it('rejects retrying a SENT notification with 409 CONFLICT to prevent duplicate delivery', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/admin/notifications/${sentNotifId}/retry`,
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(res.statusCode).toBe(409);
      const data = JSON.parse(res.body);
      expect(data.error.message).toContain('already been successfully delivered');
    });
  });
});
