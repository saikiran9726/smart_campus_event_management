import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  ProposalStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubMembers,
  clubs,
  eventProposals,
  users,
  venues,
} from '../db/schema';
import { buildServer } from '../server';
import { authenticateRequest } from '../plugins/auth';
import { env } from '../env';

describe('Prompt 26A: Role Access Enforcement & Invariant Tests (Real DB, server.inject)', () => {
  const server = buildServer();

  let studentUser: any;
  let organizerUser: any;
  let facultyUser1: any;
  let facultyUser2: any;
  let adminUser: any;
  let testClub: any;
  let testVenue: any;
  let pendingProposal1: any;
  let pendingProposal2: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create users for all roles
    const [stu] = await db
      .insert(users)
      .values({
        clerkId: `clerk_stu_${ts}`,
        email: `student_${ts}@campus.edu`,
        fullName: 'Role Student',
        role: UserRole.STUDENT,
      })
      .returning();
    studentUser = stu;

    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_${ts}`,
        email: `org_${ts}@campus.edu`,
        fullName: 'Role Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [fac1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_fac1_${ts}`,
        email: `fac1_${ts}@campus.edu`,
        fullName: 'Dr. Faculty One',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyUser1 = fac1;

    const [fac2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_fac2_${ts}`,
        email: `fac2_${ts}@campus.edu`,
        fullName: 'Dr. Faculty Two',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyUser2 = fac2;

    const [adm] = await db
      .insert(users)
      .values({
        clerkId: `clerk_adm_${ts}`,
        email: `adm_${ts}@campus.edu`,
        fullName: 'Role Admin',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = adm;

    // 2. Club & Venue setup
    const [venue] = await db
      .insert(venues)
      .values({
        name: `Auditorium ${ts}`,
        capacity: 500,
        locationText: 'Main Campus',
      })
      .returning();
    testVenue = venue;

    const [club] = await db
      .insert(clubs)
      .values({
        name: `Role Test Club ${ts}`,
        slug: `role-test-club-${ts}`,
        description: 'Testing role permissions.',
        facultyCoordinatorId: facultyUser1.id,
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Pending Proposals
    const [p1] = await db
      .insert(eventProposals)
      .values({
        clubId: testClub.id,
        proposedBy: organizerUser.id,
        facultyId: facultyUser1.id,
        title: `AI Hackathon Proposal ${ts}`,
        description: 'Proposing national hackathon.',
        expectedAttendance: 200,
        venueId: testVenue.id,
        startAt: new Date(Date.now() + 86400000 * 3),
        endAt: new Date(Date.now() + 86400000 * 4),
        status: ProposalStatus.PENDING,
      })
      .returning();
    pendingProposal1 = p1;

    const [p2] = await db
      .insert(eventProposals)
      .values({
        clubId: testClub.id,
        proposedBy: organizerUser.id,
        facultyId: facultyUser2.id,
        title: `Web3 Seminar Proposal ${ts}`,
        description: 'Proposing web3 blockchain seminar.',
        expectedAttendance: 150,
        venueId: testVenue.id,
        startAt: new Date(Date.now() + 86400000 * 6),
        endAt: new Date(Date.now() + 86400000 * 7),
        status: ProposalStatus.PENDING,
      })
      .returning();
    pendingProposal2 = p2;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. GET /faculty/proposals - Access and Visibility per Role', () => {
    it('STUDENT receives 403 Forbidden', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/faculty/proposals',
        headers: { 'x-test-user-id': studentUser.id },
      });
      expect(res.statusCode).toBe(403);
    });

    it('ORGANIZER receives 403 Forbidden', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/faculty/proposals',
        headers: { 'x-test-user-id': organizerUser.id },
      });
      expect(res.statusCode).toBe(403);
    });

    it('FACULTY sees all pending proposals across the campus', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/faculty/proposals?status=PENDING',
        headers: { 'x-test-user-id': facultyUser1.id },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.items)).toBe(true);
      const ids = body.items.map((p: any) => p.id);
      expect(ids).toContain(pendingProposal1.id);
      expect(ids).toContain(pendingProposal2.id);
    });

    it('A second FACULTY also sees all pending proposals without club/assignment barrier', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/faculty/proposals',
        headers: { 'x-test-user-id': facultyUser2.id },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const ids = body.items.map((p: any) => p.id);
      expect(ids).toContain(pendingProposal1.id);
      expect(ids).toContain(pendingProposal2.id);
    });

    it('ADMIN sees all pending proposals', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/faculty/proposals',
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const ids = body.items.map((p: any) => p.id);
      expect(ids).toContain(pendingProposal1.id);
      expect(ids).toContain(pendingProposal2.id);
    });
  });

  describe('2. POST /faculty/proposals/:id/decision - Decision Rules per Role', () => {
    it('STUDENT receives 403 Forbidden when attempting to decide a proposal', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/faculty/proposals/${pendingProposal1.id}/decision`,
        headers: { 'x-test-user-id': studentUser.id },
        payload: { status: 'APPROVED' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('ORGANIZER receives 403 Forbidden when attempting to decide a proposal', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/faculty/proposals/${pendingProposal1.id}/decision`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: { status: 'APPROVED' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('FACULTY decides a proposal: records deciding faculty ID and updates status', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/faculty/proposals/${pendingProposal1.id}/decision`,
        headers: { 'x-test-user-id': facultyUser1.id },
        payload: {
          status: 'APPROVED',
          decisionNotes: 'Endorsed for technical excellence.',
        },
      });
      expect(res.statusCode).toBe(200);

      // Verify in DB that deciding faculty ID is recorded
      const [updated] = await db
        .select()
        .from(eventProposals)
        .where(eq(eventProposals.id, pendingProposal1.id))
        .limit(1);

      expect(updated).toBeDefined();
      expect(updated!.status).toBe(ProposalStatus.APPROVED);
      expect(updated!.facultyId).toBe(facultyUser1.id);
      expect(updated!.decidedAt).toBeDefined();
    });

    it('Already-decided proposal returns 409 CONFLICT on subsequent decision attempt', async () => {
      // Second attempt by facultyUser2 on the same proposal
      const res = await server.inject({
        method: 'POST',
        url: `/faculty/proposals/${pendingProposal1.id}/decision`,
        headers: { 'x-test-user-id': facultyUser2.id },
        payload: { status: 'REJECTED' },
      });
      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error?.code || body.code).toBe('CONFLICT');

      // Admin also gets 409 because it is already decided
      const adminRes = await server.inject({
        method: 'POST',
        url: `/faculty/proposals/${pendingProposal1.id}/decision`,
        headers: { 'x-test-user-id': adminUser.id },
        payload: { status: 'APPROVED' },
      });
      expect(adminRes.statusCode).toBe(409);
    });
  });

  describe('3. Production Security Invariant: x-test-user-id Ignored in Production', () => {
    it('proves that in production (NODE_ENV=production), x-test-user-id is ignored and yields null/401', async () => {
      const originalEnv = env.NODE_ENV;
      try {
        // Temporarily simulate production environment
        (env as any).NODE_ENV = 'production';

        const mockRequest: any = {
          headers: {
            'x-test-user-id': studentUser.id,
          },
        };

        const resolvedUser = await authenticateRequest(mockRequest);
        // Under production, x-test-user-id MUST NOT resolve any user session
        expect(resolvedUser).toBeNull();
      } finally {
        (env as any).NODE_ENV = originalEnv;
      }
    });
  });
});
