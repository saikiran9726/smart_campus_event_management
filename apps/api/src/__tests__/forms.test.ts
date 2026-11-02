import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  QuestionType,
  RegistrationStatus,
  UserRole,
} from '@eventora/shared';
import { db, withTx } from '../db/client';
import {
  bookingAnswers,
  clubMembers,
  clubs,
  events,
  formQuestions,
  registrations,
  users,
} from '../db/schema';
import {
  escapeCsv,
  freezeFormIfNeeded,
  submitAnswers,
} from '../modules/forms/service';
import { buildServer } from '../server';

describe('Google-Forms-Style Dynamic Form Engine + Schema Freeze', () => {
  const server = buildServer();

  let organizerUser: any;
  let attendeeUser: any;
  let secondAttendeeUser: any;
  let testClub: any;
  let testEvent: any;

  let q1: any;
  let q2: any;
  let q3: any;
  let q4Regex: any;
  let optQ1AfterFreeze: any;
  let optQ2AfterFreeze: any;

  beforeAll(async () => {
    await server.ready();

    const timestamp = Date.now();

    // 1. Create organizer and attendees
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_form_${timestamp}`,
        email: `org_form_${timestamp}@campus.edu`,
        fullName: 'Form Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [att] = await db
      .insert(users)
      .values({
        clerkId: `clerk_att_form_${timestamp}`,
        email: `att_form_${timestamp}@campus.edu`,
        fullName: 'Attendee One',
        rollNumber: `ROLL_${timestamp}_1`,
        department: 'Computer Science',
        year: 3,
        role: UserRole.STUDENT,
      })
      .returning();
    attendeeUser = att;

    const [att2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_att2_form_${timestamp}`,
        email: `att2_form_${timestamp}@campus.edu`,
        fullName: 'Attendee Two',
        rollNumber: `ROLL_${timestamp}_2`,
        department: 'Electronics',
        year: 2,
        role: UserRole.STUDENT,
      })
      .returning();
    secondAttendeeUser = att2;

    // 2. Create club & membership
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Tech Form Club ${timestamp}`,
        slug: `tech-form-${timestamp}`,
        description: 'Testing dynamic forms.',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Create Event
    const now = new Date();
    const start = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 4 * 3600 * 1000);

    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: 'Dynamic Form Engineering Conference',
        slug: `form-conference-${timestamp}`,
        description: 'Comprehensive testing for custom dynamic forms.',
        category: 'Conference',
        startAt: start,
        endAt: end,
        registrationOpensAt: now,
        registrationClosesAt: start,
        status: EventStatus.APPROVED,
        capacity: 200,
        remainingCapacity: 200,
        pricePaise: 0,
        isPaid: false,
        createdBy: organizerUser.id,
      })
      .returning();
    testEvent = ev;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Form Creation & Public Inspection', () => {
    it('creates 3 initial form questions as organizer', async () => {
      // Q1: Short text (Full Name, required)
      const res1 = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          type: QuestionType.SHORT_TEXT,
          label: 'Full Legal Name',
          required: true,
          minLength: 2,
          maxLength: 100,
        },
      });
      expect(res1.statusCode).toBe(201);
      const json1 = JSON.parse(res1.body);
      q1 = json1.question;
      expect(q1.label).toBe('Full Legal Name');
      expect(q1.position).toBe(1);
      expect(q1.addedAfterFreeze).toBe(false);

      // Q2: Number (Graduation Year, required)
      const res2 = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          type: QuestionType.NUMBER,
          label: 'Expected Graduation Year',
          required: true,
          minNumber: 2024,
          maxNumber: 2030,
        },
      });
      expect(res2.statusCode).toBe(201);
      const json2 = JSON.parse(res2.body);
      q2 = json2.question;
      expect(q2.position).toBe(2);

      // Q3: Single Select (T-Shirt Size, optional)
      const res3 = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          type: QuestionType.SINGLE_SELECT,
          label: 'T-Shirt Size',
          required: false,
          options: ['S', 'M', 'L', 'XL', 'XXL'],
        },
      });
      expect(res3.statusCode).toBe(201);
      const json3 = JSON.parse(res3.body);
      q3 = json3.question;
      expect(q3.position).toBe(3);
    });

    it('GET /events/:eventId/form returns active questions and unfrozen status', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form`,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.frozen).toBe(false);
      expect(json.frozenAt).toBeNull();
      expect(json.registeredCount).toBe(0);
      expect(json.questions).toHaveLength(3);
      expect(json.questions[0].id).toBe(q1.id);
      expect(json.questions[1].id).toBe(q2.id);
      expect(json.questions[2].id).toBe(q3.id);
    });
  });

  describe('Regex Validation & Instant Preview', () => {
    it('creates a question with safe regex validation pattern', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          type: QuestionType.SHORT_TEXT,
          label: 'GitHub Username',
          required: false,
          regexPattern: '^@[a-zA-Z0-9_-]+$',
          regexErrorMessage: 'GitHub username must start with @',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      q4Regex = json.question;
      expect(q4Regex.validation?.regexPattern).toBe('^@[a-zA-Z0-9_-]+$');
    });

    it('invalid regex answer returns field-level error via preview-validate', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/preview-validate`,
        payload: {
          answers: {
            [q1.id]: 'Alice Doe',
            [q2.id]: 2026,
            [q4Regex.id]: 'invalid_no_at_symbol',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.valid).toBe(false);
      expect(json.errors[q4Regex.id]).toBe('GitHub username must start with @');
    });

    it('valid answers pass preview validation', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/preview-validate`,
        payload: {
          answers: {
            [q1.id]: 'Alice Doe',
            [q2.id]: 2026,
            [q3.id]: 'M',
            [q4Regex.id]: '@alicedoe',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.valid).toBe(true);
      expect(json.errors).toEqual({});
    });
  });

  describe('Registration & Schema Freeze Mechanics', () => {
    let registrationId: string;
    let initialFreezeTime: Date;

    it('registers user, freezes form, and records immutable answer snapshots', async () => {
      // 1. Create a registration record
      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: testEvent.id,
          userId: attendeeUser.id,
          status: RegistrationStatus.CONFIRMED,
          amountPaise: 0,
        })
        .returning();
      expect(reg).toBeDefined();
      registrationId = reg!.id;

      // 2. Call freezeFormIfNeeded and submitAnswers inside one transaction
      await withTx(async (tx) => {
        const frozenAt = await freezeFormIfNeeded(tx, testEvent.id);
        expect(frozenAt).toBeInstanceOf(Date);
        initialFreezeTime = frozenAt!;

        const answers = {
          [q1.id]: 'Alice Doe',
          [q2.id]: 2026,
          [q3.id]: 'L',
          [q4Regex.id]: '@alicedoe',
        };

        const answersRecorded = await submitAnswers(tx, {
          registrationId,
          eventId: testEvent.id,
          answers,
        });

        expect(answersRecorded).toHaveLength(4);
      });

      // Confirm DB reflects freeze
      const [ev] = await db
        .select()
        .from(events)
        .where(eq(events.id, testEvent.id));
      expect(ev).toBeDefined();
      expect(ev!.formFrozenAt).not.toBeNull();

      // Check snapshot integrity in booking_answers
      const answersInDb = await db
        .select()
        .from(bookingAnswers)
        .where(eq(bookingAnswers.registrationId, registrationId));

      expect(answersInDb).toHaveLength(4);
      const q1Ans = answersInDb.find((a) => a.questionId === q1.id);
      expect(q1Ans?.questionLabelSnapshot).toBe('Full Legal Name');
      expect(q1Ans?.questionTypeSnapshot).toBe(QuestionType.SHORT_TEXT);
      expect(q1Ans?.value).toBe('Alice Doe');
    });

    it('GET /events/:eventId/form confirms freeze set once and registeredCount is 1', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form`,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.frozen).toBe(true);
      expect(json.frozenAt).toBeDefined();
      expect(json.registeredCount).toBe(1);
    });

    it('label PATCH on existing question returns 409 FORM_FROZEN', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/events/${testEvent.id}/form/questions/${q1.id}`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          label: 'Updated Full Name Attempt',
        },
      });

      expect(res.statusCode).toBe(409);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('FORM_FROZEN');
    });

    it('help_text PATCH on existing question is allowed while frozen', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/events/${testEvent.id}/form/questions/${q1.id}`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          helpText: 'Please enter first and last name as per your university ID card.',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.question.helpText).toBe(
        'Please enter first and last name as per your university ID card.'
      );
    });

    it('adding a required question after freeze returns 409 FORM_FROZEN with attendee count', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          type: QuestionType.PHONE,
          label: 'Emergency Contact Phone',
          required: true,
        },
      });

      expect(res.statusCode).toBe(409);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('FORM_FROZEN');
      expect(json.error.message).toContain(
        'Form frozen: 1 attendees registered. Only new optional questions can be added.'
      );
    });

    it('adding optional questions after freeze succeeds with added_after_freeze = true', async () => {
      // Add optional question 1
      const res1 = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          type: QuestionType.SHORT_TEXT,
          label: 'Dietary Preferences',
          required: false,
        },
      });

      expect(res1.statusCode).toBe(201);
      const json1 = JSON.parse(res1.body);
      optQ1AfterFreeze = json1.question;
      expect(optQ1AfterFreeze.addedAfterFreeze).toBe(true);
      expect(optQ1AfterFreeze.required).toBe(false);
      expect(optQ1AfterFreeze.position).toBe(5);

      // Add optional question 2
      const res2 = await server.inject({
        method: 'POST',
        url: `/events/${testEvent.id}/form/questions`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          type: QuestionType.SHORT_TEXT,
          label: 'Special Accommodations',
          required: false,
        },
      });

      expect(res2.statusCode).toBe(201);
      const json2 = JSON.parse(res2.body);
      optQ2AfterFreeze = json2.question;
      expect(optQ2AfterFreeze.addedAfterFreeze).toBe(true);
      expect(optQ2AfterFreeze.position).toBe(6);
    });

    it('DELETE question after freeze returns 409 FORM_FROZEN', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/events/${testEvent.id}/form/questions/${q1.id}`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(409);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('FORM_FROZEN');
      expect(json.error.message).toContain('Cannot delete questions from a frozen form');
    });

    it('reorder of old questions returns 409 FORM_FROZEN', async () => {
      // Swapping Q1 and Q2
      const res = await server.inject({
        method: 'PUT',
        url: `/events/${testEvent.id}/form/order`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          orderedIds: [
            q2.id,
            q1.id,
            q3.id,
            q4Regex.id,
            optQ1AfterFreeze.id,
            optQ2AfterFreeze.id,
          ],
        },
      });

      expect(res.statusCode).toBe(409);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('FORM_FROZEN');
    });

    it('reorder of newly added questions among themselves succeeds', async () => {
      // Keep Q1, Q2, Q3, Q4 in place, swap optQ1AfterFreeze and optQ2AfterFreeze
      const res = await server.inject({
        method: 'PUT',
        url: `/events/${testEvent.id}/form/order`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          orderedIds: [
            q1.id,
            q2.id,
            q3.id,
            q4Regex.id,
            optQ2AfterFreeze.id,
            optQ1AfterFreeze.id,
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);

      // Verify positions
      const [reorderedQ2] = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.id, optQ2AfterFreeze.id));
      const [reorderedQ1] = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.id, optQ1AfterFreeze.id));

      expect(reorderedQ2).toBeDefined();
      expect(reorderedQ1).toBeDefined();
      expect(reorderedQ2!.position).toBe(5);
      expect(reorderedQ1!.position).toBe(6);
    });

    it('second registration answers new optional question, leaving unanswered questions absent', async () => {
      const [reg2] = await db
        .insert(registrations)
        .values({
          eventId: testEvent.id,
          userId: secondAttendeeUser.id,
          status: RegistrationStatus.CONFIRMED,
          amountPaise: 0,
        })
        .returning();
      expect(reg2).toBeDefined();

      await withTx(async (tx) => {
        // Second attendee fills Q1, Q2, and the new optQ2AfterFreeze, leaving optQ1AfterFreeze unanswered
        const answers = {
          [q1.id]: 'Bob Smith',
          [q2.id]: 2025,
          [q3.id]: 'XL',
          [optQ2AfterFreeze.id]: 'Need wheelchair accessible seating',
        };

        const answersRecorded = await submitAnswers(tx, {
          registrationId: reg2!.id,
          eventId: testEvent.id,
          answers,
        });

        // 4 answers recorded (Q1, Q2, Q3, optQ2AfterFreeze; optQ1AfterFreeze & q4Regex are absent)
        expect(answersRecorded).toHaveLength(4);
      });
    });
  });

  describe('Label Snapshot Persistence across Updates', () => {
    it("label snapshot persists after the question's label is changed before freeze in a separate event", async () => {
      const timestamp = Date.now();

      // Create a separate event
      const [sepEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Snapshot Isolation Event ${timestamp}`,
          slug: `snapshot-event-${timestamp}`,
          description: 'Testing label snapshot immutability.',
          category: 'Workshop',
          startAt: new Date(Date.now() + 86400000),
          endAt: new Date(Date.now() + 172800000),
          registrationOpensAt: new Date(),
          registrationClosesAt: new Date(Date.now() + 86400000),
          status: EventStatus.APPROVED,
          capacity: 50,
          remainingCapacity: 50,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      expect(sepEvent).toBeDefined();

      // Create question with initial label
      const [question] = await db
        .insert(formQuestions)
        .values({
          eventId: sepEvent!.id,
          position: 1,
          type: QuestionType.SHORT_TEXT,
          label: 'Original Initial Label',
          required: false,
          archived: false,
        })
        .returning();
      expect(question).toBeDefined();

      // Create registration and submit answer BEFORE any label change
      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: sepEvent!.id,
          userId: attendeeUser.id,
          status: RegistrationStatus.CONFIRMED,
        })
        .returning();
      expect(reg).toBeDefined();

      await withTx(async (tx) => {
        await submitAnswers(tx, {
          registrationId: reg!.id,
          eventId: sepEvent!.id,
          answers: {
            [question!.id]: 'Preserved Answer Content',
          },
        });
      });

      // Now PATCH the label before freeze
      const updateRes = await server.inject({
        method: 'PATCH',
        url: `/events/${sepEvent!.id}/form/questions/${question!.id}`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          label: 'Brand New Mutated Label',
        },
      });
      expect(updateRes.statusCode).toBe(200);

      // Verify booking_answers snapshot remains 'Original Initial Label'
      const [answerRecord] = await db
        .select()
        .from(bookingAnswers)
        .where(eq(bookingAnswers.registrationId, reg!.id));

      expect(answerRecord).toBeDefined();
      expect(answerRecord!.questionLabelSnapshot).toBe('Original Initial Label');
      expect(answerRecord!.value).toBe('Preserved Answer Content');

      // But formQuestions row has the new label
      const [updatedQ] = await db
        .select()
        .from(formQuestions)
        .where(eq(formQuestions.id, question!.id));
      expect(updatedQ).toBeDefined();
      expect(updatedQ!.label).toBe('Brand New Mutated Label');
    });
  });

  describe('Parallel Freeze Idempotency', () => {
    it('20 parallel freezeFormIfNeeded calls leave form_frozen_at unchanged after the first', async () => {
      const timestamp = Date.now();

      // Create fresh event for concurrency test
      const [concEvent] = await db
        .insert(events)
        .values({
          clubId: testClub.id,
          title: `Concurrency Test Event ${timestamp}`,
          slug: `concurrency-event-${timestamp}`,
          description: 'Testing 20 parallel freeze calls.',
          category: 'Seminar',
          startAt: new Date(Date.now() + 86400000),
          endAt: new Date(Date.now() + 172800000),
          registrationOpensAt: new Date(),
          registrationClosesAt: new Date(Date.now() + 86400000),
          status: EventStatus.APPROVED,
          capacity: 100,
          remainingCapacity: 100,
          pricePaise: 0,
          isPaid: false,
          createdBy: organizerUser.id,
        })
        .returning();

      expect(concEvent).toBeDefined();
      expect(concEvent!.formFrozenAt).toBeNull();

      // Run 20 concurrent transactions calling freezeFormIfNeeded
      const results = await Promise.all(
        Array.from({ length: 20 }, async () => {
          return withTx(async (tx) => {
            return freezeFormIfNeeded(tx, concEvent!.id);
          });
        })
      );

      // Confirm all 20 returned dates
      expect(results).toHaveLength(20);
      const firstTimestamp = results[0]?.getTime();
      expect(firstTimestamp).toBeDefined();

      // Confirm all returned the exact same timestamp
      for (const resDate of results) {
        expect(resDate?.getTime()).toBe(firstTimestamp);
      }

      // Confirm DB holds the exact timestamp
      const [finalEvent] = await db
        .select()
        .from(events)
        .where(eq(events.id, concEvent!.id));
      expect(finalEvent).toBeDefined();
      expect(finalEvent!.formFrozenAt?.getTime()).toBe(firstTimestamp);
    });
  });

  describe('Form Responses & Security Boundaries', () => {
    it('GET /events/:eventId/form/responses returns paginated responses with label snapshots', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form/responses?page=1&limit=10`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.total).toBe(2);
      expect(json.items).toHaveLength(2);
      expect(json.columns).toBeInstanceOf(Array);
      expect(json.columns.length).toBeGreaterThanOrEqual(4);

      // Verify attendee one's answers
      const attendee1Item = json.items.find(
        (i: any) => i.user.id === attendeeUser.id
      );
      expect(attendee1Item).toBeDefined();
      expect(attendee1Item.answers[q1.id].value).toBe('Alice Doe');
      expect(attendee1Item.answers[q1.id].labelSnapshot).toBe('Full Legal Name');
    });

    it('rejects volunteer scanner sessions with 403 FORBIDDEN', async () => {
      // 1. With x-scanner-session header
      const res1 = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form/responses`,
        headers: {
          'x-test-user-id': organizerUser.id,
          'x-scanner-session': 'active_scanner_session_token_123',
        },
      });
      expect(res1.statusCode).toBe(403);
      const json1 = JSON.parse(res1.body);
      expect(json1.error.code).toBe('FORBIDDEN');
      expect(json1.error.message).toContain('Volunteer scanner sessions');

      // 2. With x-principal: scanner header
      const res2 = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form/responses.csv`,
        headers: {
          'x-test-user-id': organizerUser.id,
          'x-principal': 'scanner',
        },
      });
      expect(res2.statusCode).toBe(403);
    });

    it('GET /events/:eventId/form/responses.csv streams valid CSV with escaping', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form/responses.csv`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('.csv');

      const csv = res.body;
      const lines = csv.split('\r\n');
      expect(lines.length).toBeGreaterThanOrEqual(3); // Header + 2 attendee rows

      // Check header line contains standard user fields and question labels
      const headerLine = lines[0];
      expect(headerLine).toContain('Registration ID');
      expect(headerLine).toContain('User Name');
      expect(headerLine).toContain('Full Legal Name');
      expect(headerLine).toContain('Expected Graduation Year');

      // Check data rows
      expect(csv).toContain('Alice Doe');
      expect(csv).toContain('Bob Smith');
    });

    it('escapeCsv neutralizes CSV formula injection characters (CWE-1236)', () => {
      // Direct formula triggers & leading whitespace bypasses
      expect(escapeCsv('=cmd|"/C calc"!A0')).toBe(`"'=cmd|""/C calc""!A0"`);
      expect(escapeCsv('   =cmd|"/C calc"!A0')).toBe(`"'   =cmd|""/C calc""!A0"`);
      expect(escapeCsv('+12345')).toBe(`'+12345`);
      expect(escapeCsv('  +12345')).toBe(`'  +12345`);
      expect(escapeCsv('-@dangerous')).toBe(`'-@dangerous`);
      expect(escapeCsv('@SUM(A1:A10)')).toBe(`'@SUM(A1:A10)`);
      expect(escapeCsv('\tTAB_PREFIX')).toBe(`'\tTAB_PREFIX`);

      // Normal benign values remain clean or normally quoted
      expect(escapeCsv('Normal text')).toBe('Normal text');
      expect(escapeCsv('Text, with comma')).toBe('"Text, with comma"');
      expect(escapeCsv(null)).toBe('');
      expect(escapeCsv(undefined)).toBe('');
    });

    it('GET /events/:eventId/form/insights returns statistical aggregations', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/form/insights`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.totalRegistrations).toBe(2);
      expect(json.insights).toBeInstanceOf(Array);

      // Find Graduation Year (NUMBER) insight
      const q2Insight = json.insights.find((i: any) => i.questionId === q2.id);
      expect(q2Insight).toBeDefined();
      expect(q2Insight.responseCount).toBe(2);
      expect(q2Insight.responseRate).toBe(1); // 2/2 = 1.0
      expect(q2Insight.stats.min).toBe(2025);
      expect(q2Insight.stats.max).toBe(2026);
      expect(q2Insight.stats.avg).toBe(2025.5);

      // Find T-Shirt Size (SINGLE_SELECT) insight
      const q3Insight = json.insights.find((i: any) => i.questionId === q3.id);
      expect(q3Insight).toBeDefined();
      expect(q3Insight.optionCounts['L']).toBe(1);
      expect(q3Insight.optionCounts['XL']).toBe(1);
      expect(q3Insight.optionCounts['S']).toBe(0);
    });
  });
});
