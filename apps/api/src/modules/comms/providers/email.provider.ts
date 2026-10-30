import { Resend } from 'resend';
import { env } from '../../../env';
import {
  EmailMessage,
  EmailProvider,
  EmailProviderResult,
} from '../types';

/**
 * Resend Email Provider leveraging Resend REST API.
 */
export class ResendEmailProvider implements EmailProvider {
  private client: Resend;

  constructor(apiKey?: string) {
    this.client = new Resend(apiKey || env.RESEND_API_KEY);
  }

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    try {
      const formattedAttachments = (message.attachments || []).map((att) => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content)
          ? att.content
          : Buffer.from(att.content),
        content_type: att.contentType,
        content_id: att.cid,
      }));

      const { data, error } = await this.client.emails.send({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: formattedAttachments,
      });

      if (error) {
        return { error: error.message };
      }

      return { id: data?.id };
    } catch (err: any) {
      return { error: err.message || 'Unknown Resend error' };
    }
  }
}

/**
 * In-memory Mock / Console Email Provider for development and automated test suites.
 */
export class ConsoleEmailProvider implements EmailProvider {
  private sentEmails: EmailMessage[] = [];
  private failNextCount = 0;
  private failError = 'Simulated email provider network failure';

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    if (this.failNextCount > 0) {
      this.failNextCount--;
      return { error: this.failError };
    }

    this.sentEmails.push(message);

    if (env.NODE_ENV === 'development') {
      console.log(`[Email Console] To: ${message.to} | Subject: ${message.subject}`);
    }

    return { id: `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }

  getSentEmails(): EmailMessage[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }

  setFailNext(count: number, errorMessage?: string): void {
    this.failNextCount = count;
    if (errorMessage) {
      this.failError = errorMessage;
    }
  }
}

const defaultConsoleProvider = new ConsoleEmailProvider();
let activeEmailProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (activeEmailProvider) {
    return activeEmailProvider;
  }

  if (
    env.EMAIL_PROVIDER === 'resend' &&
    env.RESEND_API_KEY &&
    !env.RESEND_API_KEY.includes('placeholder')
  ) {
    return new ResendEmailProvider();
  }

  return defaultConsoleProvider;
}

export function setEmailProvider(provider: EmailProvider | null): void {
  activeEmailProvider = provider;
}

export function getDefaultConsoleEmailProvider(): ConsoleEmailProvider {
  return defaultConsoleProvider;
}
