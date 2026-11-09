import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { Webhook } from 'svix';
import { EventStatus, UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { clubs, events, eventVolunteers, users, volunteerInvitations } from '../db/schema';
import { env } from '../env';
import { syncAndReconcileClerkUser } from '../lib/identity';
import { buildServer } from '../server';

describe('Volunteer Identity Reconciliation & Security Suite', () => {
  const server = buildServer();
  const testSecret = 'whsec_dGVzdHNlY3JldDEyMzQ1Njc4OWFiY2RlZg==';
  let testEventId: string;
  let testClubId: string;
  let adminUserId: string;

  beforeAll(async () => {
    (env as any).CLERK_WEBHOOK_SECRET = testSecret;
    await server.ready();

    // Create an admin user and test event for volunteer assignments
    const [adminUser] = await db
      .insert(users)
      .values({
        clerkId: `admin_reconcile_${Date.now()}`,
        email: `admin_reconcile_${Date.now()}@campus.edu`,
        fullName: 'Admin Test',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUserId = adminUser!.id;

    const [testClub] = await db
      .insert(clubs)
      .values({
        name: `Reconciliation Club ${Date.now()}`,
        slug: `reconcile-club-${Date.now()}`,
        description: 'Test club for reconciliation',
      })
      .returning();
    testClubId = testClub!.id;

    const now = new Date();
    const [testEv] = await db
      .insert(events)
      .values({
        clubId: testClub!.id,
        title: 'Reconciliation Test Event',
        slug: `reconcile-event-${Date.now()}`,
        description: 'Elite Test Event',
        category: 'Workshop',
        startAt: new Date(now.getTime() + 86400000),
        endAt: new Date(now.getTime() + 172800000),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        capacity: 100,
        remainingCapacity: 100,
        status: EventStatus.PUBLISHED,
      })
      .returning();
    testEventId = testEv!.id;
  });

  afterAll(async () => {
    await server.close();
  });

  it('1. Reconciles verified placeholder account via Clerk webhook without changing users.id or breaking event assignments', async () => {
    const timestamp = Date.now();
    const collisionEmail = `volunteer_reconcile_${timestamp}@campus.edu`.toLowerCase();
    const placeholderClerkId = `volunteer_${crypto.randomUUID()}`;

    // Step A: Admin provisions volunteer
    const [placeholderUser] = await db
      .insert(users)
      .values({
        clerkId: placeholderClerkId,
        email: collisionEmail,
        fullName: 'Pending Volunteer',
        role: UserRole.STUDENT,
      })
      .returning();

    // Attach volunteer assignment to placeholder user
    const [assignment] = await db
      .insert(eventVolunteers)
      .values({
        eventId: testEventId,
        userId: placeholderUser!.id,
        gate: 'Gate 4',
        role: 'SCANNER',
        status: 'ACTIVE',
        assignedBy: adminUserId,
      })
      .returning();

    expect(assignment!.userId).toBe(placeholderUser!.id);

    // Step B: Real user signs in via Clerk with verified email
    const realClerkId = `user_real_${timestamp}`;
    const msgId = `msg_reconcile_${timestamp}`;
    const webhookTime = new Date();

    const payloadObj = {
      type: 'user.created',
      data: {
        id: realClerkId,
        email_addresses: [
          {
            id: 'email_primary_1',
            email_address: collisionEmail,
            verification: { status: 'verified' },
          },
        ],
        primary_email_address_id: 'email_primary_1',
        first_name: 'Verified',
        last_name: 'Volunteer',
        image_url: 'https://img.campus.edu/avatar.png',
      },
    };

    const rawBody = JSON.stringify(payloadObj);
    const wh = new Webhook(testSecret);
    const signature = wh.sign(msgId, webhookTime, rawBody);
    const timestampSeconds = Math.floor(webhookTime.getTime() / 1000).toString();

    const response = await server.inject({
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

    expect(response.statusCode).toBe(200);

    // Step C: Verify account was reconciled: same id, updated clerkId
    const [reconciledUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, placeholderUser!.id));

    expect(reconciledUser).toBeDefined();
    expect(reconciledUser!.clerkId).toBe(realClerkId);
    expect(reconciledUser!.fullName).toBe('Verified Volunteer');

    // Step D: Verify assignment relationship is completely intact
    const [activeAssignment] = await db
      .select()
      .from(eventVolunteers)
      .where(eq(eventVolunteers.id, assignment!.id));

    expect(activeAssignment!.userId).toBe(placeholderUser!.id);
    expect(activeAssignment!.status).toBe('ACTIVE');
  });

  it('2. Refuses to reconcile if email is unverified', async () => {
    const timestamp = Date.now();
    const email = `unverified_vol_${timestamp}@campus.edu`.toLowerCase();
    const placeholderClerkId = `volunteer_${crypto.randomUUID()}`;

    await db.insert(users).values({
      clerkId: placeholderClerkId,
      email,
      fullName: 'Unverified Test',
      role: UserRole.STUDENT,
    });

    const result = await syncAndReconcileClerkUser({
      clerkId: `user_unverified_${timestamp}`,
      email,
      isEmailVerified: false,
      fullName: 'Attacker Impersonator',
    });

    expect(result.user).toBeNull();
    expect(result.reason).toBe('EMAIL_UNVERIFIED_CANNOT_RECONCILE');

    // Verify DB record was unchanged
    const [userInDb] = await db.select().from(users).where(eq(users.email, email));
    expect(userInDb!.clerkId).toBe(placeholderClerkId);
  });

  it('3. Refuses to merge into an existing non-placeholder account', async () => {
    const timestamp = Date.now();
    const email = `real_existing_${timestamp}@campus.edu`.toLowerCase();
    const existingRealClerkId = `user_existing_${timestamp}`;

    await db.insert(users).values({
      clerkId: existingRealClerkId,
      email,
      fullName: 'Original Legitimate User',
      role: UserRole.STUDENT,
    });

    const result = await syncAndReconcileClerkUser({
      clerkId: `user_intruder_${timestamp}`,
      email,
      isEmailVerified: true,
      fullName: 'Intruder Trying To Merge',
    });

    expect(result.user).toBeNull();
    expect(result.reason).toBe('EMAIL_COLLISION_NON_PLACEHOLDER');

    const [userInDb] = await db.select().from(users).where(eq(users.email, email));
    expect(userInDb!.clerkId).toBe(existingRealClerkId);
  });

  it('4. Concurrent reconciliation requests are idempotent and safe', async () => {
    const timestamp = Date.now();
    const email = `concurrent_vol_${timestamp}@campus.edu`.toLowerCase();
    const placeholderClerkId = `volunteer_${crypto.randomUUID()}`;
    const realClerkId = `user_concurrent_${timestamp}`;

    await db.insert(users).values({
      clerkId: placeholderClerkId,
      email,
      fullName: 'Concurrent Placeholder',
      role: UserRole.STUDENT,
    });

    // Fire 2 concurrent sync calls simulating simultaneous webhook & first authenticated request
    const [result1, result2] = await Promise.all([
      syncAndReconcileClerkUser({
        clerkId: realClerkId,
        email,
        isEmailVerified: true,
        fullName: 'Concurrent Real User',
      }),
      syncAndReconcileClerkUser({
        clerkId: realClerkId,
        email,
        isEmailVerified: true,
        fullName: 'Concurrent Real User',
      }),
    ]);

    expect(result1.user).toBeDefined();
    expect(result2.user).toBeDefined();
    expect(result1.user?.id).toBe(result2.user?.id);
    expect(result1.user?.clerkId).toBe(realClerkId);
  });

  it('5. GET /me reports accurate volunteer eligibility metrics', async () => {
    const timestamp = Date.now();
    const email = `me_volunteer_${timestamp}@campus.edu`.toLowerCase();
    const clerkId = `user_me_vol_${timestamp}`;

    const [volUser] = await db
      .insert(users)
      .values({
        clerkId,
        email,
        fullName: 'Eligibility User',
        role: UserRole.STUDENT,
      })
      .returning();

    // Initially: neither volunteer nor pending invite
    const initialRes = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': volUser!.id },
    });
    expect(initialRes.statusCode).toBe(200);
    const initialJson = JSON.parse(initialRes.body);
    expect(initialJson.user.volunteer).toEqual({
      isVolunteer: false,
      hasPendingInvite: false,
      activeCount: 0,
    });

    // Add pending invitation
    await db.insert(volunteerInvitations).values({
      email,
      fullName: 'Eligibility User',
      eventId: testEventId,
      gate: 'Gate 1',
      role: 'SCANNER',
      token: `VOL-TEST-${timestamp}`,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const pendingRes = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': volUser!.id },
    });
    expect(pendingRes.statusCode).toBe(200);
    const pendingJson = JSON.parse(pendingRes.body);
    expect(pendingJson.user.volunteer.hasPendingInvite).toBe(true);
    expect(pendingJson.user.volunteer.isVolunteer).toBe(false);

    // Add active assignment
    await db.insert(eventVolunteers).values({
      eventId: testEventId,
      userId: volUser!.id,
      gate: 'Gate 1',
      role: 'SCANNER',
      status: 'ACTIVE',
    });

    const activeRes = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': volUser!.id },
    });
    expect(activeRes.statusCode).toBe(200);
    const activeJson = JSON.parse(activeRes.body);
    expect(activeJson.user.volunteer.isVolunteer).toBe(true);
    expect(activeJson.user.volunteer.activeCount).toBe(1);

    // Exclusion case A: Revoked assignment does not count towards activeCount
    const [revokedEvent] = await db
      .insert(events)
      .values({
        clubId: testClubId,
        title: `Revoked Assignment Event ${timestamp}`,
        slug: `revoked-assignment-event-${timestamp}`,
        description: 'Test event description',
        category: 'WORKSHOP',
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 172800000),
        registrationOpensAt: new Date(Date.now() - 86400000),
        registrationClosesAt: new Date(Date.now() + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 100,
        remainingCapacity: 100,
      })
      .returning();

    await db.insert(eventVolunteers).values({
      eventId: revokedEvent!.id,
      userId: volUser!.id,
      gate: 'Side Gate',
      role: 'SCANNER',
      status: 'REVOKED',
    });

    const revokedCheckRes = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': volUser!.id },
    });
    expect(revokedCheckRes.statusCode).toBe(200);
    const revokedCheckJson = JSON.parse(revokedCheckRes.body);
    expect(revokedCheckJson.user.volunteer.activeCount).toBe(1); // Still 1, revoked is excluded

    // Exclusion case B: Ended event assignment does not count towards activeCount
    const [endedEvent] = await db
      .insert(events)
      .values({
        clubId: testClubId,
        title: `Ended Assignment Event ${timestamp}`,
        slug: `ended-assignment-event-${timestamp}`,
        description: 'Test event description',
        category: 'WORKSHOP',
        startAt: new Date(Date.now() - 172800000),
        endAt: new Date(Date.now() - 86400000), // Ended in the past
        registrationOpensAt: new Date(Date.now() - 259200000),
        registrationClosesAt: new Date(Date.now() - 172800000),
        status: EventStatus.COMPLETED,
        capacity: 100,
        remainingCapacity: 100,
      })
      .returning();

    await db.insert(eventVolunteers).values({
      eventId: endedEvent!.id,
      userId: volUser!.id,
      gate: 'Side Gate',
      role: 'SCANNER',
      status: 'ACTIVE',
    });

    const endedCheckRes = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': volUser!.id },
    });
    expect(endedCheckRes.statusCode).toBe(200);
    const endedCheckJson = JSON.parse(endedCheckRes.body);
    expect(endedCheckJson.user.volunteer.activeCount).toBe(1); // Still 1, ended is excluded

    // Exclusion case C: Cancelled event assignment does not count towards activeCount
    const [cancelledEvent] = await db
      .insert(events)
      .values({
        clubId: testClubId,
        title: `Cancelled Assignment Event ${timestamp}`,
        slug: `cancelled-assignment-event-${timestamp}`,
        description: 'Test event description',
        category: 'WORKSHOP',
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 172800000),
        registrationOpensAt: new Date(Date.now() - 86400000),
        registrationClosesAt: new Date(Date.now() + 86400000),
        status: EventStatus.CANCELLED,
        capacity: 100,
        remainingCapacity: 100,
      })
      .returning();

    await db.insert(eventVolunteers).values({
      eventId: cancelledEvent!.id,
      userId: volUser!.id,
      gate: 'Side Gate',
      role: 'SCANNER',
      status: 'ACTIVE',
    });

    const cancelledCheckRes = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': volUser!.id },
    });
    expect(cancelledCheckRes.statusCode).toBe(200);
    const cancelledCheckJson = JSON.parse(cancelledCheckRes.body);
    expect(cancelledCheckJson.user.volunteer.activeCount).toBe(1); // Still 1, cancelled is excluded

    // Exclusion case D: Expired invitation does not count towards hasPendingInvite
    const expiredInviteEmail = `expired_inv_${timestamp}@campus.edu`.toLowerCase();
    const [expiredUser] = await db
      .insert(users)
      .values({
        clerkId: `user_expired_${timestamp}`,
        email: expiredInviteEmail,
        fullName: 'Expired Invitee',
        role: UserRole.STUDENT,
      })
      .returning();

    await db.insert(volunteerInvitations).values({
      email: expiredInviteEmail,
      fullName: 'Expired Invitee',
      eventId: testEventId,
      gate: 'Main Gate',
      role: 'SCANNER',
      token: `VOL-EXP-${timestamp}`,
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
    });

    const expiredCheckRes = await server.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-test-user-id': expiredUser!.id },
    });
    expect(expiredCheckRes.statusCode).toBe(200);
    const expiredCheckJson = JSON.parse(expiredCheckRes.body);
    expect(expiredCheckJson.user.volunteer.hasPendingInvite).toBe(false);
    expect(expiredCheckJson.user.volunteer.isVolunteer).toBe(false);
  });

  it('6. Invitation activation enforces email matching and single-use expiry', async () => {
    const timestamp = Date.now();
    const inviteEmail = `invitee_${timestamp}@campus.edu`.toLowerCase();
    const token = `VOL-INV-${timestamp}`;

    await db.insert(volunteerInvitations).values({
      email: inviteEmail,
      fullName: 'Authorized Invitee',
      eventId: testEventId,
      gate: 'VIP Gate',
      role: 'SCANNER',
      token,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Step A: An authenticated attacker with different email cannot activate it
    const [attacker] = await db
      .insert(users)
      .values({
        clerkId: `attacker_${timestamp}`,
        email: `attacker_${timestamp}@campus.edu`,
        fullName: 'Attacker User',
        role: UserRole.STUDENT,
      })
      .returning();

    const forbiddenRes = await server.inject({
      method: 'POST',
      url: '/volunteers/activate',
      headers: { 'x-test-user-id': attacker!.id },
      payload: { token },
    });
    expect(forbiddenRes.statusCode).toBe(403);
    const forbiddenJson = JSON.parse(forbiddenRes.body);
    expect(forbiddenJson.error.message).toContain('issued to a different email address');

    // Step B: The authorized user activates it successfully
    const [authorizedUser] = await db
      .insert(users)
      .values({
        clerkId: `auth_user_${timestamp}`,
        email: inviteEmail,
        fullName: 'Authorized Invitee',
        role: UserRole.STUDENT,
      })
      .returning();

    const successRes = await server.inject({
      method: 'POST',
      url: '/volunteers/activate',
      headers: { 'x-test-user-id': authorizedUser!.id },
      payload: { token },
    });
    expect(successRes.statusCode).toBe(200);

    // Step C: Single-use: activating again is rejected (404 as it is now ACCEPTED, not PENDING)
    const reuseRes = await server.inject({
      method: 'POST',
      url: '/volunteers/activate',
      headers: { 'x-test-user-id': authorizedUser!.id },
      payload: { token },
    });
    expect(reuseRes.statusCode).toBe(404);
  });

  it('7. Revoked volunteer cannot launch scanner session', async () => {
    const timestamp = Date.now();
    const [revokedUser] = await db
      .insert(users)
      .values({
        clerkId: `revoked_${timestamp}`,
        email: `revoked_${timestamp}@campus.edu`,
        fullName: 'Revoked Volunteer',
        role: UserRole.STUDENT,
      })
      .returning();

    const [assignment] = await db
      .insert(eventVolunteers)
      .values({
        eventId: testEventId,
        userId: revokedUser!.id,
        gate: 'Gate 2',
        role: 'SCANNER',
        status: 'REVOKED',
      })
      .returning();

    const sessionRes = await server.inject({
      method: 'POST',
      url: `/me/volunteer-assignments/${assignment!.id}/scanner-session`,
      headers: { 'x-test-user-id': revokedUser!.id },
    });

    expect(sessionRes.statusCode).toBe(403);
    const sessionJson = JSON.parse(sessionRes.body);
    expect(sessionJson.error.message).toContain('Active volunteer assignment not found');
  });

  it('8. Admin allowlist enforcements: verified allowlisted -> ADMIN, unverified allowlisted -> STUDENT, non-listed -> STUDENT', async () => {
    const timestamp = Date.now();
    (env as any).INITIAL_ADMIN_EMAILS = `admin_allowlist_${timestamp}@campus.edu`;

    // Case 1: Verified allowlisted email -> ADMIN
    const verifiedAdminResult = await syncAndReconcileClerkUser({
      clerkId: `clerk_admin_ver_${timestamp}`,
      email: `admin_allowlist_${timestamp}@campus.edu`,
      isEmailVerified: true,
      fullName: 'Verified Allowlisted Admin',
    });
    expect(verifiedAdminResult.user).toBeDefined();
    expect(verifiedAdminResult.user?.role).toBe(UserRole.ADMIN);

    // Case 2: Unverified allowlisted email -> STUDENT
    const unverifiedAdminResult = await syncAndReconcileClerkUser({
      clerkId: `clerk_admin_unver_${timestamp}`,
      email: `admin_allowlist_unverified_${timestamp}@campus.edu`,
      isEmailVerified: false,
      fullName: 'Unverified Allowlisted Attempt',
    });
    expect(unverifiedAdminResult.user).toBeDefined();
    expect(unverifiedAdminResult.user?.role).toBe(UserRole.STUDENT);

    // Case 3: Non-allowlisted email -> STUDENT
    const regularStudentResult = await syncAndReconcileClerkUser({
      clerkId: `clerk_student_${timestamp}`,
      email: `regular_student_${timestamp}@campus.edu`,
      isEmailVerified: true,
      fullName: 'Regular Student',
    });
    expect(regularStudentResult.user).toBeDefined();
    expect(regularStudentResult.user?.role).toBe(UserRole.STUDENT);
  });

  it('9. Concurrency test: two parallel activations of same token, exactly one succeeds (200) and one fails (404)', async () => {
    const timestamp = Date.now();
    const token = `VOL-CONCUR-${timestamp}`;
    const inviteEmail = `concur_vol_${timestamp}@campus.edu`.toLowerCase();

    await db.insert(volunteerInvitations).values({
      email: inviteEmail,
      fullName: 'Concurrent Invitee',
      eventId: testEventId,
      gate: 'Main Gate',
      role: 'SCANNER',
      token,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const [user1, user2] = await Promise.all([
      db
        .insert(users)
        .values({
          clerkId: `concur_user1_${timestamp}`,
          email: inviteEmail,
          fullName: 'Concurrent Invitee Device 1',
          role: UserRole.STUDENT,
        })
        .returning(),
      db
        .insert(users)
        .values({
          clerkId: `concur_user2_${timestamp}`,
          email: `concur_other_${timestamp}@campus.edu`,
          fullName: 'Concurrent Invitee Device 2',
          role: UserRole.STUDENT,
        })
        .returning(),
    ]);

    // Fire two activations in parallel for the exact same token
    const [res1, res2] = await Promise.all([
      server.inject({
        method: 'POST',
        url: '/volunteers/activate',
        headers: { 'x-test-user-id': user1[0]!.id },
        payload: { token },
      }),
      server.inject({
        method: 'POST',
        url: '/volunteers/activate',
        headers: { 'x-test-user-id': user1[0]!.id },
        payload: { token },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([200, 404]);

    // Verify token status in DB is now ACCEPTED
    const [tokenInDb] = await db.select().from(volunteerInvitations).where(eq(volunteerInvitations.token, token));
    expect(tokenInDb!.status).toBe('ACCEPTED');
  });
});
