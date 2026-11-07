import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handlebars from 'handlebars';
import { NotificationKind } from '@eventora/shared';
import { WhatsAppButton, WhatsAppTemplate } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Template cache for Handlebars
const compiledEmails = new Map<string, handlebars.TemplateDelegate>();
const compiledWhatsApp = new Map<string, handlebars.TemplateDelegate>();

function getTemplateSource(filename: string): string {
  const filePath = path.join(__dirname, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  throw new Error(`Template file not found at ${filePath}`);
}

function getCompiledEmail(kind: NotificationKind): handlebars.TemplateDelegate {
  if (compiledEmails.has(kind)) {
    return compiledEmails.get(kind)!;
  }

  let filename = '';
  switch (kind) {
    case NotificationKind.BOOKING_CONFIRMED:
      filename = 'booking-confirmed.html.hbs';
      break;
    case NotificationKind.REMINDER_24H:
      filename = 'reminder-24h.html.hbs';
      break;
    case NotificationKind.REMINDER_2H:
      filename = 'reminder-2h.html.hbs';
      break;
    case NotificationKind.WAITLIST_OFFER:
      filename = 'waitlist-offer.html.hbs';
      break;
    case NotificationKind.FACULTY_APPROVAL:
      filename = 'faculty-approval.html.hbs';
      break;
    case NotificationKind.STRIKE_NOTICE:
      filename = 'strike-notice.html.hbs';
      break;
    case NotificationKind.REGISTRATION_APPROVED:
      filename = 'registration-approved.html.hbs';
      break;
    case NotificationKind.REGISTRATION_REJECTED:
      filename = 'registration-rejected.html.hbs';
      break;
    case NotificationKind.REGISTRATION_CANCELLED:
      filename = 'registration-cancelled.html.hbs';
      break;
    case NotificationKind.PAYMENT_SUCCESS:
      filename = 'payment-success.html.hbs';
      break;
    case NotificationKind.PAYMENT_FAILED:
      filename = 'payment-failed.html.hbs';
      break;
    case NotificationKind.TEAM_INVITATION:
      filename = 'team-invitation.html.hbs';
      break;
    case NotificationKind.ORGANIZER_ALERT:
      filename = 'organizer-alert.html.hbs';
      break;
    default:
      filename = 'organizer-alert.html.hbs';
      break;
  }

  const source = getTemplateSource(filename);
  const delegate = handlebars.compile(source);
  compiledEmails.set(kind, delegate);
  return delegate;
}

function getCompiledWhatsApp(kind: NotificationKind): handlebars.TemplateDelegate {
  if (compiledWhatsApp.has(kind)) {
    return compiledWhatsApp.get(kind)!;
  }

  let filename = '';
  switch (kind) {
    case NotificationKind.BOOKING_CONFIRMED:
      filename = 'booking-confirmed.wa.hbs';
      break;
    case NotificationKind.REMINDER_24H:
      filename = 'reminder-24h.wa.hbs';
      break;
    case NotificationKind.REMINDER_2H:
      filename = 'reminder-2h.wa.hbs';
      break;
    case NotificationKind.WAITLIST_OFFER:
      filename = 'waitlist-offer.wa.hbs';
      break;
    case NotificationKind.FACULTY_APPROVAL:
      filename = 'faculty-approval.wa.hbs';
      break;
    case NotificationKind.STRIKE_NOTICE:
      filename = 'strike-notice.wa.hbs';
      break;
    case NotificationKind.REGISTRATION_APPROVED:
      filename = 'registration-approved.wa.hbs';
      break;
    case NotificationKind.REGISTRATION_REJECTED:
      filename = 'registration-rejected.wa.hbs';
      break;
    case NotificationKind.REGISTRATION_CANCELLED:
      filename = 'registration-cancelled.wa.hbs';
      break;
    case NotificationKind.PAYMENT_SUCCESS:
      filename = 'payment-success.wa.hbs';
      break;
    case NotificationKind.PAYMENT_FAILED:
      filename = 'payment-failed.wa.hbs';
      break;
    case NotificationKind.TEAM_INVITATION:
      filename = 'team-invitation.wa.hbs';
      break;
    case NotificationKind.ORGANIZER_ALERT:
      filename = 'organizer-alert.wa.hbs';
      break;
    default:
      filename = 'organizer-alert.wa.hbs';
      break;
  }

  const source = getTemplateSource(filename);
  const delegate = handlebars.compile(source, { noEscape: true });
  compiledWhatsApp.set(kind, delegate);
  return delegate;
}

export function getEmailSubject(kind: NotificationKind, data: Record<string, any>): string {
  switch (kind) {
    case NotificationKind.BOOKING_CONFIRMED:
      return `Booking Confirmed: ${data.eventTitle || 'Campus Event'}`;
    case NotificationKind.REMINDER_24H:
      return `Reminder: ${data.eventTitle || 'Campus Event'} starts tomorrow!`;
    case NotificationKind.REMINDER_2H:
      return `Final Reminder: ${data.eventTitle || 'Campus Event'} starts in 2 hours!`;
    case NotificationKind.WAITLIST_OFFER:
      return `Confirmed Seat Available: Claim your spot for ${data.eventTitle || 'Campus Event'}`;
    case NotificationKind.FACULTY_APPROVAL:
      return `Faculty Approval Required: ${data.eventTitle || 'Event Proposal'}`;
    case NotificationKind.STRIKE_NOTICE:
      return 'Campus Attendance Policy Notice: Strike Issued';
    case NotificationKind.REGISTRATION_APPROVED:
      return `Registration Approved: ${data.eventTitle || 'Campus Event'}`;
    case NotificationKind.REGISTRATION_REJECTED:
      return `Registration Update: ${data.eventTitle || 'Campus Event'}`;
    case NotificationKind.REGISTRATION_CANCELLED:
      return `Registration Cancelled: ${data.eventTitle || 'Campus Event'}`;
    case NotificationKind.PAYMENT_SUCCESS:
      return `Payment Receipt: ${data.eventTitle || 'Campus Event'} (Test Mode)`;
    case NotificationKind.PAYMENT_FAILED:
      return `Payment Notice: ${data.eventTitle || 'Campus Event'}`;
    case NotificationKind.TEAM_INVITATION:
      return `Team Invitation: ${data.teamName || 'Eventora Team'}`;
    case NotificationKind.ORGANIZER_ALERT:
      return data.title ? `${data.title} - ${data.eventTitle || 'Campus Notice'}` : `Event Notice: ${data.eventTitle || 'Campus Event'}`;
    default:
      return `Notification: ${data.eventTitle || data.title || 'Campus Notice'}`;
  }
}

export function renderEmail(
  kind: NotificationKind,
  data: Record<string, any>
): { subject: string; html: string } {
  const delegate = getCompiledEmail(kind);
  const html = delegate(data);
  const subject = getEmailSubject(kind, data);
  return { subject, html };
}

export function buildWhatsAppTemplate(
  kind: NotificationKind,
  data: Record<string, any>
): WhatsAppTemplate {
  switch (kind) {
    case NotificationKind.BOOKING_CONFIRMED:
      return {
        name: 'eventora_booking_confirmed',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName || 'Student' },
              { type: 'text', text: data.eventTitle || 'Campus Event' },
              { type: 'text', text: data.eventStart || 'Upcoming' },
              { type: 'text', text: data.venueName || 'Campus Main Auditorium' },
            ],
          },
        ],
      };
    case NotificationKind.REMINDER_24H:
      return {
        name: 'eventora_reminder_24h',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName || 'Student' },
              { type: 'text', text: data.eventTitle || 'Campus Event' },
              { type: 'text', text: data.venueName || 'Campus Venue' },
            ],
          },
        ],
      };
    case NotificationKind.REMINDER_2H:
      return {
        name: 'eventora_reminder_2h',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName || 'Student' },
              { type: 'text', text: data.eventTitle || 'Campus Event' },
              { type: 'text', text: data.venueName || 'Campus Venue' },
            ],
          },
        ],
      };
    case NotificationKind.WAITLIST_OFFER:
      return {
        name: 'eventora_waitlist_offer',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName || 'Student' },
              { type: 'text', text: data.eventTitle || 'Campus Event' },
            ],
          },
        ],
      };
    case NotificationKind.TEAM_INVITATION:
      return {
        name: 'eventora_team_invitation',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName || 'Student' },
              { type: 'text', text: data.inviterName || 'Teammate' },
              { type: 'text', text: data.teamName || 'Team' },
            ],
          },
        ],
      };
    case NotificationKind.PAYMENT_SUCCESS:
      return {
        name: 'eventora_payment_success',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName || 'Student' },
              { type: 'text', text: String(data.amount || 0) },
              { type: 'text', text: data.eventTitle || 'Campus Event' },
            ],
          },
        ],
      };
    case NotificationKind.PAYMENT_FAILED:
      return {
        name: 'eventora_payment_failed',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName || 'Student' },
              { type: 'text', text: data.eventTitle || 'Campus Event' },
            ],
          },
        ],
      };
    default:
      return {
        name: 'eventora_announcement',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.studentName || 'Student' },
              { type: 'text', text: data.title || data.eventTitle || 'Campus Notice' },
            ],
          },
        ],
      };
  }
}

export function renderWhatsApp(
  kind: NotificationKind,
  data: Record<string, any>
): { text: string; buttons?: WhatsAppButton[]; mediaUrl?: string; template?: WhatsAppTemplate } {
  const delegate = getCompiledWhatsApp(kind);
  const text = delegate(data);

  let buttons: WhatsAppButton[] | undefined;
  if (kind === NotificationKind.WAITLIST_OFFER) {
    buttons = [{ id: 'claim_seat', title: 'Claim Your Confirmed Seat Now' }];
  } else if (kind === NotificationKind.FACULTY_APPROVAL) {
    buttons = [
      { id: 'approve_prop', title: 'Approve' },
      { id: 'reject_prop', title: 'Reject' },
    ];
  }

  const template = buildWhatsAppTemplate(kind, data);

  return { text, buttons, mediaUrl: data.qrImageUrl, template };
}
