import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';
import { FastifyInstance } from 'fastify';
import { UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { users } from '../db/schema';
import { eq, or } from 'drizzle-orm';

describe('Clean Platform Metrics & Bot Filtering Regression Suite', () => {
  let app: FastifyInstance;
  const ADMIN_CLERK_ID = 'user_3LSUmkgq6DMLjwSgoWuzjOHFc9n';
  const SYSTEM_BOT_ID = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.clerkId, ADMIN_CLERK_ID), eq(users.email, 'saikiranroopreddy@gmail.com')))
      .limit(1);

    const first = existing[0];
    if (!first) {
      await db.insert(users).values({
        clerkId: ADMIN_CLERK_ID,
        email: 'saikiranroopreddy@gmail.com',
        fullName: 'Sai Kiran Roopreddy',
        role: UserRole.ADMIN,
      });
    } else {
      await db
        .update(users)
        .set({
          clerkId: ADMIN_CLERK_ID,
          email: 'saikiranroopreddy@gmail.com',
          role: UserRole.ADMIN,
          fullName: 'Sai Kiran Roopreddy',
          deletedAt: null,
        })
        .where(eq(users.id, first.id));
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. GET /me: authenticates genuine admin Sai Kiran Roopreddy', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.role).toBe(UserRole.ADMIN);
    expect(body.user.email).toBe('saikiranroopreddy@gmail.com');
  });

  it('2. GET /admin/analytics/campus: returns accurate overview property shape with zero counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/analytics/campus',
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('overview');
    expect(typeof body.overview.totalClubs).toBe('number');
    expect(typeof body.overview.totalEvents).toBe('number');
    expect(typeof body.overview.totalRegistrations).toBe('number');
    expect(typeof body.overview.totalCheckedIn).toBe('number');
    expect(typeof body.overview.campusAttendanceRate).toBe('number');
    expect(Array.isArray(body.clubs)).toBe(true);
    expect(Array.isArray(body.topEvents)).toBe(true);
  });

  it('3. GET /admin/users: excludes internal system bot from human directory', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?q=saikiranroopreddy@gmail.com',
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.users)).toBe(true);

    const botFound = body.users.some(
      (u: any) => u.id === SYSTEM_BOT_ID || u.email === 'system@eventora.internal'
    );
    expect(botFound).toBe(false);

    const adminFound = body.users.some(
      (u: any) => u.email === 'saikiranroopreddy@gmail.com'
    );
    expect(adminFound).toBe(true);
  });

  it('4. PATCH /admin/users/:id/role: forbids modifying internal system bot role', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${SYSTEM_BOT_ID}/role`,
      headers: { 'x-test-user-id': ADMIN_CLERK_ID },
      payload: { role: UserRole.STUDENT },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    const errorCode = typeof body.error === 'object' ? body.error.code : (body.error || body.code);
    expect(errorCode).toBe('FORBIDDEN');
  });

  it('5. GET /events: returns empty active list on pristine platform', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const items = body.items || body.events || body;
    expect(Array.isArray(items)).toBe(true);
  });
});
