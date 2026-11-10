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
  projectSubmissions,
  Registration,
  registrations,
  Ticket,
  tickets,
  User,
  waitlistEntries,
} from '../../db/schema';
import { ProjectSubmissionConfig } from '@eventora/shared';
import { AppError } from '../../lib/app-error';
import { assertNotInCooldown } from '../../middleware/rbac';
import { emitSeats } from '../../realtime/io';
import { freezeFormIfNeeded, submitAnswers } from '../forms/service';
import { SubmitProjectInput, validateSubmissionAgainstConfig } from '../submissions/service';
import {
  calculateWaitlistPosition,
  releaseSeat,
} from '../waitlist/service';
import {
  notifyBookingConfirmed,
  notifyInApp,
  notifyRegistrationApproved,
  notifyRegistrationCancelled,
  notifyRegistrationRejected,
} from '../comms/queue';
import { issueTicket } from './ticket-service';

export interface RegisterForEventParams {
  eventId: string;
  user: User;
  answers: Record<string, unknown>;
  projectSubmission?: SubmitProjectInput | null;
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

  let result: RegisterResult;
  try {
    result = await withTx(async (tx) => {
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
    if (now > event.endAt) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Cannot register for an event that has already ended.',
        400
      );
    }

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

    // Direct team-only events to the team flow
    if (
      event.registrationMode === 'TEAM' ||
      (event.isCompetition && (event.minTeamSize ?? 1) > 1)
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        'This event requires team registration. Solo registrations are disallowed.',
        400,
        {
          registrationMode: event.registrationMode,
          isCompetition: event.isCompetition,
          minTeamSize: event.minTeamSize,
        }
      );
    }

    // Validate project submission if configured for DURING_REGISTRATION
    const subConfig = event.projectSubmissionConfig as ProjectSubmissionConfig | null;
    if (subConfig?.enabled && subConfig?.timing === 'DURING_REGISTRATION') {
      const subInput = params.projectSubmission;
      const hasSubmission = Boolean(
        subInput &&
          (subInput.projectTitle?.trim() ||
            subInput.abstract?.trim() ||
            subInput.repoUrl?.trim() ||
            subInput.demoUrl?.trim())
      );

      if (subConfig.requirement === 'MANDATORY' && !hasSubmission) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Project submission is mandatory for this event during registration.',
          400
        );
      }

      if (hasSubmission) {
        validateSubmissionAgainstConfig(subConfig, event, subInput!, false);
      }
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
        const approvalStatus = event.approvalRequired ? 'PENDING' : 'APPROVED';
        const [reg] = await tx
          .insert(registrations)
          .values({
            eventId,
            userId: user.id,
            status: RegistrationStatus.CONFIRMED,
            paymentStatus: PaymentStatus.NOT_REQUIRED,
            amountPaise: 0,
            formVersion: event.formVersion ?? 1,
            approvalStatus,
          })
          .returning();

        // Submit form answers
        await submitAnswers(tx, {
          registrationId: reg!.id,
          eventId,
          answers,
        });

        // Save project submission if provided during registration
        if (
          params.projectSubmission &&
          (params.projectSubmission.projectTitle?.trim() ||
            params.projectSubmission.abstract?.trim() ||
            params.projectSubmission.repoUrl?.trim() ||
            params.projectSubmission.demoUrl?.trim())
        ) {
          const subNow = new Date();
          await tx.insert(projectSubmissions).values({
            eventId,
            teamId: null,
            userId: user.id,
            registrationId: reg!.id,
            projectTitle: params.projectSubmission.projectTitle?.trim() || null,
            projectAbstract: params.projectSubmission.abstract?.trim() || null,
            repoUrl: params.projectSubmission.repoUrl?.trim() || null,
            demoUrl: params.projectSubmission.demoUrl?.trim() || null,
            deckKey: params.projectSubmission.deckKey || null,
            customFields: params.projectSubmission.customFields || {},
            status: 'SUBMITTED',
            createdAt: subNow,
            updatedAt: subNow,
          });
        }

        let ticket: Ticket | undefined;
        if (approvalStatus === 'APPROVED') {
          // Issue ticket
          ticket = await issueTicket(tx, reg!);
          // Enqueue confirmation notifications (EMAIL and WHATSAPP and IN_APP)
          await notifyBookingConfirmed(tx, reg!.id);
        } else {
          // Notify that registration is pending organizer approval
          await notifyInApp(tx, {
            userId: user.id,
            eventId,
            kind: NotificationKind.BOOKING_CONFIRMED,
            title: 'Registration Received (Pending Approval)',
            message: `Your registration for "${event.title}" is pending organizer approval.`,
            metadata: { registrationId: reg!.id, status: 'PENDING_APPROVAL' },
          });
        }

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
            formVersion: event.formVersion ?? 1,
            approvalStatus: event.approvalRequired ? 'PENDING' : 'APPROVED',
          })
          .returning();

        // Submit form answers
        await submitAnswers(tx, {
          registrationId: reg!.id,
          eventId,
          answers,
        });

        // Save project submission if provided during registration
        if (
          params.projectSubmission &&
          (params.projectSubmission.projectTitle?.trim() ||
            params.projectSubmission.abstract?.trim() ||
            params.projectSubmission.repoUrl?.trim() ||
            params.projectSubmission.demoUrl?.trim())
        ) {
          const subNow = new Date();
          await tx.insert(projectSubmissions).values({
            eventId,
            teamId: null,
            userId: user.id,
            registrationId: reg!.id,
            projectTitle: params.projectSubmission.projectTitle?.trim() || null,
            projectAbstract: params.projectSubmission.abstract?.trim() || null,
            repoUrl: params.projectSubmission.repoUrl?.trim() || null,
            demoUrl: params.projectSubmission.demoUrl?.trim() || null,
            deckKey: params.projectSubmission.deckKey || null,
            customFields: params.projectSubmission.customFields || {},
            status: 'SUBMITTED',
            createdAt: subNow,
            updatedAt: subNow,
          });
        }

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
          formVersion: event.formVersion ?? 1,
          approvalStatus: event.approvalRequired ? 'PENDING' : 'APPROVED',
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
  } catch (err: any) {
    if (
      (err?.code === '23505' || err?.cause?.code === '23505') &&
      (String(err?.constraint || err?.cause?.constraint || '').includes('registrations_event_user') ||
       String(err?.message || '').includes('registrations_event_user_active_idx'))
    ) {
      throw new AppError(
        'CONFLICT',
        'You already have an active registration for this event.',
        409,
        { eventId, userId: user.id }
      );
    }
    throw err;
  }

  // 5. Emit real-time seats update after successful transaction commit
  if (remainingAfterCommit !== undefined) {
    emitSeats(eventId, remainingAfterCommit);
  }

  return result;
}

