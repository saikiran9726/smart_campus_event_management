import { and, desc, eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { ClubMemberRole, EventStatus, RegistrationStatus, UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { auditLogs, clubMembers, clubs, events, registrations, tickets, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';

export interface ParticipantQueryOptions {
  status?: 'registered' | 'attended' | 'no_show' | 'all';
  q?: string;
  department?: string;
  year?: number | string;
  page?: number;
  limit?: number;
}

export interface ParticipantExportOptions {
  format?: 'csv' | 'xlsx';
  status?: 'registered' | 'attended' | 'no_show' | 'all';
  q?: string;
  department?: string;
  year?: number | string;
}

/**
 * Ensures caller is an Admin, Club Owner/Admin, or Club Faculty Coordinator.
 */
export async function assertCanManageEvent(
  user: { id: string; role: UserRole },
  eventIdOrSlug: string
) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventIdOrSlug);
  const [event] = await db
    .select({
      id: events.id,
      clubId: events.clubId,
      title: events.title,
      slug: events.slug,
      endAt: events.endAt,
      status: events.status,
    })
    .from(events)
    .where(isUuid ? eq(events.id, eventIdOrSlug) : eq(events.slug, eventIdOrSlug))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventIdOrSlug}' not found.`, 404);
  }

  if (user.role === UserRole.ADMIN) {
    return event;
  }

  // Check club membership as OWNER or ADMIN
  const [membership] = await db
    .select({ role: clubMembers.role })
    .from(clubMembers)
    .where(
      and(
        eq(clubMembers.clubId, event.clubId),
        eq(clubMembers.userId, user.id),
        inArray(clubMembers.role, [ClubMemberRole.OWNER, ClubMemberRole.ADMIN])
      )
    )
    .limit(1);

  if (membership) {
    return event;
  }

  // Check club faculty coordinator
  const [club] = await db
    .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
    .from(clubs)
    .where(eq(clubs.id, event.clubId))
    .limit(1);

  if (club && club.facultyCoordinatorId === user.id) {
    return event;
  }

  throw new AppError(
    'FORBIDDEN',
    'You are not authorized to view or export participants for this event.',
    403
  );
}

export async function getEventParticipants(
  user: { id: string; role: UserRole },
  eventIdOrSlug: string,
  options: ParticipantQueryOptions = {}
) {
  const event = await assertCanManageEvent(user, eventIdOrSlug);
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));

  const rows = await db
    .select({
      registrationId: registrations.id,
      registrationStatus: registrations.status,
      registeredAt: registrations.createdAt,
      paymentStatus: registrations.paymentStatus,
      amountPaise: registrations.amountPaise,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      rollNumber: users.rollNumber,
      department: users.department,
      year: users.year,
      phone: users.phone,
      ticketId: tickets.id,
      ticketToken: tickets.token,
      ticketStatus: tickets.status,
      checkedInAt: tickets.checkedInAt,
      checkedInVia: tickets.checkedInVia,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .leftJoin(tickets, eq(registrations.id, tickets.registrationId))
    .where(eq(registrations.eventId, event.id))
    .orderBy(desc(registrations.createdAt));

  const now = new Date();
  const isEnded = now > event.endAt || event.status === EventStatus.COMPLETED;

  const classified = rows.map((r) => {
    const attended = Boolean(r.checkedInAt);
    const isNoShow = Boolean(
      r.registrationStatus === RegistrationStatus.NO_SHOW ||
      (r.registrationStatus === RegistrationStatus.CONFIRMED && !attended && isEnded)
    );

    let attendanceStatus = 'Not checked in yet';
    if (attended) {
      attendanceStatus = 'Attended';
    } else if (isNoShow) {
      attendanceStatus = 'No-show';
    } else if (r.registrationStatus === RegistrationStatus.CANCELLED) {
      attendanceStatus = 'Cancelled';
    }

    return {
      id: r.registrationId,
      registrationId: r.registrationId,
      userId: r.userId,
      fullName: r.fullName,
      email: r.email,
      rollNumber: r.rollNumber,
      department: r.department,
      year: r.year,
      phone: r.phone,
      registeredAt: r.registeredAt.toISOString(),
      registrationStatus: r.registrationStatus,
      paymentStatus: r.paymentStatus,
      amountPaise: r.amountPaise,
      ticketId: r.ticketId,
      ticketStatus: r.ticketStatus,
      checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
      checkedInVia: r.checkedInVia,
      attended,
      isNoShow,
      attendanceStatus,
    };
  });

  const totalCount = classified.length;
  const registeredCount = classified.filter((p) => p.registrationStatus === RegistrationStatus.CONFIRMED).length;
  const attendedCount = classified.filter((p) => p.attended).length;
  const noShowCount = classified.filter((p) => p.isNoShow).length;

  let filtered = classified;

  if (options.status === 'registered') {
    filtered = filtered.filter((p) => p.registrationStatus === RegistrationStatus.CONFIRMED);
  } else if (options.status === 'attended') {
    filtered = filtered.filter((p) => p.attended);
  } else if (options.status === 'no_show') {
    filtered = filtered.filter((p) => p.isNoShow);
  }

  if (options.q && options.q.trim()) {
    const query = options.q.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.fullName.toLowerCase().includes(query) ||
        p.email.toLowerCase().includes(query) ||
        (p.rollNumber && p.rollNumber.toLowerCase().includes(query))
    );
  }

  if (options.department && options.department !== 'ALL') {
    filtered = filtered.filter((p) => p.department?.toLowerCase() === options.department!.toLowerCase());
  }

  if (options.year !== undefined && options.year !== null && String(options.year) !== 'ALL') {
    filtered = filtered.filter((p) => p.year === Number(options.year));
  }

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const offset = (page - 1) * limit;
  const paginatedItems = filtered.slice(offset, offset + limit);

  return {
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      isEnded,
    },
    items: paginatedItems,
    totals: {
      totalCount,
      registeredCount,
      attendedCount,
      noShowCount,
    },
    pagination: {
      page,
      limit,
      totalPages,
      totalItems,
    },
  };
}

