import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { ClubMemberRole, EventStatus, QuestionType, RegistrationStatus, UserRole, buildAnswerValidator } from '@eventora/shared';
import { buildServer } from '../server';
import { db } from '../db/client';
import {
  bookingAnswers,
  clubMembers,
  clubs,
  events,
  formQuestions,
  formVersions,
  registrations,
  teamInvitations,
  teamMembers,
  teams,
  users,
} from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { escapeCsv } from '../modules/forms/service';

describe('Form Builder, Versioning, Team Invitations & Attendee Management API Suite', () => {
  let server: FastifyInstance;
  let organizerUser: any;
  let studentUser1: any;
  let studentUser2: any;
  let testClub: any;
  let testEvent: any;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();

    // 1. Create organizer and student test users
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_${Date.now()}`,
        email: `org_${Date.now()}@testuniv.edu`,
        fullName: 'Dr. Jane Organizer',
        role: UserRole.ORGANIZER,
        collegeName: 'University College of Engineering',
        department: 'Computer Science',
        year: 4,
        program: 'B.Tech CSE',
        phone: '+91 98765 00001',
      })
      .returning();
    organizerUser = org;

    const [st1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_st1_${Date.now()}`,
        email: `student1_${Date.now()}@testuniv.edu`,
        fullName: 'Alice Walker',
        role: UserRole.STUDENT,
        rollNumber: `CS2026_${Date.now()}`,
        collegeName: 'University College of Engineering',
        department: 'Computer Science',
        year: 3,
        program: 'B.Tech CSE',
        phone: '+91 98765 00002',
      })
      .returning();
    studentUser1 = st1;

    const [st2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_st2_${Date.now()}`,
        email: `student2_${Date.now()}@testuniv.edu`,
        fullName: 'Bob Smith',
        role: UserRole.STUDENT,
        rollNumber: `ME2026_${Date.now()}`,
        collegeName: 'University College of Engineering',
        department: 'Mechanical Engineering',
        year: 2,
        program: 'B.Tech ME',
        phone: '+91 98765 00003',
      })
      .returning();
    studentUser2 = st2;

    // 2. Create test club and add organizer as OWNER in clubMembers
    const [c] = await db
      .insert(clubs)
      .values({
        name: `Tech Innovators Club ${Date.now()}`,
        slug: `tech-club-${Date.now()}`,
        description: 'Test club for form builder verification',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = c!;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Create test event
    const now = new Date();
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: 'Grand Annual Hackathon 2026',
        slug: `grand-hackathon-${Date.now()}`,
        description: 'Flagship 24-hour university hackathon',
        category: 'Technical',
        status: EventStatus.PUBLISHED,
        startAt: new Date(now.getTime() + 86400000 * 2),
        endAt: new Date(now.getTime() + 86400000 * 3),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() + 86400000 * 2),
        capacity: 100,
        remainingCapacity: 100,
        pricePaise: 0,
        isPaid: false,
        isCompetition: true,
        minTeamSize: 2,
        maxTeamSize: 4,
        createdBy: organizerUser.id,
      })
      .returning();
    testEvent = ev;
  });

  afterAll(async () => {
    // Cleanup in reverse dependency order
    if (testEvent) {
      await db.delete(teamInvitations).where(eq(teamInvitations.eventId, testEvent.id));
      await db.delete(teamMembers).where(eq(teamMembers.eventId, testEvent.id));
      await db.delete(teams).where(eq(teams.eventId, testEvent.id));
      await db.delete(bookingAnswers).where(eq(bookingAnswers.questionLabelSnapshot, 'test'));
      await db.delete(registrations).where(eq(registrations.eventId, testEvent.id));
      await db.delete(formQuestions).where(eq(formQuestions.eventId, testEvent.id));
      await db.delete(formVersions).where(eq(formVersions.eventId, testEvent.id));
      await db.delete(events).where(eq(events.id, testEvent.id));
    }
    if (testClub) {
      await db.delete(clubMembers).where(eq(clubMembers.clubId, testClub.id));
      await db.delete(clubs).where(eq(clubs.id, testClub.id));
    }
    if (organizerUser) {
      await db.delete(users).where(eq(users.id, organizerUser.id));
    }
    if (studentUser1) {
      await db.delete(users).where(eq(users.id, studentUser1.id));
    }
    if (studentUser2) {
      await db.delete(users).where(eq(users.id, studentUser2.id));
    }
    await server.close();
  });

  // --- SUITE 1: Student Profile Completeness & Safeguards ---
  describe('1. Student Profile Completeness & Update Safeguards', () => {
    it('GET /me returns computed profile completeness and missing fields', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/me',
        headers: {
          'x-test-user-id': studentUser1.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.user).toBeDefined();
      expect(data.user.collegeName).toBe('University College of Engineering');
      expect(data.user.program).toBe('B.Tech CSE');
      expect(data.user.profileComplete).toBe(true);
      expect(data.user.missingFields).toHaveLength(0);
    });

    it('PATCH /me rejects invalid phone format', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/me',
        headers: {
          'x-test-user-id': studentUser1.id,
        },
        payload: {
          phone: 'invalid-phone-string',
        },
      });

      expect(res.statusCode).toBe(400);
      const data = res.json();
      expect(data.code || data.error?.code).toBe('VALIDATION_FAILED');
    });

    it('PATCH /me does not overwrite valid existing data with empty strings', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/me',
        headers: {
          'x-test-user-id': studentUser1.id,
        },
        payload: {
          collegeName: '   ',
          program: '',
          department: '',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      // Should preserve original non-empty values
      expect(data.user.collegeName).toBe('University College of Engineering');
      expect(data.user.program).toBe('B.Tech CSE');
      expect(data.user.department).toBe('Computer Science');
    });
  });

  // --- SUITE 2: Form Templates & Builder Features ---
  describe('2. Form Builder & Template Library', () => {
    it('GET /events/:eventId/form/templates lists all 6 standard templates', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form/templates`,
      });

      expect(res.statusCode).toBe(200);
      const { templates } = res.json();
      expect(templates.length).toBe(6);
      const keys = templates.map((t: any) => t.key);
      expect(keys).toContain('HACKATHON');
      expect(keys).toContain('WORKSHOP');
      expect(keys).toContain('CULTURAL');
      expect(keys).toContain('COMPETITION');
      expect(keys).toContain('SEMINAR');
      expect(keys).toContain('GENERAL');
    });

    it('POST /events/:eventId/form/apply-template applies HACKATHON template questions', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/apply-template`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
        payload: {
          templateKey: 'HACKATHON',
          replaceExisting: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.template).toContain('Hackathon');
      expect(data.questions.length).toBeGreaterThanOrEqual(8);
    });

    it('POST /events/:eventId/form/questions adds custom field with extended question types', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
        payload: {
          type: QuestionType.DROPDOWN,
          label: 'Special Track Preference',
          helpText: 'Select your preferred secondary track',
          placeholder: 'Select a track',
          required: false,
          options: ['AI Core', 'Fintech', 'EdTech'],
        },
      });

      expect(res.statusCode).toBe(201);
      const { question } = res.json();
      expect(question.type).toBe('DROPDOWN');
      expect(question.label).toBe('Special Track Preference');
      expect(question.placeholder).toBe('Select a track');
    });

    it('POST /events/:eventId/form/questions/:qid/duplicate duplicates a question', async () => {
      const [q] = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.eventId, testEvent.id))
        .limit(1);

      expect(q).toBeDefined();

      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions/${q!.id}/duplicate`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });

      expect(res.statusCode).toBe(201);
      const { question } = res.json();
      expect(question.label).toBe(`${q!.label} (Copy)`);
      expect(question.type).toBe(q!.type);
    });

    it('PATCH /events/:eventId/form/questions/:qid updates question properties in PostgreSQL', async () => {
      const [q] = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.eventId, testEvent.id))
        .limit(1);

      const res = await server.inject({
        method: 'PATCH',
        url: `/events/${testEvent.id}/form/questions/${q!.id}`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
        payload: {
          label: 'Updated Question Label',
          required: true,
          helpText: 'Updated help text for attendee',
        },
      });

      expect(res.statusCode).toBe(200);
      const { question } = res.json();
      expect(question.label).toBe('Updated Question Label');
      expect(question.required).toBe(true);

      // Verify in DB
      const [updated] = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.id, q!.id));
      expect(updated!.label).toBe('Updated Question Label');
      expect(updated!.required).toBe(true);
    });

    it('POST /events/:eventId/form/order reorders questions in PostgreSQL', async () => {
      const qs = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.eventId, testEvent.id))
        .orderBy(asc(formQuestions.position));

      expect(qs.length).toBeGreaterThanOrEqual(2);
      const reversedIds = qs.map((q) => q.id).reverse();

      const res = await server.inject({
        method: 'PUT',
        url: `/events/${testEvent.id}/form/order`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
        payload: {
          orderedIds: reversedIds,
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify in DB
      const reordered = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.eventId, testEvent.id))
        .orderBy(asc(formQuestions.position));

      expect(reordered[0]!.id).toBe(reversedIds[0]);
    });

    it('DELETE /events/:eventId/form/questions/:qid deletes a question from PostgreSQL', async () => {
      // Create a temporary question to delete
      const createRes = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
        payload: {
          type: QuestionType.SHORT_TEXT,
          label: 'Temporary Question To Delete',
          required: false,
        },
      });

      const tempQ = createRes.json().question;

      const delRes = await server.inject({
        method: 'DELETE',
        url: `/events/${testEvent.id}/form/questions/${tempQ.id}`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });

      expect(delRes.statusCode).toBe(200);

      // Verify deleted from DB
      const [deleted] = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.id, tempQ.id));
      expect(deleted).toBeUndefined();
    });

    it('Enforces organizer authorization: unauthorized student receives 403 FORBIDDEN', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: {
          'x-test-user-id': studentUser1.id,
        },
        payload: {
          type: QuestionType.SHORT_TEXT,
          label: 'Hacker Attempted Question',
          required: false,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('Validates required vs optional fields and all extended question types', () => {
      const testQuestionDefs = [
        { id: 'q_email', type: QuestionType.EMAIL, label: 'Email', required: true, orderIndex: 0 },
        { id: 'q_phone', type: QuestionType.PHONE, label: 'Phone', required: true, orderIndex: 1 },
        { id: 'q_num', type: QuestionType.NUMBER, label: 'Age', required: false, orderIndex: 2 },
        { id: 'q_url', type: QuestionType.URL, label: 'Portfolio', required: false, orderIndex: 3 },
        { id: 'q_yesno', type: QuestionType.YES_NO, label: 'Agree', required: true, orderIndex: 4 },
        { id: 'q_instruct', type: QuestionType.INSTRUCTION, label: 'Read Info', required: false, orderIndex: 5 },
        { id: 'q_dropdown', type: QuestionType.DROPDOWN, label: 'Level', required: true, options: ['Junior', 'Senior'], orderIndex: 6 },
      ];

      const validator = buildAnswerValidator(testQuestionDefs);

      // 1. Fails when required field is missing
      const missingRequired = validator.safeParse({
        q_email: 'test@campus.edu',
      });
      expect(missingRequired.success).toBe(false);

      // 2. Fails when invalid email
      const invalidEmail = validator.safeParse({
        q_email: 'not-an-email',
        q_phone: '9876543210',
        q_yesno: true,
        q_dropdown: 'Junior',
      });
      expect(invalidEmail.success).toBe(false);

      // 3. Fails when invalid phone
      const invalidPhone = validator.safeParse({
        q_email: 'test@campus.edu',
        q_phone: '123',
        q_yesno: true,
        q_dropdown: 'Junior',
      });
      expect(invalidPhone.success).toBe(false);

      // 4. Fails when invalid dropdown option
      const invalidOption = validator.safeParse({
        q_email: 'test@campus.edu',
        q_phone: '9876543210',
        q_yesno: true,
        q_dropdown: 'InvalidOption',
      });
      expect(invalidOption.success).toBe(false);

      // 5. Succeeds with valid required and optional fields
      const valid = validator.safeParse({
        q_email: 'test@campus.edu',
        q_phone: '9876543210',
        q_num: 21,
        q_url: 'https://github.com/student',
        q_yesno: true,
        q_instruct: undefined,
        q_dropdown: 'Senior',
      });
      expect(valid.success).toBe(true);
    });
  });

  // --- SUITE 3: Form Publishing, Versioning & Historical Preservation ---
  describe('3. Form Versioning & Schema Freezing', () => {
    it('POST /events/:eventId/form/publish publishes initial form as version 1', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/publish`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.formVersion).toBe(1);
      expect(data.formPublished).toBe(true);
    });

    it('GET /events/:eventId/form returns formVersion and published state', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form`,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.formVersion).toBe(1);
      expect(data.formPublished).toBe(true);
      expect(data.questions.length).toBeGreaterThan(0);
    });

    it('POST /events/:eventId/form/publish increments version when registrations already exist', async () => {
      // Create a dummy registration under version 1 for a dedicated user
      const [extraUser] = await db
        .insert(users)
        .values({
          clerkId: `clerk_extra_${Date.now()}`,
          email: `extra_${Date.now()}@testuniv.edu`,
          fullName: 'Extra Attendee',
          role: UserRole.STUDENT,
        })
        .returning();

      expect(extraUser).toBeDefined();

      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: testEvent.id,
          userId: extraUser!.id,
          status: RegistrationStatus.CONFIRMED,
          formVersion: 1,
        })
        .returning();

      // Now organizer publishes changes
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/publish`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.formVersion).toBe(2);

      // Verify version 2 snapshot was recorded in form_versions
      const snapshots = await db
        .select()
        .from(formVersions)
        .where(eq(formVersions.eventId, testEvent.id));
      expect(snapshots.length).toBeGreaterThan(0);
    });
  });

  // --- SUITE 4: Team Invitations & Consent Workflow ---
  describe('4. Team Invitations & Member Consent', () => {
    let createdTeam: any;
    let invitationId: string;

    it('Leader creates a team and sends invitation to teammate by email', async () => {
      // 1. Student 1 creates team
      const createRes = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/teams`,
        headers: {
          'x-test-user-id': studentUser1.id,
        },
        payload: {
          name: `ByteWarriors_${Date.now()}`,
        },
      });

      expect(createRes.statusCode).toBe(201);
      createdTeam = createRes.json().team;

      // 2. Student 1 invites Student 2 by email
      const inviteRes = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/teams/${createdTeam.id}/invite`,
        headers: {
          'x-test-user-id': studentUser1.id,
        },
        payload: {
          email: studentUser2.email,
        },
      });

      expect(inviteRes.statusCode).toBe(201);
      const data = inviteRes.json();
      expect(data.success).toBe(true);
      expect(data.targetFound).toBe(true);
      invitationId = data.invitation.id;
    });

    it('Student 2 views pending team invitations on /me/team-invitations', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/me/team-invitations',
        headers: {
          'x-test-user-id': studentUser2.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const { invitations } = res.json();
      expect(invitations.length).toBeGreaterThan(0);
      const inv = invitations.find((i: any) => i.id === invitationId);
      expect(inv).toBeDefined();
      expect(inv.teamName).toBe(createdTeam.name);
      expect(inv.eventTitle).toBe(testEvent.title);
    });

    it('Student 2 accepts team invitation and joins the roster', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/team-invitations/${invitationId}/accept`,
        headers: {
          'x-test-user-id': studentUser2.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);

      // Verify Student 2 is now in teamMembers
      const members = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, createdTeam.id));
      expect(members.map((m) => m.userId)).toContain(studentUser2.id);
    });
  });

  // --- SUITE 5: Organizer Deep Attendee Inspection (10 Sections), Filtering & CSV Export ---
  describe('5. Organizer Attendee Deep Inspection, Filtering & CSV Export', () => {
    it('GET /events/:eventId/attendees returns list with all 11 authoritative directory fields', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.items.length).toBeGreaterThan(0);
      const item = data.items[0];

      // 11 Authoritative Attendee Directory Fields
      expect(item.name || item.studentName).toBeDefined();
      expect(item.email).toBeDefined();
      expect(item.phone).toBeDefined();
      expect(item.rollNumber).toBeDefined();
      expect(item.department).toBeDefined();
      expect(item.academicYear !== undefined).toBe(true);
      expect(item.registrationDate || item.registeredAt).toBeDefined();
      expect(item.registrationStatus || item.status).toBeDefined();
      expect(item.paymentStatus).toBeDefined();
      expect(item.checkInStatus).toBeDefined();
      expect(item.teamName !== undefined).toBe(true);

      // Verify nested records for backward compatibility
      expect(item.user).toBeDefined();
      expect(item.answers).toBeDefined();
    });

    it('GET /events/:eventId/attendees supports multi-field search and filters', async () => {
      // 1. Search by student name
      const nameRes = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees?search=Alice`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });
      expect(nameRes.statusCode).toBe(200);
      const nameData = nameRes.json();
      expect(nameData.items.some((i: any) => i.studentName.includes('Alice'))).toBe(true);

      // 2. Search by phone number
      const phoneRes = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees?search=98765`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });
      expect(phoneRes.statusCode).toBe(200);
      expect(phoneRes.json().items.length).toBeGreaterThan(0);

      // 3. Filter by department
      const deptRes = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees?department=Computer%20Science`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });
      expect(deptRes.statusCode).toBe(200);
      expect(deptRes.json().items.every((i: any) => i.department === 'Computer Science')).toBe(true);

      // 4. Filter by academic year
      const yearRes = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees?year=3`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });
      expect(yearRes.statusCode).toBe(200);
      expect(yearRes.json().items.every((i: any) => i.academicYear === 3)).toBe(true);

      // 5. Filter by team status
      const withTeamRes = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees?team=WITH_TEAM`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });
      expect(withTeamRes.statusCode).toBe(200);
      expect(withTeamRes.json().items.every((i: any) => i.teamName !== null)).toBe(true);
    });

    it('GET /events/:eventId/attendees/:registrationId returns complete 10-section inspection', async () => {
      const [reg] = await db
        .select()
        .from(registrations)
        .where(eq(registrations.eventId, testEvent.id))
        .limit(1);

      expect(reg).toBeDefined();

      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees/${reg!.id}`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();

      // Section 1: Complete Student Profile
      expect(data.personalProfile).toBeDefined();
      expect(data.personalProfile.fullName).toBeDefined();
      expect(data.personalProfile.email).toBeDefined();
      expect(data.personalProfile.phone).toBeDefined();
      expect(data.personalProfile.rollNumber).toBeDefined();
      expect(data.personalProfile.department).toBeDefined();
      expect(data.personalProfile.collegeName).toBeDefined();

      // Section 2: Registration Information
      expect(data.registration).toBeDefined();
      expect(data.registration.id).toBe(reg!.id);
      expect(data.registration.formVersion).toBeDefined();
      expect(data.registration.approvalStatus).toBeDefined();
      expect(data.registration.registeredAt).toBeDefined();

      // Section 3: Custom Form Responses
      expect(Array.isArray(data.formResponses)).toBe(true);

      // Section 4: Historical Form Version
      expect(data.formVersion).toBeDefined();

      // Section 5: Uploaded Documents
      expect(Array.isArray(data.documents)).toBe(true);

      // Section 6: Team Details (Name, Leader & Members)
      if (data.team) {
        expect(data.team.name).toBeDefined();
        expect(Array.isArray(data.team.members)).toBe(true);
      }

      // Section 7: Payment / Test Transaction Information
      expect(data.payment).toBeDefined();
      expect(data.payment.testMode).toBe(true);
      expect(data.payment.amountRupees).toBeDefined();
      expect(data.payment.paymentPolicy).toBeDefined();

      // Section 8: Ticket Status
      expect(data.ticket === null || typeof data.ticket === 'object').toBe(true);

      // Section 9: Check-in Timestamp
      expect(data.checkInTimestamp !== undefined).toBe(true);

      // Section 10: Gate and Volunteer Information
      expect(data.gateCheckIn).toBeDefined();
      expect(data.gateCheckIn.status).toBeDefined();
      expect(data.gateCheckIn.volunteer !== undefined).toBe(true);
    });

    it('GET /events/:eventId/attendees/csv exports filtered RFC 4180 CSV with formula protection', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees/csv?status=CONFIRMED`,
        headers: {
          'x-test-user-id': organizerUser.id,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('.csv');
      const csv = res.body;

      // Base headers present
      expect(csv).toContain('Registration ID');
      expect(csv).toContain('Full Name');
      expect(csv).toContain('Email');
      expect(csv).toContain('Phone');
      expect(csv).toContain('Roll Number');
      expect(csv).toContain('Department');
      expect(csv).toContain('Academic Year');
      expect(csv).toContain('Registration Status');
      expect(csv).toContain('Payment Status');
      expect(csv).toContain('Check-in Status');
      expect(csv).toContain('Team Name');
    });

    it('Denies access to unauthorized students and volunteer scanners', async () => {
      // 1. Student without organizer ownership is denied 403
      const studentRes = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees`,
        headers: {
          'x-test-user-id': studentUser1.id,
        },
      });
      expect(studentRes.statusCode).toBe(403);

      // 2. Scanner session is denied 403 by denyScanner
      const scannerRes = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/attendees`,
        headers: {
          'x-test-user-id': organizerUser.id,
          'x-scanner-session': 'true',
        },
      });
      expect(scannerRes.statusCode).toBe(403);
    });

    it('CWE-1236 Formula Injection Sanitizer escapes leading formula characters', () => {
      expect(escapeCsv('=cmd|’ /C calc’!A0')).toBe(`'=cmd|’ /C calc’!A0`);
      expect(escapeCsv('+12345')).toBe(`'+12345`);
      expect(escapeCsv('-45.67')).toBe(`'-45.67`);
      expect(escapeCsv('@SUM(A1:A10)')).toBe(`'@SUM(A1:A10)`);
      expect(escapeCsv('+12,34')).toBe(`"'+12,34"`);
      expect(escapeCsv('Normal Student Name')).toBe('Normal Student Name');
    });
  });
});
