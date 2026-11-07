import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  ProposalStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  avResources,
  clubMembers,
  clubs,
  eventProposals,
  events,
  notifications,
  users,
  venues,
} from '../db/schema';
import { env } from '../env';
import { signApprovalToken } from '../lib/magic-link';
import { requireTurnstile } from '../lib/turnstile';
import { buildServer } from '../server';

describe('Proposals, Events, Uploads, Venue/AV Collision, & Magic Links', () => {
  const server = buildServer();

  let organizerUser: any;
  let facultyUser: any;
  let testClub: any;
  let testVenue: any;
  let testProjector: any;

  beforeAll(async () => {
    // Register turnstile test route before server.ready()
    server.post(
      '/test/turnstile-protected',
      { preHandler: [requireTurnstile] },
      async (req, reply) => reply.send({ success: true })
    );

    await server.ready();

    const timestamp = Date.now();

    // 1. Create Organizer and Faculty users
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_${timestamp}`,
        email: `org_${timestamp}@campus.edu`,
        fullName: 'Proposal Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [fac] = await db
      .insert(users)
      .values({
        clerkId: `clerk_fac_${timestamp}`,
        email: `fac_${timestamp}@campus.edu`,
        fullName: 'Faculty Coordinator',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyUser = fac;

    // 2. Create Club with organizer as OWNER
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Robotics Club ${timestamp}`,
        slug: `robotics-${timestamp}`,
        description: 'Building autonomous robots and rovers.',
        facultyCoordinatorId: facultyUser.id,
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Create Venue with capacity 500
    const [venue] = await db
      .insert(venues)
      .values({
        name: `Seminar Complex ${timestamp}`,
        capacity: 500,
        locationText: 'Block B, 3rd Floor',
      })
      .returning();
    testVenue = venue;

    // 4. Create AV Resource with quantity = 1 (Single Projector)
    const [projector] = await db
      .insert(avResources)
      .values({
        name: `Single 4K Projector ${timestamp}`,
        kind: 'PROJECTOR',
        quantity: 1,
      })
      .returning();
    testProjector = projector;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Venue Collision Detection', () => {
    const baseTime = Date.now() + 86400000; // Tomorrow
    const windowStart = new Date(baseTime).toISOString();
    const windowMid = new Date(baseTime + 3600000).toISOString(); // +1 hr
    const windowEnd = new Date(baseTime + 7200000).toISOString(); // +2 hr
    const windowNext = new Date(baseTime + 10800000).toISOString(); // +3 hr

    it('creates proposal holding venue window [windowStart, windowEnd)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/proposals`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Autonomous Navigation Workshop',
          description: 'Hands-on session using ROS2 and LiDAR sensors.',
          expectedAttendance: 200,
          venueId: testVenue.id,
          startAt: windowStart,
          endAt: windowEnd,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = JSON.parse(response.body);
      expect(json.proposal.title).toBe('Autonomous Navigation Workshop');
      expect(json.proposal.status).toBe(ProposalStatus.PENDING);
    });

    it('rejects overlapping proposal for the same venue with 409 VENUE_CONFLICT', async () => {
      // Overlaps [windowMid, windowNext) which intersects [windowStart, windowEnd)
      const response = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/proposals`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Conflicting AI Seminar',
          description: 'A different club or event attempting to book overlapping time.',
          expectedAttendance: 150,
          venueId: testVenue.id,
          startAt: windowMid,
          endAt: windowNext,
        },
      });

      expect(response.statusCode).toBe(409);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('VENUE_CONFLICT');
    });

    it('adjacent window (end == next start) succeeds without conflict', async () => {
      // Window [windowEnd, windowNext) directly abuts [windowStart, windowEnd)
      const response = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/proposals`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Adjacent Drone Workshop',
          description: 'Starts exactly when the previous session finishes.',
          expectedAttendance: 180,
          venueId: testVenue.id,
          startAt: windowEnd,
          endAt: windowNext,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = JSON.parse(response.body);
      expect(json.proposal.status).toBe(ProposalStatus.PENDING);
    });
  });

  describe('AV Resources Collision Detection', () => {
    const avBaseTime = Date.now() + 172800000; // 2 days from now
    const avStart = new Date(avBaseTime).toISOString();
    const avEnd = new Date(avBaseTime + 7200000).toISOString();
    let otherVenue: any;

    beforeAll(async () => {
      const [venue2] = await db
        .insert(venues)
        .values({
          name: `Alternate Hall ${Date.now()}`,
          capacity: 400,
          locationText: 'Block C',
        })
        .returning();
      otherVenue = venue2;
    });

    it('reserves available AV projector quantity', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/proposals`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Computer Vision Lab',
          description: 'Testing object tracking.',
          expectedAttendance: 100,
          venueId: otherVenue.id,
          startAt: avStart,
          endAt: avEnd,
          avRequests: [{ avResourceId: testProjector.id, quantity: 1 }],
        },
      });

      expect(response.statusCode).toBe(201);
      const json = JSON.parse(response.body);
      expect(json.proposal.status).toBe(ProposalStatus.PENDING);
    });

    it('rejects second overlapping request for single projector with 409 AV_CONFLICT', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/proposals`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Machine Learning Keynote',
          description: 'Requires the same projector at the same time.',
          expectedAttendance: 80,
          venueId: testVenue.id, // Different venue, but same AV equipment
          startAt: avStart,
          endAt: avEnd,
          avRequests: [{ avResourceId: testProjector.id, quantity: 1 }],
        },
      });

      expect(response.statusCode).toBe(409);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('AV_CONFLICT');
      expect(json.error.details.requested).toBe(1);
      expect(json.error.details.available).toBe(0);
    });
  });

  describe('Magic Link Approvals & Token Lifecycle', () => {
    let proposalId: string;
    let approveToken: string;
    let rejectToken: string;

    beforeAll(async () => {
      const baseTime = Date.now() + 259200000;
      const res = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/proposals`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'National Robotics Expo 2026',
          description: 'Grand expo showcasing university projects.',
          expectedAttendance: 350,
          venueId: testVenue.id,
          startAt: new Date(baseTime).toISOString(),
          endAt: new Date(baseTime + 14400000).toISOString(),
        },
      });

      const json = JSON.parse(res.body);
      proposalId = json.proposal.id;

      // Extract tokens
      const appTokenData = await signApprovalToken({
        proposalId,
        facultyId: facultyUser.id,
        action: 'APPROVE',
      });
      approveToken = appTokenData.token;

      const rejTokenData = await signApprovalToken({
        proposalId,
        facultyId: facultyUser.id,
        action: 'REJECT',
      });
      rejectToken = rejTokenData.token;
    });

    it('accepts valid approval token, creates event in APPROVED status', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/public/faculty/decision',
        payload: { token: approveToken },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.outcome).toBe('APPROVED');
      expect(json.eventId).toBeDefined();

      // Verify event in DB
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, json.eventId));

      expect(event).toBeDefined();
      expect(event?.status).toBe(EventStatus.APPROVED);
      expect(event?.capacity).toBe(350);
      expect(event?.remainingCapacity).toBe(350);
    });

    it('replaying approval token returns 409 TOKEN_USED', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/public/faculty/decision',
        payload: { token: approveToken },
      });

      expect(response.statusCode).toBe(409);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('TOKEN_USED');
    });

    it('approving burns the reject sibling token (returns 409 TOKEN_USED)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/public/faculty/decision',
        payload: { token: rejectToken },
      });

      expect(response.statusCode).toBe(409);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('TOKEN_USED');
    });

    it('tampered magic link token returns 400 TOKEN_INVALID', async () => {
      const tampered = `${approveToken.slice(0, -6)}tamper`;
      const response = await server.inject({
        method: 'POST',
        url: '/public/faculty/decision',
        payload: { token: tampered },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('TOKEN_INVALID');
    });

    it('expired magic link token returns 410 OFFER_EXPIRED', async () => {
      // 1-second TTL token helper
      const expiredData = await signApprovalToken({
        proposalId,
        facultyId: facultyUser.id,
        action: 'APPROVE',
        ttlSeconds: 1,
      });

      // Wait 1.2 seconds for expiration
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const response = await server.inject({
        method: 'POST',
        url: '/public/faculty/decision',
        payload: { token: expiredData.token },
      });

      expect(response.statusCode).toBe(410);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('OFFER_EXPIRED');
    });
  });

  describe('Uploads & Presign Validation', () => {
    it('rejects executable file upload (.exe) with 400 VALIDATION_FAILED', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/uploads/presign',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          purpose: 'ATTACHMENT',
          fileName: 'malware.exe',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects file sizes exceeding MAX_UPLOAD_BYTES (10MB) with 400 VALIDATION_FAILED', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/uploads/presign',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          purpose: 'DECK',
          fileName: 'large_presentation.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 20000000, // 20MB > 10MB limit
        },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('VALIDATION_FAILED');
    });

    it('generates valid presigned PUT URL for allowable PDF payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/uploads/presign',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          purpose: 'POSTER',
          fileName: 'banner.png',
          mimeType: 'image/png',
          sizeBytes: 2048000,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.uploadUrl).toBeDefined();
      expect(json.objectKey).toContain('poster/');
      expect(json.expiresAt).toBeDefined();
    });
  });

  describe('Turnstile Bot Protection', () => {
    it('rejects request with test-fail token with 403 TURNSTILE_FAILED', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/test/turnstile-protected',
        headers: {
          'cf-turnstile-response': 'test-fail',
        },
      });

      expect(response.statusCode).toBe(403);
      const json = JSON.parse(response.body);
      expect(json.error.code).toBe('TURNSTILE_FAILED');
    });

    it('accepts request with test-pass token with 200', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/test/turnstile-protected',
        headers: {
          'cf-turnstile-response': 'test-pass',
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
    });
  });

  describe('Faculty Approval Integrity & Notification Isolation', () => {
    it('creates proposal for club without assigned faculty coordinator in PENDING status without granting proposer approval authority', async () => {
      const timestamp = Date.now();
      const [unassignedClub] = await db
        .insert(clubs)
        .values({
          name: `Unassigned Club ${timestamp}`,
          slug: `unassigned-${timestamp}`,
          description: 'Club without assigned faculty coordinator',
          facultyCoordinatorId: null,
          createdBy: organizerUser.id,
        })
        .returning();

      expect(unassignedClub).toBeDefined();
      await db.insert(clubMembers).values({
        clubId: unassignedClub!.id,
        userId: organizerUser.id,
        role: ClubMemberRole.OWNER,
      });

      const baseTime = Date.now() + 864000000;
      const startAt = new Date(baseTime).toISOString();
      const endAt = new Date(baseTime + 3600000).toISOString();

      const response = await server.inject({
        method: 'POST',
        url: `/clubs/${unassignedClub!.slug}/proposals`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Autonomous Robotics Hackathon',
          description: 'A robotics hackathon with pending faculty assignment.',
          expectedAttendance: 100,
          venueId: testVenue.id,
          startAt,
          endAt,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = JSON.parse(response.body);
      expect(json.proposal.status).toBe(ProposalStatus.PENDING);
      expect(json.proposal.facultyId).toBeNull();
      // Ensure no approval authority / tokens are generated for unassigned club
      expect(json.proposal.approveUrl).toBeNull();
      expect(json.proposal.rejectUrl).toBeNull();

      // Verify in DB that facultyId is null and proposedBy is the organizer
      const [dbProposal] = await db
        .select()
        .from(eventProposals)
        .where(eq(eventProposals.id, json.proposal.id))
        .limit(1);

      expect(dbProposal).toBeDefined();
      expect(dbProposal!.status).toBe(ProposalStatus.PENDING);
      expect(dbProposal!.facultyId).toBeNull();
      expect(dbProposal!.proposedBy).toBe(organizerUser.id);
    });

    it('isolates notification failure post-commit so proposal creation succeeds', async () => {
      const baseTime = Date.now() + 950400000;
      const startAt = new Date(baseTime).toISOString();
      const endAt = new Date(baseTime + 3600000).toISOString();

      // Mock db.insert specifically when inserting into notifications to simulate a failure
      const originalInsert = db.insert.bind(db);
      const insertSpy = vi.spyOn(db, 'insert').mockImplementation((table: any) => {
        if (table === notifications) {
          return {
            values: () => Promise.reject(new Error('Simulated Notification Network Error / Service Unavailable')),
          } as any;
        }
        return originalInsert(table);
      });

      try {
        const response = await server.inject({
          method: 'POST',
          url: `/clubs/${testClub.id}/proposals`,
          headers: { 'x-test-user-id': organizerUser.id },
          payload: {
            title: 'Resilient Notification Event',
            description: 'Proposal must succeed even if notifications fail.',
            expectedAttendance: 50,
            venueId: testVenue.id,
            startAt,
            endAt,
          },
        });

        expect(response.statusCode).toBe(201);
        const json = JSON.parse(response.body);
        expect(json.proposal.title).toBe('Resilient Notification Event');
        expect(json.proposal.status).toBe(ProposalStatus.PENDING);

        // Verify database persistence of proposal
        const [saved] = await db
          .select()
          .from(eventProposals)
          .where(eq(eventProposals.id, json.proposal.id))
          .limit(1);

        expect(saved).toBeDefined();
        expect(saved!.title).toBe('Resilient Notification Event');
        expect(saved!.status).toBe(ProposalStatus.PENDING);
      } finally {
        insertSpy.mockRestore();
      }
    });
  });
});