/**
 * Escapes values against formula injection (starts with =, +, -, @, \t, \r)
 * and escapes internal quotes.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportEventParticipants(
  user: { id: string; role: UserRole },
  eventIdOrSlug: string,
  options: ParticipantExportOptions = {}
) {
  const event = await assertCanManageEvent(user, eventIdOrSlug);
  const format = options.format === 'xlsx' ? 'xlsx' : 'csv';

  // Audit log entry
  await db.insert(auditLogs).values({
    actorId: user.id,
    action: 'EXPORT_PARTICIPANTS',
    entity: 'EVENT',
    entityId: event.id,
    diff: {
      format,
      status: options.status || 'all',
      filters: {
        q: options.q || null,
        department: options.department || null,
        year: options.year || null,
      },
    },
  });

  const participantsResult = await getEventParticipants(user, eventIdOrSlug, {
    status: options.status,
    q: options.q,
    department: options.department,
    year: options.year,
    page: 1,
    limit: 100000,
  });

  const participants = participantsResult.items;
  const dateStr = new Date().toISOString().slice(0, 10);
  const statusSlug = options.status || 'all';
  const filename = `participants-${event.slug}-${statusSlug}-${dateStr}.${format}`;

  if (format === 'csv') {
    const BOM = '\uFEFF';
    const headers = [
      'Full Name',
      'Email',
      'Roll Number',
      'Department',
      'Year',
      'Phone',
      'Registration Date',
      'Registration Status',
      'Attendance Status',
      'Check-in Time',
      'Ticket Status',
      'Payment Status',
    ];

    const lines: string[] = [headers.map(escapeCsvField).join(',')];

    for (const p of participants) {
      const row = [
        escapeCsvField(p.fullName),
        escapeCsvField(p.email),
        escapeCsvField(p.rollNumber || 'N/A'),
        escapeCsvField(p.department || 'N/A'),
        escapeCsvField(p.year ? String(p.year) : 'N/A'),
        escapeCsvField(p.phone || 'N/A'),
        escapeCsvField(p.registeredAt ? new Date(p.registeredAt).toLocaleString() : 'N/A'),
        escapeCsvField(p.registrationStatus),
        escapeCsvField(p.attendanceStatus),
        escapeCsvField(p.checkedInAt ? new Date(p.checkedInAt).toLocaleString() : 'N/A'),
        escapeCsvField(p.ticketStatus || 'N/A'),
        escapeCsvField(p.paymentStatus || 'N/A'),
      ];
      lines.push(row.join(','));
    }

    return {
      contentType: 'text/csv; charset=utf-8',
      filename,
      content: Buffer.from(BOM + lines.join('\r\n'), 'utf8'),
    };
  }

  // Excel (.xlsx)
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Eventora Campus System';
  const worksheet = workbook.addWorksheet('Participants');

  worksheet.columns = [
    { header: 'Full Name', key: 'fullName', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Roll Number', key: 'rollNumber', width: 16 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Year', key: 'year', width: 10 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Registration Date', key: 'registeredAt', width: 22 },
    { header: 'Registration Status', key: 'registrationStatus', width: 20 },
    { header: 'Attendance Status', key: 'attendanceStatus', width: 22 },
    { header: 'Check-in Time', key: 'checkedInAt', width: 22 },
    { header: 'Ticket Status', key: 'ticketStatus', width: 15 },
    { header: 'Payment Status', key: 'paymentStatus', width: 16 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };

  for (const p of participants) {
    worksheet.addRow({
      fullName: p.fullName,
      email: p.email,
      rollNumber: p.rollNumber || 'N/A',
      department: p.department || 'N/A',
      year: p.year ? String(p.year) : 'N/A',
      phone: p.phone || 'N/A',
      registeredAt: p.registeredAt ? new Date(p.registeredAt).toLocaleString() : 'N/A',
      registrationStatus: p.registrationStatus,
      attendanceStatus: p.attendanceStatus,
      checkedInAt: p.checkedInAt ? new Date(p.checkedInAt).toLocaleString() : 'N/A',
      ticketStatus: p.ticketStatus || 'N/A',
      paymentStatus: p.paymentStatus || 'N/A',
    });
  }

  const excelBuffer = await workbook.xlsx.writeBuffer();

  return {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename,
    content: Buffer.from(excelBuffer),
  };
}
