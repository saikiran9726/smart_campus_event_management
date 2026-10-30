import { and, count, eq, ilike, sql } from 'drizzle-orm';
import {
  generateOpaqueToken,
  PaymentStatus,
  RegistrationStatus,
  ScanMode,
  ScanResult,
  TicketStatus,
} from '@eventora/shared';
import { db, withTx } from '../../db/client';
import {
  events,
  registrations,
  scanLogs,
  ticketRedemptions,
  tickets,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { assertNotInCooldown } from '../../middleware/rbac';
import { emitScanResult, emitSeats } from '../../realtime/io';
import { ScannerPrincipal } from '../passkeys/auth';
import { hashTokenPrefix, maskToken } from '../tickets/service';

// In-memory rate limiting for scanning: max 20 scans per second per session/IP
const scanTimestampsMap = new Map<string, number[]>();

export function resetScanRateLimits(): void {
  scanTimestampsMap.clear();
}

function checkScanRateLimit(key: string): void {
  // In test environment, bypass rate limit unless explicitly testing rate limits
  if (
    process.env.NODE_ENV === 'test' &&
    !key.startsWith('test-rate-limit-')
  ) {
    return;
  }

  const now = Date.now();
  const windowMs = 1000;
  const timestamps = (scanTimestampsMap.get(key) ?? []).filter(
    (t) => now - t < windowMs
  );

  if (timestamps.length >= 20) {
    throw new AppError(
      'RATE_LIMITED',
      'Scan rate limit exceeded (maximum 20 scans per second).',
      429
    );
  }

  timestamps.push(now);
  scanTimestampsMap.set(key, timestamps);
}

export interface GateScanParams {
  eventId: string;
  token: string;
  mode: 'GATE' | 'MEAL' | 'KIT';
}

export interface GateScanResult {
  result: 'GREEN' | 'YELLOW' | 'RED';
  code: string;
  message: string;
  attendee?: {
    id: string;
    firstName: string;
    fullName: string;
    email: string;
    rollNumber: string | null;
    department: string | null;
  };
  ticket?: {
    id: string;
    checkedInAt?: string;
  };
  kind?: string;
  redeemedAt?: string;
  scannedAt?: string;
  scannedByLabel?: string;
  timestamp: string;
}

/**
 * Executes high-performance gate scans with atomic database operations and sub-second responses.
 */
export async function scanTicket(
  scanner: ScannerPrincipal,
  params: {
    eventId: string;
    token: string;
    mode: 'GATE' | 'MEAL' | 'KIT';
    clientIp?: string;
  }
): Promise<GateScanResult> {
  const { eventId, token, mode, clientIp } = params;

  // Rate limit key per scanner session / user / IP
  const rateLimitKey =
    clientIp && clientIp.startsWith('test-rate-limit-')
      ? clientIp
      : scanner.sessionId || scanner.userId || clientIp || 'scanner-anonymous';
  checkScanRateLimit(rateLimitKey);

  const nowIso = new Date().toISOString();
  const tokenRegex = /^ev_tok_[A-Za-z0-9]{25}$/;

  // 1. Fast regex verification without DB read on invalid format
  if (!token || !tokenRegex.test(token)) {
    const prefixHash = hashTokenPrefix(token || '');
    await db.insert(scanLogs).values({
      eventId,
      tokenPrefixHash: prefixHash,
      mode: mode as any,
      result: ScanResult.YELLOW,
      scannerUserId: scanner.userId ?? null,
      passkeyId: scanner.passkeyId ?? null,
      ticketId: null,
      scannedAt: new Date(),
    });

    emitScanResult(eventId, {
      scanId: '',
      result: ScanResult.YELLOW,
      message: 'Invalid ticket token format.',
      timestamp: nowIso,
    });

    return {
      result: 'YELLOW',
      code: 'INVALID_TOKEN',
      message: 'Invalid ticket token format.',
      timestamp: nowIso,
    };
  }

  const prefixHash = hashTokenPrefix(token);

  // 2. Mode GATE check-in
  if (mode === 'GATE') {
    const scannerUserId = scanner.userId ?? null;

    // Atomic check-in update: exactly 1 concurrency winner on concurrent requests
    const res = await db.execute<{
      id: string;
      user_id: string;
      checked_in_at: Date | string;
    }>(
      sql`UPDATE tickets
          SET status = 'CHECKED_IN',
              checked_in_at = now(),
              checked_in_by = ${scannerUserId},
              checked_in_via = 'SCANNER'
          WHERE token = ${token} AND event_id = ${eventId} AND status = 'VALID'
          RETURNING id, user_id, checked_in_at`
    );

    if (res.rows.length > 0) {
      const row = res.rows[0]!;
      const checkedInAtIso = row.checked_in_at
        ? new Date(row.checked_in_at).toISOString()
        : nowIso;

      const [attendeeUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, row.user_id))
        .limit(1);

      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: ScanMode.GATE,
        result: ScanResult.GREEN,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: row.id,
        scannedAt: new Date(),
      });

      const firstName = attendeeUser?.fullName
        ? attendeeUser.fullName.split(' ')[0]!
        : 'Attendee';

      emitScanResult(eventId, {
        scanId: row.id,
        result: ScanResult.GREEN,
        attendeeName: attendeeUser?.fullName ?? 'Attendee',
        ticketId: row.id,
        message: 'Checked in successfully.',
        timestamp: checkedInAtIso,
      });

      return {
        result: 'GREEN',
        code: 'CHECKED_IN',
        message: 'Attendee successfully checked in.',
        attendee: attendeeUser
          ? {
              id: attendeeUser.id,
              firstName,
              fullName: attendeeUser.fullName,
              email: attendeeUser.email,
              rollNumber: attendeeUser.rollNumber,
              department: attendeeUser.department,
            }
          : undefined,
        ticket: {
          id: row.id,
          checkedInAt: checkedInAtIso,
        },
        timestamp: nowIso,
      };
    }

    // Follow-up query when 0 rows were updated
    const followUp = await db.execute<{
      id: string;
      event_id: string;
      status: string;
      checked_in_at: Date | string | null;
      checked_in_by: string | null;
      scanner_name: string | null;
    }>(
      sql`SELECT t.id, t.event_id, t.status, t.checked_in_at, t.checked_in_by, u.full_name as scanner_name
          FROM tickets t
          LEFT JOIN users u ON t.checked_in_by = u.id
          WHERE t.token = ${token}
          LIMIT 1`
    );

    if (followUp.rows.length === 0) {
      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: ScanMode.GATE,
        result: ScanResult.YELLOW,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: null,
        scannedAt: new Date(),
      });

      emitScanResult(eventId, {
        scanId: '',
        result: ScanResult.YELLOW,
        message: 'Ticket token not found.',
        timestamp: nowIso,
      });

      return {
        result: 'YELLOW',
        code: 'INVALID_TOKEN',
        message: 'Ticket token not found.',
        timestamp: nowIso,
      };
    }

    const ticketRow = followUp.rows[0]!;
    const ticketCheckedInAtIso = ticketRow.checked_in_at
      ? new Date(ticketRow.checked_in_at).toISOString()
      : undefined;

    if (ticketRow.event_id !== eventId) {
      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: ScanMode.GATE,
        result: ScanResult.YELLOW,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: ticketRow.id,
        scannedAt: new Date(),
      });

      emitScanResult(eventId, {
        scanId: ticketRow.id,
        result: ScanResult.YELLOW,
        message: 'Ticket belongs to a different event.',
        timestamp: nowIso,
      });

      return {
        result: 'YELLOW',
        code: 'WRONG_EVENT',
        message: 'Ticket belongs to a different event.',
        timestamp: nowIso,
      };
    }

    if (ticketRow.status === TicketStatus.VOID) {
      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: ScanMode.GATE,
        result: ScanResult.YELLOW,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: ticketRow.id,
        scannedAt: new Date(),
      });

      emitScanResult(eventId, {
        scanId: ticketRow.id,
        result: ScanResult.YELLOW,
        message: 'Ticket has been voided.',
        timestamp: nowIso,
      });

      return {
        result: 'YELLOW',
        code: 'VOID',
        message: 'Ticket has been voided.',
        timestamp: nowIso,
      };
    }

    if (ticketRow.status === TicketStatus.CHECKED_IN) {
      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: ScanMode.GATE,
        result: ScanResult.RED,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: ticketRow.id,
        scannedAt: new Date(),
      });

      emitScanResult(eventId, {
        scanId: ticketRow.id,
        result: ScanResult.RED,
        ticketId: ticketRow.id,
        message: 'Ticket was already checked in.',
        timestamp: nowIso,
      });

      return {
        result: 'RED',
        code: 'ALREADY_CHECKED_IN',
        message: 'Ticket has already been checked in.',
        scannedAt: ticketCheckedInAtIso,
        scannedByLabel: ticketRow.scanner_name || 'Volunteer Scanner',
        ticket: {
          id: ticketRow.id,
          checkedInAt: ticketCheckedInAtIso,
        },
        timestamp: nowIso,
      };
    }

    // Default yellow fallback
    return {
      result: 'YELLOW',
      code: 'UNKNOWN_STATUS',
      message: `Ticket status is ${ticketRow.status}.`,
      timestamp: nowIso,
    };
  }

  // 3. Mode MEAL or KIT redemptions
  if (mode === 'MEAL' || mode === 'KIT') {
    const [ticketRow] = await db
      .select({
        id: tickets.id,
        eventId: tickets.eventId,
        status: tickets.status,
      })
      .from(tickets)
      .where(eq(tickets.token, token))
      .limit(1);

    if (!ticketRow) {
      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: mode as any,
        result: ScanResult.YELLOW,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: null,
        scannedAt: new Date(),
      });

      return {
        result: 'YELLOW',
        code: 'INVALID_TOKEN',
        message: 'Ticket not found.',
        timestamp: nowIso,
      };
    }

    if (ticketRow.eventId !== eventId) {
      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: mode as any,
        result: ScanResult.YELLOW,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: ticketRow.id,
        scannedAt: new Date(),
      });

      return {
        result: 'YELLOW',
        code: 'WRONG_EVENT',
        message: 'Ticket is for a different event.',
        timestamp: nowIso,
      };
    }

    if (ticketRow.status !== TicketStatus.CHECKED_IN) {
      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: mode as any,
        result: ScanResult.YELLOW,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: ticketRow.id,
        scannedAt: new Date(),
      });

      return {
        result: 'YELLOW',
        code: 'NOT_CHECKED_IN',
        message: 'Ticket must be checked in at the gate before claiming meals or kits.',
        timestamp: nowIso,
      };
    }

    // Atomic redemption insert with ON CONFLICT DO NOTHING
    const scannerUserId = scanner.userId ?? null;
    const redeemRes = await db.execute<{
      id: string;
      ticket_id: string;
      kind: string;
      redeemed_at: Date | string;
    }>(
      sql`INSERT INTO ticket_redemptions (ticket_id, kind, redeemed_by)
          VALUES (${ticketRow.id}, ${mode}, ${scannerUserId})
          ON CONFLICT (ticket_id, kind) DO NOTHING
          RETURNING id, ticket_id, kind, redeemed_at`
    );

    if (redeemRes.rows.length > 0) {
      const redeemed = redeemRes.rows[0]!;
      const redeemedAtIso = redeemed.redeemed_at
        ? new Date(redeemed.redeemed_at).toISOString()
        : nowIso;

      await db.insert(scanLogs).values({
        eventId,
        tokenPrefixHash: prefixHash,
        mode: mode as any,
        result: ScanResult.GREEN,
        scannerUserId: scanner.userId ?? null,
        passkeyId: scanner.passkeyId ?? null,
        ticketId: ticketRow.id,
        scannedAt: new Date(),
      });

      emitScanResult(eventId, {
        scanId: redeemed.id,
        result: ScanResult.GREEN,
        ticketId: ticketRow.id,
        message: `${mode} successfully redeemed.`,
        timestamp: redeemedAtIso,
      });

      return {
        result: 'GREEN',
        code: 'REDEEMED',
        message: `${mode === 'MEAL' ? 'Meal' : 'Kit'} successfully redeemed.`,
        kind: mode,
        redeemedAt: redeemedAtIso,
        timestamp: nowIso,
      };
    }

    // Conflict: already redeemed!
    const [existing] = await db
      .select({ redeemedAt: ticketRedemptions.redeemedAt })
      .from(ticketRedemptions)
      .where(
        and(
          eq(ticketRedemptions.ticketId, ticketRow.id),
          eq(ticketRedemptions.kind, mode as any)
        )
      )
      .limit(1);

    const existingRedeemedAtIso = existing?.redeemedAt
      ? new Date(existing.redeemedAt).toISOString()
      : nowIso;

    await db.insert(scanLogs).values({
      eventId,
      tokenPrefixHash: prefixHash,
      mode: mode as any,
      result: ScanResult.RED,
      scannerUserId: scanner.userId ?? null,
      passkeyId: scanner.passkeyId ?? null,
      ticketId: ticketRow.id,
      scannedAt: new Date(),
    });

    emitScanResult(eventId, {
      scanId: ticketRow.id,
      result: ScanResult.RED,
      ticketId: ticketRow.id,
      message: `Already claimed ${mode.toLowerCase()}.`,
      timestamp: nowIso,
    });

    return {
      result: 'RED',
      code: 'ALREADY_REDEEMED',
      message: `This attendee has already claimed their ${mode.toLowerCase()}.`,
      kind: mode,
      redeemedAt: existingRedeemedAtIso,
      timestamp: nowIso,
    };
  }

  throw new AppError('VALIDATION_FAILED', `Unsupported scan mode '${mode}'`, 400);
}

