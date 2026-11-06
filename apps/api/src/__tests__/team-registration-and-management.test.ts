import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  PaymentStatus,
  QuestionType,
  RegistrationStatus,
  TeamStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  bookingAnswers,
  clubMembers,
  clubs,
  events,
  formQuestions,
  registrations,
  teamInvitations,
  teamMembers,
  teams,
  users,
} from '../db/schema';
import { buildServer } from '../server';

describe('Team Registration, Organizer Settings, Invitations & Security Suite', () => {
  const server = buildServer();

  let organizerUser: any;
  let leaderUser: any;
  let inviteeUser1: any;
  let inviteeUser2: any;
  let otherStudent: any;
  let testClub: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create Organizer and Student Users
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_team_org_${ts}`,
        email: `team_org_${ts}@eventora.edu`,
        fullName: 'Team Ops Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [lead] = await db
      .insert(users)
      .values({
        clerkId: `clerk_lead_${ts}`,
        email: `team_lead_${ts}@eventora.edu`,
        fullName: 'Team Captain Lead',
        role: UserRole.STUDENT,
        rollNumber: `CS_LEAD_${ts}`,
      })
      .returning();
    leaderUser = lead;

    const [inv1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_inv1_${ts}`,
        email: `invitee1_${ts}@eventora.edu`,
        fullName: 'Invitee Alice',
        role: UserRole.STUDENT,
        rollNumber: `CS_INV1_${ts}`,
      })
      .returning();
    inviteeUser1 = inv1;

    const [inv2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_inv2_${ts}`,
        email: `invitee2_${ts}@eventora.edu`,
        fullName: 'Invitee Bob',
        role: UserRole.STUDENT,
        rollNumber: `CS_INV2_${ts}`,
      })
      .returning();
    inviteeUser2 = inv2;

    const [other] = await db
      .insert(users)
      .values({
        clerkId: `clerk_other_${ts}`,
        email: `other_${ts}@eventora.edu`,
        fullName: 'Other Charlie',
        role: UserRole.STUDENT,
        rollNumber: `CS_OTH_${ts}`,
      })
      .returning();
    otherStudent = other;

    // 2. Create Test Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Hackathon Association ${ts}`,
        slug: `hack-assoc-${ts}`,
        description: 'Innovating campus hackathons.',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Organizer Settings & Registration Modes', () => {
    it('blocks team creation when registrationMode is INDIVIDUAL', async () => {
      const ts = Date.now();
      const [soloEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Solo Workshop ${ts}`,
          slug: `solo-workshop-${ts}`,
          description: 'Individual participants only.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'INDIVIDUAL',
          capacity: 50,
          remainingCapacity: 50,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000 * 4),
          createdBy: organizerUser.id,
        })
        .returning();

      const res = await server.inject({
        method: 'POST',
        url: `/events/${soloEvent!.id}/teams`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { name: 'Solo Breakers' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('Team formation is not permitted');
    });

    it('blocks solo registration when registrationMode is TEAM', async () => {
      const ts = Date.now();
      const [teamOnlyEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Team Hackathon Only ${ts}`,
          slug: `team-hack-only-${ts}`,
          description: 'Teams required.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'TEAM',
          minTeamSize: 2,
          maxTeamSize: 4,
          capacity: 50,
          remainingCapacity: 50,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000 * 4),
          createdBy: organizerUser.id,
        })
        .returning();

      const res = await server.inject({
        method: 'POST',
        url: `/events/${teamOnlyEvent!.id}/registrations`,
        headers: {
          'x-test-user-id': otherStudent.id,
          'cf-turnstile-response': 'test-pass',
        },
        payload: { answers: {} },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('requires team registration');
    });
  });

  describe('2. Student Team Creation & Form Answers', () => {
    let competitionEvent: any;
    let question1: any;

    beforeAll(async () => {
      const ts = Date.now();
      const [ev] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Autonomous Code Sprint ${ts}`,
          slug: `code-sprint-${ts}`,
          description: 'Team competition event with custom form questions.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'BOTH',
          isCompetition: true,
          minTeamSize: 2,
          maxTeamSize: 3,
          teamPaymentPolicy: 'PER_MEMBER',
          allowMemberReplacement: true,
          allowLateJoining: false,
          capacity: 30,
          remainingCapacity: 30,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000 * 3),
          createdBy: organizerUser.id,
        })
        .returning();
      competitionEvent = ev;

      // Add custom form question
      const [q] = await db
        .insert(formQuestions)
        .values({
          eventId: competitionEvent.id,
          position: 0,
          label: 'Team Track Preference',
          type: QuestionType.SINGLE_SELECT,
          options: ['AI/ML', 'Web3', 'Cybersecurity'],
        })
        .returning();
      question1 = q;
    });

    it('creates team, saves leader registration and records form answers', async () => {
      const answers: Record<string, any> = {};
      answers[question1.id] = 'AI/ML';

      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: {
          name: 'Cyber Pioneers',
          answers,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.team.name).toBe('Cyber Pioneers');
      expect(body.team.leaderId).toBe(leaderUser.id);
      expect(body.inviteCode).toBeDefined();

      // Verify leader registration
      const [leaderReg] = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, competitionEvent.id),
            eq(registrations.userId, leaderUser.id)
          )
        );
      expect(leaderReg).toBeDefined();
      expect(leaderReg!.teamId).toBe(body.team.id);

      // Verify booking answers saved
      const [savedAnswer] = await db
        .select()
        .from(bookingAnswers)
        .where(
          and(
            eq(bookingAnswers.registrationId, leaderReg!.id),
            eq(bookingAnswers.questionId, question1.id)
          )
        );
      expect(savedAnswer).toBeDefined();
      expect(savedAnswer!.value).toBe('AI/ML');
    });

    it('prevents leader from creating a second team in the same event', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { name: 'Duplicate Squad' },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('already in a team');
    });
  });

  describe('3. Team Invitations Workflow & Security', () => {
    let competitionEvent: any;
    let team: any;

    beforeAll(async () => {
      const ts = Date.now();
      const [ev] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Smart Campus Hack ${ts}`,
          slug: `smart-campus-hack-${ts}`,
          description: 'Innovating campus life.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'TEAM',
          minTeamSize: 2,
          maxTeamSize: 3,
          allowMemberReplacement: true,
          allowLateJoining: true,
          capacity: 20,
          remainingCapacity: 20,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000 * 3),
          createdBy: organizerUser.id,
        })
        .returning();
      competitionEvent = ev;

      // Leader creates team
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { name: 'Alpha Hackers' },
      });
      team = JSON.parse(res.payload).team;
    });

    it('non-leader cannot send team invitations', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams/${team.id}/invite`,
        headers: { 'x-test-user-id': otherStudent.id },
        payload: { email: inviteeUser1.email },
      });

      expect(res.statusCode).toBe(403);
    });

    it('leader can send invitation by roll number', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams/${team.id}/invite`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { rollNumber: inviteeUser1.rollNumber },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.invitation.status).toBe('PENDING');
      expect(body.invitation.expiresAt).toBeDefined();
    });

    it('prevents duplicate pending invitation to the same student', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams/${team.id}/invite`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { email: inviteeUser1.email },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('pending invitation already exists');
    });

    it('leader can send second invitation by email', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams/${team.id}/invite`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { email: inviteeUser2.email },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.invitation.invitedEmail).toBe(inviteeUser2.email);
    });

    it('enforces backend team capacity: rejects invite when currentMembers + pending >= maxTeamSize', async () => {
      // Current: 1 leader + 2 pending invitations = 3. Max is 3.
      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams/${team.id}/invite`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { email: otherStudent.email },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('TEAM_CAPACITY_EXCEEDED');
    });

    it('leader can cancel a pending invitation', async () => {
      // Find invitee2's invitation
      const [inv2] = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, team.id),
            eq(teamInvitations.invitedEmail, inviteeUser2.email)
          )
        );

      const res = await server.inject({
        method: 'POST',
        url: `/events/${competitionEvent.id}/teams/${team.id}/invitations/${inv2!.id}/cancel`,
        headers: { 'x-test-user-id': leaderUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.invitation.status).toBe('CANCELLED');
    });

    it('student cannot accept an invitation addressed to another student', async () => {
      // Invitee 1's invitation
      const [inv1] = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, team.id),
            eq(teamInvitations.status, 'PENDING')
          )
        );

      // Other student tries to accept it
      const res = await server.inject({
        method: 'POST',
        url: `/team-invitations/${inv1!.id}/accept`,
        headers: { 'x-test-user-id': otherStudent.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it('invited student can accept using their authenticated account', async () => {
      const [inv1] = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, team.id),
            eq(teamInvitations.status, 'PENDING')
          )
        );

      const res = await server.inject({
        method: 'POST',
        url: `/team-invitations/${inv1!.id}/accept`,
        headers: { 'x-test-user-id': inviteeUser1.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.member.role).toBe('MEMBER');

      // Verify invitation marked ACCEPTED
      const [updatedInv] = await db
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.id, inv1!.id));
      expect(updatedInv!.status).toBe('ACCEPTED');
      expect(updatedInv!.invitedUserId).toBe(inviteeUser1.id);

      // Verify membership
      const [mem] = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, team.id),
            eq(teamMembers.userId, inviteeUser1.id)
          )
        );
      expect(mem).toBeDefined();
    });

    it('rejects expired invitations with 410 INVITATION_EXPIRED', async () => {
      // Re-invite invitee2 with an expired timestamp
      const [expiredInv] = await db
        .insert(teamInvitations)
        .values({
          teamId: team.id,
          eventId: competitionEvent.id,
          invitedBy: leaderUser.id,
          invitedEmail: inviteeUser2.email,
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        })
        .returning();

      const res = await server.inject({
        method: 'POST',
        url: `/team-invitations/${expiredInv!.id}/accept`,
        headers: { 'x-test-user-id': inviteeUser2.id },
      });

      expect(res.statusCode).toBe(410);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('INVITATION_EXPIRED');
    });
  });

  describe('4. Member Replacement Rules', () => {
    let eventWithReplacement: any;
    let eventWithoutReplacement: any;
    let teamWith: any;
    let teamWithout: any;

    beforeAll(async () => {
      const ts = Date.now();
      // Event allowing replacement
      const [ev1] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Replacement Allowed Hack ${ts}`,
          slug: `rep-allowed-${ts}`,
          description: 'Allows member replacement.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'TEAM',
          allowMemberReplacement: true,
          capacity: 10,
          remainingCapacity: 10,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000 * 3),
          createdBy: organizerUser.id,
        })
        .returning();
      eventWithReplacement = ev1;

      // Event disallowing replacement
      const [ev2] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `No Replacement Hack ${ts}`,
          slug: `no-rep-${ts}`,
          description: 'Disallows member replacement.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'TEAM',
          allowMemberReplacement: false,
          capacity: 10,
          remainingCapacity: 10,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000 * 3),
          createdBy: organizerUser.id,
        })
        .returning();
      eventWithoutReplacement = ev2;

      // Leader creates team in both
      const res1 = await server.inject({
        method: 'POST',
        url: `/events/${eventWithReplacement.id}/teams`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { name: 'Replaceable Stars' },
      });
      teamWith = JSON.parse(res1.payload).team;

      // Invitee joins teamWith
      await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': inviteeUser1.id },
        payload: { code: teamWith.inviteCode },
      });

      const res2 = await server.inject({
        method: 'POST',
        url: `/events/${eventWithoutReplacement.id}/teams`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { name: 'Fixed Stars' },
      });
      teamWithout = JSON.parse(res2.payload).team;

      // Invitee joins teamWithout
      await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': inviteeUser1.id },
        payload: { code: teamWithout.inviteCode },
      });
    });

    it('rejects member removal when event.allowMemberReplacement is false', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${eventWithoutReplacement.id}/teams/${teamWithout.id}/members/${inviteeUser1.id}/remove`,
        headers: { 'x-test-user-id': leaderUser.id },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('REPLACEMENT_DISALLOWED');
    });

    it('allows leader to remove member when allowMemberReplacement is true, unassigns registration and releases seat', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${eventWithReplacement.id}/teams/${teamWith.id}/members/${inviteeUser1.id}/remove`,
        headers: { 'x-test-user-id': leaderUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.removedUserId).toBe(inviteeUser1.id);

      // Verify member is removed from teamMembers
      const [mem] = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamWith.id),
            eq(teamMembers.userId, inviteeUser1.id)
          )
        );
      expect(mem).toBeUndefined();

      // Verify registration is cancelled and unlinked
      const [reg] = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, eventWithReplacement.id),
            eq(registrations.userId, inviteeUser1.id)
          )
        );
      expect(reg).toBeDefined();
      expect(reg!.teamId).toBeNull();
      expect(reg!.status).toBe(RegistrationStatus.CANCELLED);
    });
  });

  describe('5. Late Joining Rules', () => {
    let closedEventNoLate: any;
    let teamNoLate: any;

    beforeAll(async () => {
      const ts = Date.now();
      const [ev] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Strict Deadline Event ${ts}`,
          slug: `strict-deadline-${ts}`,
          description: 'No late joining after registration deadline.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'TEAM',
          allowLateJoining: false,
          capacity: 20,
          remainingCapacity: 20,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 86400000 * 2),
          registrationClosesAt: new Date(Date.now() - 3600000), // CLOSED 1 hour ago
          createdBy: organizerUser.id,
        })
        .returning();
      closedEventNoLate = ev;

      // Seed team directly since registration closesAt is in past
      const [tm] = await db
        .insert(teams)
        .values({
          eventId: closedEventNoLate.id,
          name: `Late Deniers ${ts}`,
          leaderId: leaderUser.id,
          inviteCode: `LAT${ts.toString().slice(-3)}`,
          status: TeamStatus.FORMING,
        })
        .returning();
      teamNoLate = tm;

      await db.insert(teamMembers).values({
        teamId: teamNoLate.id,
        userId: leaderUser.id,
        eventId: closedEventNoLate.id,
        role: 'LEADER',
      });
    });

    it('rejects joining by code when registration closed and allowLateJoining is false', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': otherStudent.id },
        payload: { code: teamNoLate.inviteCode },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('LATE_JOINING_DISALLOWED');
    });
  });

  describe('6. Payment Policy: PER_TEAM vs PER_MEMBER (Test Mode)', () => {
    let perTeamEvent: any;
    let teamPerTeam: any;

    beforeAll(async () => {
      const ts = Date.now();
      const [ev] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Paid Hackathon Single Team Fee ${ts}`,
          slug: `paid-team-fee-${ts}`,
          description: 'Fixed registration per team.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'TEAM',
          isPaid: true,
          pricePaise: 50000, // Rs 500
          teamPaymentPolicy: 'PER_TEAM',
          capacity: 20,
          remainingCapacity: 20,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000 * 3),
          createdBy: organizerUser.id,
        })
        .returning();
      perTeamEvent = ev;

      // Leader forms team
      const res = await server.inject({
        method: 'POST',
        url: `/events/${perTeamEvent.id}/teams`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { name: 'Paid Team Pass' },
      });
      teamPerTeam = JSON.parse(res.payload).team;
    });

    it('under PER_TEAM policy, joining teammate registration paymentStatus is NOT_REQUIRED (covered by team)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': otherStudent.id },
        payload: { code: teamPerTeam.inviteCode },
      });

      expect(res.statusCode).toBe(200);

      // Verify otherStudent's registration
      const [joinerReg] = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, perTeamEvent.id),
            eq(registrations.userId, otherStudent.id)
          )
        );

      expect(joinerReg).toBeDefined();
      expect(joinerReg!.status).toBe(RegistrationStatus.CONFIRMED);
      expect(joinerReg!.paymentStatus).toBe(PaymentStatus.NOT_REQUIRED);
      expect(joinerReg!.amountPaise).toBe(0);
    });
  });

  describe('7. Organizer View: Teams, Readiness, Invitations & Deliverables', () => {
    it('returns complete team details, leader, member answers, invitations, and project deliverables', async () => {
      const ts = Date.now();
      const [orgEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Campus Grand Showcase ${ts}`,
          slug: `grand-showcase-${ts}`,
          description: 'Organizer comprehensive view test.',
          category: 'Technology',
          status: EventStatus.PUBLISHED,
          registrationMode: 'TEAM',
          minTeamSize: 2,
          maxTeamSize: 4,
          capacity: 20,
          remainingCapacity: 18,
          startAt: new Date(Date.now() + 86400000 * 5),
          endAt: new Date(Date.now() + 86400000 * 6),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 86400000 * 3),
          createdBy: organizerUser.id,
        })
        .returning();

      // Create a form question
      const [q] = await db
        .insert(formQuestions)
        .values({
          eventId: orgEvent!.id,
          label: 'GitHub Organization',
          type: QuestionType.SHORT_TEXT,
          required: false,
          position: 0,
        })
        .returning();

      // Create team
      const answers: Record<string, any> = {};
      answers[q!.id] = 'https://github.com/campus-ai';

      const resTeam = await server.inject({
        method: 'POST',
        url: `/events/${orgEvent!.id}/teams`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: {
          name: 'Apex Innovators',
          answers,
        },
      });
      const team = JSON.parse(resTeam.payload).team;

      // Add a second member
      await server.inject({
        method: 'POST',
        url: '/teams/join',
        headers: { 'x-test-user-id': inviteeUser1.id },
        payload: { code: team.inviteCode },
      });

      // Submit project deliverable
      await db
        .update(teams)
        .set({
          projectTitle: 'SmartCampus IoT Matrix',
          projectAbstract: 'Autonomous sensor mesh for college halls.',
          repoUrl: 'https://github.com/campus-ai/matrix',
          submittedAt: new Date(),
        })
        .where(eq(teams.id, team.id));

      // Invite a third person (pending)
      await server.inject({
        method: 'POST',
        url: `/events/${orgEvent!.id}/teams/${team.id}/invite`,
        headers: { 'x-test-user-id': leaderUser.id },
        payload: { email: inviteeUser2.email },
      });

      // Query organizer view endpoint
      const res = await server.inject({
        method: 'GET',
        url: `/events/${orgEvent!.id}/teams`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.teams).toHaveLength(1);

      const t = body.teams[0];
      expect(t.name).toBe('Apex Innovators');
      expect(t.leaderId).toBe(leaderUser.id);
      expect(t.leader.fullName).toBe(leaderUser.fullName);
      expect(t.isReady).toBe(true); // 2 members >= minTeamSize 2
      expect(t.members).toHaveLength(2);

      // Verify leader's form answers are attached
      const leaderMember = t.members.find((m: any) => m.userId === leaderUser.id);
      expect(leaderMember.answers[q!.id].value).toBe('https://github.com/campus-ai');

      // Verify teammate invitations are listed with status
      expect(t.invitations).toBeDefined();
      expect(t.invitations.length).toBeGreaterThanOrEqual(1);
      const pendingInv = t.invitations.find((i: any) => i.invitedEmail === inviteeUser2.email);
      expect(pendingInv).toBeDefined();
      expect(pendingInv.status).toBe('PENDING');

      // Verify project submission is populated
      expect(t.projectSubmission).toBeDefined();
      expect(t.projectSubmission.projectTitle).toBe('SmartCampus IoT Matrix');
      expect(t.projectSubmission.repoUrl).toBe('https://github.com/campus-ai/matrix');
    });
  });
});
