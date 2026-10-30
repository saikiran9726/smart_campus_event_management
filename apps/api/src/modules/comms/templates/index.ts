import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handlebars from 'handlebars';
import { NotificationKind } from '@eventora/shared';
import { WhatsAppButton } from '../types';

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
    default:
      throw new Error(`Unsupported email template kind '${kind}'`);
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
    default:
      throw new Error(`Unsupported WhatsApp template kind '${kind}'`);
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
    default:
      return `Notification: ${data.eventTitle || 'Campus Notice'}`;
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

export function renderWhatsApp(
  kind: NotificationKind,
  data: Record<string, any>
): { text: string; buttons?: WhatsAppButton[]; mediaUrl?: string } {
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

  return { text, buttons, mediaUrl: data.qrImageUrl };
}
