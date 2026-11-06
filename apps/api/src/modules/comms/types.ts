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
  isConfigured?(): boolean;
}

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppTemplateParameter {
  type: 'text' | 'image' | 'payload';
  text?: string;
  image?: { link: string };
  payload?: string;
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'url' | 'quick_reply';
  index?: number;
  parameters: WhatsAppTemplateParameter[];
}

export interface WhatsAppTemplate {
  name: string;
  language: { code: string };
  components?: WhatsAppTemplateComponent[];
}

export interface WhatsAppMessage {
  toPhone: string;
  text: string;
  buttons?: WhatsAppButton[];
  mediaUrl?: string;
  template?: WhatsAppTemplate;
}

export interface WhatsAppProviderResult {
  id?: string;
  error?: string;
  status?: 'ACCEPTED' | 'FAILED';
}

export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<WhatsAppProviderResult>;
  isConfigured?(): boolean;
}

export interface EnqueueNotificationParams {
  userId: string;
  eventId?: string | null;
  kind: NotificationKind;
  channel: NotificationChannel;
  payload: Record<string, any>;
  runAt?: Date;
}
