import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  RegistrationStatus,
  TeamStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  certificates,
  clubMembers,
  clubs,
  events,
  registrations,
  teamMembers,
  teamRosterSnapshots,
  teams,
  tickets,
  users,
} from '../db/schema';
import { autoLockTeamsForEvent } from '../workers/team-lock.worker';
import { buildServer } from '../server';

describe('Hackathon Teams, Roster Snapshots, Submissions, Teammate Pool & Winners Podium Suite', () => {
  const server = buildServer();

  let organizerUser: any;
  let leaderUser1: any;
  let memberUser1: any;
  let memberUser2: any;
  let memberUser3: any;
  let soloUser: any;
  let testClub: any;
  let competitionEvent: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create Users
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_hack_org_${ts}`,
        email: `hack_org_${ts}@eventora.edu`,
        fullName: 'Hackathon Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [lead1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_lead1_${ts}`,
        email: `lead1_${ts}@eventora.edu`,
        fullName: 'Team Leader One',
        role: UserRole.STUDENT,
        rollNumber: `CS2026_${ts}_1`,
      })
      .returning();
    leaderUser1 = lead1;

    const [mem1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_mem1_${ts}`,
        email: `mem1_${ts}@eventora.edu`,
        fullName: 'Member One',
        role: UserRole.STUDENT,
        rollNumber: `CS2026_${ts}_2`,
      })
      .returning();
    memberUser1 = mem1;

    const [mem2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_mem2_${ts}`,
        email: `mem2_${ts}@eventora.edu`,
        fullName: 'Member Two',
        role: UserRole.STUDENT,
        rollNumber: `CS2026_${ts}_3`,
      })
      .returning();
    memberUser2 = mem2;

    const [mem3] = await db
      .insert(users)
      .values({
        clerkId: `clerk_mem3_${ts}`,
        email: `mem3_${ts}@eventora.edu`,
        fullName: 'Member Three',
        role: UserRole.STUDENT,
        rollNumber: `CS2026_${ts}_4`,
      })
      .returning();
    memberUser3 = mem3;

    const [solo] = await db
      .insert(users)
      .values({
        clerkId: `clerk_solo_${ts}`,
        email: `solo_${ts}@eventora.edu`,
        fullName: 'Solo Participant',
        role: UserRole.STUDENT,
        rollNumber: `CS2026_${ts}_5`,
      })
      .returning();
    soloUser = solo;

    // 2. Create Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Hackathon Club ${ts}`,
        slug: `hack-club-${ts}`,
        description: 'Club hosting premier hackathons',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Create Competition Event: minTeamSize=2, maxTeamSize=3, capacity=25
    const now = new Date();
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Campus Hackathon 2026 ${ts}`,
        slug: `campus-hack-${ts}`,
        description: '48-hour autonomous coding challenge',
        category: 'Hackathon',
        status: EventStatus.PUBLISHED,
        startAt: new Date(now.getTime() + 86400000),
        endAt: new Date(now.getTime() + 172800000),
        registrationOpensAt: new Date(now.getTime() - 3600000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        submissionDeadlineAt: new Date(now.getTime() + 160000000),
        capacity: 25,
        remainingCapacity: 25,
        isPaid: false,
        isCompetition: true,
        minTeamSize: 2,
        maxTeamSize: 3,
        createdBy: organizerUser.id,
      })
      .returning();
    competitionEvent = ev;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Team Creation & Seat Reservation', () => {
    let createdTeam: any;

    it('creates team with atomic seat reservation for leader and returns TEAM- code', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams`,
        headers: { 'x-test-user-id': leaderUser1.id },
        payload: { name: 'Binary Beasts' },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.team.name).toBe('Binary Beasts');
      expect(json.team.leaderId).toBe(leaderUser1.id);
      expect(json.team.status).toBe(TeamStatus.FORMING);
      expect(json.inviteCode).toHaveLength(6);
      expect(json.display).toBe(`TEAM-${json.inviteCode}`);

      createdTeam = json.team;

      // Check remaining capacity decreased by 1
      const [updatedEvent] = await db
        .select({ remaining: events.remainingCapacity })
        .from(events)
        .where(eq(events.id, competitionEvent.id));

      expect(updatedEvent!.remaining).toBe(24);

      // Check leader has registration
      const [reg] = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, competitionEvent.id),
            eq(registrations.userId, leaderUser1.id)
          )
        );

      expect(reg).toBeTruthy();
      expect(reg!.status).toBe(RegistrationStatus.CONFIRMED);
      expect(reg!.teamId).toBe(createdTeam.id);
    });

    it('blocks leader from creating a second team in the same event (409)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams`,
        headers: { 'x-test-user-id': leaderUser1.id },
        payload: { name: 'Duplicate Beasts' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('rejects team creation if event is not a competition (400)', async () => {
      const [nonCompEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: 'Non Comp Talk',
          slug: `non-comp-${Date.now()}`,
          description: 'A guest lecture',
          category: 'Talk',
          status: EventStatus.PUBLISHED,
          startAt: new Date(Date.now() + 86400000),
          endAt: new Date(Date.now() + 90000000),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000),
          capacity: 50,
          remainingCapacity: 50,
          isCompetition: false,
          createdBy: organizerUser.id,
        })
        .returning();

      const res = await server.inject({
        method: 'POST',
        url: `/events/${nonCompEvent!.id}/teams`,
        headers: { 'x-test-user-id': memberUser1.id },
        payload: { name: 'Illegal Team' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('2. Invite Code Normalization & Min/Max Enforcement', () => {
    let team: any;

    beforeAll(async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${competitionEvent.id}/teams/me`,
        headers: { 'x-test-user-id': leaderUser1.id },
      });
      team = res.json().team;
    });

    it('fails to lock team when member_count < minTeamSize (422 TEAM_MIN_NOT_MET)', async () => {
      // Current count = 1, min = 2
      const res = await server.inject({
        method: 'POST',
        url: `/teams/${team.id}/lock`,
        headers: { 'x-test-user-id': leaderUser1.id },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('TEAM_MIN_NOT_MET');
    });

    it('allows joining with lowercase code with prefix "team-"', async () => {
      const lowerCodeWithPrefix = `team-${team.inviteCode.toLowerCase()}`;
      const res = await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': memberUser1.id },
        payload: { code: lowerCodeWithPrefix },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().memberCount).toBe(2);
    });

    it('allows joining with raw code without prefix', async () => {
      const rawCode = team.inviteCode.toUpperCase();
      const res = await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': memberUser2.id },
        payload: { code: rawCode },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().memberCount).toBe(3); // Team is now full (max=3)
    });

    it('rejects join when team is at max capacity (409 TEAM_FULL)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': memberUser3.id },
        payload: { code: team.inviteCode },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('TEAM_FULL');
    });
  });

  describe('3. Concurrency: 10 Concurrent Joins on 1 Slot Left', () => {
    let concTeam: any;
    let concUsers: any[] = [];

    beforeAll(async () => {
      const ts = Date.now();
      // Dedicated competition event with maxTeamSize = 2
      const [concEv] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Conc Hack Event ${ts}`,
          slug: `conc-hack-${ts}`,
          description: 'Testing concurrency with max 2 members',
          category: 'Hackathon',
          status: EventStatus.PUBLISHED,
          startAt: new Date(Date.now() + 86400000),
          endAt: new Date(Date.now() + 172800000),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000),
          capacity: 20,
          remainingCapacity: 20,
          isPaid: false,
          isCompetition: true,
          minTeamSize: 2,
          maxTeamSize: 2, // Exactly 2 members max!
          createdBy: organizerUser.id,
        })
        .returning();

      // Create team leader
      const [cLeader] = await db
        .insert(users)
        .values({
          clerkId: `clerk_conc_lead_${ts}`,
          email: `conc_lead_${ts}@eventora.edu`,
          fullName: 'Concurrency Leader',
          role: UserRole.STUDENT,
        })
        .returning();

      // Create team: max size 2, leader takes 1 slot, so exactly 1 slot remains!
      const teamRes = await server.inject({
        method: 'POST',
        url: `/events/${concEv!.id}/teams`,
        headers: { 'x-test-user-id': cLeader!.id },
        payload: { name: `Conc Team ${ts}` },
      });
      concTeam = teamRes.json().team;

      // Create 10 candidate joiners
      for (let i = 0; i < 10; i++) {
        const [u] = await db
          .insert(users)
          .values({
            clerkId: `clerk_conc_user_${ts}_${i}`,
            email: `conc_user_${ts}_${i}@eventora.edu`,
            fullName: `Conc User ${i}`,
            role: UserRole.STUDENT,
          })
          .returning();
        concUsers.push(u);
      }
    });

    it('executes 10 simultaneous joins on 1 slot left: exactly 1 success, 9 TEAM_FULL', async () => {
      const joinPromises = concUsers.map((u) =>
        server.inject({
          method: 'POST',
          url: '/teams/join',
          headers: { 'x-test-user-id': u.id },
          payload: { code: concTeam.inviteCode },
        })
      );

      const responses = await Promise.all(joinPromises);

      const successes = responses.filter((r) => r.statusCode === 200);
      const teamFulls = responses.filter(
        (r) => r.statusCode === 409 && r.json().error?.code === 'TEAM_FULL'
      );

      expect(successes).toHaveLength(1);
      expect(teamFulls).toHaveLength(9);

      // Verify DB member count is exactly 2 (leader + 1 joiner)
      const [countRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, concTeam.id));

      expect(countRes!.count).toBe(2);
    });
  });

  describe('4. Team Roster Locking, Immutable Snapshots & DB-Level Protection', () => {
    let teamToLock: any;

    beforeAll(async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${competitionEvent.id}/teams/me`,
        headers: { 'x-test-user-id': leaderUser1.id },
      });
      teamToLock = res.json().team;
    });

    it('locks team roster and inserts immutable snapshot into team_roster_snapshots', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/teams/${teamToLock.id}/lock`,
        headers: { 'x-test-user-id': leaderUser1.id },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.team.status).toBe(TeamStatus.LOCKED);
      expect(json.snapshot).toBeTruthy();
      expect(json.snapshot.snapshot.members).toHaveLength(3);
      expect(json.snapshot.snapshot.minTeamSize).toBe(2);
      expect(json.snapshot.snapshot.maxTeamSize).toBe(3);
    });

    it('blocks subsequent attempts to join a locked team with 409 ROSTER_LOCKED', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': soloUser.id },
        payload: { code: teamToLock.inviteCode },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ROSTER_LOCKED');
    });

    it('blocks leaving a locked team with 409 ROSTER_LOCKED', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/teams/${teamToLock.id}/leave`,
        headers: { 'x-test-user-id': memberUser1.id },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ROSTER_LOCKED');
    });

    it('fails at DB level when attempting an UPDATE on team_roster_snapshots', async () => {
      // Find the snapshot row
      const [snapshot] = await db
        .select({ id: teamRosterSnapshots.id })
        .from(teamRosterSnapshots)
        .where(eq(teamRosterSnapshots.teamId, teamToLock.id))
        .limit(1);

      expect(snapshot).toBeTruthy();

      // Trigger should prevent UPDATE with RAISE EXCEPTION
      let threwError = false;
      try {
        await db.execute(sql`
          UPDATE team_roster_snapshots 
          SET snapshot = '{"tampered": true}'::jsonb 
          WHERE id = ${snapshot!.id}::uuid
        `);
      } catch (err: any) {
        threwError = true;
        const fullMessage = `${err.message} ${err.cause?.message || ''}`;
        expect(fullMessage).toMatch(/immutable/i);
      }

      expect(threwError).toBe(true);
    });
  });

  describe('5. Auto-lock & Check-In Close Worker', () => {
    it('locks forming teams above min and marks under-minimum teams DISQUALIFIED', async () => {
      const ts = Date.now();

      // Create an under-minimum team (leader only, min=2)
      const [underMinLeader] = await db
        .insert(users)
        .values({
          clerkId: `clerk_undermin_${ts}`,
          email: `undermin_${ts}@eventora.edu`,
          fullName: 'Under Min Leader',
          role: UserRole.STUDENT,
        })
        .returning();

      const teamRes = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams`,
        headers: { 'x-test-user-id': underMinLeader!.id },
        payload: { name: `Under Min Team ${ts}` },
      });
      const underMinTeam = teamRes.json().team;

      // Close check-in for the event
      const closeRes = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/close-checkin`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(closeRes.statusCode).toBe(200);

      // Verify under-minimum team is DISQUALIFIED
      const [disqualifiedTeam] = await db
        .select({ status: teams.status })
        .from(teams)
        .where(eq(teams.id, underMinTeam.id));

      expect(disqualifiedTeam!.status).toBe(TeamStatus.DISQUALIFIED);
    });
  });

  describe('6. Project Submissions & Deadline Enforcement', () => {
    let team: any;

    beforeAll(async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${competitionEvent.id}/teams/me`,
        headers: { 'x-test-user-id': leaderUser1.id },
      });
      team = res.json().team;
    });

    it('rejects submissions with non-github/gitlab URLs (400)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/teams/${team.id}/submission`,
        headers: { 'x-test-user-id': leaderUser1.id },
        payload: {
          projectTitle: 'Cool Hack Project',
          abstract: 'A novel approach to campus event management.',
          repoUrl: 'https://bitbucket.org/team/repo', // Bitbucket disallowed
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects submissions with abstract > 2000 chars (400)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/teams/${team.id}/submission`,
        headers: { 'x-test-user-id': leaderUser1.id },
        payload: {
          projectTitle: 'Cool Hack Project',
          abstract: 'x'.repeat(2001),
          repoUrl: 'https://github.com/eventora/hack-project',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
    });

    it('accepts valid submission with github URL and sets status SUBMITTED', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/teams/${team.id}/submission`,
        headers: { 'x-test-user-id': leaderUser1.id },
        payload: {
          projectTitle: 'SmartCampus OS',
          abstract: 'An enterprise campus event operating system built on Fastify and Drizzle.',
          repoUrl: 'https://github.com/eventora/smartcampus',
          demoUrl: 'https://smartcampus.demo.app',
          deckKey: 'test-deck-presentation.pdf',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.team.status).toBe(TeamStatus.SUBMITTED);
      expect(json.team.projectTitle).toBe('SmartCampus OS');
      expect(json.team.submittedAt).toBeTruthy();
    });

    it('rejects submissions after deadline with 403 DEADLINE_PASSED', async () => {
      // Create event with past deadline
      const [pastEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: 'Past Deadline Event',
          slug: `past-deadline-${Date.now()}`,
          description: 'Finished hackathon',
          category: 'Hackathon',
          status: EventStatus.PUBLISHED,
          startAt: new Date(Date.now() - 172800000),
          endAt: new Date(Date.now() - 86400000),
          registrationOpensAt: new Date(Date.now() - 200000000),
          registrationClosesAt: new Date(Date.now() - 172800000),
          submissionDeadlineAt: new Date(Date.now() - 3600000), // 1 hour ago
          capacity: 10,
          remainingCapacity: 10,
          isCompetition: true,
          createdBy: organizerUser.id,
        })
        .returning();

      const [pastLeader] = await db
        .insert(users)
        .values({
          clerkId: `clerk_past_${Date.now()}`,
          email: `past_${Date.now()}@eventora.edu`,
          fullName: 'Past Leader',
          role: UserRole.STUDENT,
        })
        .returning();

      // Create team
      const [pastTeam] = await db
        .insert(teams)
        .values({
          eventId: pastEvent!.id,
          name: 'Late Comers',
          leaderId: pastLeader!.id,
          inviteCode: 'LATE99',
          status: TeamStatus.LOCKED,
        })
        .returning();

      await db.insert(teamMembers).values({
        teamId: pastTeam!.id,
        userId: pastLeader!.id,
        eventId: pastEvent!.id,
        role: 'LEADER',
      });

      const res = await server.inject({
        method: 'POST',
        url: `/teams/${pastTeam!.id}/submission`,
        headers: { 'x-test-user-id': pastLeader!.id },
        payload: {
          projectTitle: 'Too Late Project',
          abstract: 'We missed the deadline.',
          repoUrl: 'https://github.com/eventora/too-late',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('DEADLINE_PASSED');
    });

    it('allows organizer to list submissions with downloadable presigned links', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${competitionEvent.id}/submissions`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const submissions = res.json().submissions;
      expect(submissions.length).toBeGreaterThanOrEqual(1);
      const found = submissions.find((s: any) => s.id === team.id);
      expect(found).toBeTruthy();
      expect(found.deckDownloadUrl).toContain('test-deck-presentation.pdf');
    });
  });

  describe('7. Teammate Matchmaking Pool', () => {
    beforeAll(async () => {
      // Register soloUser for competition event
      await db.insert(registrations).values({
        eventId: competitionEvent.id,
        userId: soloUser.id,
        status: RegistrationStatus.CONFIRMED,
      });
    });

    it('blocks user already in a team from joining teammate pool (409)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teammate-pool`,
        headers: { 'x-test-user-id': leaderUser1.id }, // in Binary Beasts
        payload: {
          skills: ['Frontend', 'Backend'],
          bio: 'Fullstack dev looking for team',
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('rejects skills not in the allowed set (400)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teammate-pool`,
        headers: { 'x-test-user-id': soloUser.id },
        payload: {
          skills: ['Frontend', 'Guitar Playing'], // Guitar Playing invalid
          bio: 'Musician coder',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
    });

    it('allows solo participant to join pool with valid skills', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teammate-pool`,
        headers: { 'x-test-user-id': soloUser.id },
        payload: {
          skills: ['ML', 'Data', 'Backend'],
          bio: 'Data scientist proficient in PyTorch and PostgreSQL.',
        },
      });

      expect(res.statusCode).toBe(201);
      const entry = res.json().entry;
      expect(entry.userId).toBe(soloUser.id);
      expect(entry.skills).toEqual(['ML', 'Data', 'Backend']);
    });

    it('allows team leaders to view pool (shows name, skills, bio only)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${competitionEvent.id}/teammate-pool`,
        headers: { 'x-test-user-id': leaderUser1.id },
      });

      expect(res.statusCode).toBe(200);
      const pool = res.json().pool;
      const found = pool.find((p: any) => p.userId === soloUser.id);
      expect(found).toBeTruthy();
      expect(found.name).toBe('Solo Participant');
      expect(found.skills).toEqual(['ML', 'Data', 'Backend']);
      expect(found.bio).toBe('Data scientist proficient in PyTorch and PostgreSQL.');
    });

    it('allows solo user to leave teammate pool', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/events/${competitionEvent.id}/teammate-pool`,
        headers: { 'x-test-user-id': soloUser.id },
      });

      expect(res.statusCode).toBe(200);

      const listRes = await server.inject({
        method: 'GET',
        url: `/events/${competitionEvent.id}/teammate-pool`,
        headers: { 'x-test-user-id': leaderUser1.id },
      });
      const pool = listRes.json().pool;
      expect(pool.some((p: any) => p.userId === soloUser.id)).toBe(false);
    });
  });

  describe('8. Winners Podium & Atomic Certificate Issuance', () => {
    let team1: any;
    let team2: any;
    let team3: any;

    beforeAll(async () => {
      const ts = Date.now();
      // Team 1 is Binary Beasts
      const res = await server.inject({
        method: 'GET',
        url: `/events/${competitionEvent.id}/teams/me`,
        headers: { 'x-test-user-id': leaderUser1.id },
      });
      team1 = res.json().team;

      // Create Team 2
      const [lead2] = await db
        .insert(users)
        .values({
          clerkId: `clerk_lead2_${ts}`,
          email: `lead2_${ts}@eventora.edu`,
          fullName: 'Leader Two',
          role: UserRole.STUDENT,
        })
        .returning();

      const [t2] = await db
        .insert(teams)
        .values({
          eventId: competitionEvent.id,
          name: 'Quantum Coders',
          leaderId: lead2!.id,
          inviteCode: 'QNTM02',
          status: TeamStatus.SUBMITTED,
          projectTitle: 'Quantum Safe Campus',
          projectAbstract: 'Post-quantum cryptography for campus identity.',
          repoUrl: 'https://github.com/eventora/quantum',
          demoUrl: 'https://quantum.demo.app',
          submittedAt: new Date(),
        })
        .returning();
      team2 = t2;

      await db.insert(teamMembers).values({
        teamId: team2.id,
        userId: lead2!.id,
        eventId: competitionEvent.id,
        role: 'LEADER',
      });

      // Create Team 3
      const [lead3] = await db
        .insert(users)
        .values({
          clerkId: `clerk_lead3_${ts}`,
          email: `lead3_${ts}@eventora.edu`,
          fullName: 'Leader Three',
          role: UserRole.STUDENT,
        })
        .returning();

      const [t3] = await db
        .insert(teams)
        .values({
          eventId: competitionEvent.id,
          name: 'Neural Knights',
          leaderId: lead3!.id,
          inviteCode: 'NEUR03',
          status: TeamStatus.SUBMITTED,
          projectTitle: 'Neural Attendance',
          projectAbstract: 'Edge AI facial presence detection.',
          repoUrl: 'https://github.com/eventora/neural',
          demoUrl: 'https://neural.demo.app',
          submittedAt: new Date(),
        })
        .returning();
      team3 = t3;

      await db.insert(teamMembers).values({
        teamId: team3.id,
        userId: lead3!.id,
        eventId: competitionEvent.id,
        role: 'LEADER',
      });

      // Set submission deadline in the past to allow winner publication
      await db
        .update(events)
        .set({ submissionDeadlineAt: new Date(Date.now() - 60000) })
        .where(eq(events.id, competitionEvent.id));
    });

    it('publishes podium (ranks 1-3) and issues WINNER certificates to all team members', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/winners`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          placements: [
            { rank: 1, teamId: team1.id },
            { rank: 2, teamId: team2.id },
            { rank: 3, teamId: team3.id },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.winners).toHaveLength(3);

      // Verify WINNER certificates exist for leaderUser1, memberUser1, memberUser2
      const team1Certs = await db
        .select()
        .from(certificates)
        .where(
          and(
            eq(certificates.eventId, competitionEvent.id),
            eq(certificates.kind, 'WINNER'),
            eq(certificates.rank, 1)
          )
        );

      expect(team1Certs).toHaveLength(3); // All 3 members got rank 1 certificates!
    });

    it('returns public podium with prize badges and Cache-Control header', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/public/events/${competitionEvent.slug}/winners`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=60');

      const json = res.json();
      expect(json.podium).toHaveLength(3);

      expect(json.podium[0].rank).toBe(1);
      expect(json.podium[0].prizeBadge).toBe('🥇 1st Place');
      expect(json.podium[0].teamName).toBe('Binary Beasts');
      expect(json.podium[0].members).toHaveLength(3);
      expect(json.podium[0].members[0].profileUrl).toBeTruthy();

      expect(json.podium[1].rank).toBe(2);
      expect(json.podium[1].prizeBadge).toBe('🥈 2nd Place');
      expect(json.podium[1].teamName).toBe('Quantum Coders');

      expect(json.podium[2].rank).toBe(3);
      expect(json.podium[2].prizeBadge).toBe('🥉 3rd Place');
      expect(json.podium[2].teamName).toBe('Neural Knights');
    });

    it('atomically replaces winners when republished with swapped placements', async () => {
      // Swap Rank 1 and Rank 2
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/winners`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          placements: [
            { rank: 1, teamId: team2.id }, // Quantum Coders is now #1
            { rank: 2, teamId: team1.id }, // Binary Beasts is now #2
            { rank: 3, teamId: team3.id },
          ],
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify public podium updated immediately
      const publicRes = await server.inject({
        method: 'GET',
        url: `/public/events/${competitionEvent.slug}/winners`,
      });

      const podium = publicRes.json().podium;
      expect(podium[0].teamName).toBe('Quantum Coders');
      expect(podium[0].rank).toBe(1);
      expect(podium[1].teamName).toBe('Binary Beasts');
      expect(podium[1].rank).toBe(2);

      // Check certificates updated: Team 1 members now have rank 2
      const team1Certs = await db
        .select()
        .from(certificates)
        .where(
          and(
            eq(certificates.eventId, competitionEvent.id),
            eq(certificates.kind, 'WINNER'),
            eq(certificates.rank, 2)
          )
        );

      expect(team1Certs).toHaveLength(3);
    });
  });
});
