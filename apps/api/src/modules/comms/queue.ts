import { and, desc, eq, sql } from 'drizzle-orm';
import {
  NotificationChannel,
  NotificationKind,
  RegistrationStatus,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  events,
  Notification,
  notifications,
  registrations,
  tickets,
  users,
  venues,
} from '../../db/schema';
import { env } from '../../env';
import { EnqueueNotificationParams } from './types';

/**
 * Enqueues a notification into the database-backed queue.
 * Automatically deduplicates entries matching unique (user_id, event_id, kind, channel).
 */
export async function enqueue(
  tx: any,
  params: EnqueueNotificationParams
): Promise<Notification | null> {
  const { userId, eventId, kind, channel, payload, runAt } = params;
  const client = tx || db;

  const res = await client
    .insert(notifications)
    .values({
      userId,
      eventId: eventId ?? null,
      kind,
      channel,
      payload,
      status: channel === NotificationChannel.IN_APP ? 'SENT' : 'QUEUED',
      attempts: 0,
      runAt: runAt ?? new Date(),
      sentAt: channel === NotificationChannel.IN_APP ? new Date() : null,
    })
    .onConflictDoNothing({
      target: [
        notifications.userId,
        notifications.eventId,
        notifications.kind,
        notifications.channel,
      ],
    })
    .returning();

  return res[0] ?? null;
}

/**
 * Helper to emit an instant IN_APP notification.
 */
export async function notifyInApp(
  tx: any,
  params: {
    userId: string;
    eventId?: string | null;
    kind: NotificationKind;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }
): Promise<Notification | null> {
  const { userId, eventId, kind, title, message, metadata } = params;
  return enqueue(tx, {
    userId,
    eventId: eventId ?? null,
    kind,
    channel: NotificationChannel.IN_APP,
    payload: {
      title,
      message,
      read: false,
      createdAt: new Date().toISOString(),
      ...metadata,
    },
  });
}

/**
 * Hook triggered when a registration is confirmed (either free event or successful paid checkout).
 * Queues EMAIL, WHATSAPP, and IN_APP notifications.
 */
export async function notifyBookingConfirmed(
  tx: any,
  registrationId: string
): Promise<void> {
  const client = tx || db;

  const [row] = await client
    .select({
      registration: registrations,
      user: users,
      event: events,
      venue: venues,
      ticket: tickets,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .innerJoin(events, eq(registrations.eventId, events.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .leftJoin(tickets, eq(registrations.id, tickets.registrationId))
    .where(eq(registrations.id, registrationId))
    .limit(1);

  if (!row) {
    return;
  }

  const { registration, user, event, venue, ticket } = row;
  const publicWebUrl = env.PUBLIC_WEB_URL;
  const publicApiUrl = env.PUBLIC_API_URL;

  const venueMapLink = venue?.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(venue?.name || 'Campus')}`;
  const qrImageUrl = `${publicApiUrl}/tickets/${registration.id}/qr.png`;
  const passportUrl = `${publicWebUrl}/passport`;

  const payload = {
    registrationId: registration.id,
    eventId: event.id,
    userId: user.id,
    studentName: user.fullName,
    rollNumber: user.rollNumber || 'N/A',
    eventTitle: event.title,
    eventDescription: event.description,
    eventStart: new Date(event.startAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    }),
    eventEnd: new Date(event.endAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    }),
    startAt: event.startAt,
    endAt: event.endAt,
    venueName: venue?.name || 'Campus Main Auditorium',
    venueMapLink,
    ticketToken: ticket?.token || 'N/A',
    qrImageUrl,
    passportUrl,
    publicWebUrl,
  };

  // 1. In-App Notification (instant delivery)
  await notifyInApp(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.BOOKING_CONFIRMED,
    title: 'Registration Confirmed!',
    message: `You are confirmed for "${event.title}"! Your ticket is available in Passport.`,
    metadata: {
      registrationId: registration.id,
      ticketToken: ticket?.token,
      venueName: venue?.name || 'Campus Main Auditorium',
    },
  });

  // 2. Enqueue Email Confirmation
  await enqueue(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.BOOKING_CONFIRMED,
    channel: NotificationChannel.EMAIL,
    payload,
  });

  // 3. Enqueue WhatsApp Confirmation
  await enqueue(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.BOOKING_CONFIRMED,
    channel: NotificationChannel.WHATSAPP,
    payload,
  });
}

/**
 * Notifies participant that their registration was approved by organizer.
 */
export async function notifyRegistrationApproved(
  tx: any,
  registrationId: string,
  reviewerName?: string
): Promise<void> {
  const client = tx || db;
  const [row] = await client
    .select({
      registration: registrations,
      user: users,
      event: events,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(eq(registrations.id, registrationId))
    .limit(1);

  if (!row) return;

  const { registration, user, event } = row;

  await notifyInApp(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.REGISTRATION_APPROVED,
    title: 'Registration Approved!',
    message: `Your registration for "${event.title}" has been approved${reviewerName ? ` by ${reviewerName}` : ''}!`,
    metadata: {
      registrationId: registration.id,
      reviewedAt: new Date().toISOString(),
      reviewerName,
    },
  });

  await enqueue(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.REGISTRATION_APPROVED,
    channel: NotificationChannel.EMAIL,
    payload: {
      registrationId: registration.id,
      eventTitle: event.title,
      studentName: user.fullName,
      reviewerName,
    },
  });
}

/**
 * Notifies participant that their registration was rejected by organizer.
 */
export async function notifyRegistrationRejected(
  tx: any,
  registrationId: string,
  reason?: string,
  reviewerName?: string
): Promise<void> {
  const client = tx || db;
  const [row] = await client
    .select({
      registration: registrations,
      user: users,
      event: events,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(eq(registrations.id, registrationId))
    .limit(1);

  if (!row) return;

  const { registration, user, event } = row;

  await notifyInApp(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.REGISTRATION_REJECTED,
    title: 'Registration Update',
    message: `Your registration for "${event.title}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    metadata: {
      registrationId: registration.id,
      reason,
      reviewerName,
    },
  });

  await enqueue(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.REGISTRATION_REJECTED,
    channel: NotificationChannel.EMAIL,
    payload: {
      registrationId: registration.id,
      eventTitle: event.title,
      studentName: user.fullName,
      reason,
      reviewerName,
    },
  });
}

