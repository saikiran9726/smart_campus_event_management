import { NotificationChannel, NotificationKind } from '@eventora/shared';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  cid?: string; // Content-ID for CID inline embedding (e.g. cid:ticket-qr)
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface EmailProviderResult {
  id?: string;
  error?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailProviderResult>;
}

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppMessage {
  toPhone: string;
  text: string;
  buttons?: WhatsAppButton[];
  mediaUrl?: string;
}

export interface WhatsAppProviderResult {
  id?: string;
  error?: string;
}

export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<WhatsAppProviderResult>;
}

export interface EnqueueNotificationParams {
  userId: string;
  eventId?: string | null;
  kind: NotificationKind;
  channel: NotificationChannel;
  payload: Record<string, any>;
  runAt?: Date;
}
