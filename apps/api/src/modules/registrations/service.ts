import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  EventStatus,
  NotificationChannel,
  NotificationKind,
  PaymentStatus,
  RegistrationStatus,
  TicketStatus,
  UserRole,
} from '@eventora/shared';
import { db, withTx } from '../../db/client';
import {
  events,
  ledgerEntries,
  notifications,
  payments,
  Registration,
  registrations,
  Ticket,
  tickets,
  User,
  waitlistEntries,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { assertNotInCooldown } from '../../middleware/rbac';
import { emitSeats } from '../../realtime/io';
import { freezeFormIfNeeded, submitAnswers } from '../forms/service';
import {
  calculateWaitlistPosition,
  releaseSeat,
} from '../waitlist/service';
import { notifyBookingConfirmed } from '../comms/queue';
import { issueTicket } from './ticket-service';

export interface RegisterForEventParams {
  eventId: string;
  user: User;
  answers: Record<string, unknown>;
}

export interface RegisterResult {
  outcome: 'CONFIRMED' | 'PAYMENT_REQUIRED' | 'WAITLISTED';
  registration: Registration;
  ticket?: Ticket;
  position?: number;
}

/**
 * Executes ACID seat reservation or waitlist insertion in one transaction.
 */
export async function registerForEvent(
  params: RegisterForEventParams
): Promise<RegisterResult> {
  const { eventId, user, answers } = params;

  // 1. Assert user is not under active strike penalty cooldown
  assertNotInCooldown(user);

  let remainingAfterCommit: number | undefined;

  const result = await withTx(async (tx) => {
    // 2. Load event to check status, time windows, and competition constraints
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
    }

    if (
      event.status !== EventStatus.PUBLISHED &&
      event.status !== EventStatus.LIVE
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Event is not currently open for registrations (status: ${event.status}).`,
        400
      );
    }

    const now = new Date();
    if (now < event.registrationOpensAt) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Registrations for this event open at ${event.registrationOpensAt.toISOString()}.`,
        400
      );
    }

    if (now > event.registrationClosesAt) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Registrations for this event closed at ${event.registrationClosesAt.toISOString()}.`,
        400
      );
    }

    // Direct team-only competitions to the team flow
    if (event.isCompetition && (event.minTeamSize ?? 1) > 1) {
      throw new AppError(
        'VALIDATION_FAILED',
        'This competition event requires team registration. Solo registrations are disallowed.',
        400,
        { isCompetition: true, minTeamSize: event.minTeamSize }
      );
    }

    // Check for existing active registration (idempotent / duplicate rejection)
    const [existing] = await tx
      .select({ id: registrations.id, status: registrations.status })
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, eventId),
          eq(registrations.userId, user.id),
          notInArray(registrations.status, [
            RegistrationStatus.CANCELLED,
            RegistrationStatus.EXPIRED,
          ])
        )
      )
      .limit(1)
      .for('update');

    if (existing) {
      throw new AppError(
        'CONFLICT',
        `You already have an active registration for this event (status: ${existing.status}).`,
        409,
        { registrationId: existing.id, status: existing.status }
      );
    }

    // 3. Form freeze check
    await freezeFormIfNeeded(tx, eventId);

    // 4. Atomic capacity decrement
    const [reserved] = await tx
      .update(events)
      .set({
        remainingCapacity: sql`${events.remainingCapacity} - 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(events.id, eventId),
          sql`${events.remainingCapacity} > 0`
        )
      )
      .returning({ remainingCapacity: events.remainingCapacity });

    if (reserved) {
      remainingAfterCommit = reserved.remainingCapacity;

      if (!event.isPaid || event.pricePaise === 0) {
        // Free Event -> Instantly CONFIRMED
        const [reg] = await tx
          .insert(registrations)
          .values({
            eventId,
            userId: user.id,
            status: RegistrationStatus.CONFIRMED,
            paymentStatus: PaymentStatus.NOT_REQUIRED,
            amountPaise: 0,
          })
          .returning();

        // Submit form answers
        await submitAnswers(tx, {
          registrationId: reg!.id,
          eventId,
          answers,
        });

        // Issue ticket
        const ticket = await issueTicket(tx, reg!);

        // Enqueue confirmation notifications (EMAIL and WHATSAPP)
        await notifyBookingConfirmed(tx, reg!.id);

        return {
          outcome: 'CONFIRMED' as const,
          registration: reg!,
          ticket,
        };
      } else {
        // Paid Event -> PENDING payment with 10-minute hold
        const [reg] = await tx
          .insert(registrations)
          .values({
            eventId,
            userId: user.id,
            status: RegistrationStatus.CONFIRMED,
            paymentStatus: PaymentStatus.PENDING,
            amountPaise: event.pricePaise,
          })
          .returning();

        // Submit form answers
        await submitAnswers(tx, {
          registrationId: reg!.id,
          eventId,
          answers,
        });

        return {
          outcome: 'PAYMENT_REQUIRED' as const,
          registration: reg!,
        };
      }
    } else {
      // Zero rows returned -> Event sold out; serialize waitlist entry insertion via event lock
      await tx.execute(sql`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`);

      const [reg] = await tx
        .insert(registrations)
        .values({
          eventId,
          userId: user.id,
          status: RegistrationStatus.WAITLISTED,
          paymentStatus: PaymentStatus.NOT_REQUIRED,
          amountPaise: event.isPaid ? event.pricePaise : 0,
        })
        .returning();

      const [entry] = await tx
        .insert(waitlistEntries)
        .values({
          eventId,
          userId: user.id,
          registrationId: reg!.id,
          status: 'QUEUED',
          createdAt: sql`clock_timestamp()`,
        })
        .returning();

      const [countResult] = await tx
        .select({
          position: sql<number>`count(*)::int`,
        })
        .from(waitlistEntries)
        .where(
          and(
            eq(waitlistEntries.eventId, eventId),
            eq(waitlistEntries.status, 'QUEUED')
          )
        );

      const position = Number(countResult?.position ?? 1);

      await tx
        .update(registrations)
        .set({ waitlistPositionHint: position })
        .where(eq(registrations.id, reg!.id));

      // Submit form answers
      await submitAnswers(tx, {
        registrationId: reg!.id,
        eventId,
        answers,
      });

      return {
        outcome: 'WAITLISTED' as const,
        registration: reg!,
        position,
      };
    }
  });

  // 5. Emit real-time seats update after successful transaction commit
  if (remainingAfterCommit !== undefined) {
    emitSeats(eventId, remainingAfterCommit);
  }

  return result;
}

