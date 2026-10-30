import crypto from 'node:crypto';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import {
  accreditationReports,
  budgetAllocations,
  certificates,
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
  ticketRedemptions,
  tickets,
  users,
  venues,
  waitlistEntries,
  winners,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { getFormInsights } from '../forms/service';
import {
  buildNaacCsvString,
  buildNaacPdfBuffer,
  buildNaacXlsxBuffer,
  NaacReportData,
} from './report-generators';

/**
 * Retrieves post-mortem analytics for an event using pure SQL aggregates.
 */
export async function getEventAnalytics(eventId: string) {
  // 1. Verify event exists
  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      startAt: events.startAt,
      endAt: events.endAt,
      capacity: events.capacity,
      isCompetition: events.isCompetition,
      clubId: events.clubId,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
  }

  // 2. Funnel metrics via SQL aggregates
  const funnelRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'NO_SHOW'))::int AS registered,
       COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS "noShowCount",
       COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancellations
     FROM registrations
     WHERE event_id = $1`,
    [eventId]
  );
  const funnelRow = funnelRes.rows[0] || { registered: 0, noShowCount: 0, cancellations: 0 };

  const checkInRes = await pool.query(
    `SELECT COUNT(*)::int AS "checkedIn"
     FROM tickets
     WHERE event_id = $1 AND checked_in_at IS NOT NULL`,
    [eventId]
  );
  const checkedIn: number = checkInRes.rows[0]?.checkedIn ?? 0;
  const registered: number = funnelRow.registered;
  const conversionRate =
    registered > 0 ? Number(((checkedIn / registered) * 100).toFixed(1)) : 0;

  const waitlistRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('QUEUED', 'OFFERED'))::int AS waitlisted,
       COUNT(*) FILTER (WHERE status = 'CLAIMED')::int AS "promotionsClaimed",
       COUNT(*) FILTER (WHERE status = 'EXPIRED')::int AS "promotionsExpired"
     FROM waitlist_entries
     WHERE event_id = $1`,
    [eventId]
  );
  const waitlistRow = waitlistRes.rows[0] || {
    waitlisted: 0,
    promotionsClaimed: 0,
    promotionsExpired: 0,
  };

  const funnel = {
    registered,
    checkedIn,
    conversionRate,
    noShowCount: funnelRow.noShowCount,
    waitlisted: waitlistRow.waitlisted,
    promotionsClaimed: waitlistRow.promotionsClaimed,
    promotionsExpired: waitlistRow.promotionsExpired,
    cancellations: funnelRow.cancellations,
  };

  // 3. Arrival curve bucketed per 5 minutes using PostgreSQL date_bin
  const arrivalRes = await pool.query(
    `SELECT
       to_char(date_bin('5 minutes'::interval, checked_in_at, TIMESTAMP '2000-01-01 00:00:00Z'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket,
       COUNT(*)::int AS count
     FROM tickets
     WHERE event_id = $1 AND checked_in_at IS NOT NULL
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [eventId]
  );
  const arrivalBuckets = arrivalRes.rows.map((r: any) => ({
    bucket: r.bucket,
    count: r.count,
  }));

  let peakBucket: { bucket: string; count: number } | null = null;
  for (const b of arrivalBuckets) {
    if (!peakBucket || b.count > peakBucket.count) {
      peakBucket = b;
    }
  }

  const arrivalCurve = {
    buckets: arrivalBuckets,
    peakBucket,
  };

  // 4. Scan stats (GREEN/RED/YELLOW) and duplicate attempts
  const scanRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE result = 'GREEN')::int AS green,
       COUNT(*) FILTER (WHERE result = 'RED')::int AS red,
       COUNT(*) FILTER (WHERE result = 'YELLOW')::int AS yellow,
       COUNT(*) FILTER (WHERE result = 'RED' AND ticket_id IS NOT NULL)::int AS "duplicateAttempts"
     FROM scan_logs
     WHERE event_id = $1`,
    [eventId]
  );
  const scanRow = scanRes.rows[0] || { green: 0, red: 0, yellow: 0, duplicateAttempts: 0 };
  const scanStats = {
    green: scanRow.green,
    red: scanRow.red,
    yellow: scanRow.yellow,
    duplicateAttempts: scanRow.duplicateAttempts,
  };

  // 5. Redemptions (meals and kits)
  const redempRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE tr.kind = 'MEAL')::int AS meals,
       COUNT(*) FILTER (WHERE tr.kind = 'KIT')::int AS kits
     FROM ticket_redemptions tr
     JOIN tickets t ON tr.ticket_id = t.id
     WHERE t.event_id = $1`,
    [eventId]
  );
  const mealsCount = redempRes.rows[0]?.meals ?? 0;
  const kitsCount = redempRes.rows[0]?.kits ?? 0;
  const mealsPercentage =
    checkedIn > 0 ? Number(((mealsCount / checkedIn) * 100).toFixed(1)) : 0;
  const kitsPercentage =
    checkedIn > 0 ? Number(((kitsCount / checkedIn) * 100).toFixed(1)) : 0;

  const redemptions = {
    meals: mealsCount,
    kits: kitsCount,
    mealsPercentage,
    kitsPercentage,
  };

  // 6. Spot walk-ins
  const walkinRes = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM tickets
     WHERE event_id = $1 AND checked_in_via = 'SPOT_WALKIN'`,
    [eventId]
  );
  const spotWalkins = walkinRes.rows[0]?.count ?? 0;

  // 7. Reviews
  const reviewsRes = await pool.query(
    `SELECT
       COUNT(*)::int AS count,
       COALESCE(AVG(stars), 0)::float AS average,
       COUNT(*) FILTER (WHERE stars = 1)::int AS s1,
       COUNT(*) FILTER (WHERE stars = 2)::int AS s2,
       COUNT(*) FILTER (WHERE stars = 3)::int AS s3,
       COUNT(*) FILTER (WHERE stars = 4)::int AS s4,
       COUNT(*) FILTER (WHERE stars = 5)::int AS s5
     FROM reviews
     WHERE event_id = $1`,
    [eventId]
  );
  const revRow = reviewsRes.rows[0] || { count: 0, average: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
  const reviewsStats = {
    count: revRow.count,
    average: Number(revRow.average.toFixed(1)),
    histogram: {
      1: revRow.s1,
      2: revRow.s2,
      3: revRow.s3,
      4: revRow.s4,
      5: revRow.s5,
    },
  };

  // 8. Form Insights (reusing dynamic form engine insights)
  const formInsights = await getFormInsights(eventId).catch(() => null);

  // 9. Revenue Sandbox (gross, refunds, net in paise)
  const revRes = await pool.query(
    `SELECT
       COALESCE(SUM(le.amount_paise) FILTER (WHERE le.kind = 'CHARGE'), 0)::int AS "grossPaise",
       COALESCE(SUM(le.amount_paise) FILTER (WHERE le.kind = 'REFUND'), 0)::int AS "refundsPaise"
     FROM ledger_entries le
     JOIN payments p ON le.payment_id = p.id
     JOIN registrations r ON p.registration_id = r.id
     WHERE r.event_id = $1`,
    [eventId]
  );
  const grossPaise = revRes.rows[0]?.grossPaise ?? 0;
  const refundsPaise = revRes.rows[0]?.refundsPaise ?? 0;
  const netPaise = grossPaise - refundsPaise;

  const revenueSandbox = {
    grossPaise,
    refundsPaise,
    netPaise,
    isSandbox: true,
  };

  // 10. Capacity & Utilisation
  const capacity = event.capacity;
  const finalUtilisation =
    capacity > 0 ? Number(((checkedIn / capacity) * 100).toFixed(1)) : 0;

  // 11. Demographics with Privacy Rule: suppress any bucket with fewer than 3 people
  const demoRes = await pool.query(
    `SELECT
       COALESCE(u.department, 'General') AS department,
       COALESCE(u.year, 1) AS year,
       COUNT(*)::int AS count
     FROM registrations r
     JOIN users u ON r.user_id = u.id
     WHERE r.event_id = $1 AND r.status IN ('CONFIRMED', 'NO_SHOW')
     GROUP BY u.department, u.year
     ORDER BY count DESC`,
    [eventId]
  );

  const demoBuckets: Array<{ department: string; year: number; count: number }> = [];
  let suppressedCount = 0;
  for (const d of demoRes.rows) {
    if (d.count >= 3) {
      demoBuckets.push({
        department: d.department,
        year: d.year,
        count: d.count,
      });
    } else {
      suppressedCount += d.count;
    }
  }

  const demographics = {
    buckets: demoBuckets,
    suppressedCount,
  };

  // 12. Teams (for competition events)
  let teamsStats = null;
  if (event.isCompetition) {
    const teamRes = await pool.query(
      `SELECT
         COUNT(*)::int AS "teamCount",
         COUNT(*) FILTER (WHERE submitted_at IS NOT NULL)::int AS "submittedCount"
       FROM teams
       WHERE event_id = $1`,
      [eventId]
    );
    const memberRes = await pool.query(
      `SELECT COUNT(*)::int AS "memberCount"
       FROM team_members
       WHERE event_id = $1`,
      [eventId]
    );

    const teamCount: number = teamRes.rows[0]?.teamCount ?? 0;
    const submittedCount: number = teamRes.rows[0]?.submittedCount ?? 0;
    const memberCount: number = memberRes.rows[0]?.memberCount ?? 0;

    const averageSize = teamCount > 0 ? Number((memberCount / teamCount).toFixed(1)) : 0;
    const submissionsRate =
      teamCount > 0 ? Number(((submittedCount / teamCount) * 100).toFixed(1)) : 0;

    teamsStats = {
      teamCount,
      averageSize,
      submissionsRate,
    };
  }

  return {
    eventId: event.id,
    eventTitle: event.title,
    eventSlug: event.slug,
    funnel,
    arrivalCurve,
    scanStats,
    redemptions,
    spotWalkins,
    reviews: reviewsStats,
    formInsights,
    revenueSandbox,
    capacity: {
      capacity,
      finalUtilisation,
    },
    demographics,
    teams: teamsStats,
  };
}

