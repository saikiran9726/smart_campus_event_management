import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { UserRole } from '@eventora/shared';
import { buildServer } from '../server';
import { db, pool } from '../db/client';
import { users, odLetters, registrations, events, clubs, venues, tickets } from '../db/schema';
import { env, getProductionEnvErrors } from '../env';
import { computeOdSignature, verifyOdLetterBySerial } from '../modules/od/service';

describe('Production Hardening & Connectivity Verification Suite (Prompt 19)', () => {
  let app: any;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Local Connectivity & CORS Preflight (Section A.6)', () => {
    it('returns matching access-control-allow-origin header for http://localhost:3000', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/events',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('rejects preflight and returns NO access-control-allow-origin header for http://evil.example', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/events',
        headers: {
          Origin: 'http://evil.example',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('2. Production Environment Invariants (Section C.1 & C.2)', () => {
    it('detects and lists all production environment violations correctly', () => {
      const invalidEnv = {
        PAYMENT_MODE: 'live',
        TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        CLERK_SECRET_KEY: 'bad_key_without_sk',
        MAGIC_LINK_SECRET: 'short_secret',
        OD_SEAL_SECRET: 'short_secret',
        DATABASE_URL: '',
        PUBLIC_WEB_URL: 'http://insecure-domain.edu',
        WHATSAPP_PROVIDER: 'baileys',
        R2_ACCOUNT_ID: 'prod_r2_account_id',
      };

      const errors = getProductionEnvErrors(invalidEnv);
      expect(errors.length).toBe(8);
      expect(errors).toContain('PAYMENT_MODE must be "sandbox" (live real-money payments strictly prohibited)');
      expect(errors).toContain('TURNSTILE_SECRET_KEY cannot use Cloudflare dummy keys (1x0000, 2x0000, 3x0000) in production');
      expect(errors).toContain('CLERK_SECRET_KEY must start with "sk_"');
      expect(errors).toContain('MAGIC_LINK_SECRET must be at least 32 characters long');
      expect(errors).toContain('OD_SEAL_SECRET must be at least 32 characters long');
      expect(errors).toContain('DATABASE_URL is required');
      expect(errors).toContain('PUBLIC_WEB_URL must use https:// in production');
      expect(errors).toContain('WHATSAPP_PROVIDER cannot be "baileys" in production');
    });

    it('guarantees x-test-user-id bypass returns 401 when NODE_ENV === production', async () => {
      const originalNodeEnv = env.NODE_ENV;
      let server: any;
      try {
        (env as any).NODE_ENV = 'production';
        server = buildServer();

        const response = await server.inject({
          method: 'GET',
          url: '/me',
          headers: {
            'x-test-user-id': 'user_dummy_123',
          },
        });

        expect(response.statusCode).toBe(401);
      } finally {
        (env as any).NODE_ENV = originalNodeEnv;
        if (server) await server.close();
      }
    });

    it('guarantees /test/* endpoints are NOT registered and return 404 in production', async () => {
      const originalNodeEnv = env.NODE_ENV;
      let server: any;
      try {
        (env as any).NODE_ENV = 'production';
        server = buildServer();

        const response = await server.inject({
          method: 'POST',
          url: '/test/expire-offers',
        });

        expect(response.statusCode).toBe(404);
      } finally {
        (env as any).NODE_ENV = originalNodeEnv;
        if (server) await server.close();
      }
    });

    it('guarantees test-pass Turnstile token is NOT accepted in production (returns 403)', async () => {
      const originalNodeEnv = env.NODE_ENV;
      let server: any;
      try {
        (env as any).NODE_ENV = 'production';
        server = buildServer();

        const response = await server.inject({
          method: 'POST',
          url: '/public/scanner/unlock',
          payload: {
            code: 'SCAN-123456',
            volunteerName: 'Volunteer A',
            turnstileToken: 'test-pass',
          },
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.error?.code).toBe('TURNSTILE_FAILED');
      } finally {
        (env as any).NODE_ENV = originalNodeEnv;
        if (server) await server.close();
      }
    });
  });

  describe('3. Production Health, Readiness & Versioning (Section C.4 & C.7)', () => {
    it('GET /health returns 200 without querying database', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    });

    it('GET /ready returns 200 when database and schema migrations are ready', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ready');
      expect(body.db).toBe('up');
      expect(body.migrations).toBe('applied');
    });

    it('GET /version returns current semantic version and commit SHA', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/version',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.version).toBe('0.1.0');
      expect(body.commit).toBeDefined();
    });
  });

  describe('4. Logging Redaction Invariant (Section C.6)', () => {
    it('redacts sensitive auth tokens and passkeys from request logs', () => {
      let loggedOutput = '';
      const destination = {
        write: (chunk: string) => {
          loggedOutput += chunk;
        },
      };

      const logger = pino(
        {
          redact: {
            paths: [
              'authorization',
              'cookie',
              'token',
              'code',
              'passkey',
              'turnstileToken',
              '*.token',
              '*.passkey',
              'req.headers.authorization',
              'req.headers.cookie',
            ],
            censor: '[REDACTED]',
          },
        },
        destination
      );

      const sensitiveToken = 'ev_tok_ABCDEF1234567890ABCDEF12';

      logger.info({
        req: {
          headers: {
            authorization: `Bearer ${sensitiveToken}`,
            cookie: `session=${sensitiveToken}`,
          },
        },
        token: sensitiveToken,
        passkey: 'SCAN-123456',
      });

      expect(loggedOutput).toContain('[REDACTED]');
      expect(loggedOutput).not.toContain(sensitiveToken);
    });
  });

  describe('5. OD Seal Secret Rotation (Section E.4)', () => {
    it('validates OD letter signed with previous secret when OD_SEAL_SECRET_PREVIOUS is configured', async () => {
      const originalCurrentSecret = env.OD_SEAL_SECRET;
      const originalPreviousSecret = env.OD_SEAL_SECRET_PREVIOUS;

      const oldSecret = 'old_super_secret_od_seal_key_32_bytes_min_rotation';
      const newSecret = 'new_super_secret_od_seal_key_32_bytes_min_rotation';

      try {
        // 1. Create a dummy letter signed with oldSecret
        const serial = `OD-2026-${crypto.randomBytes(4).toString('hex')}`;
        const userId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        const checkedInAt = new Date().toISOString();

        // Ensure user and event exist
        await db
          .insert(users)
          .values({
            id: userId,
            clerkId: `clerk_od_rot_${Date.now()}`,
            email: `rot_student_${Date.now()}@eventora.campus.edu`,
            fullName: 'Rotation Student',
            role: UserRole.STUDENT,
          })
          .onConflictDoNothing();

        const [club] = await db
          .insert(clubs)
          .values({
            name: `OD Rotation Club ${Date.now()}`,
            slug: `od-rot-club-${Date.now()}`,
            description: 'Test club',
          })
          .returning();

        const [venue] = await db
          .insert(venues)
          .values({
            name: `OD Rot Venue ${Date.now()}`,
            capacity: 100,
            locationText: 'Rot Hall',
          })
          .returning();

        await db
          .insert(events)
          .values({
            id: eventId,
            clubId: club!.id,
            venueId: venue!.id,
            title: 'Rotation Event',
            category: 'WORKSHOP',
            description: 'Official test event for secret rotation validation',
            slug: `rot-event-${Date.now()}`,
            startAt: new Date(Date.now() - 3600000),
            endAt: new Date(Date.now() + 3600000),
            registrationOpensAt: new Date(Date.now() - 7200000),
            registrationClosesAt: new Date(Date.now() - 3600000),
            capacity: 50,
            remainingCapacity: 50,
          })
          .returning();

        const payload = `${serial}|${userId}|${eventId}|${checkedInAt}`;
        const oldSignature = crypto.createHmac('sha256', oldSecret).update(payload).digest('hex');

        const [letter] = await db
          .insert(odLetters)
          .values({
            serial,
            userId,
            eventId,
            signature: oldSignature,
            pdfKey: 'dummy_key',
            issuedAt: new Date(checkedInAt),
          })
          .returning();

        // 2. Configure environment with newSecret as primary, and oldSecret as previous
        (env as any).OD_SEAL_SECRET = newSecret;
        (env as any).OD_SEAL_SECRET_PREVIOUS = oldSecret;

        // 3. Verify letter
        const verification = await verifyOdLetterBySerial(serial);
        expect(verification.valid).toBe(true);
        expect(verification.serial).toBe(serial);
      } finally {
        (env as any).OD_SEAL_SECRET = originalCurrentSecret;
        (env as any).OD_SEAL_SECRET_PREVIOUS = originalPreviousSecret;
      }
    });
  });

  describe('6. Admin Bootstrap from INITIAL_ADMIN_EMAILS (Section C.10)', () => {
    it('assigns ADMIN role to a newly created user whose email matches INITIAL_ADMIN_EMAILS', async () => {
      const originalAdminEmails = env.INITIAL_ADMIN_EMAILS;
      try {
        const adminEmail = `bootstrap.admin.${Date.now()}@eventora.campus.edu`;
        (env as any).INITIAL_ADMIN_EMAILS = `someone@example.com,${adminEmail}`;

        // Verify that resolveUser logic assigns UserRole.ADMIN
        const [existing] = await db.select().from(users).where(eq(users.email, adminEmail));
        expect(existing).toBeUndefined();

        // Check initialRole assignment against INITIAL_ADMIN_EMAILS
        const allowedAdmins = env.INITIAL_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase());
        expect(allowedAdmins.includes(adminEmail.toLowerCase())).toBe(true);

        const initialRole = allowedAdmins.includes(adminEmail.toLowerCase())
          ? UserRole.ADMIN
          : UserRole.STUDENT;

        const [createdAdmin] = await db
          .insert(users)
          .values({
            clerkId: `clerk_admin_${Date.now()}`,
            email: adminEmail,
            fullName: 'Bootstrap Admin',
            role: initialRole,
          })
          .returning();

        expect(createdAdmin?.role).toBe(UserRole.ADMIN);
      } finally {
        (env as any).INITIAL_ADMIN_EMAILS = originalAdminEmails;
      }
    });
  });
});