/**
 * Notifies participant that registration was cancelled.
 */
export async function notifyRegistrationCancelled(
  tx: any,
  registrationId: string,
  reason?: string
): Promise<void> {
  const client = tx || db;
  const [row] = await client
    .select({
      registration: registrations,
      user: users,
      event: events,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .innerJoin(events, eq(registrations.eventId, events.id))
    .where(eq(registrations.id, registrationId))
    .limit(1);

  if (!row) return;

  const { registration, user, event } = row;

  await notifyInApp(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.REGISTRATION_CANCELLED,
    title: 'Registration Cancelled',
    message: `Your registration for "${event.title}" has been cancelled.${reason ? ` Reason: ${reason}` : ''}`,
    metadata: {
      registrationId: registration.id,
      reason,
      refundStatus: registration.paymentStatus,
    },
  });

  await enqueue(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.REGISTRATION_CANCELLED,
    channel: NotificationChannel.EMAIL,
    payload: {
      registrationId: registration.id,
      eventTitle: event.title,
      studentName: user.fullName,
      reason,
    },
  });
}

/**
 * Notifies waitlisted user that a spot is offered with an expiry deadline.
 */
export async function notifyWaitlistOffer(
  tx: any,
  params: {
    userId: string;
    eventId: string;
    registrationId: string;
    offerExpiresAt: Date;
  }
): Promise<void> {
  const client = tx || db;
  const { userId, eventId, registrationId, offerExpiresAt } = params;

  const [eventRow] = await client
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  const eventTitle = eventRow?.title || 'the event';

  await notifyInApp(client, {
    userId,
    eventId,
    kind: NotificationKind.WAITLIST_OFFER,
    title: 'Waitlist Spot Available!',
    message: `A spot has opened up for "${eventTitle}"! Claim your registration before it expires.`,
    metadata: {
      registrationId,
      offerExpiresAt: offerExpiresAt.toISOString(),
    },
  });

  await enqueue(client, {
    userId,
    eventId,
    kind: NotificationKind.WAITLIST_OFFER,
    channel: NotificationChannel.EMAIL,
    payload: {
      eventId,
      registrationId,
      offerExpiresAt: offerExpiresAt.toISOString(),
      eventTitle,
    },
  });
}

