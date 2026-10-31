import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  ChannelKind,
  ClubMemberRole,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubChannels,
  clubMembers,
  clubs,
  users,
} from '../db/schema';
import { buildServer } from '../server';

describe('Prompt 24: Real Club Discovery, Selection, Creation and Permissions', () => {
  const server = buildServer();

  let organizerUser: any;
  let adminUser: any;
  let nonMemberUser: any;
  let clubAlpha: any;
  let clubBeta: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Seed users
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_p24_org_${ts}`,
        email: `p24_org_${ts}@eventora.edu`,
        fullName: 'Prompt24 Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_p24_admin_${ts}`,
        email: `p24_admin_${ts}@eventora.edu`,
        fullName: 'Prompt24 Global Admin',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin;

    const [nonMember] = await db
      .insert(users)
      .values({
        clerkId: `clerk_p24_nonmem_${ts}`,
        email: `p24_nonmem_${ts}@eventora.edu`,
        fullName: 'Prompt24 Non Member',
        role: UserRole.ORGANIZER,
      })
      .returning();
    nonMemberUser = nonMember;

    // 2. Seed clubs
    const [cBeta] = await db
      .insert(clubs)
      .values({
        name: `Zeta Club ${ts}`,
        slug: `zeta-club-${ts}`,
        description: 'Zeta club description',
        createdBy: organizerUser.id,
      })
      .returning();
    clubBeta = cBeta;

    const [cAlpha] = await db
      .insert(clubs)
      .values({
        name: `Alpha Club ${ts}`,
        slug: `alpha-club-${ts}`,
        description: 'Alpha club description',
        createdBy: organizerUser.id,
      })
      .returning();
    clubAlpha = cAlpha;

    // Add organizerUser to Alpha as ADMIN, Beta as OWNER
    await db.insert(clubMembers).values([
      { clubId: clubAlpha.id, userId: organizerUser.id, role: ClubMemberRole.ADMIN },
      { clubId: clubBeta.id, userId: organizerUser.id, role: ClubMemberRole.OWNER },
    ]);
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /clubs/me', () => {
    it('returns empty array { clubs: [] } for caller with zero club memberships', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/clubs/me',
        headers: { 'x-test-user-id': nonMemberUser.id },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('clubs');
      expect(Array.isArray(json.clubs)).toBe(true);
      expect(json.clubs.length).toBe(0);
    });

    it('returns caller memberships with id, name, slug, description, role sorted by name', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/clubs/me',
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.clubs.length).toBe(2);

      // Verify sorting by name ASC: Alpha Club precedes Zeta Club
      expect(json.clubs[0].id).toBe(clubAlpha.id);
      expect(json.clubs[0].name).toBe(clubAlpha.name);
      expect(json.clubs[0].role).toBe(ClubMemberRole.ADMIN);

      expect(json.clubs[1].id).toBe(clubBeta.id);
      expect(json.clubs[1].name).toBe(clubBeta.name);
      expect(json.clubs[1].role).toBe(ClubMemberRole.OWNER);
    });

    it('returns all clubs with role ADMIN for global ADMIN caller', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/clubs/me',
        headers: { 'x-test-user-id': adminUser.id },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.clubs.length).toBeGreaterThanOrEqual(2);

      const alpha = json.clubs.find((c: any) => c.id === clubAlpha.id);
      const beta = json.clubs.find((c: any) => c.id === clubBeta.id);
      expect(alpha).toBeDefined();
      expect(alpha.role).toBe(ClubMemberRole.ADMIN);
      expect(beta).toBeDefined();
      expect(beta.role).toBe(ClubMemberRole.ADMIN);
    });

    it('verifies route shadowing: /clubs/me is NOT intercepted by /clubs/:slug', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/clubs/me',
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      // If it hit /clubs/:slug, it would return { club: ... } or 404 NOT_FOUND
      expect(json).toHaveProperty('clubs');
      expect(json).not.toHaveProperty('club');
    });
  });

  describe('Club Access Control & Creation', () => {
    it('returns 403 FORBIDDEN when user without club membership attempts POST /clubs/:clubId/proposals', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/clubs/${clubAlpha.id}/proposals`,
        headers: { 'x-test-user-id': nonMemberUser.id },
        payload: {
          title: 'Unauthorized Proposal',
          description: 'This proposal should be rejected by requireClubRole',
          expectedAttendance: 50,
          venueId: '00000000-0000-0000-0000-000000000000',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 86400000 + 7200000).toISOString(),
        },
      });

      expect(res.statusCode).toBe(403);
      const json = res.json();
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('POST /clubs automatically creates club, sets creator as OWNER, and provisions 3 default channels', async () => {
      const ts = Date.now();
      const clubPayload = {
        name: `Newly Created Robotics ${ts}`,
        slug: `newly-created-robotics-${ts}`,
        description: 'Building autonomous robotics kits',
      };

      const res = await server.inject({
        method: 'POST',
        url: '/clubs',
        headers: { 'x-test-user-id': nonMemberUser.id },
        payload: clubPayload,
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.club).toBeDefined();
      expect(json.club.name).toBe(clubPayload.name);
      expect(json.club.slug).toBe(clubPayload.slug);

      const createdClubId = json.club.id;

      // Verify creator is OWNER
      const [membership] = await db
        .select()
        .from(clubMembers)
        .where(eq(clubMembers.clubId, createdClubId));
      expect(membership).toBeDefined();
      expect(membership!.userId).toBe(nonMemberUser.id);
      expect(membership!.role).toBe(ClubMemberRole.OWNER);

      // Verify 3 default channels created
      const channels = await db
        .select()
        .from(clubChannels)
        .where(eq(clubChannels.clubId, createdClubId));
      expect(channels.length).toBe(3);
      const channelSlugs = channels.map((c) => c.slug).sort();
      expect(channelSlugs).toEqual(['announcements', 'events', 'general']);
    });

    it('GET /clubs/:id/members returns 404 NOT_FOUND for nonexistent club', async () => {
      const nonexistentClubId = '99999999-9999-4999-a999-999999999999';
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${nonexistentClubId}/members`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(404);
      const json = res.json();
      expect(json.error.code).toBe('NOT_FOUND');
    });
  });
});
