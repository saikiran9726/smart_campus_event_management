import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  DEFAULT_PROJECT_SUBMISSION_CONFIG,
  DEFAULT_SUBMISSION_FIELDS,
  EventStatus,
  ProjectSubmissionConfig,
  RegistrationStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  clubs,
  events,
  projectSubmissions,
  registrations,
  teamMembers,
  teams,
  users,
} from '../db/schema';
import { buildServer } from '../server';

describe('Eventora: Event-Specific Configurable Project Submission Regression Suite', () => {
  const server = buildServer();

  let organizer: any;
  let student1: any;
  let student2: any;
  let student3: any;
  let testClub: any;

  beforeAll(async () => {
    await server.ready();

    // 0. Strict database safety verification: MUST be isolated test database (strictly reject production)
    const dbRes = await db.execute<{ current_database: string }>(
      sql`SELECT current_database() as current_database;`
    );
    expect(dbRes.rows[0]?.current_database).not.toBe('eventora');
    expect(['eventora_venue_test', 'eventora_test']).toContain(dbRes.rows[0]?.current_database);

    const ts = Date.now();

    // Seed test users
    [organizer] = await db
      .insert(users)
      .values({
        clerkId: `clerk_sub_org_${ts}`,
        email: `sub_org_${ts}@campus.edu`,
        fullName: 'Project Sub Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();

    [student1] = await db
      .insert(users)
      .values({
        clerkId: `clerk_sub_s1_${ts}`,
        email: `sub_s1_${ts}@campus.edu`,
        fullName: 'Student Alice',
        role: UserRole.STUDENT,
      })
      .returning();

    [student2] = await db
      .insert(users)
      .values({
        clerkId: `clerk_sub_s2_${ts}`,
        email: `sub_s2_${ts}@campus.edu`,
        fullName: 'Student Bob',
        role: UserRole.STUDENT,
      })
      .returning();

    [student3] = await db
      .insert(users)
      .values({
        clerkId: `clerk_sub_s3_${ts}`,
        email: `sub_s3_${ts}@campus.edu`,
        fullName: 'Student Charlie',
        role: UserRole.STUDENT,
      })
      .returning();

    [testClub] = await db
      .insert(clubs)
      .values({
        name: `Submissions Test Club ${ts}`,
        slug: `sub-test-club-${ts}`,
        description: 'Testing event-specific project submissions',
      })
      .returning();
  });

  afterAll(async () => {
    await server.close();
  });

  // 1. Hackathon with Submissions Disabled
  it('1. Hackathon with submissions disabled: never requires submissions and rejects submission attempts', async () => {
    const ts = Date.now();
    const [hackathon] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Hackathon No Subs ${ts}`,
        slug: `hack-no-subs-${ts}`,
        description: 'Hackathon with project submissions disabled',
        category: 'Hackathon',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        isCompetition: true,
        minTeamSize: 1,
        maxTeamSize: 4,
        projectSubmissionConfig: {
          enabled: false,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: DEFAULT_SUBMISSION_FIELDS,
        },
        createdBy: organizer.id,
      })
      .returning();

    // Student registers without any project submission
    const regRes = await server.inject({
      method: 'POST',
      url: `/events/${hackathon!.id}/registrations`,
      headers: {
        'x-test-user-id': student1.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {} },
    });

    expect(regRes.statusCode).toBe(201);
    expect(regRes.json().outcome).toBe('CONFIRMED');

    // Attempting to submit project deliverables must fail with 400 SUBMISSIONS_DISABLED
    const subRes = await server.inject({
      method: 'POST',
      url: `/events/${hackathon!.id}/submissions`,
      headers: { 'x-test-user-id': student1.id },
      payload: {
        projectTitle: 'Unsolicited Hackathon Project',
        abstract: 'This should be blocked',
      },
    });

    expect(subRes.statusCode).toBe(400);
    expect(subRes.json().error.code).toBe('SUBMISSIONS_DISABLED');
  });

  // 2. Hackathon with Optional Submissions
  it('2. Hackathon with optional submissions: skipping never blocks registration, submitting records deliverables', async () => {
    const ts = Date.now();
    const [optHackathon] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Hackathon Optional Subs ${ts}`,
        slug: `hack-opt-subs-${ts}`,
        description: 'Hackathon with optional deliverables during registration',
        category: 'Hackathon',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        isCompetition: true,
        minTeamSize: 1,
        maxTeamSize: 4,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'OPTIONAL',
          timing: 'DURING_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: DEFAULT_SUBMISSION_FIELDS,
        },
        createdBy: organizer.id,
      })
      .returning();

    // Student 1 skips optional submission: registration completes cleanly!
    const skipRes = await server.inject({
      method: 'POST',
      url: `/events/${optHackathon!.id}/registrations`,
      headers: {
        'x-test-user-id': student1.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {}, projectSubmission: null },
    });
    expect(skipRes.statusCode).toBe(201);
    expect(skipRes.json().outcome).toBe('CONFIRMED');

    // Student 2 provides optional deliverables: registration completes and saves submission!
    const submitRes = await server.inject({
      method: 'POST',
      url: `/events/${optHackathon!.id}/registrations`,
      headers: {
        'x-test-user-id': student2.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: {
        answers: {},
        projectSubmission: {
          projectTitle: 'Smart AI Attendance',
          abstract: 'Edge vision and BLE beacon attendance system',
          repoUrl: 'https://github.com/eventora/smart-ai',
        },
      },
    });
    expect(submitRes.statusCode).toBe(201);

    // Verify submission record exists in project_submissions
    const saved = await db
      .select()
      .from(projectSubmissions)
      .where(and(eq(projectSubmissions.eventId, optHackathon!.id), eq(projectSubmissions.userId, student2.id)));
    expect(saved.length).toBe(1);
    expect(saved[0]?.projectTitle).toBe('Smart AI Attendance');
  });

  // 3. Hackathon with Mandatory Submissions
  it('3. Hackathon with mandatory submissions: blocks registration if required fields are missing, succeeds when provided', async () => {
    const ts = Date.now();
    const [mandHackathon] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Hackathon Mandatory Subs ${ts}`,
        slug: `hack-mand-subs-${ts}`,
        description: 'Hackathon with mandatory deliverables during registration',
        category: 'Hackathon',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        isCompetition: true,
        minTeamSize: 1,
        maxTeamSize: 4,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'MANDATORY',
          timing: 'DURING_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: [
            { key: 'title', label: 'Project Title', enabled: true, required: true, type: 'text' },
            { key: 'abstract', label: 'Abstract', enabled: true, required: true, type: 'textarea' },
            { key: 'repoUrl', label: 'Repo URL', enabled: true, required: true, type: 'url' },
          ],
        },
        createdBy: organizer.id,
      })
      .returning();

    // Registration attempt without project deliverables is REJECTED with 400
    const emptyRes = await server.inject({
      method: 'POST',
      url: `/events/${mandHackathon!.id}/registrations`,
      headers: {
        'x-test-user-id': student1.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {} },
    });
    expect(emptyRes.statusCode).toBe(400);
    expect(emptyRes.json().error.code).toBe('VALIDATION_FAILED');

    // Registration attempt missing required repoUrl is REJECTED
    const missingRepoRes = await server.inject({
      method: 'POST',
      url: `/events/${mandHackathon!.id}/registrations`,
      headers: {
        'x-test-user-id': student1.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: {
        answers: {},
        projectSubmission: {
          projectTitle: 'Cool Autonomous Rover',
          abstract: 'Self-driving robot on ROS2',
        },
      },
    });
    expect(missingRepoRes.statusCode).toBe(400);

    // Registration with all required fields SUCCEEDS
    const validRes = await server.inject({
      method: 'POST',
      url: `/events/${mandHackathon!.id}/registrations`,
      headers: {
        'x-test-user-id': student1.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: {
        answers: {},
        projectSubmission: {
          projectTitle: 'Cool Autonomous Rover',
          abstract: 'Self-driving robot on ROS2',
          repoUrl: 'https://github.com/eventora/autonomous-rover',
        },
      },
    });
    expect(validRes.statusCode).toBe(201);
  });

  // 4. Submission After Registration
  it('4. Submission after registration: allows registration to complete first, accepts submission later', async () => {
    const ts = Date.now();
    const [afterEvent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `After Reg Subs Event ${ts}`,
        slug: `after-reg-subs-${ts}`,
        description: 'Deliverables turned in after ticket issuance',
        category: 'Tech',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: DEFAULT_SUBMISSION_FIELDS,
        },
        createdBy: organizer.id,
      })
      .returning();

    // 1. Student registers with no project details
    const regRes = await server.inject({
      method: 'POST',
      url: `/events/${afterEvent!.id}/registrations`,
      headers: {
        'x-test-user-id': student1.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {} },
    });
    expect(regRes.statusCode).toBe(201);

    // 2. Student later submits project deliverables
    const subRes = await server.inject({
      method: 'POST',
      url: `/events/${afterEvent!.id}/submissions`,
      headers: { 'x-test-user-id': student1.id },
      payload: {
        projectTitle: 'Decentralized Campus Identity',
        abstract: 'DID architecture with zero-knowledge proofs',
        repoUrl: 'https://github.com/eventora/did-identity',
      },
    });
    expect(subRes.statusCode).toBe(200);
    expect(subRes.json().success).toBe(true);

    // 3. Verify user submission query returns active status
    const statusRes = await server.inject({
      method: 'GET',
      url: `/events/${afterEvent!.id}/submissions/me`,
      headers: { 'x-test-user-id': student1.id },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().submission?.projectTitle).toBe('Decentralized Campus Identity');
    expect(statusRes.json().canEdit).toBe(true);
  });

  // 5. Ordinary Non-Hackathon Event
  it('5. Ordinary non-hackathon event: project submissions work according to configuration, not event category', async () => {
    const ts = Date.now();
    const [workshop] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Design Workshop ${ts}`,
        slug: `design-workshop-${ts}`,
        description: 'Ordinary non-hackathon workshop with submissions enabled for portfolio evaluation',
        category: 'Design',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        isCompetition: false,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: [
            { key: 'title', label: 'Portfolio Title', enabled: true, required: true, type: 'text' },
            { key: 'demoUrl', label: 'Figma URL', enabled: true, required: true, type: 'url' },
          ],
        },
        createdBy: organizer.id,
      })
      .returning();

    // Register
    await server.inject({
      method: 'POST',
      url: `/events/${workshop!.id}/registrations`,
      headers: {
        'x-test-user-id': student2.id,
        'cf-turnstile-response': 'test-pass',
      },
      payload: { answers: {} },
    });

    // Submits portfolio
    const subRes = await server.inject({
      method: 'POST',
      url: `/events/${workshop!.id}/submissions`,
      headers: { 'x-test-user-id': student2.id },
      payload: {
        projectTitle: 'Design System Case Study',
        demoUrl: 'https://figma.com/@campus/design-tokens',
      },
    });
    expect(subRes.statusCode).toBe(200);
  });

  // 6. Two Events with Different Submission Configurations
  it('6. Two events with different submission configurations: configuration never leaks or affects other events', async () => {
    const ts = Date.now();
    const [eventA] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Event A Mandatory ${ts}`,
        slug: `event-a-${ts}`,
        description: 'Event A',
        category: 'Tech',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'MANDATORY',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: [{ key: 'title', label: 'Title', enabled: true, required: true, type: 'text' }],
        },
        createdBy: organizer.id,
      })
      .returning();

    const [eventB] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Event B Disabled ${ts}`,
        slug: `event-b-${ts}`,
        description: 'Event B',
        category: 'Tech',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        projectSubmissionConfig: {
          enabled: false,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: [],
        },
        createdBy: organizer.id,
      })
      .returning();

    // Register student3 to both events
    await server.inject({
      method: 'POST',
      url: `/events/${eventA!.id}/registrations`,
      headers: { 'x-test-user-id': student3.id, 'cf-turnstile-response': 'test-pass' },
      payload: { answers: {} },
    });
    await server.inject({
      method: 'POST',
      url: `/events/${eventB!.id}/registrations`,
      headers: { 'x-test-user-id': student3.id, 'cf-turnstile-response': 'test-pass' },
      payload: { answers: {} },
    });

    // Event A accepts submission
    const resA = await server.inject({
      method: 'POST',
      url: `/events/${eventA!.id}/submissions`,
      headers: { 'x-test-user-id': student3.id },
      payload: { projectTitle: 'Project for Event A' },
    });
    expect(resA.statusCode).toBe(200);

    // Event B rejects submission because it is disabled
    const resB = await server.inject({
      method: 'POST',
      url: `/events/${eventB!.id}/submissions`,
      headers: { 'x-test-user-id': student3.id },
      payload: { projectTitle: 'Project for Event B' },
    });
    expect(resB.statusCode).toBe(400);
    expect(resB.json().error.code).toBe('SUBMISSIONS_DISABLED');
  });

  // 7. Individual Submission
  it('7. Individual submission: associates with user registration and prevents duplicate submissions', async () => {
    const ts = Date.now();
    const [indivEvent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Indiv Project Event ${ts}`,
        slug: `indiv-proj-${ts}`,
        description: 'Individual competition',
        category: 'Science',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        registrationMode: 'INDIVIDUAL',
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: DEFAULT_SUBMISSION_FIELDS,
        },
        createdBy: organizer.id,
      })
      .returning();

    // Register
    await server.inject({
      method: 'POST',
      url: `/events/${indivEvent!.id}/registrations`,
      headers: { 'x-test-user-id': student1.id, 'cf-turnstile-response': 'test-pass' },
      payload: { answers: {} },
    });

    // Submit
    const res = await server.inject({
      method: 'POST',
      url: `/events/${indivEvent!.id}/submissions`,
      headers: { 'x-test-user-id': student1.id },
      payload: {
        projectTitle: 'Quantum Cryptography',
        abstract: 'Post-quantum key exchange for students',
        repoUrl: 'https://github.com/eventora/quantum-crypto',
      },
    });
    expect(res.statusCode).toBe(200);

    const [record] = await db
      .select()
      .from(projectSubmissions)
      .where(and(eq(projectSubmissions.eventId, indivEvent!.id), eq(projectSubmissions.userId, student1.id)));
    expect(record?.teamId).toBeNull();
    expect(record?.projectTitle).toBe('Quantum Cryptography');
  });

  // 8. Team Submission
  it('8. Team submission: associates with team, verifies membership, and synchronizes to team record', async () => {
    const ts = Date.now();
    const [teamEvent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Team Project Event ${ts}`,
        slug: `team-proj-${ts}`,
        description: 'Team project competition',
        category: 'Hackathon',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 3600000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        isCompetition: true,
        registrationMode: 'TEAM',
        minTeamSize: 1,
        maxTeamSize: 3,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: DEFAULT_SUBMISSION_FIELDS,
        },
        createdBy: organizer.id,
      })
      .returning();

    // Student 1 creates team
    const createTeamRes = await server.inject({
      method: 'POST',
      url: `/events/${teamEvent!.id}/teams`,
      headers: { 'x-test-user-id': student1.id },
      payload: { name: `Team Rocket ${ts}`, answers: {} },
    });
    expect(createTeamRes.statusCode).toBe(201);
    const teamId = createTeamRes.json().team.id;

    // Student 1 (team leader) submits deliverables
    const subRes = await server.inject({
      method: 'POST',
      url: `/events/${teamEvent!.id}/submissions`,
      headers: { 'x-test-user-id': student1.id },
      payload: {
        projectTitle: 'Team Rocket Launcher',
        abstract: 'Automated satellite tracking antenna',
        repoUrl: 'https://github.com/eventora/rocket-launcher',
      },
    });
    expect(subRes.statusCode).toBe(200);

    // Verify submission record has teamId
    const [record] = await db
      .select()
      .from(projectSubmissions)
      .where(and(eq(projectSubmissions.eventId, teamEvent!.id), eq(projectSubmissions.teamId, teamId)));
    expect(record?.teamId).toBe(teamId);
    expect(record?.projectTitle).toBe('Team Rocket Launcher');

    // Verify team table itself was synchronized
    const [teamRow] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(teamRow?.projectTitle).toBe('Team Rocket Launcher');
    expect(teamRow?.status).toBe('SUBMITTED');
  });

  // 9. Submission After Deadline
  it('9. Submission after deadline: rejected with 403 DEADLINE_PASSED', async () => {
    const ts = Date.now();
    const pastDeadline = new Date(ts - 3600000); // 1 hour ago
    const [expiredEvent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Expired Deadline Event ${ts}`,
        slug: `expired-deadline-${ts}`,
        description: 'Submissions are closed',
        category: 'Tech',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 86400000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        submissionDeadlineAt: pastDeadline,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          deadline: pastDeadline.toISOString(),
          allowEditAfterSubmission: true,
          fields: DEFAULT_SUBMISSION_FIELDS,
        },
        createdBy: organizer.id,
      })
      .returning();

    // Register student2
    await server.inject({
      method: 'POST',
      url: `/events/${expiredEvent!.id}/registrations`,
      headers: { 'x-test-user-id': student2.id, 'cf-turnstile-response': 'test-pass' },
      payload: { answers: {} },
    });

    // Attempting to submit after deadline
    const lateRes = await server.inject({
      method: 'POST',
      url: `/events/${expiredEvent!.id}/submissions`,
      headers: { 'x-test-user-id': student2.id },
      payload: {
        projectTitle: 'Too Late Project',
        abstract: 'Should be rejected',
        repoUrl: 'https://github.com/eventora/too-late',
      },
    });

    expect(lateRes.statusCode).toBe(403);
    expect(lateRes.json().error.code).toBe('DEADLINE_PASSED');
  });

  // 10. Editing an Existing Submission
  it('10. Editing an existing submission: updates persist when allowed, rejected when editing is disabled', async () => {
    const ts = Date.now();

    // Case A: allowEditAfterSubmission = true
    const [editableEvent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Editable Event ${ts}`,
        slug: `editable-event-${ts}`,
        description: 'Editing is permitted',
        category: 'Tech',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 86400000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: true,
          fields: DEFAULT_SUBMISSION_FIELDS,
        },
        createdBy: organizer.id,
      })
      .returning();

    await server.inject({
      method: 'POST',
      url: `/events/${editableEvent!.id}/registrations`,
      headers: { 'x-test-user-id': student1.id, 'cf-turnstile-response': 'test-pass' },
      payload: { answers: {} },
    });

    // First submission
    await server.inject({
      method: 'POST',
      url: `/events/${editableEvent!.id}/submissions`,
      headers: { 'x-test-user-id': student1.id },
      payload: {
        projectTitle: 'Initial Title',
        abstract: 'Initial Abstract',
        repoUrl: 'https://github.com/eventora/initial',
      },
    });

    // Edit submission
    const editRes = await server.inject({
      method: 'POST',
      url: `/events/${editableEvent!.id}/submissions`,
      headers: { 'x-test-user-id': student1.id },
      payload: {
        projectTitle: 'Updated & Polished Title',
        abstract: 'Updated abstract with benchmarks',
        repoUrl: 'https://github.com/eventora/initial',
      },
    });
    expect(editRes.statusCode).toBe(200);

    const [updatedRow] = await db
      .select()
      .from(projectSubmissions)
      .where(and(eq(projectSubmissions.eventId, editableEvent!.id), eq(projectSubmissions.userId, student1.id)));
    expect(updatedRow?.projectTitle).toBe('Updated & Polished Title');

    // Case B: allowEditAfterSubmission = false
    const [lockedEvent] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Locked Event ${ts}`,
        slug: `locked-event-${ts}`,
        description: 'Editing is forbidden once turned in',
        category: 'Tech',
        startAt: new Date(ts + 86400000),
        endAt: new Date(ts + 86400000 * 3),
        registrationOpensAt: new Date(ts - 86400000),
        registrationClosesAt: new Date(ts + 86400000),
        status: EventStatus.PUBLISHED,
        capacity: 50,
        remainingCapacity: 50,
        projectSubmissionConfig: {
          enabled: true,
          requirement: 'OPTIONAL',
          timing: 'AFTER_REGISTRATION',
          allowEditAfterSubmission: false,
          fields: DEFAULT_SUBMISSION_FIELDS,
        },
        createdBy: organizer.id,
      })
      .returning();

    await server.inject({
      method: 'POST',
      url: `/events/${lockedEvent!.id}/registrations`,
      headers: { 'x-test-user-id': student2.id, 'cf-turnstile-response': 'test-pass' },
      payload: { answers: {} },
    });

    // First submission
    const firstSub = await server.inject({
      method: 'POST',
      url: `/events/${lockedEvent!.id}/submissions`,
      headers: { 'x-test-user-id': student2.id },
      payload: {
        projectTitle: 'Final Submission v1',
        abstract: 'Locked in',
        repoUrl: 'https://github.com/eventora/final-v1',
      },
    });
    expect(firstSub.statusCode).toBe(200);

    // Second submission attempt must be rejected with 403 EDITING_NOT_ALLOWED
    const secondSub = await server.inject({
      method: 'POST',
      url: `/events/${lockedEvent!.id}/submissions`,
      headers: { 'x-test-user-id': student2.id },
      payload: {
        projectTitle: 'Attempted Modification',
        abstract: 'This must be rejected',
        repoUrl: 'https://github.com/eventora/final-v1',
      },
    });
    expect(secondSub.statusCode).toBe(403);
    expect(secondSub.json().error.code).toBe('EDITING_NOT_ALLOWED');
  });
});