/**
 * Retrieves historical attendance and no-show trends across a club's events.
 */
export async function getClubTrends(clubId: string) {
  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);

  if (!club) {
    throw new AppError('NOT_FOUND', `Club '${clubId}' not found.`, 404);
  }

  const res = await pool.query(
    `SELECT
       e.id AS "eventId",
       e.title,
       e.slug,
       e.start_at AS "startAt",
       COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('CONFIRMED', 'NO_SHOW'))::int AS registrations,
       COUNT(DISTINCT t.id) FILTER (WHERE t.checked_in_at IS NOT NULL)::int AS "checkedIn"
     FROM events e
     LEFT JOIN registrations r ON e.id = r.event_id
     LEFT JOIN tickets t ON r.id = t.registration_id
     WHERE e.club_id = $1
     GROUP BY e.id
     ORDER BY e.start_at ASC`,
    [clubId]
  );

  const eventTrends = res.rows.map((row: any) => {
    const reg = row.registrations;
    const checked = row.checkedIn;
    const attendanceRate = reg > 0 ? Number(((checked / reg) * 100).toFixed(1)) : 0;
    const noShowRate = reg > 0 ? Number((((reg - checked) / reg) * 100).toFixed(1)) : 0;

    return {
      eventId: row.eventId,
      title: row.title,
      slug: row.slug,
      date: row.startAt ? row.startAt.toISOString() : null,
      registrations: reg,
      checkedIn: checked,
      attendanceRate,
      noShowRate,
    };
  });

  return {
    clubId: club.id,
    clubName: club.name,
    clubSlug: club.slug,
    events: eventTrends,
  };
}

