import { and, eq, sql } from 'drizzle-orm';
import {
  NotificationChannel,
  NotificationKind,
  RegistrationStatus,
  TicketStatus,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  Notification,
  notificationPreferences,
  notifications,
  registrations,
  tickets,
  users,
} from '../db/schema';
import { generateEventIcs } from '../modules/comms/calendar';
import {
  getEmailProvider,
  getWhatsAppProvider,
} from '../modules/comms/providers';
import {
  renderEmail,
  renderWhatsApp,
} from '../modules/comms/templates';
import { EmailAttachment } from '../modules/comms/types';
import { renderQrPng } from '../modules/tickets/service';
import { normalizeIndianPhoneNumber } from '../modules/comms/phone';

function calculateBackoffMs(attempt: number): number {
  if (attempt <= 1) return 60 * 1000; // 1 minute
  if (attempt === 2) return 5 * 60 * 1000; // 5 minutes
  return 30 * 60 * 1000; // 30 minutes
}

/**
 * Polls the notifications queue using SELECT FOR UPDATE SKIP LOCKED
 * and dispatches queued messages through the appropriate provider.
 */
export async function processCommsQueueOnce(): Promise<number> {
  // 1. Claim batch of queued notifications due for execution with aliased columns
  const batchRes = await db.execute<Notification>(
    sql`SELECT 
          id,
          user_id as "userId",
          event_id as "eventId",
          kind,
          channel,
          payload,
          status,
          attempts,
          run_at as "runAt",
          sent_at as "sentAt",
          error
        FROM notifications
        WHERE status = 'QUEUED' AND run_at <= (now() + interval '5 seconds')
        ORDER BY run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 20`
  );

  const items = batchRes.rows;
  if (!items || items.length === 0) {
    return 0;
  }

  for (const item of items) {
    try {
      const userId = item.userId ?? (item as any).user_id;
      const eventId = item.eventId ?? (item as any).event_id;
      const currentAttempts = Number(item.attempts ?? (item as any).attempts ?? 0);

      // 2. Fetch recipient user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        await db
          .update(notifications)
          .set({
            status: 'FAILED',
            error: 'User not found in system',
            attempts: currentAttempts + 1,
          })
          .where(eq(notifications.id, item.id));
        continue;
      }

      // Check user preferences
      const [userPrefs] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, user.id))
        .limit(1);

      if (userPrefs) {
        if (item.channel === NotificationChannel.EMAIL && userPrefs.emailEnabled === false) {
          await db
            .update(notifications)
            .set({
              status: 'SENT',
              sentAt: new Date(),
              attempts: currentAttempts + 1,
              error: 'PREFERENCE_EMAIL_DISABLED',
            })
            .where(eq(notifications.id, item.id));
          continue;
        }

        if (item.channel === NotificationChannel.WHATSAPP && userPrefs.whatsappEnabled === false) {
          await db
            .update(notifications)
            .set({
              status: 'SKIPPED',
              sentAt: new Date(),
              attempts: currentAttempts + 1,
              error: 'PREFERENCE_WHATSAPP_DISABLED',
            })
            .where(eq(notifications.id, item.id));
          continue;
        }

        if (
          (item.kind === NotificationKind.REMINDER_24H || item.kind === NotificationKind.REMINDER_2H) &&
          userPrefs.eventReminders === false
        ) {
          await db
            .update(notifications)
            .set({
              status: 'SKIPPED',
              sentAt: new Date(),
              attempts: currentAttempts + 1,
              error: 'PREFERENCE_REMINDERS_DISABLED',
            })
            .where(eq(notifications.id, item.id));
          continue;
        }

        if (item.kind === NotificationKind.ORGANIZER_ALERT && userPrefs.announcements === false) {
          await db
            .update(notifications)
            .set({
              status: 'SKIPPED',
              sentAt: new Date(),
              attempts: currentAttempts + 1,
              error: 'PREFERENCE_ANNOUNCEMENTS_DISABLED',
            })
            .where(eq(notifications.id, item.id));
          continue;
        }
      }

      // 3. WhatsApp: Check and validate Indian phone number
      if (item.channel === NotificationChannel.WHATSAPP) {
        if (!user.phone || !user.phone.trim()) {
          await db
            .update(notifications)
            .set({
              status: 'SKIPPED',
              sentAt: new Date(),
              attempts: currentAttempts + 1,
              error: 'NO_PHONE',
            })
            .where(eq(notifications.id, item.id));
          continue;
        }

        const phoneValidation = normalizeIndianPhoneNumber(user.phone);
        if (!phoneValidation.valid) {
          await db
            .update(notifications)
            .set({
              status: 'SKIPPED',
              sentAt: new Date(),
              attempts: currentAttempts + 1,
              error: phoneValidation.error || 'INVALID_INDIAN_PHONE',
            })
            .where(eq(notifications.id, item.id));
          continue;
        }
      }

      // 4. Reminders: Re-check registration and ticket status at send time
      if (
        item.kind === NotificationKind.REMINDER_24H ||
        item.kind === NotificationKind.REMINDER_2H
      ) {
        if (eventId) {
          const [reg] = await db
            .select()
            .from(registrations)
            .where(
              and(
                eq(registrations.userId, user.id),
                eq(registrations.eventId, eventId)
              )
            )
            .limit(1);

          if (!reg || reg.status === RegistrationStatus.CANCELLED) {
            await db
              .update(notifications)
              .set({
                status: 'FAILED',
                error: 'REGISTRATION_CANCELLED',
                attempts: currentAttempts + 1,
              })
              .where(eq(notifications.id, item.id));
            continue;
          }

          const [ticket] = await db
            .select()
            .from(tickets)
            .where(
              and(
                eq(tickets.userId, user.id),
                eq(tickets.eventId, eventId)
              )
            )
            .limit(1);

          if (ticket && ticket.status === TicketStatus.VOID) {
            await db
              .update(notifications)
              .set({
                status: 'FAILED',
                error: 'TICKET_VOID',
                attempts: currentAttempts + 1,
              })
              .where(eq(notifications.id, item.id));
            continue;
          }
        }
      }

      const payload = (item.payload as Record<string, any>) || {};

      // 5. Dispatch based on channel
      let sendError: string | undefined;
      let providerMessageId: string | undefined;

      if (item.channel === NotificationChannel.EMAIL) {
        const { subject, html } = renderEmail(item.kind, payload);
        const attachments: EmailAttachment[] = [];

        // For BOOKING_CONFIRMED: embed QR PNG inline and attach .ics
        if (item.kind === NotificationKind.BOOKING_CONFIRMED) {
          if (payload.ticketToken && payload.ticketToken !== 'N/A') {
            const qrPngBuffer = await renderQrPng(payload.ticketToken);
            attachments.push({
              filename: 'ticket-qr.png',
              content: qrPngBuffer,
              contentType: 'image/png',
              cid: 'ticket-qr',
            });
          }

          if (payload.startAt && payload.endAt) {
            const icsContent = generateEventIcs({
              title: payload.eventTitle || 'Campus Event',
              description: payload.eventDescription || payload.eventTitle || 'Event details',
              startAt: new Date(payload.startAt),
              endAt: new Date(payload.endAt),
              location: payload.venueName || 'Campus Venue',
              url: payload.publicWebUrl
                ? `${payload.publicWebUrl}/events/${eventId}`
                : undefined,
            });

            attachments.push({
              filename: 'event.ics',
              content: icsContent,
              contentType: 'text/calendar',
            });
          }
        }

        const emailResult = await getEmailProvider().send({
          to: user.email,
          subject,
          html,
          attachments,
        });

        sendError = emailResult.error;
        providerMessageId = emailResult.id;
      } else if (item.channel === NotificationChannel.WHATSAPP) {
        const { text, buttons, mediaUrl, template } = renderWhatsApp(item.kind, payload);

        const waResult = await getWhatsAppProvider().send({
          toPhone: user.phone!,
          text,
          buttons,
          mediaUrl,
          template,
        });

        sendError = waResult.error;
        providerMessageId = waResult.id;
      }

      // 6. Handle outcome (Success vs Failure with backoff)
      if (sendError) {
        const nextAttempt = currentAttempts + 1;
        if (nextAttempt >= 5) {
          await db
            .update(notifications)
            .set({
              status: 'FAILED',
              error: sendError,
              attempts: nextAttempt,
            })
            .where(eq(notifications.id, item.id));
        } else {
          const backoffMs = calculateBackoffMs(nextAttempt);
          const nextRunAt = new Date(Date.now() + backoffMs);

          await db
            .update(notifications)
            .set({
              status: 'QUEUED',
              runAt: nextRunAt,
              attempts: nextAttempt,
              error: sendError,
            })
            .where(eq(notifications.id, item.id));
        }
      } else {
        // Meta WhatsApp policy: status transitions to ACCEPTED on provider ACK,
        // and only transitions to DELIVERED when the delivery webhook is received.
        const finalStatus = item.channel === NotificationChannel.WHATSAPP ? 'ACCEPTED' : 'SENT';

        await db
          .update(notifications)
          .set({
            status: finalStatus,
            sentAt: new Date(),
            providerMessageId: providerMessageId ?? null,
            attempts: currentAttempts + 1,
            error: null,
          })
          .where(eq(notifications.id, item.id));
      }
    } catch (err: any) {
      const currentAttempts = Number(item.attempts ?? (item as any).attempts ?? 0);
      const nextAttempt = currentAttempts + 1;
      const isExhausted = nextAttempt >= 5;
      try {
        await db
          .update(notifications)
          .set({
            status: isExhausted ? 'FAILED' : 'QUEUED',
            error: err.message || 'Unexpected processing error',
            attempts: nextAttempt,
            // Only reschedule while retrying. When exhausted, leave run_at untouched:
            // the raw-SQL row value is a string (not a Date) and cannot be written back.
            ...(isExhausted
              ? {}
              : { runAt: new Date(Date.now() + calculateBackoffMs(nextAttempt)) }),
          })
          .where(eq(notifications.id, item.id));
      } catch (updateErr: any) {
        // A single bad row must never abort the rest of the batch (poison-pill guard).
        console.error(
          '[Comms Worker] Could not record failure for notification',
          item.id,
          updateErr?.message ?? updateErr
        );
      }
    }
  }

  return items.length;
}

/**
 * Starts the recurrent comms queue polling worker.
 */
export function startCommsWorker(intervalMs = 5000): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await processCommsQueueOnce();
    } catch (err) {
      console.error('[Comms Worker] Error executing queue batch:', err);
    }
  }, intervalMs);
}
