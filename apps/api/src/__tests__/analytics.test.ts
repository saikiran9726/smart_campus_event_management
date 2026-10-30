import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import {
  ClubMemberRole,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  TicketStatus,
  UserRole,
} from '@eventora/shared';
import { db, pool } from '../db/client';
import {
  accreditationReports,
  budgetAllocations,
  certificates,
  clubMembers,
  clubs,
  eventResources,
  events,
  expenseItems,
  ledgerEntries,
  odLetters,
  payments,
  registrations,
  reviews,
  scanLogs,
  teamMembers,
  teams,
  ticketRedemptions,
  tickets,
  users,
  waitlistEntries,
  winners,
} from '../db/schema';
import { buildServer } from '../server';

describe('Analytics, Macro Trends, & NAAC/NBA Report Engine Suite', () => {
  const server = buildServer();

  let facultyUser: any;
  let adminUser: any;
  let organizerUser: any;
  let studentUser: any;
  let testClub: any;
  let testEvent: any;
  let largePerfEvent: any;
  let generatedReportSerial: string;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();

    // 1. Create Core Users
    const [fac] = await db
      .insert(users)
      .values({
        clerkId: `clerk_an_fac_${ts}`,
        email: `an_faculty_${ts}@eventora.edu`,
        fullName: 'Dr. Anand Verma',
        role: UserRole.FACULTY,
      })
      .returning();
    facultyUser = fac;

    const [adm] = await db
      .insert(users)
      .values({
        clerkId: `clerk_an_adm_${ts}`,
        email: `an_admin_${ts}@eventora.edu`,
        fullName: 'Campus Administrator',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = adm;

    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_an_org_${ts}`,
        email: `an_org_${ts}@eventora.edu`,
        fullName: 'Organizer Lead',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [stu] = await db
      .insert(users)
      .values({
        clerkId: `clerk_an_stu_${ts}`,
        email: `an_stu_${ts}@eventora.edu`,
        fullName: 'Regular Student',
        role: UserRole.STUDENT,
      })
      .returning();
    studentUser = stu;

    // 2. Create Club
    const [club] = await db
      .insert(clubs)
      .values({
        name: `Analytics Tech Club ${ts}`,
        slug: `an-club-${ts}`,
        description: 'Premier data science and co-curricular student chapter',
        createdBy: organizerUser.id,
        facultyCoordinatorId: facultyUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.OWNER,
    });

    // 3. Create Event (Competition, Capacity 100)
    const now = new Date();
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `National Data Hackathon ${ts}`,
        slug: `data-hack-${ts}`,
        description: 'Comprehensive 48h data competition',
        category: 'Hackathon',
        status: EventStatus.COMPLETED,
        startAt: new Date(now.getTime() - 86400000), // yesterday
        endAt: new Date(now.getTime() - 3600000), // 1h ago
        registrationOpensAt: new Date(now.getTime() - 172800000),
        registrationClosesAt: new Date(now.getTime() - 86400000),
        capacity: 100,
        remainingCapacity: 50,
        isPaid: true,
        isCompetition: true,
        createdBy: organizerUser.id,
      })
      .returning();
    testEvent = ev;

    // 4. Seed Deterministic Dataset:
    // Exactly 50 registered (40 check-ins + 6 no-shows + 4 confirmed un-checked),
    // 2 cancellations,
    // 40 check-ins, 6 no-shows, 3 duplicate scans, 20 meals, 10 kits, 2 spot walkins
    // Demographics: CS: 30, EC: 15, ME: 3, Civil: 2 (Civil < 3 -> suppressed!)

    // Create 50 students with specific departments
    const studentIds: string[] = [];
    const depts = [
      ...Array(30).fill({ dept: 'Computer Science', year: 3 }),
      ...Array(15).fill({ dept: 'Electronics', year: 2 }),
      ...Array(3).fill({ dept: 'Mechanical', year: 4 }),
      ...Array(2).fill({ dept: 'Civil', year: 1 }),
    ];

    for (let i = 0; i < 50; i++) {
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_st_${ts}_${i}`,
          email: `student_${ts}_${i}@eventora.edu`,
          fullName: `Attendee Student ${i}`,
          department: depts[i].dept,
          year: depts[i].year,
          role: UserRole.STUDENT,
        })
        .returning();
      studentIds.push(u!.id);
    }

    // 4a. 40 Checked-in attendees
    const checkInStartTime = new Date(now.getTime() - 7200000); // 2 hours ago
    const checkInTickets: any[] = [];

    for (let i = 0; i < 40; i++) {
      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: testEvent.id,
          userId: studentIds[i]!,
          status: RegistrationStatus.CONFIRMED,
        })
        .returning();

      // Distribute check-in timestamps across 5-minute bins
      const checkInOffsetMs = (i % 8) * 5 * 60 * 1000;
      const checkedInAt = new Date(checkInStartTime.getTime() + checkInOffsetMs);
      const isSpotWalkin = i < 2; // First 2 are spot walk-ins

      const [ticket] = await db
        .insert(tickets)
        .values({
          registrationId: reg!.id,
          eventId: testEvent.id,
          userId: studentIds[i]!,
          token: `ev_tok_${ts}_${i.toString().padStart(4, '0')}`.slice(0, 32).padEnd(32, 'a'),
          status: TicketStatus.CHECKED_IN,
          checkedInAt,
          checkedInVia: isSpotWalkin ? 'SPOT_WALKIN' : 'SCANNER',
        })
        .returning();
      checkInTickets.push(ticket!);

      // Log GREEN scan for check-in
      await db.insert(scanLogs).values({
        eventId: testEvent.id,
        tokenPrefixHash: `hash_green_${i}`,
        mode: 'GATE' as any,
        result: 'GREEN' as any,
        ticketId: ticket!.id,
        scannedAt: checkedInAt,
      });
    }

    // 4b. 3 Duplicate Scan Attempts (RED scans against existing tickets)
    for (let i = 0; i < 3; i++) {
      await db.insert(scanLogs).values({
        eventId: testEvent.id,
        tokenPrefixHash: `hash_dup_${i}`,
        mode: 'GATE' as any,
        result: 'RED' as any,
        ticketId: checkInTickets[i]!.id,
        scannedAt: new Date(checkInStartTime.getTime() + 60000),
      });
    }

    // 2 YELLOW scans (e.g. invalid gate or premature scan)
    for (let i = 0; i < 2; i++) {
      await db.insert(scanLogs).values({
        eventId: testEvent.id,
        tokenPrefixHash: `hash_yel_${i}`,
        mode: 'GATE' as any,
        result: 'YELLOW' as any,
        ticketId: null,
        scannedAt: new Date(checkInStartTime.getTime() + 120000),
      });
    }

    // 4c. 20 Meal redemptions & 10 Kit redemptions
    for (let i = 0; i < 20; i++) {
      await db.insert(ticketRedemptions).values({
        ticketId: checkInTickets[i]!.id,
        kind: 'MEAL' as any,
        redeemedAt: new Date(checkInStartTime.getTime() + 1800000),
      });
    }
    for (let i = 0; i < 10; i++) {
      await db.insert(ticketRedemptions).values({
        ticketId: checkInTickets[i]!.id,
        kind: 'KIT' as any,
        redeemedAt: new Date(checkInStartTime.getTime() + 1200000),
      });
    }

    // 4d. 6 NO_SHOW registrations
    for (let i = 40; i < 46; i++) {
      await db.insert(registrations).values({
        eventId: testEvent.id,
        userId: studentIds[i]!,
        status: RegistrationStatus.NO_SHOW,
      });
    }

    // 4e. 4 CONFIRMED registrations (did not check in)
    for (let i = 46; i < 50; i++) {
      await db.insert(registrations).values({
        eventId: testEvent.id,
        userId: studentIds[i]!,
        status: RegistrationStatus.CONFIRMED,
      });
    }

    // 4f. 2 CANCELLED registrations
    for (let i = 0; i < 2; i++) {
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_canc_${ts}_${i}`,
          email: `cancelled_${ts}_${i}@eventora.edu`,
          fullName: `Cancelled User ${i}`,
          role: UserRole.STUDENT,
        })
        .returning();

      await db.insert(registrations).values({
        eventId: testEvent.id,
        userId: u!.id,
        status: RegistrationStatus.CANCELLED,
      });
    }

    // 4g. Waitlist: 3 QUEUED, 1 CLAIMED, 1 EXPIRED
    for (let i = 0; i < 5; i++) {
      const [u] = await db
        .insert(users)
        .values({
          clerkId: `clerk_wl_${ts}_${i}`,
          email: `wl_${ts}_${i}@eventora.edu`,
          fullName: `Waitlist User ${i}`,
          role: UserRole.STUDENT,
        })
        .returning();

      const [reg] = await db
        .insert(registrations)
        .values({
          eventId: testEvent.id,
          userId: u!.id,
          status: RegistrationStatus.WAITLISTED,
        })
        .returning();

      const wlStatus = i < 3 ? 'QUEUED' : i === 3 ? 'CLAIMED' : 'EXPIRED';
      await db.insert(waitlistEntries).values({
        eventId: testEvent.id,
        userId: u!.id,
        registrationId: reg!.id,
        status: wlStatus,
      });
    }

    // 4h. Reviews: exactly 4 reviews: 5, 5, 4, 4 -> count: 4, avg: 4.5
    const reviewStars = [5, 5, 4, 4];
    for (let i = 0; i < 4; i++) {
      await db.insert(reviews).values({
        eventId: testEvent.id,
        userId: studentIds[i]!,
        stars: reviewStars[i]!,
        comment: `Excellent review #${i}`,
        verified: true,
      });
    }

    // 4i. Sandbox Payments & Ledger:
    // 10 charges of 10,000 paise (₹100) = 100,000 paise gross
    // 1 refund of 10,000 paise = 10,000 paise refund
    // Net = 90,000 paise
    for (let i = 0; i < 10; i++) {
      const [reg] = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, testEvent.id),
            eq(registrations.userId, studentIds[i]!)
          )
        )
        .limit(1);

      const [pay] = await db
        .insert(payments)
        .values({
          registrationId: reg!.id,
          provider: 'SANDBOX',
          providerRef: `pay_ref_${ts}_${i}`,
          amountPaise: 10000,
          status: PaymentStatus.SUCCEEDED,
        })
        .returning();

      await db.insert(ledgerEntries).values({
        paymentId: pay!.id,
        kind: 'CHARGE',
        amountPaise: 10000,
        balanceAfterPaise: 10000 * (i + 1),
      });

      if (i === 9) {
        // Issue 1 refund
        await db.insert(ledgerEntries).values({
          paymentId: pay!.id,
          kind: 'REFUND',
          amountPaise: 10000,
          balanceAfterPaise: 90000,
        });
      }
    }

    // 4j. Teams: 10 teams, 25 members (avgSize 2.5), 6 submitted (submissionsRate 60.0%)
    for (let tIdx = 0; tIdx < 10; tIdx++) {
      const leader = studentIds[tIdx]!;
      const isSubmitted = tIdx < 6;
      const [team] = await db
        .insert(teams)
        .values({
          eventId: testEvent.id,
          name: `Team Alpha ${ts}_${tIdx}`,
          leaderId: leader,
          inviteCode: `TM${tIdx.toString().padStart(4, '0')}`,
          projectTitle: isSubmitted ? `Project ${tIdx}` : null,
          submittedAt: isSubmitted ? new Date() : null,
        })
        .returning();

      // Leader member
      await db.insert(teamMembers).values({
        teamId: team!.id,
        userId: leader,
        eventId: testEvent.id,
        role: 'LEADER',
      });

      // 5 teams get 2 extra members (total 3), 5 teams get 1 extra member (total 2) -> total 25 members
      const extraCount = tIdx < 5 ? 2 : 1;
      for (let m = 0; m < extraCount; m++) {
        const memberUser = studentIds[10 + tIdx * 2 + m];
        if (memberUser) {
          await db.insert(teamMembers).values({
            teamId: team!.id,
            userId: memberUser,
            eventId: testEvent.id,
            role: 'MEMBER',
          });
        }
      }
    }

    // 4k. NAAC report supporting items: Budget allocations, expenses, receipts, winners, certificates, OD letters
    const [alloc] = await db
      .insert(budgetAllocations)
      .values({
        clubId: testClub.id,
        eventId: testEvent.id,
        title: 'Hackathon Operations & Prizes',
        category: 'PRIZES',
        allocatedPaise: 400000,
        spentPaise: 250000,
      })
      .returning();

    await db.insert(expenseItems).values({
      allocationId: alloc!.id,
      category: 'PRIZES',
      description: 'First prize grant award',
      amountPaise: 250000,
      receiptKey: 'receipts/first-prize-cheque.pdf',
    });

    await db.insert(winners).values({
      eventId: testEvent.id,
      rank: 1,
    });

    await db.insert(certificates).values({
      eventId: testEvent.id,
      userId: studentIds[0]!,
      kind: 'WINNER',
      rank: 1,
    });

    await db.insert(odLetters).values({
      eventId: testEvent.id,
      userId: studentIds[0]!,
      serial: `OD-${ts.toString().slice(-4)}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      signature: 'signature-digest-mock-12345678',
      issuedAt: new Date(),
    });

    await db.insert(eventResources).values({
      eventId: testEvent.id,
      title: 'Workshop Slides & Github Repo',
      kind: 'SLIDES',
      url: 'https://github.com/eventora/data-hack-2026',
    });

    // 5. Large Event for Performance Testing: 5,000 registrations & tickets
    const [perfEv] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Mega Campus TechFest 5K ${ts}`,
        slug: `techfest-5k-${ts}`,
        description: 'Large scale load test event',
        category: 'Fest',
        status: EventStatus.COMPLETED,
        startAt: new Date(now.getTime() - 86400000),
        endAt: new Date(now.getTime() - 3600000),
        registrationOpensAt: new Date(now.getTime() - 172800000),
        registrationClosesAt: new Date(now.getTime() - 86400000),
        capacity: 10000,
        remainingCapacity: 5000,
        isPaid: false,
        createdBy: organizerUser.id,
      })
      .returning();
    largePerfEvent = perfEv;

    // Fast batch seed 5,000 registrations and tickets directly via PostgreSQL generate_series
    await pool.query(
      `WITH inserted_users AS (
         INSERT INTO users (id, clerk_id, email, full_name, role)
         SELECT
           gen_random_uuid(),
           'clerk_perf_' || n || '_' || $2,
           'perf_' || n || '_' || $2 || '@eventora.edu',
           'Perf User ' || n,
           'STUDENT'
         FROM generate_series(1, 5000) n
         RETURNING id
       ),
       inserted_regs AS (
         INSERT INTO registrations (id, event_id, user_id, status, created_at)
         SELECT
           gen_random_uuid(),
           $1,
           u.id,
           'CONFIRMED',
           NOW() - (random() * 3600 || ' seconds')::interval
         FROM inserted_users u
         RETURNING id, event_id, user_id
       )
       INSERT INTO tickets (id, registration_id, event_id, user_id, token, status, checked_in_at, created_at)
       SELECT
         gen_random_uuid(),
         r.id,
         r.event_id,
         r.user_id,
         'ev_tok_' || substring(md5(random()::text) from 1 for 25),
         'CHECKED_IN',
         NOW() - (random() * 3600 || ' seconds')::interval,
         NOW()
       FROM inserted_regs r`,
      [largePerfEvent.id, ts]
    );
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Post-Mortem Event Analytics (Pure SQL Aggregates)', () => {
    it('returns exact deterministic numbers for funnel, arrival curve, scans, redemptions & teams', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/analytics`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      // Funnel
      expect(data.funnel.registered).toBe(50);
      expect(data.funnel.checkedIn).toBe(40);
      expect(data.funnel.conversionRate).toBe(80.0);
      expect(data.funnel.noShowCount).toBe(6);
      expect(data.funnel.cancellations).toBe(2);
      expect(data.funnel.waitlisted).toBe(3);
      expect(data.funnel.promotionsClaimed).toBe(1);
      expect(data.funnel.promotionsExpired).toBe(1);

      // Arrival Curve
      expect(data.arrivalCurve.buckets.length).toBeGreaterThan(0);
      expect(data.arrivalCurve.peakBucket).toBeDefined();
      expect(data.arrivalCurve.peakBucket.count).toBeGreaterThan(0);

      // Scan Stats & Duplicate Attempts
      expect(data.scanStats.green).toBe(40);
      expect(data.scanStats.red).toBe(3);
      expect(data.scanStats.yellow).toBe(2);
      expect(data.scanStats.duplicateAttempts).toBe(3);

      // Redemptions
      expect(data.redemptions.meals).toBe(20);
      expect(data.redemptions.kits).toBe(10);
      expect(data.redemptions.mealsPercentage).toBe(50.0);
      expect(data.redemptions.kitsPercentage).toBe(25.0);

      // Spot Walk-ins
      expect(data.spotWalkins).toBe(2);

      // Reviews
      expect(data.reviews.count).toBe(4);
      expect(data.reviews.average).toBe(4.5);
      expect(data.reviews.histogram['5']).toBe(2);
      expect(data.reviews.histogram['4']).toBe(2);

      // Revenue Sandbox
      expect(data.revenueSandbox.isSandbox).toBe(true);
      expect(data.revenueSandbox.grossPaise).toBe(100000);
      expect(data.revenueSandbox.refundsPaise).toBe(10000);
      expect(data.revenueSandbox.netPaise).toBe(90000);

      // Capacity & Utilisation
      expect(data.capacity.capacity).toBe(100);
      expect(data.capacity.finalUtilisation).toBe(40.0);

      // Teams (Competition)
      expect(data.teams).toBeDefined();
      expect(data.teams.teamCount).toBe(10);
      expect(data.teams.averageSize).toBe(2.5);
      expect(data.teams.submissionsRate).toBe(60.0);
    });

    it('suppresses demographic buckets with fewer than 3 attendees for privacy', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/analytics`,
        headers: { 'x-test-user-id': facultyUser.id },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      const buckets = data.demographics.buckets;

      // Computer Science (30), Electronics (15), Mechanical (3) must be present
      const cs = buckets.find((b: any) => b.department === 'Computer Science');
      expect(cs).toBeDefined();
      expect(cs.count).toBe(30);

      const ec = buckets.find((b: any) => b.department === 'Electronics');
      expect(ec).toBeDefined();
      expect(ec.count).toBe(15);

      const me = buckets.find((b: any) => b.department === 'Mechanical');
      expect(me).toBeDefined();
      expect(me.count).toBe(3);

      // Civil has only 2 people: must be suppressed from buckets
      const civil = buckets.find((b: any) => b.department === 'Civil');
      expect(civil).toBeUndefined();
      expect(data.demographics.suppressedCount).toBe(2);
    });

    it('rejects regular students with 403 Forbidden', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/events/${testEvent.id}/analytics`,
        headers: { 'x-test-user-id': studentUser.id },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Historical Club Trends & Campus Macro Analytics', () => {
    it('returns historical trends per event for a club', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/analytics/trends`,
        headers: { 'x-test-user-id': facultyUser.id },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.clubId).toBe(testClub.id);
      expect(data.events.length).toBeGreaterThan(0);

      const ev = data.events.find((e: any) => e.eventId === testEvent.id);
      expect(ev).toBeDefined();
      expect(ev.registrations).toBe(50);
      expect(ev.checkedIn).toBe(40);
      expect(ev.attendanceRate).toBe(80.0);
      expect(ev.noShowRate).toBe(20.0);
    });

    it('returns campus-wide analytics for administrators only', async () => {
      // 1. Student access rejected
      const stuRes = await server.inject({
        method: 'GET',
        url: '/admin/analytics/campus',
        headers: { 'x-test-user-id': studentUser.id },
      });
      expect(stuRes.statusCode).toBe(403);

      // 2. Admin access accepted
      const admRes = await server.inject({
        method: 'GET',
        url: '/admin/analytics/campus',
        headers: { 'x-test-user-id': adminUser.id },
      });
      expect(admRes.statusCode).toBe(200);
      const body = JSON.parse(admRes.body);
      expect(body.overview.totalClubs).toBeGreaterThan(0);
      expect(body.overview.totalEvents).toBeGreaterThan(0);
      expect(body.clubs.length).toBeGreaterThan(0);
      expect(body.topEvents.length).toBeGreaterThan(0);
    });
  });

  describe('3. NAAC/NBA Accreditation Report Export (PDF, CSV, XLSX)', () => {
    it('rejects unauthorized students with 403 Forbidden', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/reports/naac?format=pdf`,
        headers: { 'x-test-user-id': studentUser.id },
      });

      expect(res.statusCode).toBe(403);
    });

    it('generates A4 PDF report starting with %PDF and containing signature serial', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/reports/naac?format=pdf`,
        headers: { 'x-test-user-id': facultyUser.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="NAAC-Report-.*\.pdf"/);

      const raw = res.rawPayload;
      expect(raw.toString('utf8', 0, 4)).toBe('%PDF');

      // Extract serial from content-disposition
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/NAAC-\d{4}-[A-F0-9]{8}/);
      expect(match).not.toBeNull();
      generatedReportSerial = match![0];
    });

    it('generates multi-section CSV report with expected headers', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/reports/naac?format=csv`,
        headers: { 'x-test-user-id': organizerUser.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const csv = res.body;

      expect(csv).toContain('=== SECTION A: INSTITUTIONAL & RECOGNISED ENTITY DETAILS ===');
      expect(csv).toContain('=== SECTION B: TABLE OF EVENTS ===');
      expect(csv).toContain('Event ID,Title,Start Time (IST),Venue,Category,Level,Registered,Attended,Attendance Rate (%),Budget Allocated (INR),Budget Spent (INR)');
      expect(csv).toContain('=== SECTION C: PARTICIPATION BY DEPARTMENT AND YEAR ===');
      expect(csv).toContain('=== SECTION D: OUTCOMES & RECOGNITION ===');
      expect(csv).toContain('=== SECTION E: DOCUMENTARY EVIDENCE ===');
      expect(csv).toContain('=== SECTION F: ATTESTATION ===');
      expect(csv).toContain('Report Serial,NAAC-');
    });

    it('generates multi-sheet XLSX report with frozen headers per section', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/clubs/${testClub.id}/reports/naac?format=xlsx`,
        headers: { 'x-test-user-id': facultyUser.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      // Parse with exceljs to verify sheets and frozen header views
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.rawPayload as any);

      expect(workbook.worksheets.length).toBe(6);
      const sheetNames = workbook.worksheets.map((s) => s.name);
      expect(sheetNames).toContain('Section A - Overview');
      expect(sheetNames).toContain('Section B - Events');
      expect(sheetNames).toContain('Section C - Demographics');
      expect(sheetNames).toContain('Section D - Outcomes');
      expect(sheetNames).toContain('Section E - Evidence');
      expect(sheetNames).toContain('Section F - Attestation');

      // Check frozen header view on Section B
      const sheetB = workbook.getWorksheet('Section B - Events');
      expect(sheetB).toBeDefined();
      expect(sheetB!.views).toBeDefined();
      expect((sheetB!.views![0] as any).ySplit).toBe(1);
    });

    it('publicly verifies the generated accreditation report serial', async () => {
      expect(generatedReportSerial).toBeDefined();

      const res = await server.inject({
        method: 'GET',
        url: `/public/verify/report/${generatedReportSerial}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.valid).toBe(true);
      expect(body.serial).toBe(generatedReportSerial);
      expect(body.club.name).toBe(testClub.name);
      expect(body.eventCount).toBeGreaterThanOrEqual(1);
      expect(body.generatedAt).toBeDefined();
    });
  });

  describe('4. Performance Requirement: 5,000 Seeded Registrations Respond in < 300ms', () => {
    it('executes full post-mortem analytics on 5,000 registrations in under 300ms', async () => {
      const start = Date.now();
      const res = await server.inject({
        method: 'GET',
        url: `/events/${largePerfEvent.id}/analytics`,
        headers: { 'x-test-user-id': organizerUser.id },
      });
      const durationMs = Date.now() - start;

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.funnel.registered).toBe(5000);
      expect(data.funnel.checkedIn).toBe(5000);

      console.log(`[Performance Benchmark] 5,000 registrations analytics query response time: ${durationMs}ms`);
      expect(durationMs).toBeLessThan(300);
    });
  });
});