/**
 * Retrieves campus-wide macro analytics for campus administrators.
 */
export async function getCampusAnalytics() {
  // 1. Club totals
  const clubRes = await pool.query(
    `SELECT
       c.id AS "clubId",
       c.name AS "clubName",
       c.slug AS "clubSlug",
       COUNT(DISTINCT e.id)::int AS "totalEvents",
       COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('CONFIRMED', 'NO_SHOW'))::int AS "totalRegistrations",
       COUNT(DISTINCT t.id) FILTER (WHERE t.checked_in_at IS NOT NULL)::int AS "totalCheckedIn"
     FROM clubs c
     LEFT JOIN events e ON c.id = e.club_id
     LEFT JOIN registrations r ON e.id = r.event_id
     LEFT JOIN tickets t ON r.id = t.registration_id
     GROUP BY c.id
     ORDER BY "totalRegistrations" DESC`
  );

  const clubsData = clubRes.rows.map((c: any) => {
    const reg = c.totalRegistrations;
    const att = c.totalCheckedIn;
    const averageAttendanceRate = reg > 0 ? Number(((att / reg) * 100).toFixed(1)) : 0;
    return {
      clubId: c.clubId,
      clubName: c.clubName,
      clubSlug: c.clubSlug,
      totalEvents: c.totalEvents,
      totalRegistrations: reg,
      totalCheckedIn: att,
      averageAttendanceRate,
    };
  });

  // 2. Top events by attendance
  const topRes = await pool.query(
    `SELECT
       e.id AS "eventId",
       e.title,
       c.name AS "clubName",
       e.start_at AS "startAt",
       COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('CONFIRMED', 'NO_SHOW'))::int AS registrations,
       COUNT(DISTINCT t.id) FILTER (WHERE t.checked_in_at IS NOT NULL)::int AS "checkedIn"
     FROM events e
     JOIN clubs c ON e.club_id = c.id
     LEFT JOIN registrations r ON e.id = r.event_id
     LEFT JOIN tickets t ON r.id = t.registration_id
     GROUP BY e.id, c.name
     ORDER BY "checkedIn" DESC
     LIMIT 10`
  );

  const topEvents = topRes.rows.map((row: any) => ({
    eventId: row.eventId,
    title: row.title,
    clubName: row.clubName,
    date: row.startAt ? row.startAt.toISOString() : null,
    registrations: row.registrations,
    checkedIn: row.checkedIn,
  }));

  // 3. Macro totals
  let totalEvents = 0;
  let totalRegistrations = 0;
  let totalCheckedIn = 0;
  for (const c of clubsData) {
    totalEvents += c.totalEvents;
    totalRegistrations += c.totalRegistrations;
    totalCheckedIn += c.totalCheckedIn;
  }

  return {
    overview: {
      totalClubs: clubsData.length,
      totalEvents,
      totalRegistrations,
      totalCheckedIn,
      campusAttendanceRate:
        totalRegistrations > 0
          ? Number(((totalCheckedIn / totalRegistrations) * 100).toFixed(1))
          : 0,
    },
    clubs: clubsData,
    topEvents,
  };
}

