import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  NotificationChannel,
  NotificationKind,
  PaymentStatus,
  RegistrationStatus,
} from '@eventora/shared';
import { withTx } from '../../db/client';
import {
  ledgerEntries,
  notifications,
  Payment,
  payments,
  Registration,
  registrations,
  Ticket,
  tickets,
  User,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { issueTicket } from '../registrations/ticket-service';
import { releaseSeat } from '../waitlist/service';
import {
  notifyBookingConfirmed,
  notifyInApp,
  notifyPaymentFailed,
  notifyPaymentSuccess,
} from '../comms/queue';

/**
 * Strict schema for sandbox checkout simulation:
 * Explicitly forbids card numbers, bank accounts, UPI IDs, or any extraneous parameters.
 */
export const sandboxCheckoutSchema = z
  .object({
    simulate: z.enum(['SUCCESS', 'FAILURE']),
  })
  .strict();

export type SandboxCheckoutInput = z.infer<typeof sandboxCheckoutSchema>;

export interface ProcessSandboxResult {
  outcome: 'SUCCEEDED' | 'FAILED';
  payment: Payment;
  ticket?: Ticket;
}

/**
 * Generates an HMAC SHA-256 signature for sandbox webhook validation.
 */
export function signSandboxWebhookPayload(payload: string): string {
  return crypto
    .createHmac('sha256', env.MAGIC_LINK_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Verifies the incoming webhook HMAC signature.
 */
export function verifySandboxWebhookSignature(
  payload: string,
  signature: string
): boolean {
  try {
    const expected = signSandboxWebhookPayload(payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Handles sandbox webhook logic atomically inside a database transaction.
 */
export async function handleSandboxWebhook(params: {
  paymentId: string;
  simulate: 'SUCCESS' | 'FAILURE';
}): Promise<ProcessSandboxResult> {
  const { paymentId, simulate } = params;

  return withTx(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1)
      .for('update');

    if (!payment) {
      throw new AppError('NOT_FOUND', `Payment '${paymentId}' not found.`, 404);
    }

    const [registration] = await tx
      .select()
      .from(registrations)
      .where(eq(registrations.id, payment.registrationId))
      .limit(1)
      .for('update');

    if (!registration) {
      throw new AppError(
        'NOT_FOUND',
        `Registration '${payment.registrationId}' not found.`,
        404
      );
    }

    // Idempotency: if payment already completed, return existing result without duplicate ledger entries or tickets
    if (payment.status === PaymentStatus.SUCCEEDED) {
      const [existingTicket] = await tx
        .select()
        .from(tickets)
        .where(eq(tickets.registrationId, registration.id))
        .limit(1);

      return {
        outcome: 'SUCCEEDED',
        payment,
        ticket: existingTicket,
      };
    }

    if (payment.status === PaymentStatus.FAILED) {
      return {
        outcome: 'FAILED',
        payment,
      };
    }

    if (simulate === 'SUCCESS') {
      // 1. Update payment to SUCCEEDED
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          status: PaymentStatus.SUCCEEDED,
          settledAt: new Date(),
        })
        .where(eq(payments.id, paymentId))
        .returning();

      // 2. Update registration to CONFIRMED
      const [confirmedReg] = await tx
        .update(registrations)
        .set({
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: PaymentStatus.SUCCEEDED,
        })
        .where(eq(registrations.id, registration.id))
        .returning();

      // 3. Record running balance in ledger
      const [lastLedger] = await tx
        .select({ balanceAfterPaise: ledgerEntries.balanceAfterPaise })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.paymentId, paymentId))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(1);

      const previousBalance = lastLedger?.balanceAfterPaise ?? 0;
      const newBalance = previousBalance + payment.amountPaise;

      await tx.insert(ledgerEntries).values({
        paymentId,
        kind: 'CHARGE',
        amountPaise: payment.amountPaise,
        balanceAfterPaise: newBalance,
      });

      // 4. Issue ticket and notify participant if already approved
      let ticket: Ticket | undefined;
      if (confirmedReg?.approvalStatus === 'APPROVED') {
        ticket = await issueTicket(tx, confirmedReg!);
        await notifyBookingConfirmed(tx, registration.id);
      }

      await notifyPaymentSuccess(tx, {
        userId: registration.userId,
        eventId: registration.eventId,
        registrationId: registration.id,
        amount: payment.amountPaise / 100,
        transactionId: paymentId,
      });

      return {
        outcome: 'SUCCEEDED',
        payment: updatedPayment!,
        ticket,
      };
    } else {
      // Simulate FAILURE: release held seat back to capacity or waitlist
      const [failedPayment] = await tx
        .update(payments)
        .set({
          status: PaymentStatus.FAILED,
        })
        .where(eq(payments.id, paymentId))
        .returning();

      await tx
        .update(registrations)
        .set({
          status: RegistrationStatus.CANCELLED,
          paymentStatus: PaymentStatus.FAILED,
          cancelledAt: new Date(),
          cancellationReason: 'Payment simulation failure',
        })
        .where(eq(registrations.id, registration.id));

      await releaseSeat(tx, registration.eventId);

      await notifyPaymentFailed(tx, {
        userId: registration.userId,
        eventId: registration.eventId,
        registrationId: registration.id,
        errorReason: 'Payment simulation declined in test sandbox mode',
      });

      return {
        outcome: 'FAILED',
        payment: failedPayment!,
      };
    }
  });
}