/**
 * Cancels a user's registration, voids associated ticket, simulates refund if paid,
 * and releases the seat to the next waitlisted participant or general capacity.
 */
export async function cancelRegistration(
  user: User,
  registrationId: string
): Promise<{ success: boolean; message?: string }> {
  return withTx(async (tx) => {
    const [reg] = await tx
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId))
      .limit(1)
      .for('update');

    if (!reg) {
      throw new AppError('NOT_FOUND', 'Registration not found.', 404);
    }

    if (reg.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new AppError(
        'FORBIDDEN',
        'You are not authorized to cancel this registration.',
        403
      );
    }

    if (reg.status === RegistrationStatus.CANCELLED) {
      return { success: true, message: 'Registration is already cancelled.' };
    }

    const previousStatus = reg.status;

    // Update registration to CANCELLED
    await tx
      .update(registrations)
      .set({
        status: RegistrationStatus.CANCELLED,
        cancelledAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));

    // Void ticket if present
    await tx
      .update(tickets)
      .set({ status: TicketStatus.VOID })
      .where(eq(tickets.registrationId, registrationId));

    // Handle refund if paid and confirmed
    if (
      reg.paymentStatus === PaymentStatus.SUCCEEDED &&
      reg.amountPaise > 0
    ) {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.registrationId, registrationId))
        .orderBy(desc(payments.createdAt))
        .limit(1);

      if (payment) {
        // Query running balance
        const [lastLedger] = await tx
          .select({ balanceAfterPaise: ledgerEntries.balanceAfterPaise })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.paymentId, payment.id))
          .orderBy(desc(ledgerEntries.createdAt))
          .limit(1);

        const currentBalance = lastLedger?.balanceAfterPaise ?? payment.amountPaise;
        const newBalance = currentBalance - payment.amountPaise;

        await tx.insert(ledgerEntries).values({
          paymentId: payment.id,
          kind: 'REFUND',
          amountPaise: -payment.amountPaise,
          balanceAfterPaise: newBalance,
        });

        await tx
          .update(payments)
          .set({ status: PaymentStatus.REFUNDED })
          .where(eq(payments.id, payment.id));
      }
    }

    // If registration held a seat, release it to waitlist or capacity
    if (
      previousStatus === RegistrationStatus.CONFIRMED ||
      previousStatus === RegistrationStatus.OFFERED
    ) {
      await releaseSeat(tx, reg.eventId);
    }

    return { success: true };
  });
}