/**
 * Generates official NAAC/NBA Accreditation Report (PDF, CSV, or XLSX).
 */
export async function generateNaacReport(params: {
  clubId: string;
  from?: Date;
  to?: Date;
  format: 'pdf' | 'csv' | 'xlsx';
  userId: string;
}) {
  const { clubId, format, userId } = params;
  const now = new Date();
  const from = params.from ?? new Date(now.getFullYear(), 0, 1);
  const to = params.to ?? now;

  // 1. Load club details & faculty coordinator
  const [club] = await db
    .select({
      id: clubs.id,
      name: clubs.name,
      slug: clubs.slug,
      description: clubs.description,
      facultyCoordinatorId: clubs.facultyCoordinatorId,
    })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);

  if (!club) {
    throw new AppError('NOT_FOUND', `Club '${clubId}' not found.`, 404);
  }

  let facultyCoordinator = {
    fullName: 'Faculty Advisor',
    email: 'faculty@eventora.edu',
  };
  if (club.facultyCoordinatorId) {
    const [fac] = await db
      .select({ fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, club.facultyCoordinatorId))
      .limit(1);
    if (fac) {
      facultyCoordinator = fac;
    }
  }

  // 2. Load Events with Venue, Registration, Check-in, and Budget Allocations
  const eventsRes = await pool.query(
    `SELECT
       e.id,
       e.title,
       e.slug,
       e.start_at AS "startAt",
       e.end_at AS "endAt",
       e.category,
       e.is_competition AS "isCompetition",
       COALESCE(v.name, 'Auditorium') AS "venueName",
       COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('CONFIRMED', 'NO_SHOW'))::int AS registered,
       COUNT(DISTINCT t.id) FILTER (WHERE t.checked_in_at IS NOT NULL)::int AS attended,
       COALESCE(SUM(ba.allocated_paise), 0)::int AS "budgetAllocatedPaise",
       COALESCE(SUM(ba.spent_paise), 0)::int AS "budgetSpentPaise"
     FROM events e
     LEFT JOIN venues v ON e.venue_id = v.id
     LEFT JOIN registrations r ON e.id = r.event_id
     LEFT JOIN tickets t ON r.id = t.registration_id
     LEFT JOIN budget_allocations ba ON e.id = ba.event_id
     WHERE e.club_id = $1 AND e.start_at >= $2 AND e.end_at <= $3
     GROUP BY e.id, v.name
     ORDER BY e.start_at ASC`,
    [clubId, from, to]
  );

  const eventsData = eventsRes.rows.map((ev: any) => {
    const reg = ev.registered;
    const att = ev.attended;
    const attendancePercentage = reg > 0 ? Number(((att / reg) * 100).toFixed(1)) : 0;
    return {
      id: ev.id,
      title: ev.title,
      slug: ev.slug,
      startAt: new Date(ev.startAt),
      endAt: new Date(ev.endAt),
      category: ev.category,
      isCompetition: ev.isCompetition,
      venueName: ev.venueName,
      registered: reg,
      attended: att,
      attendancePercentage,
      budgetAllocatedPaise: ev.budgetAllocatedPaise,
      budgetSpentPaise: ev.budgetSpentPaise,
    };
  });

  // 3. Demographics across all events in timeframe
  const demoRes = await pool.query(
    `SELECT
       COALESCE(u.department, 'Engineering') AS department,
       COALESCE(u.year, 1) AS year,
       COUNT(DISTINCT r.user_id)::int AS count
     FROM events e
     JOIN registrations r ON e.id = r.event_id
     JOIN users u ON r.user_id = u.id
     WHERE e.club_id = $1 AND e.start_at >= $2 AND e.end_at <= $3
       AND r.status IN ('CONFIRMED', 'NO_SHOW')
     GROUP BY u.department, u.year
     ORDER BY count DESC`,
    [clubId, from, to]
  );

  // 4. Outcomes (Winners, Rating, Certificates)
  const winnersRes = await pool.query(
    `SELECT
       w.id,
       e.title AS "eventTitle",
       w.rank,
       COALESCE(tm.name, 'Podium Winner') AS "recipientName",
       '' AS notes
     FROM winners w
     JOIN events e ON w.event_id = e.id
     LEFT JOIN teams tm ON w.team_id = tm.id
     WHERE e.club_id = $1 AND e.start_at >= $2 AND e.end_at <= $3
     ORDER BY e.start_at ASC, w.rank ASC`,
    [clubId, from, to]
  );

  const reviewsRes = await pool.query(
    `SELECT
       COALESCE(AVG(rev.stars), 0)::float AS "avgRating",
       COUNT(rev.id)::int AS "reviewCount"
     FROM reviews rev
     JOIN events e ON rev.event_id = e.id
     WHERE e.club_id = $1 AND e.start_at >= $2 AND e.end_at <= $3`,
    [clubId, from, to]
  );

  const certsRes = await pool.query(
    `SELECT COUNT(cert.id)::int AS "certCount"
     FROM certificates cert
     JOIN events e ON cert.event_id = e.id
     WHERE e.club_id = $1 AND e.start_at >= $2 AND e.end_at <= $3`,
    [clubId, from, to]
  );

  // 5. Documentary Evidence (Receipts, Resources, OD letters)
  const receiptsRes = await pool.query(
    `SELECT
       ei.id,
       ei.description,
       ei.receipt_key AS "receiptKey",
       (ei.amount_paise / 100)::text AS "amountInr"
     FROM expense_items ei
     JOIN budget_allocations ba ON ei.allocation_id = ba.id
     WHERE ba.club_id = $1`,
    [clubId]
  );

  const resourcesRes = await pool.query(
    `SELECT
       er.id,
       er.title,
       er.kind,
       COALESCE(er.url, er.resource_key, 'Internal Record') AS link,
       e.title AS "eventTitle"
     FROM event_resources er
     JOIN events e ON er.event_id = e.id
     WHERE e.club_id = $1 AND e.start_at >= $2 AND e.end_at <= $3`,
    [clubId, from, to]
  );

  const odRes = await pool.query(
    `SELECT
       od.id,
       od.serial,
       od.issued_at AS "issuedAt",
       e.title AS "eventTitle",
       u.full_name AS "studentName"
     FROM od_letters od
     JOIN events e ON od.event_id = e.id
     JOIN users u ON od.user_id = u.id
     WHERE e.club_id = $1 AND e.start_at >= $2 AND e.end_at <= $3`,
    [clubId, from, to]
  );

  // 6. Generate unique serial: NAAC-YYYY-<8hex>
  const yyyy = now.getFullYear();
  const hexPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  const serial = `NAAC-${yyyy}-${hexPart}`;
  const verificationUrl = `${env.PUBLIC_WEB_URL}/verify/report/${serial}`;

  const reportPayload: NaacReportData = {
    serial,
    periodFrom: from,
    periodTo: to,
    generatedAt: now,
    club: {
      id: club.id,
      name: club.name,
      slug: club.slug,
      description: club.description,
    },
    facultyCoordinator,
    events: eventsData,
    demographics: demoRes.rows,
    outcomes: {
      winners: winnersRes.rows,
      averageRating: reviewsRes.rows[0]?.avgRating ?? 0,
      reviewCount: reviewsRes.rows[0]?.reviewCount ?? 0,
      certificatesCount: certsRes.rows[0]?.certCount ?? 0,
    },
    evidence: {
      receiptsCount: receiptsRes.rows.length,
      receipts: receiptsRes.rows,
      resourcesCount: resourcesRes.rows.length,
      resources: resourcesRes.rows,
      odLettersCount: odRes.rows.length,
      odLetters: odRes.rows,
    },
    verificationUrl,
  };

  // 7. Insert row in accreditation_reports
  const [createdReport] = await db
    .insert(accreditationReports)
    .values({
      clubId,
      serial,
      periodFrom: from,
      periodTo: to,
      format: format.toUpperCase(),
      generatedBy: userId,
      eventCount: eventsData.length,
      createdAt: now,
    })
    .returning();

  // 8. Generate File By Format
  if (format === 'pdf') {
    const buffer = await buildNaacPdfBuffer(reportPayload);
    return {
      format: 'pdf',
      contentType: 'application/pdf',
      filename: `NAAC-Report-${club.slug}-${serial}.pdf`,
      serial,
      buffer,
      report: createdReport,
    };
  } else if (format === 'csv') {
    const csvString = buildNaacCsvString(reportPayload);
    return {
      format: 'csv',
      contentType: 'text/csv; charset=utf-8',
      filename: `NAAC-Report-${club.slug}-${serial}.csv`,
      serial,
      buffer: Buffer.from(csvString, 'utf8'),
      report: createdReport,
    };
  } else {
    const xlsxBuffer = await buildNaacXlsxBuffer(reportPayload);
    return {
      format: 'xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `NAAC-Report-${club.slug}-${serial}.xlsx`,
      serial,
      buffer: xlsxBuffer,
      report: createdReport,
    };
  }
}

/**
 * Publicly verifies an accreditation report by its serial.
 */
export async function verifyAccreditationReport(serial: string) {
  const [report] = await db
    .select({
      id: accreditationReports.id,
      serial: accreditationReports.serial,
      clubId: accreditationReports.clubId,
      periodFrom: accreditationReports.periodFrom,
      periodTo: accreditationReports.periodTo,
      format: accreditationReports.format,
      eventCount: accreditationReports.eventCount,
      createdAt: accreditationReports.createdAt,
    })
    .from(accreditationReports)
    .where(eq(accreditationReports.serial, serial))
    .limit(1);

  if (!report) {
    throw new AppError('NOT_FOUND', `Accreditation report with serial '${serial}' not found.`, 404);
  }

  const [club] = await db
    .select({ name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.id, report.clubId))
    .limit(1);

  return {
    valid: true,
    serial: report.serial,
    club: {
      name: club?.name || 'Student Club',
      slug: club?.slug || 'club',
    },
    periodFrom: report.periodFrom.toISOString(),
    periodTo: report.periodTo.toISOString(),
    eventCount: report.eventCount,
    format: report.format,
    generatedAt: report.createdAt.toISOString(),
  };
}
