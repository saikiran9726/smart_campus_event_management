import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  proposalAvRequests,
  users,
  venueBookings,
  venues,
} from '../db/schema';
import { signApprovalToken } from '../lib/magic-link';
import { buildServer } from '../server';

describe('Faculty Preview & Magic Link Decision API', () => {
  const server = buildServer();

  let organizerUser: any;
  let facultyUser: any;
  let testClub: any;
  let testVenue: any;
  let testResource: any;
  let pendingProposal: any;
  let approveToken: string;
  let rejectToken: string;

  beforeAll(async () => {
    await server.ready();
    const timestamp = Date.now();

    // 1. Create users
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_fac_preview_org_${timestamp}`,
        email: `org_preview_${timestamp}@campus.edu`,
        fullName: 'Preview Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [fac] = await db
      .insert(users)
      .values({
        clerkId: `clerk_fac_preview_fac_${timestamp}`,
        email: `fac_preview_${timestamp}@campus.edu`,
        fullName: 'Preview Faculty Coordinator',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyUser = fac;

    // 2. Create club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Preview Club ${timestamp}`,
        slug: `preview-club-${timestamp}`,
        description: 'Testing Faculty Preview Flow',
        facultyCoordinatorId: facultyUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.ADMIN,
    });

    // 3. Create Venue & AV Resource
    const [venue] = await db
      .insert(venues)
      .values({
        name: `Preview Auditorium ${timestamp}`,
        capacity: 250,
        locationText: 'Academic Block B',
      })
      .returning();
    testVenue = venue;

    const [av] = await db
      .insert(avResources)
      .values({
        name: `Wireless Mic Set ${timestamp}`,
        kind: 'AUDIO',
        quantity: 4,
      })
      .returning();
    testResource = av;

    // 4. Create Proposal with AV request
    const startAt = new Date(Date.now() + 86400000 * 2);
    const endAt = new Date(startAt.getTime() + 3600000 * 3);

    const [prop] = await db
      .insert(eventProposals)
      .values({
        clubId: testClub.id,
        proposedBy: organizerUser.id,
        title: 'Campus Hackathon 2026 Proposal',
        description: 'Annual overnight development challenge',
        expectedAttendance: 180,
        venueId: testVenue.id,
        startAt,
        endAt,
        status: ProposalStatus.PENDING,
        facultyId: facultyUser.id,
      })
      .returning();
    pendingProposal = prop;

    await db.insert(proposalAvRequests).values({
      proposalId: pendingProposal.id,
      avResourceId: testResource.id,
      quantity: 2,
    });

    // 5. Sign approval and rejection tokens
    const approveData = await signApprovalToken({
      proposalId: pendingProposal.id,
      facultyId: facultyUser.id,
      action: 'APPROVE',
    });
    approveToken = approveData.token;

    const rejectData = await signApprovalToken({
      proposalId: pendingProposal.id,
      facultyId: facultyUser.id,
      action: 'REJECT',
    });
    rejectToken = rejectData.token;
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /public/faculty/preview returns summary without consuming the token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/faculty/preview?token=${approveToken}`,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);

    expect(json.proposal).toBeDefined();
    expect(json.proposal.id).toBe(pendingProposal.id);
    expect(json.proposal.title).toBe('Campus Hackathon 2026 Proposal');
    expect(json.proposal.status).toBe(ProposalStatus.PENDING);

    expect(json.club).toBeDefined();
    expect(json.club.id).toBe(testClub.id);
    expect(json.club.name).toBe(testClub.name);

    expect(json.venue).toBeDefined();
    expect(json.venue.id).toBe(testVenue.id);
    expect(json.venue.capacity).toBe(250);

    expect(json.avRequests).toHaveLength(1);
    expect(json.avRequests[0].quantity).toBe(2);

    expect(json.conflictAudit).toBeDefined();
    expect(json.conflictAudit.hasConflicts).toBe(false);
    expect(json.tokenAction).toBe('APPROVE');
  });

  it('GET /public/faculty/preview can be called repeatedly without burning token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/faculty/preview?token=${approveToken}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /public/faculty/preview rejects missing token with 400 VALIDATION_FAILED', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/public/faculty/preview',
    });
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET /public/faculty/preview rejects tampered token with 400 TOKEN_INVALID', async () => {
    const tampered = `${approveToken.slice(0, -5)}tamper`;
    const res = await server.inject({
      method: 'GET',
      url: `/public/faculty/preview?token=${tampered}`,
    });
    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('TOKEN_INVALID');
  });

  it('GET /public/faculty/preview rejects expired token with 410 OFFER_EXPIRED', async () => {
    const expiredData = await signApprovalToken({
      proposalId: pendingProposal.id,
      facultyId: facultyUser.id,
      action: 'APPROVE',
      ttlSeconds: 1,
    });
    await new Promise((r) => setTimeout(r, 1100));

    const res = await server.inject({
      method: 'GET',
      url: `/public/faculty/preview?token=${expiredData.token}`,
    });
    expect(res.statusCode).toBe(410);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('OFFER_EXPIRED');
  });

  it('POST /public/faculty/decision consumes token and approves proposal', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/public/faculty/decision',
      payload: { token: approveToken },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.outcome).toBe('APPROVED');
    expect(json.eventId).toBeDefined();

    // Verify proposal updated
    const [updated] = await db
      .select()
      .from(eventProposals)
      .where(eq(eventProposals.id, pendingProposal.id));
    expect(updated.status).toBe(ProposalStatus.APPROVED);
  });

  it('subsequent GET /public/faculty/preview returns 409 TOKEN_USED once consumed', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/faculty/preview?token=${approveToken}`,
    });
    expect(res.statusCode).toBe(409);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('TOKEN_USED');
  });

  it('sibling reject token is also burned with 409 TOKEN_USED', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/public/faculty/preview?token=${rejectToken}`,
    });
    expect(res.statusCode).toBe(409);
    const json = JSON.parse(res.body);
    expect(json.error.code).toBe('TOKEN_USED');
  });
});