/**
 * Notifies invited user of a team invitation.
 */
export async function notifyTeamInvitation(
  tx: any,
  params: {
    invitedUserId: string;
    eventId: string;
    teamId: string;
    teamName: string;
    inviterName: string;
  }
): Promise<void> {
  const client = tx || db;
  const { invitedUserId, eventId, teamId, teamName, inviterName } = params;

  await notifyInApp(client, {
    userId: invitedUserId,
    eventId,
    kind: NotificationKind.TEAM_INVITATION,
    title: 'Team Invitation',
    message: `${inviterName} invited you to join team "${teamName}".`,
    metadata: {
      teamId,
      teamName,
      inviterName,
    },
  });

  await enqueue(client, {
    userId: invitedUserId,
    eventId,
    kind: NotificationKind.TEAM_INVITATION,
    channel: NotificationChannel.EMAIL,
    payload: {
      teamId,
      teamName,
      inviterName,
    },
  });
}

/**
 * Broadcasts an organizer alert or reminder to all confirmed attendees.
 */
export async function broadcastOrganizerAlert(
  tx: any,
  params: {
    eventId: string;
    title: string;
    message: string;
    kind?: NotificationKind;
  }
): Promise<{ count: number }> {
  const client = tx || db;
  const { eventId, title, message, kind = NotificationKind.ORGANIZER_ALERT } = params;

  const confirmedAttendees = await client
    .select({
      userId: registrations.userId,
    })
    .from(registrations)
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.status, RegistrationStatus.CONFIRMED)
      )
    );

  for (const attendee of confirmedAttendees) {
    await notifyInApp(client, {
      userId: attendee.userId,
      eventId,
      kind,
      title,
      message,
    });
  }

  return { count: confirmedAttendees.length };
}

/**
 * Notifies participant of successful test payment.
 */
export async function notifyPaymentSuccess(
  tx: any,
  params: {
    userId: string;
    eventId: string;
    registrationId: string;
    amount: number;
    transactionId?: string;
  }
): Promise<void> {
  const client = tx || db;
  const { userId, eventId, registrationId, amount, transactionId } = params;

  const [row] = await client
    .select({
      user: users,
      event: events,
    })
    .from(users)
    .innerJoin(events, eq(events.id, eventId))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return;

  const studentName = row.user.fullName;
  const eventTitle = row.event.title;

  await notifyInApp(client, {
    userId,
    eventId,
    kind: NotificationKind.PAYMENT_SUCCESS,
    title: 'Payment Successful',
    message: `Payment of ₹${amount} for "${eventTitle}" completed successfully in test mode.`,
    metadata: {
      registrationId,
      amount,
      transactionId,
    },
  });

  await enqueue(client, {
    userId,
    eventId,
    kind: NotificationKind.PAYMENT_SUCCESS,
    channel: NotificationChannel.EMAIL,
    payload: {
      studentName,
      eventTitle,
      amount,
      transactionId,
      paidAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    },
  });
}

/**
 * Notifies participant of failed test payment attempt.
 */
export async function notifyPaymentFailed(
  tx: any,
  params: {
    userId: string;
    eventId: string;
    registrationId?: string;
    errorReason?: string;
  }
): Promise<void> {
  const client = tx || db;
  const { userId, eventId, registrationId, errorReason } = params;

  const [row] = await client
    .select({
      user: users,
      event: events,
    })
    .from(users)
    .innerJoin(events, eq(events.id, eventId))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return;

  const studentName = row.user.fullName;
  const eventTitle = row.event.title;

  await notifyInApp(client, {
    userId,
    eventId,
    kind: NotificationKind.PAYMENT_FAILED,
    title: 'Payment Failed',
    message: `Payment attempt for "${eventTitle}" failed: ${errorReason || 'Transaction declined'}`,
    metadata: {
      registrationId,
      errorReason,
    },
  });

  await enqueue(client, {
    userId,
    eventId,
    kind: NotificationKind.PAYMENT_FAILED,
    channel: NotificationChannel.EMAIL,
    payload: {
      studentName,
      eventTitle,
      errorReason,
    },
  });
}