/**
 * Searches for a student by roll number to check registration and check-in status.
 */
export async function lookupStudent(eventId: string, rollNumber: string) {
  const cleanRoll = rollNumber.trim();

  const [student] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      rollNumber: users.rollNumber,
      department: users.department,
    })
    .from(users)
    .where(sql`lower(${users.rollNumber}) = lower(${cleanRoll})`)
    .limit(1);

  if (!student) {
    return {
      firstName: null,
      fullName: null,
      rollNumber: cleanRoll,
      registered: false,
      checkedIn: false,
      ticketId: null,
    };
  }

  const [ticket] = await db
    .select({
      id: tickets.id,
      status: tickets.status,
      checkedInAt: tickets.checkedInAt,
    })
    .from(tickets)
    .where(
      and(eq(tickets.eventId, eventId), eq(tickets.userId, student.id))
    )
    .limit(1);

  const [reg] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.userId, student.id)
      )
    )
    .limit(1);

  const isRegistered = Boolean(ticket || reg);
  const isCheckedIn = ticket?.status === TicketStatus.CHECKED_IN;
  const firstName = student.fullName.split(' ')[0] ?? '';

  return {
    id: student.id,
    firstName,
    fullName: student.fullName,
    rollNumber: student.rollNumber,
    department: student.department,
    registered: isRegistered,
    checkedIn: isCheckedIn,
    checkedInAt: ticket?.checkedInAt
      ? new Date(ticket.checkedInAt).toISOString()
      : null,
    ticketId: ticket?.id ?? null,
  };
}

