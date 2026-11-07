
import { Resend } from 'resend';
import { env } from '../../../env';
import {
  EmailMessage,
  EmailProvider,
  EmailProviderResult,
} from '../types';

function getSender() {
  const legacyFrom = env.MAIL_FROM || '';
  const match = legacyFrom.match(/^(.*?)\s*<([^>]+)>$/);

  return {
    email: env.EMAIL_FROM_ADDRESS || match?.[2]?.trim() || '',
    name: env.EMAIL_FROM_NAME || match?.[1]?.trim() || 'Eventora',
  };
}

function toBuffer(content: Buffer | string): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

function createPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Brevo transactional email provider.
 * Uses the official Brevo REST API without an additional SDK.
 */
export class BrevoEmailProvider implements EmailProvider {
  private apiKey: string;
  private sender: { email: string; name: string };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.BREVO_API_KEY || '';
    this.sender = getSender();
  }

  isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      !this.apiKey.toLowerCase().includes('placeholder') &&
      this.sender.email &&
      this.sender.email.includes('@'),
    );
  }

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    if (!this.isConfigured()) {
      return {
        error: 'Brevo API key or sender email is not configured.',
      };
    }

    if (!message.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
      return {
        error: `Invalid recipient email address: '${message.to}'`,
      };
    }

    try {
      let htmlContent = message.html;

      const attachments: Array<{ name: string; content: string }> = [];

      for (const attachment of message.attachments || []) {
        const buffer = toBuffer(attachment.content);
        const base64 = buffer.toString('base64');

        // Brevo's documented attachment format does not expose
        // Resend-style content_id. Embed CID images directly in HTML.
        if (attachment.cid && attachment.contentType?.startsWith('image/')) {
          const dataUri = `data:${attachment.contentType};base64,${base64}`;
          htmlContent = htmlContent.replaceAll(
            `cid:${attachment.cid}`,
            dataUri,
          );
          continue;
        }

        attachments.push({
          name: attachment.filename,
          content: base64,
        });
      }

      const textContent = message.text || createPlainText(htmlContent);

      const response = await fetch(
        'https://api.brevo.com/v3/smtp/email',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-key': this.apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: this.sender,
            to: [{ email: message.to }],
            subject: message.subject,
            htmlContent,
            textContent,
            ...(attachments.length > 0 ? { attachment: attachments } : {}),
          }),
        },
      );

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        const providerMessage =
          responseBody?.message ||
          responseBody?.code ||
          `Brevo API returned HTTP ${response.status}`;

        return {
          error: String(providerMessage),
        };
      }

      return {
        id: responseBody?.messageId
          ? String(responseBody.messageId)
          : undefined,
      };
    } catch (err: unknown) {
      return {
        error:
          err instanceof Error
            ? err.message
            : 'Unknown Brevo email provider error',
      };
    }
  }
}

/**
 * Legacy Resend provider.
 * Kept temporarily for backward compatibility with existing tests/configuration.
 */
export class ResendEmailProvider implements EmailProvider {
  private client: Resend;
  private apiKey: string;
  private from: string;

  constructor(apiKey?: string, from?: string) {
    this.apiKey = apiKey || env.RESEND_API_KEY || '';
    this.from =
      from || env.MAIL_FROM || 'Eventora <events@eventora.campus.edu>';
    this.client = new Resend(this.apiKey);
  }

  isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      !this.apiKey.includes('placeholder') &&
      this.apiKey.startsWith('re_'),
    );
  }

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    if (!this.isConfigured()) {
      return {
        error: 'Resend API key is not configured or uses placeholder credentials.',
      };
    }

    if (!message.to || !message.to.includes('@')) {
      return {
        error: `Invalid recipient email address: '${message.to}'`,
      };
    }

    try {
      const formattedAttachments = (message.attachments || []).map((att) => ({
        filename: att.filename,
        content: toBuffer(att.content),
        content_type: att.contentType,
        content_id: att.cid,
      }));

      const plainText = message.text || createPlainText(message.html);

      const { data, error } = await this.client.emails.send({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: plainText,
        attachments: formattedAttachments,
      });

      if (error) {
        return { error: error.message };
      }

      return { id: data?.id };
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err.message : 'Unknown Resend error',
      };
    }
  }
}

/**
 * In-memory Console Email Provider for development and automated tests.
 */
export class ConsoleEmailProvider implements EmailProvider {
  private sentEmails: EmailMessage[] = [];
  private failNextCount = 0;
  private failError = 'Simulated email provider network failure';

  isConfigured(): boolean {
    return true;
  }

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    if (this.failNextCount > 0) {
      this.failNextCount--;
      return { error: this.failError };
    }

    this.sentEmails.push(message);

    if (env.NODE_ENV === 'development') {
      console.log(
        `[Email Console] To: ${message.to} | Subject: ${message.subject}`,
      );
    }

    return {
      id: `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  getSentEmails(): EmailMessage[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }

  reset(): void {
    this.sentEmails = [];
    this.failNextCount = 0;
  }

  setFailNext(countOrError: number | string, errorMessage?: string): void {
    if (typeof countOrError === 'string') {
      this.failNextCount = 1;
      this.failError = countOrError;
    } else {
      this.failNextCount = countOrError;
      if (errorMessage) {
        this.failError = errorMessage;
      }
    }
  }
}

const defaultConsoleProvider = new ConsoleEmailProvider();
let activeEmailProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (activeEmailProvider) {
    return activeEmailProvider;
  }

  if (env.EMAIL_PROVIDER === 'brevo') {
    return new BrevoEmailProvider();
  }

  if (env.EMAIL_PROVIDER === 'resend') {
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

export function isBrevoConfigured(): boolean {
  return new BrevoEmailProvider().isConfigured();
}

export function isEmailProviderConfigured(): boolean {
  if (env.EMAIL_PROVIDER === 'brevo') {
    return isBrevoConfigured();
  }

  if (env.EMAIL_PROVIDER === 'resend') {
    return isResendConfigured();
  }

  return env.EMAIL_PROVIDER === 'console';
}

export function isResendConfigured(): boolean {
  return Boolean(
    env.RESEND_API_KEY &&
    !env.RESEND_API_KEY.includes('placeholder') &&
    env.RESEND_API_KEY.startsWith('re_'),
  );
}
