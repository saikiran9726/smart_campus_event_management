import { eq, sql } from 'drizzle-orm';
import {
  NotificationChannel,
  NotificationKind,
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
      status: 'QUEUED',
      attempts: 0,
      runAt: runAt ?? new Date(),
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
 * Hook triggered when a registration is confirmed (either free event or successful paid checkout).
 * Queues both EMAIL and WHATSAPP notifications.
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

  // 1. Enqueue Email Confirmation
  await enqueue(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.BOOKING_CONFIRMED,
    channel: NotificationChannel.EMAIL,
    payload,
  });

  // 2. Enqueue WhatsApp Confirmation
  await enqueue(client, {
    userId: user.id,
    eventId: event.id,
    kind: NotificationKind.BOOKING_CONFIRMED,
    channel: NotificationChannel.WHATSAPP,
    payload,
  });
}