/**
 * Manually marks a student checked in by their roll number.
 */
export async function manualCheckin(
  scanner: ScannerPrincipal,
  params: { eventId: string; rollNumber: string }
) {
  const { eventId, rollNumber } = params;
  const cleanRoll = rollNumber.trim();

  const [student] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      rollNumber: users.rollNumber,
    })
    .from(users)
    .where(sql`lower(${users.rollNumber}) = lower(${cleanRoll})`)
    .limit(1);

  if (!student) {
    throw new AppError(
      'NOT_FOUND',
      `Student with roll number '${rollNumber}' not found in directory.`,
      404
    );
  }

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(
      and(eq(tickets.eventId, eventId), eq(tickets.userId, student.id))
    )
    .limit(1);

  if (!ticket) {
    throw new AppError(
      'NOT_FOUND',
      `No registration or ticket found for student '${rollNumber}' for this event.`,
      404
    );
  }

  if (ticket.status === TicketStatus.CHECKED_IN) {
    throw new AppError(
      'CONFLICT',
      `Student is already checked in (since ${ticket.checkedInAt ? new Date(ticket.checkedInAt).toISOString() : ''}).`,
      409,
      { checkedInAt: ticket.checkedInAt }
    );
  }

  const scannerUserId = scanner.userId ?? null;
  const res = await db.execute<{
    id: string;
    checked_in_at: Date | string;
  }>(
    sql`UPDATE tickets
        SET status = 'CHECKED_IN',
            checked_in_at = now(),
            checked_in_by = ${scannerUserId},
            checked_in_via = 'SCANNER'
        WHERE id = ${ticket.id} AND status = 'VALID'
        RETURNING id, checked_in_at`
  );

  if (res.rows.length === 0) {
    throw new AppError('CONFLICT', 'Ticket is not in valid status for check-in.', 409);
  }

  const updated = res.rows[0]!;
  const checkedInAtIso = updated.checked_in_at
    ? new Date(updated.checked_in_at).toISOString()
    : new Date().toISOString();
  const prefixHash = hashTokenPrefix(ticket.token);

  await db.insert(scanLogs).values({
    eventId,
    tokenPrefixHash: prefixHash,
    mode: ScanMode.GATE,
    result: ScanResult.GREEN,
    scannerUserId: scanner.userId ?? null,
    passkeyId: scanner.passkeyId ?? null,
    ticketId: ticket.id,
    scannedAt: new Date(),
  });

  emitScanResult(eventId, {
    scanId: ticket.id,
    result: ScanResult.GREEN,
    attendeeName: student.fullName,
    ticketId: ticket.id,
    message: 'Manually checked in attendee.',
    timestamp: checkedInAtIso,
  });

  return {
    status: 'CHECKED_IN',
    student: {
      id: student.id,
      firstName: student.fullName.split(' ')[0],
      fullName: student.fullName,
      rollNumber: student.rollNumber,
    },
    checkedInAt: checkedInAtIso,
  };
}

