import { createEvent, DateArray, EventAttributes } from 'ics';
import { AppError } from '../../lib/app-error';

export interface CalendarEventParams {
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  url?: string | null;
}

function toDateArray(date: Date): DateArray {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
}

/**
 * Generates RFC 5545 compliant .ics calendar file containing VEVENT
 * and two VALARMs (24h and 2h before the event).
 */
export function generateEventIcs(params: CalendarEventParams): string {
  const { title, description, startAt, endAt, location, url } = params;

  const eventAttributes: EventAttributes = {
    start: toDateArray(new Date(startAt)),
    end: toDateArray(new Date(endAt)),
    title: title || 'Campus Event',
    description: description || 'Campus Eventora Event',
    location: location || 'Campus Venue',
    url: url || undefined,
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    alarms: [
      {
        action: 'display',
        description: `Reminder: ${title} starts in 24 hours`,
        trigger: { hours: 24, minutes: 0, before: true },
      },
      {
        action: 'display',
        description: `Final Reminder: ${title} starts in 2 hours`,
        trigger: { hours: 2, minutes: 0, before: true },
      },
    ],
  };

  const { error, value } = createEvent(eventAttributes);

  if (error || !value) {
    throw new AppError(
      'VALIDATION_FAILED',
      `Failed to generate calendar .ics file: ${error?.message || 'unknown error'}`,
      500
    );
  }

  return value;
}
