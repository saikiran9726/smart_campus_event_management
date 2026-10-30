import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  EventStatus,
  NotificationChannel,
  NotificationKind,
  RegistrationStatus,
} from '@eventora/shared';
import { db } from '../db/client';
import {
  events,
  registrations,
  users,
  venues,
} from '../db/schema';
import { env } from '../env';
import { enqueue } from '../modules/comms/queue';

/**
 * Sweeps for upcoming events within the 24h and 2h reminder windows
 * and enqueues automated attendee reminders.
 */
export async function runRemindersSweepOnce(): Promise<{
  reminders24h: number;
  reminders2h: number;
}> {
  const now = new Date();
  let enqueued24h = 0;
  let enqueued2h = 0;

  // 1. Calculate 24-Hour Reminder Window (24h ± 30 min: [23.5h, 24.5h])
  const window24hStart = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
  const window24hEnd = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);

  const events24h = await db
    .select({
      event: events,
      venue: venues,
    })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(
      and(
        inArray(events.status, [EventStatus.PUBLISHED, EventStatus.LIVE]),
        gte(events.startAt, window24hStart),
        lte(events.startAt, window24hEnd)
      )
    );

  for (const { event, venue } of events24h) {
    const attendees = await db
      .select({
        registration: registrations,
        user: users,
      })
      .from(registrations)
      .innerJoin(users, eq(registrations.userId, users.id))
      .where(
        and(
          eq(registrations.eventId, event.id),
          eq(registrations.status, RegistrationStatus.CONFIRMED)
        )
      );

    const eventNotes = (event.notes as Record<string, any>) || {};
    const gateNumbers = eventNotes.gates || eventNotes.gateNumbers || 'Gates 1 & 2';
    const rules = Array.isArray(eventNotes.rules)
      ? eventNotes.rules.join(', ')
      : eventNotes.rules || 'Valid college ID required. No outside food.';
    const requiredIdProofs =
      eventNotes.idProofs || eventNotes.requiredIdProofs || 'College Identity Card';
    const parkingGuidelines =
      eventNotes.parking || eventNotes.parkingGuidelines || 'Campus Multi-level Parking Lot P3';

    for (const { registration, user } of attendees) {
      const payload = {
        registrationId: registration.id,
        eventId: event.id,
        studentName: user.fullName,
        rollNumber: user.rollNumber || 'N/A',
        eventTitle: event.title,
        eventStart: new Date(event.startAt).toLocaleString('en-US', {
          dateStyle: 'full',
          timeStyle: 'short',
        }),
        venueName: venue?.name || 'Main Campus Auditorium',
        gateNumbers,
        rules,
        requiredIdProofs,
        parkingGuidelines,
        passportUrl: `${env.PUBLIC_WEB_URL}/passport`,
      };

      const emailResult = await enqueue(db, {
        userId: user.id,
        eventId: event.id,
        kind: NotificationKind.REMINDER_24H,
        channel: NotificationChannel.EMAIL,
        payload,
      });

      const waResult = await enqueue(db, {
        userId: user.id,
        eventId: event.id,
        kind: NotificationKind.REMINDER_24H,
        channel: NotificationChannel.WHATSAPP,
        payload,
      });

      if (emailResult) enqueued24h++;
      if (waResult) enqueued24h++;
    }
  }

  // 2. Calculate 2-Hour Reminder Window (2h ± 15 min: [1.75h, 2.25h])
  const window2hStart = new Date(now.getTime() + 1.75 * 60 * 60 * 1000);
  const window2hEnd = new Date(now.getTime() + 2.25 * 60 * 60 * 1000);

  const events2h = await db
    .select({
      event: events,
      venue: venues,
    })
    .from(events)
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(
      and(
        inArray(events.status, [EventStatus.PUBLISHED, EventStatus.LIVE]),
        gte(events.startAt, window2hStart),
        lte(events.startAt, window2hEnd)
      )
    );

  for (const { event, venue } of events2h) {
    const attendees = await db
      .select({
        registration: registrations,
        user: users,
      })
      .from(registrations)
      .innerJoin(users, eq(registrations.userId, users.id))
      .where(
        and(
          eq(registrations.eventId, event.id),
          eq(registrations.status, RegistrationStatus.CONFIRMED)
        )
      );

    const eventNotes = (event.notes as Record<string, any>) || {};
    const gateNumbers = eventNotes.gates || eventNotes.gateNumbers || 'Gates 1 & 2';
    const queueStatus =
      eventNotes.queueStatus ||
      'Entry gates open & running smoothly. Fast-track volunteer scanning active.';
    const parkingGuidelines =
      eventNotes.parking || eventNotes.parkingGuidelines || 'Campus Lot P3';

    for (const { registration, user } of attendees) {
      const payload = {
        registrationId: registration.id,
        eventId: event.id,
        studentName: user.fullName,
        rollNumber: user.rollNumber || 'N/A',
        eventTitle: event.title,
        venueName: venue?.name || 'Main Campus Auditorium',
        gateNumbers,
        queueStatus,
        parkingGuidelines,
        passportUrl: `${env.PUBLIC_WEB_URL}/passport`,
      };

      const emailResult = await enqueue(db, {
        userId: user.id,
        eventId: event.id,
        kind: NotificationKind.REMINDER_2H,
        channel: NotificationChannel.EMAIL,
        payload,
      });

      const waResult = await enqueue(db, {
        userId: user.id,
        eventId: event.id,
        kind: NotificationKind.REMINDER_2H,
        channel: NotificationChannel.WHATSAPP,
        payload,
      });

      if (emailResult) enqueued2h++;
      if (waResult) enqueued2h++;
    }
  }

  return { reminders24h: enqueued24h, reminders2h: enqueued2h };
}

/**
 * Starts the hourly reminder worker.
 */
export function startRemindersWorker(
  intervalMs = 60 * 60 * 1000
): NodeJS.Timeout {
  // Execute initial sweep at startup
  runRemindersSweepOnce().catch((err) =>
    console.error('[Reminders Worker] Error during startup reminder sweep:', err)
  );

  return setInterval(async () => {
    try {
      await runRemindersSweepOnce();
    } catch (err) {
      console.error('[Reminders Worker] Error during scheduled reminder sweep:', err);
    }
  }, intervalMs);
}