/**
 * Registers an attendee on the spot during a live event and instantly checks them in.
 */
export async function spotRegister(
  scanner: ScannerPrincipal,
  params: { eventId: string; rollNumber: string }
) {
  const { eventId, rollNumber } = params;
  const cleanRoll = rollNumber.trim();

  // 1. Verify event eligibility: must be LIVE or within 2h of start, and FREE
  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      status: events.status,
      startAt: events.startAt,
      endAt: events.endAt,
      pricePaise: events.pricePaise,
      capacity: events.capacity,
      remainingCapacity: events.remainingCapacity,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
  }

  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;
  const startTime = new Date(event.startAt).getTime();
  const endTime = new Date(event.endAt).getTime();
  const isTimeEligible =
    event.status === 'LIVE' ||
    (startTime - now <= twoHours && endTime >= now);

  if (!isTimeEligible) {
    throw new AppError(
      'FORBIDDEN',
      'Spot walk-in registration is only allowed when the event is LIVE or within 2 hours of starting.',
      403
    );
  }

  if (event.pricePaise > 0) {
    throw new AppError(
      'PAYMENT_FAILED',
      'Spot registration is only available for free events. Paid events require online checkout.',
      402
    );
  }

  // 2. Student lookup and validation
  const [student] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.rollNumber}) = lower(${cleanRoll})`)
    .limit(1);

  if (!student) {
    throw new AppError(
      'NOT_FOUND',
      `Student with roll number '${rollNumber}' does not exist in student directory.`,
      404
    );
  }

  // 3. Penalty cooldown check
  assertNotInCooldown(student);

  // 4. Duplicate registration check
  const [existingReg] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.userId, student.id)
      )
    )
    .limit(1);

  if (existingReg) {
    throw new AppError(
      'CONFLICT',
      'Student is already registered for this event.',
      409
    );
  }

  // 5. Atomic seat decrement, registration insertion, and ticket check-in in transaction
  const result = await withTx(async (tx) => {
    const seatRes = await tx.execute<{ remaining_capacity: number }>(
      sql`UPDATE events
          SET remaining_capacity = remaining_capacity - 1,
              updated_at = now()
          WHERE id = ${eventId} AND remaining_capacity > 0
          RETURNING remaining_capacity`
    );

    if (seatRes.rows.length === 0) {
      throw new AppError(
        'SOLD_OUT',
        'Event is sold out. No capacity remaining for spot walk-ins.',
        409
      );
    }

    const remainingCapacity = seatRes.rows[0]!.remaining_capacity;

    const [reg] = await tx
      .insert(registrations)
      .values({
        eventId,
        userId: student.id,
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.NOT_REQUIRED,
      })
      .returning();

    const token = generateOpaqueToken();
    const scannerUserId = scanner.userId ?? null;

    const [ticket] = await tx
      .insert(tickets)
      .values({
        registrationId: reg!.id,
        eventId,
        userId: student.id,
        token,
        status: TicketStatus.CHECKED_IN,
        checkedInAt: new Date(),
        checkedInBy: scannerUserId,
        checkedInVia: 'SPOT_WALKIN',
      })
      .returning();

    const prefixHash = hashTokenPrefix(token);
    await tx.insert(scanLogs).values({
      eventId,
      tokenPrefixHash: prefixHash,
      mode: ScanMode.GATE,
      result: ScanResult.GREEN,
      scannerUserId: scanner.userId ?? null,
      passkeyId: scanner.passkeyId ?? null,
      ticketId: ticket!.id,
      scannedAt: new Date(),
    });

    return {
      registrationId: reg!.id,
      ticketId: ticket!.id,
      checkedInAt: ticket!.checkedInAt,
      remainingCapacity,
    };
  });

  // 6. Broadcast seat update and scan result realtime events
  emitSeats(eventId, result.remainingCapacity);
  emitScanResult(eventId, {
    scanId: result.ticketId,
    result: ScanResult.GREEN,
    attendeeName: student.fullName,
    ticketId: result.ticketId,
    message: 'Spot walk-in registered and checked in.',
    timestamp: result.checkedInAt
      ? new Date(result.checkedInAt).toISOString()
      : new Date().toISOString(),
  });

  return {
    registrationId: result.registrationId,
    ticketId: result.ticketId,
    student: {
      id: student.id,
      firstName: student.fullName.split(' ')[0],
      fullName: student.fullName,
      rollNumber: student.rollNumber,
      department: student.department,
    },
    status: 'CHECKED_IN',
    checkedInAt: result.checkedInAt
      ? new Date(result.checkedInAt).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Returns comprehensive gate statistics for organizers and dashboard displays.
 */
export async function getGateStats(eventId: string) {
  const [event] = await db
    .select({
      capacity: events.capacity,
      remainingCapacity: events.remainingCapacity,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
  }

  // Count tickets checked in
  const [checkedInCount] = await db
    .select({ total: count() })
    .from(tickets)
    .where(
      and(
        eq(tickets.eventId, eventId),
        eq(tickets.status, TicketStatus.CHECKED_IN)
      )
    );

  // Count redemptions for this event
  const [mealRedemptions] = await db
    .select({ total: count() })
    .from(ticketRedemptions)
    .innerJoin(tickets, eq(ticketRedemptions.ticketId, tickets.id))
    .where(
      and(
        eq(tickets.eventId, eventId),
        eq(ticketRedemptions.kind, ScanMode.MEAL)
      )
    );

  const [kitRedemptions] = await db
    .select({ total: count() })
    .from(ticketRedemptions)
    .innerJoin(tickets, eq(ticketRedemptions.ticketId, tickets.id))
    .where(
      and(
        eq(tickets.eventId, eventId),
        eq(ticketRedemptions.kind, ScanMode.KIT)
      )
    );

  return {
    checkedIn: Number(checkedInCount?.total ?? 0),
    remaining: event.remainingCapacity,
    totalCapacity: event.capacity,
    mealsRedeemed: Number(mealRedemptions?.total ?? 0),
    kitsRedeemed: Number(kitRedemptions?.total ?? 0),
  };
}
