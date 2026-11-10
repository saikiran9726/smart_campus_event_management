import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClubMemberRole, EventStatus, RegistrationStatus, TicketStatus, UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { auditLogs, clubMembers, clubs, events, registrations, tickets, users } from '../db/schema';
import { buildServer } from '../server';

describe('Area 3: Organiser Participants, Attendance, and Exports', () => {
  const server = buildServer();
  const ts = Date.now();

  let adminUser: any;
  let clubOwner: any;
  let regularStudent: any;
  let testClub: any;
  let testEvent: any;
  let studentAttended: any;
  let studentNoShow: any;

  beforeAll(async () => {
    await server.ready();

    // 1. Admin user
    const [admin] = await db
      .insert(users)
      .values({
        clerkId: `clerk_admin_pt_${ts}`,
        email: `admin_pt_${ts}@campus.edu`,
        fullName: 'Admin User',
        role: UserRole.ADMIN,
      })
      .returning();
    adminUser = admin;

    // 2. Club Owner
    const [owner] = await db
      .insert(users)
      .values({
        clerkId: `clerk_owner_pt_${ts}`,
        email: `owner_pt_${ts}@campus.edu`,
        fullName: 'Club Lead Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    clubOwner = owner;

    // 3. Regular student (unauthorized)
    const [student] = await db
      .insert(users)
      .values({
        clerkId: `clerk_std_pt_${ts}`,
        email: `std_pt_${ts}@campus.edu`,
        fullName: 'Regular Student',
        role: UserRole.STUDENT,
      })
      .returning();
    regularStudent = student;

    const testRollFormula = `+9199${ts % 100000}`;
    const testRollNoShow = `21CS${ts % 100000}`;

    // 4. Attended student (with formula test in name)
    const [stdAttended] = await db
      .insert(users)
      .values({
        clerkId: `clerk_att_pt_${ts}`,
        email: `attended_pt_${ts}@campus.edu`,
        fullName: '=SUM(1+2)', // Formula injection probe
        rollNumber: testRollFormula, // Formula injection probe
        department: 'Computer Science',
        year: 3,
        role: UserRole.STUDENT,
      })
      .returning();
    studentAttended = stdAttended;

    // 5. No-show student
    const [stdNoShow] = await db
      .insert(users)
      .values({
        clerkId: `clerk_ns_pt_${ts}`,
        email: `noshow_pt_${ts}@campus.edu`,
        fullName: 'Absent Student',
        rollNumber: testRollNoShow,
        department: 'Electronics',
        year: 2,
        role: UserRole.STUDENT,
      })
      .returning();
    studentNoShow = stdNoShow;

    // 6. Club
    const [clb] = await db
      .insert(clubs)
      .values({
        name: `Participants Club ${ts}`,
        slug: `participants-club-${ts}`,
        description: 'Testing participants and exports',
      })
      .returning();
    testClub = clb;

    // Add owner to club
    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: clubOwner.id,
      role: ClubMemberRole.OWNER,
    });

    const now = new Date();

    // 7. Event (ended 2 hours ago so un-checked-in is no-show)
    const [ev] = await db
      .insert(events)
      .values({
        clubId: testClub.id,
        title: `Participants Hackathon ${ts}`,
        slug: `participants-hackathon-${ts}`,
        description: 'Event for testing participants table and exports',
        category: 'Technical',
        startAt: new Date(now.getTime() - 14400000),
        endAt: new Date(now.getTime() - 7200000),
        registrationOpensAt: new Date(now.getTime() - 86400000),
        registrationClosesAt: new Date(now.getTime() - 14400000),
        status: EventStatus.COMPLETED,
        capacity: 100,
        remainingCapacity: 98,
        pricePaise: 0,
        isPaid: false,
        createdBy: clubOwner.id,
      })
      .returning();
    testEvent = ev;

    // Register attended student + create ticket + check-in
    const [regAttended] = await db
      .insert(registrations)
      .values({
        eventId: testEvent.id,
        userId: studentAttended.id,
        status: RegistrationStatus.CONFIRMED,
      })
      .returning();

    if (!regAttended) throw new Error('regAttended failed');

    await db.insert(tickets).values({
      eventId: testEvent.id,
      userId: studentAttended.id,
      registrationId: regAttended.id,
      token: `tkn_att_${ts}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 32).padEnd(32, '0'),
      status: TicketStatus.CHECKED_IN,
      checkedInAt: new Date(now.getTime() - 10000000),
      checkedInVia: 'SCANNER',
    });

    // Register no-show student (no ticket check-in)
    const [regNoShow] = await db
      .insert(registrations)
      .values({
        eventId: testEvent.id,
        userId: studentNoShow.id,
        status: RegistrationStatus.CONFIRMED,
      })
      .returning();

    if (!regNoShow) throw new Error('regNoShow failed');

    await db.insert(tickets).values({
      eventId: testEvent.id,
      userId: studentNoShow.id,
      registrationId: regNoShow.id,
      token: `tkn_ns_${ts}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 32).padEnd(32, '0'),
      status: TicketStatus.VALID,
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('rejects unauthorized regular student from accessing participants (403)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events/${testEvent.id}/participants`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': regularStudent.id,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('allows club owner to get participants with totals and classification', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events/${testEvent.id}/participants`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': clubOwner.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals).toBeDefined();
    expect(body.totals.totalCount).toBe(2);
    expect(body.totals.registeredCount).toBe(2);
    expect(body.totals.attendedCount).toBe(1);
    expect(body.totals.noShowCount).toBe(1);
    expect(body.items).toHaveLength(2);

    const attendedRow = body.items.find((i: any) => i.userId === studentAttended.id);
    expect(attendedRow).toBeDefined();
    expect(attendedRow.attended).toBe(true);
    expect(attendedRow.attendanceStatus).toBe('Attended');

    const noShowRow = body.items.find((i: any) => i.userId === studentNoShow.id);
    expect(noShowRow).toBeDefined();
    expect(noShowRow.attended).toBe(false);
    expect(noShowRow.isNoShow).toBe(true);
    expect(noShowRow.attendanceStatus).toBe('No-show');
  });

  it('supports filtering by status=attended', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events/${testEvent.id}/participants?status=attended`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': clubOwner.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].userId === studentAttended.id).toBe(true);
  });

  it('supports filtering by department', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events/${testEvent.id}/participants?department=Computer%20Science`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': clubOwner.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].department).toBe('Computer Science');
  });

  it('exports participants to CSV with UTF-8 BOM, formula defense, and audit logging', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events/${testEvent.id}/participants/export?format=csv`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': clubOwner.id,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.csv');

    const rawBody = res.body;
    // Check UTF-8 BOM (\uFEFF)
    expect(rawBody.startsWith('\uFEFF')).toBe(true);

    // Check Formula Injection defense: '=SUM(1+2)' escaped to ''=SUM(1+2)'
    expect(rawBody).toContain(`'=SUM(1+2)`);
    // Roll number '+9199...' escaped to ''+9199...'
    expect(rawBody).toContain(`'+9199${ts % 100000}`);

    // Verify Audit log entry
    const [auditEntry] = await db
      .select()
      .from(auditLogs)
      .where(auditLogs.entityId.getSQL() ? undefined as any : undefined as any)
      .limit(1);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(auditLogs.entityId.getSQL() ? undefined as any : undefined as any);

    const matchingAudit = audits.find(
      (a) => a.action === 'EXPORT_PARTICIPANTS' && a.entityId === testEvent.id
    );
    expect(matchingAudit).toBeDefined();
    expect(matchingAudit!.actorId).toBe(clubOwner.id);
  });

  it('exports participants to XLSX binary buffer', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/events/${testEvent.id}/participants/export?format=xlsx`,
      headers: {
        authorization: 'Bearer dev-token',
        'x-test-user-id': adminUser.id,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('.xlsx');
    expect(res.rawPayload.length).toBeGreaterThan(100);
  });
});
