import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  EventStatus,
  formatTeamCode,
  normalizeTeamCode,
  RegistrationStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubs,
  events,
  registrations,
  teamMembers,
  teams,
  users,
  venues,
} from '../db/schema';
import { buildServer } from '../server';

describe('Phase 1: Team Join Code & Security Verification Suite', () => {
  const server = buildServer();

  let leader: any;
  let student1: any;
  let student2: any;
  let outsider: any;
  let testClub: any;
  let testVenue: any;
  let testEvent: any;
  let createdTeam: any;

  beforeAll(async () => {
    await server.ready();

    // Verify test database (strictly reject production)
    const dbRes = await db.execute<{ current_database: string }>(
      sql`SELECT current_database() as current_database;`
    );
    expect(dbRes.rows[0]?.current_database).not.toBe('eventora');
    expect(['eventora_venue_test', 'eventora_test']).toContain(dbRes.rows[0]?.current_database);

    const ts = Date.now();

    // Create test users
    [leader] = await db
      .insert(users)
      .values({
        clerkId: `clerk_ldr_${ts}`,
        email: `leader_${ts}@test.edu`,
        fullName: 'Phase1 Leader',
        role: UserRole.STUDENT,
        phone: '9876543210',
      })
      .returning();

    [student1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_stu1_${ts}`,
        email: `student1_${ts}@test.edu`,
        fullName: 'Phase1 Student 1',
        role: UserRole.STUDENT,
        phone: '9876543211',
      })
      .returning();

    [student2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_stu2_${ts}`,
        email: `student2_${ts}@test.edu`,
        fullName: 'Phase1 Student 2',
        role: UserRole.STUDENT,
        phone: '9876543212',
      })
      .returning();

    [outsider] = await db
      .insert(users)
      .values({
        clerkId: `clerk_out_${ts}`,
        email: `outsider_${ts}@test.edu`,
        fullName: 'Phase1 Outsider',
        role: UserRole.STUDENT,
      })
      .returning();

    // Venue & Club
    [testVenue] = await db
      .insert(venues)
      .values({
        name: `Hackathon Hall ${ts}`,
        capacity: 100,
        locationText: 'Tech Annex Building',
      })
      .returning();

    [testClub] = await db
      .insert(clubs)
      .values({
        name: `Builders Guild ${ts}`,
        slug: `builders-guild-${ts}`,
        description: 'Testing Guild',
      })
      .returning();

    // Event with maxTeamSize = 2
    const now = new Date();
    [testEvent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Campus Hackathon ${ts}`,
        slug: `campus-hackathon-${ts}`,
        description: 'Phase 1 verification hackathon.',
        category: 'Hackathon',
        venueId: testVenue.id,
        startAt: new Date(now.getTime() + 48 * 3600000),
        endAt: new Date(now.getTime() + 72 * 3600000),
        registrationOpensAt: new Date(now.getTime() - 24 * 3600000),
        registrationClosesAt: new Date(now.getTime() + 24 * 3600000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        isCompetition: true,
        registrationMode: 'TEAM',
        minTeamSize: 2,
        maxTeamSize: 2,
        createdBy: leader.id,
      })
      .returning();
  });

  afterAll(async () => {
    if (createdTeam) {
      await db.delete(registrations).where(eq(registrations.eventId, testEvent.id));
      await db.delete(teamMembers).where(eq(teamMembers.teamId, createdTeam.id));
      await db.delete(teams).where(eq(teams.id, createdTeam.id));
    }
    if (testEvent) {
      await db.delete(events).where(eq(events.id, testEvent.id));
    }
    if (testVenue) {
      await db.delete(venues).where(eq(venues.id, testVenue.id));
    }
    if (testClub) {
      await db.delete(clubs).where(eq(clubs.id, testClub.id));
    }
    for (const u of [leader, student1, student2, outsider]) {
      if (u) {
        await db.delete(users).where(eq(users.id, u.id));
      }
    }
    await server.close();
  });

  it('1. Generates 8-character CSPRNG join code and separate inviteToken on team creation', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/events/${testEvent.id}/teams`,
      headers: { 'x-test-user-id': leader.id },
      payload: { name: 'Supernova Coders' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    createdTeam = body.team;

    expect(body.inviteCode).toBeDefined();
    expect(body.inviteCode.length).toBe(8);
    // Disallows ambiguous characters 0, O, 1, I, L
    expect(body.inviteCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(body.formattedCode).toBe(`${body.inviteCode.slice(0, 4)}-${body.inviteCode.slice(4)}`);
    expect(body.inviteToken).toMatch(/^ev_inv_/);
    expect(body.registration).toBeDefined();
  });

  it('2. Normalizes input and matches code ignoring hyphens, spaces, and case', async () => {
    const raw = createdTeam.inviteCode;
    const formatted = formatTeamCode(raw);
    const messyInput = `  ${formatted.toLowerCase().slice(0, 4)} - ${formatted.toLowerCase().slice(4)}  `;

    // Preview endpoint returns safe public preview
    const previewRes = await server.inject({
      method: 'GET',
      url: `/teams/preview?code=${encodeURIComponent(messyInput)}`,
    });

    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json();
    expect(preview.teamName).toBe('Supernova Coders');
    expect(preview.eventTitle).toBe(testEvent.title);
    expect(preview.leaderName).toBe(leader.fullName);
    expect(preview.memberCount).toBe(1);
    expect(preview.maxTeamSize).toBe(2);
  });

  it('3. Successfully joins team with formatted code and updates team member list', async () => {
    const formatted = formatTeamCode(createdTeam.inviteCode);

    const joinRes = await server.inject({
      method: 'POST',
      url: '/teams/join',
      headers: { 'x-test-user-id': student1.id },
      payload: { code: formatted },
    });

    expect(joinRes.statusCode).toBe(200);
    const body = joinRes.json();
    expect(body.success).toBe(true);
    expect(body.memberCount).toBe(2);

    // Verify student is now a member
    const teamRes = await server.inject({
      method: 'GET',
      url: `/teams/${createdTeam.id}`,
      headers: { 'x-test-user-id': student1.id },
    });

    expect(teamRes.statusCode).toBe(200);
    const teamData = teamRes.json().team;
    expect(teamData.memberCount).toBe(2);
    expect(teamData.formattedCode).toBe(formatted);
  });

  it('4. Rejects join when team capacity is full with typed TEAM_FULL error code', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/teams/join',
      headers: { 'x-test-user-id': student2.id },
      payload: { code: createdTeam.inviteCode },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('TEAM_FULL');
  });

  it('5. Rejects existing member joining again with typed ALREADY_MEMBER error code', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/teams/join',
      headers: { 'x-test-user-id': student1.id },
      payload: { code: createdTeam.inviteCode },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('ALREADY_MEMBER');
  });

  it('6. Leader regenerates join code, immediately invalidating old code', async () => {
    const oldCode = createdTeam.inviteCode;

    const regenRes = await server.inject({
      method: 'POST',
      url: `/teams/${createdTeam.id}/code/regenerate`,
      headers: { 'x-test-user-id': leader.id },
    });

    expect(regenRes.statusCode).toBe(200);
    const regenBody = regenRes.json();
    const newCode = regenBody.inviteCode;

    expect(newCode).toBeDefined();
    expect(newCode.length).toBe(8);
    expect(newCode).not.toBe(oldCode);

    // Old code now returns INVALID (not found for active)
    const oldJoinRes = await server.inject({
      method: 'POST',
      url: '/teams/join',
      headers: { 'x-test-user-id': outsider.id },
      payload: { code: oldCode },
    });
    expect(oldJoinRes.statusCode).toBe(404);
    expect(oldJoinRes.json().error.code).toBe('INVALID');

    // Update test reference
    createdTeam.inviteCode = newCode;
  });

  it('7. Non-leader cannot regenerate or revoke team code (Leader-only authorization)', async () => {
    const nonLeaderRes = await server.inject({
      method: 'POST',
      url: `/teams/${createdTeam.id}/code/regenerate`,
      headers: { 'x-test-user-id': student1.id },
    });

    expect(nonLeaderRes.statusCode).toBe(403);
    expect(nonLeaderRes.json().error.code).toBe('FORBIDDEN');
  });

  it('8. Leader revokes join code, returning typed REVOKED error code on join attempts', async () => {
    const revokeRes = await server.inject({
      method: 'POST',
      url: `/teams/${createdTeam.id}/code/revoke`,
      headers: { 'x-test-user-id': leader.id },
    });

    expect(revokeRes.statusCode).toBe(200);

    const joinRevokedRes = await server.inject({
      method: 'POST',
      url: '/teams/join',
      headers: { 'x-test-user-id': outsider.id },
      payload: { code: createdTeam.inviteCode },
    });

    expect(joinRevokedRes.statusCode).toBe(409);
    expect(joinRevokedRes.json().error.code).toBe('REVOKED');
  });
});
