import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  ClubMemberRole,
  EventStatus,
  RegistrationStatus,
  TicketStatus,
  UserRole,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  budgetAllocations,
  certificates,
  clubMembers,
  clubs,
  eventResources,
  events,
  expenseItems,
  odLetters,
  registrations,
  reviews,
  tickets,
  users,
} from '../db/schema';
import { buildServer } from '../server';

const { PDFParse } = require('pdf-parse');

describe('Academic OD Letters, Verified Reviews, Public Verify, OG Cards, LinkedIn Share & Budget Ledger Suite', () => {
  const server = buildServer();

  let facultyUser: any;
  let otherFacultyUser: any;
  let organizerUser: any;
  let attendeeUser: any;
  let nonAttendeeUser: any;
  let testClub: any;
  let completedEvent: any;
  let futureEvent: any;
  let attendeeTicket: any;
  let nonAttendeeTicket: any;
  let issuedCertificate: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create Faculty User (assigned coordinator)
    const [fac] = await db
      .insert(users)
      .values({
        clerkId: `clerk_fac_${ts}`,
        email: `faculty_${ts}@eventora.edu`,
        fullName: 'Dr. Ramesh Sharma',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyUser = fac;

    // 2. Create Other Faculty User (unassigned)
    const [otherFac] = await db
      .insert(users)
      .values({
        clerkId: `clerk_other_fac_${ts}`,
        email: `other_faculty_${ts}@eventora.edu`,
        fullName: 'Prof. Sunita Rao',
        role: UserRole.FACULTY,
      })
      .returning();
    otherFacultyUser = otherFac;

    // 3. Create Organizer User
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_org_${ts}`,
        email: `org_${ts}@eventora.edu`,
        fullName: 'Alex Chen',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    // 4. Create Attendee User (checked in)
    const [att] = await db
      .insert(users)
      .values({
        clerkId: `clerk_att_${ts}`,
        email: `attendee_${ts}@eventora.edu`,
        fullName: 'Sai Kumar',
        rollNumber: `CS2026_${ts}`,
        department: 'Computer Science & Engineering',
        year: 3,
        role: UserRole.STUDENT,
      })
      .returning();
    attendeeUser = att;

    // 5. Create Non-Attendee User (not checked in)
    const [nonAtt] = await db
      .insert(users)
      .values({
        clerkId: `clerk_non_att_${ts}`,
        email: `non_attendee_${ts}@eventora.edu`,
        fullName: 'Priya Sharma',
        rollNumber: `EC2026_${ts}`,
        department: 'Electronics & Communication',
        year: 2,
        role: UserRole.STUDENT,
      })
      .returning();
    nonAttendeeUser = nonAtt;

    // 6. Create Club with assigned faculty coordinator
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Google Developer Student Club ${ts}`,
        slug: `gdsc-${ts}`,
        description: 'Technology and software development club',
        createdBy: organizerUser.id,
        facultyCoordinatorId: facultyUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values([
      {
        clubId: testClub.id,
        userId: organizerUser.id,
        role: ClubMemberRole.OWNER,
      },
    ]);

    // 7. Create Completed Event (ended 2 hours ago)
    const now = new Date();
    const [evCompleted] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Campus Hackathon 2026 ${ts}`,
        slug: `campus-hack-${ts}`,
        description: 'Premier campus hackathon',
        category: 'Hackathon',
        status: EventStatus.COMPLETED,
        startAt: new Date(now.getTime() - 7200000), // 2h ago
        endAt: new Date(now.getTime() - 3600000), // 1h ago
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() - 7200000),
        capacity: 100,
        remainingCapacity: 98,
        isPaid: false,
        createdBy: organizerUser.id,
      })
      .returning();
    completedEvent = evCompleted;

    // 8. Create Future Event (starts tomorrow)
    const [evFuture] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Future Tech Fest ${ts}`,
        slug: `future-fest-${ts}`,
        description: 'Upcoming technology symposium',
        category: 'Workshop',
        status: EventStatus.PUBLISHED,
        startAt: new Date(now.getTime() + 86400000),
        endAt: new Date(now.getTime() + 172800000),
        registrationOpensAt: new Date(now.getTime() - 3600000),
        registrationClosesAt: new Date(now.getTime() + 86400000),
        capacity: 50,
        remainingCapacity: 50,
        isPaid: false,
        createdBy: organizerUser.id,
      })
      .returning();
    futureEvent = evFuture;

    // 9. Setup Attendee: registration + valid ticket with check-in timestamp
    const [attReg] = await db
      .insert(registrations)
      .values({
        eventId: completedEvent.id,
        userId: attendeeUser.id,
        status: RegistrationStatus.CONFIRMED,
      })
      .returning();

    const [attTick] = await db
      .insert(tickets)
      .values({
        registrationId: attReg!.id,
        eventId: completedEvent.id,
        userId: attendeeUser.id,
        token: `ev_tok_${ts.toString(36).padEnd(25, 'x').slice(0, 25)}`,
        status: TicketStatus.CHECKED_IN,
        checkedInAt: new Date(now.getTime() - 5400000),
      })
      .returning();
    attendeeTicket = attTick;

    // 10. Setup Non-Attendee: registration + ticket without check-in timestamp
    const [nonAttReg] = await db
      .insert(registrations)
      .values({
        eventId: completedEvent.id,
        userId: nonAttendeeUser.id,
        status: RegistrationStatus.CONFIRMED,
      })
      .returning();

    const [nonAttTick] = await db
      .insert(tickets)
      .values({
        registrationId: nonAttReg!.id,
        eventId: completedEvent.id,
        userId: nonAttendeeUser.id,
        token: `ev_tok_${(ts + 1).toString(36).padEnd(25, 'y').slice(0, 25)}`,
        status: TicketStatus.VALID,
        checkedInAt: null,
      })
      .returning();
    nonAttendeeTicket = nonAttTick;

    // 11. Create Certificate for Attendee (WINNER, rank 1)
    const [cert] = await db
      .insert(certificates)
      .values({
        eventId: completedEvent.id,
        userId: attendeeUser.id,
        kind: 'WINNER',
        rank: 1,
        issuedAt: new Date(),
      })
      .returning();
    issuedCertificate = cert;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. On-Duty (OD) Sanction Letters', () => {
    let generatedOdLetter: any;

    it('rejects OD request for attendee who never checked in (403 NOT_CHECKED_IN)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${completedEvent.id}/od`,
        headers: { 'x-test-user-id': nonAttendeeUser.id },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('NOT_CHECKED_IN');
    });

    it('generates official OD letter for checked-in attendee with unique serial and HMAC signature', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${completedEvent.id}/od`,
        headers: { 'x-test-user-id': attendeeUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.serial).toMatch(/^OD-\d{4}-[A-F0-9]{8}$/);
      expect(body.letter).toBeDefined();
      expect(body.letter.signature).toBeDefined();
      expect(body.downloadUrl).toBe(`/od/${body.letter.id}.pdf`);
      generatedOdLetter = body.letter;
    });

    it('streams OD PDF buffer starting with %PDF and containing serial in text (pdf-parse)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/od/${generatedOdLetter.id}.pdf`,
        headers: { 'x-test-user-id': attendeeUser.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');

      const rawBuffer = res.rawPayload;
      // 1. Must start with %PDF
      const magic = rawBuffer.toString('utf8', 0, 4);
      expect(magic).toBe('%PDF');

      // 2. Parse text content using pdf-parse to verify serial and student details
      const parser = new PDFParse({ data: rawBuffer });
      const parsed = await parser.getText();
      expect(parsed.text).toContain(generatedOdLetter.serial);
      expect(parsed.text).toContain('OFFICIAL ON-DUTY (OD) ATTENDANCE SANCTION ORDER');
      expect(parsed.text).toContain('Sai Kumar');
    });

    it('verifies valid OD letter via public endpoint', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/public/verify/od/${generatedOdLetter.serial}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.valid).toBe(true);
      expect(body.serial).toBe(generatedOdLetter.serial);
      expect(body.studentName).toBe('Sai Kumar');
      expect(body.maskedRollNumber).toContain('****');
      expect(body.event.title).toBe(completedEvent.title);
    });

    it('tampering with the stored signature makes verification valid: false', async () => {
      // Tamper signature in database
      const originalSig = generatedOdLetter.signature;
      await db
        .update(odLetters)
        .set({ signature: 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678' })
        .where(eq(odLetters.id, generatedOdLetter.id));

      const res = await server.inject({
        method: 'GET',
        url: `/public/verify/od/${generatedOdLetter.serial}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.valid).toBe(false);

      // Restore original signature
      await db
        .update(odLetters)
        .set({ signature: originalSig })
        .where(eq(odLetters.id, generatedOdLetter.id));
    });
  });

  describe('2. Verified Attendee Reviews', () => {
    it('rejects reviews for a non-attendee (403 NOT_CHECKED_IN)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${completedEvent.id}/reviews`,
        headers: { 'x-test-user-id': nonAttendeeUser.id },
        payload: {
          stars: 5,
          comment: 'Could not attend but looks great!',
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('NOT_CHECKED_IN');
    });

    it('rejects review if event has not concluded yet', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${futureEvent.id}/reviews`,
        headers: { 'x-test-user-id': attendeeUser.id },
        payload: {
          stars: 5,
          comment: 'Looking forward to this!',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('accepts review from checked-in attendee with optional showName flag', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${completedEvent.id}/reviews`,
        headers: { 'x-test-user-id': attendeeUser.id },
        payload: {
          stars: 5,
          comment: 'Incredible hackathon! Well organized mentors and great food.',
          showName: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.review.verified).toBe(true);
      expect(body.review.stars).toBe(5);
    });

    it('returns aggregated reviews histogram, average, and comments on public route', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/public/events/${completedEvent.slug}/reviews`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.count).toBe(1);
      expect(body.average).toBe(5);
      expect(body.histogram['5']).toBe(1);
      expect(body.reviews[0].verified).toBe(true);
      expect(body.reviews[0].authorName).toBe('Sai Kumar');
    });

    it('allows updating review within 7-day window', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/events/${completedEvent.id}/reviews`,
        headers: { 'x-test-user-id': attendeeUser.id },
        payload: {
          stars: 4,
          comment: 'Updated review: Overall great, but air conditioning was a bit cold.',
          showName: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.updated).toBe(true);
      expect(body.review.stars).toBe(4);
    });
  });

  describe('3. Public Verification, OG Cards, LinkedIn Share & Passport', () => {
    it('publicly verifies certificate JSON by ID', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/public/verify/cert/${issuedCertificate.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(issuedCertificate.id);
      expect(body.holderName).toBe('Sai Kumar');
      expect(body.kind).toBe('WINNER');
      expect(body.rank).toBe(1);
      expect(body.event.title).toBe(completedEvent.title);
    });

    it('renders server-side OG HTML with four meta tags, absolute image URL, and redirect', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/og/cert/${issuedCertificate.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');

      const html = res.body;
      expect(html).toContain('<meta property="og:title"');
      expect(html).toContain('<meta property="og:description"');
      expect(html).toContain('<meta property="og:image"');
      expect(html).toContain('<meta property="og:url"');
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
      expect(html).toMatch(/content="https?:\/\/[^"]+\/og\/cert\/[^"]+\.png"/);
      expect(html).toContain('window.location.replace(');
    });

    it('serves dynamic OG PNG with exact 1200x630 dimensions and Cache-Control header', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/og/cert/${issuedCertificate.id}.png`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('public, max-age=86400');

      const raw = res.rawPayload;
      // PNG magic number check
      expect(raw[0]).toBe(0x89);
      expect(raw[1]).toBe(0x50);
      expect(raw[2]).toBe(0x4e);
      expect(raw[3]).toBe(0x47);

      // Width and Height in IHDR chunk
      const width = raw.readUInt32BE(16);
      const height = raw.readUInt32BE(20);
      expect(width).toBe(1200);
      expect(height).toBe(630);
    });

    it('generates LinkedIn share payload with encoded URL, caption, and hashtags', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/certificates/${issuedCertificate.id}/share`,
        headers: { 'x-test-user-id': attendeeUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.linkedinUrl).toContain('https://www.linkedin.com/sharing/share-offsite/?url=');
      expect(body.caption).toContain('Excited to share that I won 1st place at');
      expect(body.caption).toContain('Verified on Eventora');
      expect(body.hashtags).toContain('#Eventora #CampusLife #');
    });

    it('manages event resource vault restricted to checked-in attendees', async () => {
      // 1. Organizer uploads resource
      const createRes = await server.inject({
        method: 'POST',
        url: `/events/${completedEvent.id}/resources`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Official Hackathon Slide Deck',
          kind: 'SLIDES',
          url: 'https://slides.eventora.edu/hackcampus2026.pdf',
        },
      });

      expect(createRes.statusCode).toBe(201);

      // 2. Non-attendee is rejected (403 NOT_CHECKED_IN)
      const rejectRes = await server.inject({
        method: 'GET',
        url: `/events/${completedEvent.id}/resources`,
        headers: { 'x-test-user-id': nonAttendeeUser.id },
      });

      expect(rejectRes.statusCode).toBe(403);
      expect(JSON.parse(rejectRes.body).error.code).toBe('NOT_CHECKED_IN');

      // 3. Checked-in attendee can access resources (200)
      const accessRes = await server.inject({
        method: 'GET',
        url: `/events/${completedEvent.id}/resources`,
        headers: { 'x-test-user-id': attendeeUser.id },
      });

      expect(accessRes.statusCode).toBe(200);
      const body = JSON.parse(accessRes.body);
      expect(body.resources.length).toBeGreaterThanOrEqual(1);
      expect(body.resources[0].title).toBe('Official Hackathon Slide Deck');
    });

    it('returns complete passport for checked-in attendee', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/me/passport',
        headers: { 'x-test-user-id': attendeeUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.passport.length).toBeGreaterThanOrEqual(1);

      const entry = body.passport.find((p: any) => p.event.id === completedEvent.id);
      expect(entry).toBeDefined();
      expect(entry.ticket).toBeDefined();
      expect(entry.certificate).toBeDefined();
      expect(entry.certificate.rank).toBe(1);
      expect(entry.odLetter).toBeDefined();
      expect(entry.review).toBeDefined();
      expect(entry.resources.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Club Budget Ledger & Faculty Sign-Off', () => {
    let allocation: any;
    let expense: any;

    it('creates club budget allocation', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/allocations`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          title: 'Hackathon Hackathon Prizes & Swag',
          category: 'PRIZES',
          allocatedPaise: 500000, // 5,000 INR
          note: 'Allocated for top 3 teams and participant t-shirts',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.allocation.allocatedPaise).toBe(500000);
      expect(body.allocation.spentPaise).toBe(0);
      allocation = body.allocation;
    });

    it('returns club budget overview with category breakdowns', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/budget`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalAllocatedPaise).toBe(500000);
      expect(body.totalSpentPaise).toBe(0);
      expect(body.totalRemainingPaise).toBe(500000);
      expect(body.categories['PRIZES'].allocatedPaise).toBe(500000);
    });

    it('records expense and atomically increments spentPaise', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/allocations/${allocation.id}/expenses`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          amountPaise: 200000, // 2,000 INR
          category: 'PRIZES',
          description: '1st place trophy and cash grant',
          receiptKey: 'receipts/2026/10/prize1.pdf',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.expense.amountPaise).toBe(200000);
      expect(body.allocation.spentPaise).toBe(200000);
      expense = body.expense;
    });

    it('rejects expense that would exceed the allocation (422 OVER_BUDGET)', async () => {
      // Remaining is 300,000 paise (500,000 - 200,000); attempting 400,000 paise
      const res = await server.inject({
        method: 'POST',
        url: `/allocations/${allocation.id}/expenses`,
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          amountPaise: 400000,
          category: 'PRIZES',
          description: 'Excessive prize expenditure',
          receiptKey: 'receipts/2026/10/excess.pdf',
        },
      });

      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('OVER_BUDGET');
    });

    it('rejects sign-off from unauthorized users or unassigned faculty', async () => {
      // Student attendee attempt
      const studentRes = await server.inject({
        method: 'POST',
        url: `/expenses/${expense.id}/sign-off`,
        headers: { 'x-test-user-id': attendeeUser.id },
      });
      expect(studentRes.statusCode).toBe(403);

      // Unassigned faculty attempt
      const otherFacRes = await server.inject({
        method: 'POST',
        url: `/expenses/${expense.id}/sign-off`,
        headers: { 'x-test-user-id': otherFacultyUser.id },
      });
      expect(otherFacRes.statusCode).toBe(403);
    });

    it('stamps sign-off when approved by the club faculty coordinator', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/expenses/${expense.id}/sign-off`,
        headers: { 'x-test-user-id': facultyUser.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.expense.signedOffBy).toBe(facultyUser.id);
      expect(body.expense.signedOffAt).toBeDefined();
    });

    it('blocks subsequent sign-off or edits on signed-off expenses (immutability)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/expenses/${expense.id}/sign-off`,
        headers: { 'x-test-user-id': facultyUser.id },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('CONFLICT');
    });

    it('exports budget ledger as CSV format', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/budget/export.csv`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const csv = res.body;
      expect(csv).toContain('Allocation ID,Allocation Title,Category,Allocated (INR)');
      expect(csv).toContain('5000.00');
      expect(csv).toContain('2000.00');
      expect(csv).toContain('1st place trophy and cash grant');
    });

    it('enforces object-level authorization on club budget routes (403 for non-organizer students)', async () => {
      // 1. GET /clubs/:id/budget
      const getRes = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/budget`,
        headers: { 'x-test-user-id': attendeeUser.id },
      });
      expect(getRes.statusCode).toBe(403);

      // 2. POST /clubs/:id/allocations
      const postAllocRes = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/allocations`,
        headers: { 'x-test-user-id': attendeeUser.id },
        payload: {
          category: 'Unauthorized',
          allocatedPaise: 50000,
        },
      });
      expect(postAllocRes.statusCode).toBe(403);

      // 3. POST /allocations/:id/expenses
      const postExpRes = await server.inject({
        method: 'POST',
        url: `/allocations/${allocation.id}/expenses`,
        headers: { 'x-test-user-id': attendeeUser.id },
        payload: {
          category: 'Unauthorized',
          amountPaise: 10000,
          description: 'Attacker expense',
          receiptKey: 'test_key',
        },
      });
      expect(postExpRes.statusCode).toBe(403);

      // 4. GET /clubs/:id/budget/export.csv
      const exportRes = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/budget/export.csv`,
        headers: { 'x-test-user-id': attendeeUser.id },
      });
      expect(exportRes.statusCode).toBe(403);
    });

    it('enforces cross-club isolation: organizers of other clubs cannot access or modify budget (403)', async () => {
      const ts = Date.now();
      const [otherOrganizer] = await db
        .insert(users)
        .values({
          clerkId: `clerk_other_org_${ts}`,
          email: `other_org_${ts}@eventora.edu`,
          fullName: 'Other Club Organizer',
          role: UserRole.ORGANIZER,
        })
        .returning();

      // Cross-club budget overview
      const getRes = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/budget`,
        headers: { 'x-test-user-id': otherOrganizer!.id },
      });
      expect(getRes.statusCode).toBe(403);

      // Cross-club allocation creation
      const postAllocRes = await server.inject({
        method: 'POST',
        url: `/clubs/${testClub.id}/allocations`,
        headers: { 'x-test-user-id': otherOrganizer!.id },
        payload: {
          category: 'Unauthorized Hack',
          allocatedPaise: 50000,
        },
      });
      expect(postAllocRes.statusCode).toBe(403);

      // Cross-club expense addition
      const postExpRes = await server.inject({
        method: 'POST',
        url: `/allocations/${allocation.id}/expenses`,
        headers: { 'x-test-user-id': otherOrganizer!.id },
        payload: {
          category: 'Unauthorized Expense',
          amountPaise: 10000,
          description: 'Cross-club expense attack',
          receiptKey: 'test_key',
        },
      });
      expect(postExpRes.statusCode).toBe(403);
    });
  });
});