export interface CancelRegistrationOptions {
  reason?: string;
  isOrganizerOverride?: boolean;
}

/**
 * Cancels a user's registration, voids associated ticket, simulates refund if paid,
 * and releases the seat to the next waitlisted participant or general capacity.
 * Enforces organizer-defined cancellation deadlines for student cancellations.
 */
export async function cancelRegistration(
  user: User,
  registrationId: string,
  options?: CancelRegistrationOptions
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

    if (
      !options?.isOrganizerOverride &&
      reg.userId !== user.id &&
      user.role !== UserRole.ADMIN
    ) {
      throw new AppError(
        'FORBIDDEN',
        'You are not authorized to cancel this registration.',
        403
      );
    }

    if (reg.status === RegistrationStatus.CANCELLED) {
      return { success: true, message: 'Registration is already cancelled.' };
    }

    // Verify cancellation deadline for student cancellation requests
    if (!options?.isOrganizerOverride && user.role !== UserRole.ADMIN) {
      const [event] = await tx
        .select({ cancellationDeadline: events.cancellationDeadline })
        .from(events)
        .where(eq(events.id, reg.eventId))
        .limit(1);

      if (
        event?.cancellationDeadline &&
        new Date() > new Date(event.cancellationDeadline)
      ) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Cancellation deadline has passed for this event.',
          400
        );
      }
    }

    const previousStatus = reg.status;
    const cancellationReason =
      options?.reason ??
      (options?.isOrganizerOverride
        ? 'Cancelled by organizer'
        : 'Cancelled by student');

    // Update registration to CANCELLED
    await tx
      .update(registrations)
      .set({
        status: RegistrationStatus.CANCELLED,
        paymentStatus:
          reg.paymentStatus === PaymentStatus.SUCCEEDED
            ? PaymentStatus.REFUNDED
            : reg.paymentStatus,
        cancellationReason,
        reviewedBy: options?.isOrganizerOverride ? user.id : reg.reviewedBy,
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

    // Send cancellation notification
    await notifyRegistrationCancelled(tx, registrationId, cancellationReason);

    return { success: true };
  });
}

