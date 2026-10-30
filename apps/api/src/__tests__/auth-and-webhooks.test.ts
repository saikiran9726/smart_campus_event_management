import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Webhook } from 'svix';
import { UserRole } from '@eventora/shared';
import { db, pool } from '../db/client';
import { users, webhookEvents } from '../db/schema';
import { env } from '../env';
import { assertNotInCooldown, requireRole } from '../middleware/rbac';
import { buildServer } from '../server';

describe('Fastify Server, Clerk Auth, Webhooks, & RBAC', () => {
  const server = buildServer();
  const testSecret = 'whsec_dGVzdHNlY3JldDEyMzQ1Njc4OWFiY2RlZg==';

  beforeAll(async () => {
    // Override webhook secret for deterministic test signing
    (env as any).CLERK_WEBHOOK_SECRET = testSecret;

    // Register test-only route before server.ready()
    server.get(
      '/test/admin-protected',
      { preHandler: [requireRole(UserRole.ADMIN)] },
      async (req, reply) => reply.send({ success: true })
    );

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /health', () => {
    it('returns status ok and db up', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.status).toBe('ok');
      expect(json.db).toBe('up');
    });
  });

  describe('POST /webhooks/clerk', () => {
    it('rejects request with missing svix signature headers (400)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhooks/clerk',
        payload: { type: 'user.created', data: { id: 'user_test_no_headers' } },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects request with invalid svix signature (400)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhooks/clerk',
        headers: {
          'svix-id': 'msg_invalid_123',
          'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
          'svix-signature': 'v1,invalid_signature_hash_here',
        },
        payload: { type: 'user.created', data: { id: 'user_test_invalid_sig' } },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('VALIDATION_FAILED');
    });

    it('accepts validly signed user.created payload and is idempotent on replay', async () => {
      const clerkId = `user_wh_${Date.now()}`;
      const email = `wh_user_${Date.now()}@campus.edu`;
      const msgId = `msg_test_${Date.now()}`;
      const timestamp = new Date();

      const payloadObj = {
        type: 'user.created',
        data: {
          id: clerkId,
          email_addresses: [
            {
              id: 'email_primary_1',
              email_address: email,
            },
          ],
          primary_email_address_id: 'email_primary_1',
          first_name: 'Webhook',
          last_name: 'Student',
          image_url: 'https://img.campus.edu/avatar.png',
        },
      };

      const rawBody = JSON.stringify(payloadObj);
      const wh = new Webhook(testSecret);
      const signature = wh.sign(msgId, timestamp, rawBody);
      const timestampSeconds = Math.floor(timestamp.getTime() / 1000).toString();

      // First delivery
      const firstResponse = await server.inject({
        method: 'POST',
        url: '/webhooks/clerk',
        headers: {
          'content-type': 'application/json',
          'svix-id': msgId,
          'svix-timestamp': timestampSeconds,
          'svix-signature': signature,
        },
        payload: rawBody,
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(JSON.parse(firstResponse.body).received).toBe(true);

      // Verify user was inserted into DB
      const [userInDb] = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkId));

      expect(userInDb).toBeDefined();
      expect(userInDb?.email).toBe(email);
      expect(userInDb?.fullName).toBe('Webhook Student');
      expect(userInDb?.role).toBe(UserRole.STUDENT);

      // Replay delivery with exact same svix-id
      const replayResponse = await server.inject({
        method: 'POST',
        url: '/webhooks/clerk',
        headers: {
          'content-type': 'application/json',
          'svix-id': msgId,
          'svix-timestamp': timestampSeconds,
          'svix-signature': signature,
        },
        payload: rawBody,
      });

      expect(replayResponse.statusCode).toBe(200);
      const replayJson = JSON.parse(replayResponse.body);
      expect(replayJson.received).toBe(true);
      expect(replayJson.replayed).toBe(true);

      // Verify user was not duplicated
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkId));

      expect(userRows).toHaveLength(1);
    });
  });

  describe('GET /me and PATCH /me', () => {
    it('returns 401 UNAUTHENTICATED without auth token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/me',
      });

      expect(response.statusCode).toBe(401);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns authenticated user profile using test header', async () => {
      const clerkId = `user_me_test_${Date.now()}`;
      const [testUser] = await db
        .insert(users)
        .values({
          clerkId,
          email: `test_me_${Date.now()}@campus.edu`,
          fullName: 'Me Test User',
          role: UserRole.STUDENT,
        })
        .returning();

      expect(testUser).toBeDefined();

      const response = await server.inject({
        method: 'GET',
        url: '/me',
        headers: {
          'x-test-user-id': testUser!.id,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.user.id).toBe(testUser!.id);
      expect(json.user.email).toBe(testUser!.email);
    });

    it('updates user profile via PATCH /me and enforces roll_number uniqueness (409 CONFLICT)', async () => {
      const timestamp = Date.now();
      const [user1] = await db
        .insert(users)
        .values({
          clerkId: `user_patch1_${timestamp}`,
          email: `patch1_${timestamp}@campus.edu`,
          fullName: 'User One',
          rollNumber: `ROLL_${timestamp}_1`,
          role: UserRole.STUDENT,
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          clerkId: `user_patch2_${timestamp}`,
          email: `patch2_${timestamp}@campus.edu`,
          fullName: 'User Two',
          role: UserRole.STUDENT,
        })
        .returning();

      expect(user1).toBeDefined();
      expect(user2).toBeDefined();

      // Update user2 with new details
      const patchResponse = await server.inject({
        method: 'PATCH',
        url: '/me',
        headers: {
          'x-test-user-id': user2!.id,
        },
        payload: {
          fullName: 'User Two Updated',
          department: 'Mechanical Engineering',
          year: 3,
        },
      });

      expect(patchResponse.statusCode).toBe(200);
      const patchJson = JSON.parse(patchResponse.body);
      expect(patchJson.user.fullName).toBe('User Two Updated');
      expect(patchJson.user.department).toBe('Mechanical Engineering');

      // Attempt conflicting rollNumber
      const conflictResponse = await server.inject({
        method: 'PATCH',
        url: '/me',
        headers: {
          'x-test-user-id': user2!.id,
        },
        payload: {
          rollNumber: `ROLL_${timestamp}_1`, // Already user1's roll number
        },
      });

      expect(conflictResponse.statusCode).toBe(409);
      const conflictJson = JSON.parse(conflictResponse.body);
      expect(conflictJson.error.code).toBe('CONFLICT');
    });
  });

  describe('RBAC Middleware', () => {
    it('requireRole blocks STUDENT from accessing an ADMIN-only route (403 FORBIDDEN)', async () => {
      const timestamp = Date.now();
      const [student] = await db
        .insert(users)
        .values({
          clerkId: `student_rbac_${timestamp}`,
          email: `student_rbac_${timestamp}@campus.edu`,
          fullName: 'Student RBAC',
          role: UserRole.STUDENT,
        })
        .returning();

      const [admin] = await db
        .insert(users)
        .values({
          clerkId: `admin_rbac_${timestamp}`,
          email: `admin_rbac_${timestamp}@campus.edu`,
          fullName: 'Admin RBAC',
          role: UserRole.ADMIN,
        })
        .returning();

      expect(student).toBeDefined();
      expect(admin).toBeDefined();

      // Student attempt
      const studentRes = await server.inject({
        method: 'GET',
        url: '/test/admin-protected',
        headers: {
          'x-test-user-id': student!.id,
        },
      });

      expect(studentRes.statusCode).toBe(403);
      const studentJson = JSON.parse(studentRes.body);
      expect(studentJson.error.code).toBe('FORBIDDEN');

      // Admin attempt
      const adminRes = await server.inject({
        method: 'GET',
        url: '/test/admin-protected',
        headers: {
          'x-test-user-id': admin!.id,
        },
      });

      expect(adminRes.statusCode).toBe(200);
      expect(JSON.parse(adminRes.body).success).toBe(true);
    });

    it('assertNotInCooldown throws COOLDOWN_ACTIVE if active cooldown timestamp', () => {
      const activeUser: any = {
        id: 'user_1',
        strikeCount: 2,
        consecutiveNoShows: 2,
        cooldownUntil: new Date(Date.now() + 60 * 60 * 1000), // 1 hour in future
      };

      expect(() => assertNotInCooldown(activeUser)).toThrowError(
        /under cooldown penalty/
      );

      const clearedUser: any = {
        id: 'user_2',
        strikeCount: 0,
        consecutiveNoShows: 0,
        cooldownUntil: new Date(Date.now() - 60 * 60 * 1000), // 1 hour in past
      };

      expect(() => assertNotInCooldown(clearedUser)).not.toThrow();
    });
  });
});