/**
 * Claims a waitlist offer within its valid expiration window.
 */
export async function claimWaitlistOffer(
  user: User,
  registrationId: string
): Promise<RegisterResult> {
  return withTx(async (tx) => {
    // 1. Atomically claim registration if still in valid OFFERED window
    const [claimed] = await tx
      .update(registrations)
      .set({
        status: RegistrationStatus.CONFIRMED,
      })
      .where(
        and(
          eq(registrations.id, registrationId),
          eq(registrations.userId, user.id),
          eq(registrations.status, RegistrationStatus.OFFERED),
          sql`${registrations.offerExpiresAt} > now()`
        )
      )
      .returning();

    if (!claimed) {
      throw new AppError(
        'OFFER_EXPIRED',
        'Waitlist offer has expired or is invalid.',
        410
      );
    }

    // 2. Mark waitlist entry CLAIMED
    await tx
      .update(waitlistEntries)
      .set({ status: 'CLAIMED' })
      .where(
        and(
          eq(waitlistEntries.registrationId, claimed.id),
          eq(waitlistEntries.status, 'OFFERED')
        )
      );

    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, claimed.eventId))
      .limit(1);

    if (event?.isPaid && event.pricePaise > 0) {
      // Transition to payment PENDING with fresh 10-minute hold
      const tenMinutes = new Date(Date.now() + 10 * 60 * 1000);
      const [paidPending] = await tx
        .update(registrations)
        .set({
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PENDING,
          offerExpiresAt: tenMinutes,
        })
        .where(eq(registrations.id, claimed.id))
        .returning();

      return {
        outcome: 'PAYMENT_REQUIRED',
        registration: paidPending!,
      };
    }

    // Free event -> Issue ticket and enqueue notifications (EMAIL & WHATSAPP)
    const ticket = await issueTicket(tx, claimed);
    await notifyBookingConfirmed(tx, claimed.id);

    return {
      outcome: 'CONFIRMED',
      registration: claimed,
      ticket,
    };
  });
}

/**
 * Retrieves all registrations for the authenticated user.
 */
export async function getUserRegistrations(userId: string) {
  const rows = await db
    .select({
      registration: registrations,
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
        startAt: events.startAt,
        endAt: events.endAt,
        category: events.category,
        posterKey: events.posterKey,
        isPaid: events.isPaid,
        pricePaise: events.pricePaise,
      },
      ticket: tickets,
    })
    .from(registrations)
    .innerJoin(events, eq(registrations.eventId, events.id))
    .leftJoin(tickets, eq(tickets.registrationId, registrations.id))
    .where(eq(registrations.userId, userId))
    .orderBy(desc(registrations.createdAt));

  return rows;
}