/**
 * Initiates simulated checkout in 100% sandbox mode.
 */
export async function createSandboxCheckout(
  user: User,
  registrationId: string,
  input: SandboxCheckoutInput
): Promise<ProcessSandboxResult> {
  if (env.PAYMENT_MODE !== 'sandbox') {
    throw new AppError(
      'VALIDATION_FAILED',
      'Sandbox checkout is only accessible when PAYMENT_MODE=sandbox.',
      400
    );
  }

  // Parse strictly to forbid unknown/financial parameters
  const parsed = sandboxCheckoutSchema.parse(input);

  const payment = await withTx(async (tx) => {
    const [reg] = await tx
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId))
      .limit(1)
      .for('update');

    if (!reg) {
      throw new AppError('NOT_FOUND', 'Registration not found.', 404);
    }

    if (reg.userId !== user.id && user.role !== 'ADMIN') {
      throw new AppError('FORBIDDEN', 'Unauthorized to checkout this registration.', 403);
    }

    // Idempotent: if payment already succeeded, return existing payment record and ticket
    if (reg.paymentStatus === PaymentStatus.SUCCEEDED) {
      const [existingPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.registrationId, reg.id))
        .orderBy(desc(payments.createdAt))
        .limit(1);

      const [existingTicket] = await tx
        .select()
        .from(tickets)
        .where(eq(tickets.registrationId, reg.id))
        .limit(1);

      return {
        alreadyCompleted: true as const,
        outcome: 'SUCCEEDED' as const,
        payment: existingPayment!,
        ticket: existingTicket,
      };
    }

    if (
      reg.paymentStatus !== PaymentStatus.PENDING ||
      (reg.status !== RegistrationStatus.OFFERED &&
        reg.status !== RegistrationStatus.CONFIRMED)
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Registration is not in payable pending state (status: ${reg.status}, payment: ${reg.paymentStatus}).`,
        400
      );
    }

    // Insert pending payment record
    const [createdPayment] = await tx
      .insert(payments)
      .values({
        registrationId: reg.id,
        provider: 'SANDBOX',
        providerRef: `sbx_${crypto.randomUUID()}`,
        amountPaise: reg.amountPaise,
        status: PaymentStatus.PENDING,
      })
      .returning();

    return createdPayment!;
  });

  if ('alreadyCompleted' in payment) {
    return {
      outcome: 'SUCCEEDED',
      payment: payment.payment,
      ticket: payment.ticket,
    };
  }

  // Call internal webhook handler
  return handleSandboxWebhook({
    paymentId: payment.id,
    simulate: parsed.simulate,
  });
}