/**
 * Approves a registration requiring organizer review.
 */
export async function approveRegistration(
  organizerUser: User,
  eventId: string,
  registrationId: string
): Promise<{ success: boolean; registration: Registration; ticket?: Ticket }> {
  return withTx(async (tx) => {
    const [reg] = await tx
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.id, registrationId),
          eq(registrations.eventId, eventId)
        )
      )
      .limit(1)
      .for('update');

    if (!reg) {
      throw new AppError('NOT_FOUND', 'Registration not found for this event.', 404);
    }

    if (reg.status === RegistrationStatus.CANCELLED) {
      throw new AppError('CONFLICT', 'Cannot approve a cancelled registration.', 409);
    }

    const [updatedReg] = await tx
      .update(registrations)
      .set({
        approvalStatus: 'APPROVED',
        reviewedBy: organizerUser.id,
        reviewedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId))
      .returning();

    let ticket: Ticket | undefined;
    // Issue ticket if registration is confirmed and payment is completed or not required
    if (
      updatedReg!.status === RegistrationStatus.CONFIRMED &&
      (updatedReg!.paymentStatus === PaymentStatus.NOT_REQUIRED ||
        updatedReg!.paymentStatus === PaymentStatus.SUCCEEDED)
    ) {
      const [existingTicket] = await tx
        .select()
        .from(tickets)
        .where(eq(tickets.registrationId, registrationId))
        .limit(1);

      if (existingTicket) {
        ticket = existingTicket;
      } else {
        ticket = await issueTicket(tx, updatedReg!);
      }

      await notifyBookingConfirmed(tx, registrationId);
    }

    await notifyRegistrationApproved(tx, registrationId, organizerUser.fullName);

    return {
      success: true,
      registration: updatedReg!,
      ticket,
    };
  });
}

/**
 * Rejects an attendee registration with reason, voids ticket, refunds if paid, and releases seat.
 */
export async function rejectRegistration(
  organizerUser: User,
  eventId: string,
  registrationId: string,
  reason?: string
): Promise<{ success: boolean; registration: Registration }> {
  return withTx(async (tx) => {
    const [reg] = await tx
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.id, registrationId),
          eq(registrations.eventId, eventId)
        )
      )
      .limit(1)
      .for('update');

    if (!reg) {
      throw new AppError('NOT_FOUND', 'Registration not found for this event.', 404);
    }

    const previousStatus = reg.status;

    // Void ticket if present
    await tx
      .update(tickets)
      .set({ status: TicketStatus.VOID })
      .where(eq(tickets.registrationId, registrationId));

    // Handle refund if paid
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

    const [updatedReg] = await tx
      .update(registrations)
      .set({
        status: RegistrationStatus.CANCELLED,
        approvalStatus: 'REJECTED',
        paymentStatus:
          reg.paymentStatus === PaymentStatus.SUCCEEDED
            ? PaymentStatus.REFUNDED
            : reg.paymentStatus,
        reviewedBy: organizerUser.id,
        reviewedAt: new Date(),
        rejectionReason: reason ?? 'Rejected by event organizer',
        cancelledAt: new Date(),
      })
      .where(eq(registrations.id, registrationId))
      .returning();

    // Release seat if held
    if (
      previousStatus === RegistrationStatus.CONFIRMED ||
      previousStatus === RegistrationStatus.OFFERED
    ) {
      await releaseSeat(tx, eventId);
    }

    await notifyRegistrationRejected(tx, registrationId, reason, organizerUser.fullName);

    return {
      success: true,
      registration: updatedReg!,
    };
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

    // Free event -> Issue ticket and enqueue notifications if approved
    let ticket: Ticket | undefined;
    if (claimed.approvalStatus === 'APPROVED') {
      ticket = await issueTicket(tx, claimed);
      await notifyBookingConfirmed(tx, claimed.id);
    }

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
