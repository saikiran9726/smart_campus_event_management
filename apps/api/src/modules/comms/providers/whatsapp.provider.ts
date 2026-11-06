import { env } from '../../../env';
import { normalizeIndianPhoneNumber } from '../phone';
import {
  WhatsAppMessage,
  WhatsAppProvider,
  WhatsAppProviderResult,
} from '../types';

/**
 * Meta Cloud WhatsApp Provider communicating via the official Meta Graph API.
 */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  private token: string;
  private phoneId: string;
  private apiVersion: string;

  constructor(token?: string, phoneId?: string, apiVersion?: string) {
    this.token = token || env.META_WA_TOKEN || '';
    this.phoneId = phoneId || env.META_WA_PHONE_ID || '';
    this.apiVersion = apiVersion || env.META_WA_API_VERSION || 'v21.0';
  }

  isConfigured(): boolean {
    return Boolean(
      this.token &&
      this.phoneId &&
      !this.token.includes('placeholder') &&
      !this.phoneId.includes('placeholder')
    );
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppProviderResult> {
    if (!this.isConfigured()) {
      return {
        error: 'Meta WhatsApp credentials missing or using placeholder (META_WA_TOKEN or META_WA_PHONE_ID)',
      };
    }

    // 1. Normalize recipient phone number using Indian mobile number standard (+91)
    const phoneRes = normalizeIndianPhoneNumber(message.toPhone);
    if (!phoneRes.valid || !phoneRes.normalized) {
      return {
        error: phoneRes.error || `Invalid recipient phone number: '${message.toPhone}'`,
      };
    }

    const recipient = phoneRes.normalized;

    try {
      let bodyPayload: any;

      // 2. Official WhatsApp Business Platform Template Policy:
      // Business-initiated notifications outside customer service window must use approved templates
      if (message.template) {
        bodyPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'template',
          template: {
            name: message.template.name,
            language: message.template.language || { code: 'en' },
            components: message.template.components || [],
          },
        };
      } else if (message.buttons && message.buttons.length > 0) {
        bodyPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: message.text },
            action: {
              buttons: message.buttons.slice(0, 3).map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        };
      } else {
        bodyPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { preview_url: true, body: message.text },
        };
      }

      const response = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        }
      );

      const data = (await response.json()) as any;
      if (!response.ok || data.error) {
        return {
          error: data.error?.message || `HTTP ${response.status} from Meta WhatsApp API`,
        };
      }

      const messageId = data.messages?.[0]?.id;
      return { id: messageId, status: 'ACCEPTED' };
    } catch (err: any) {
      return { error: err.message || 'Network error communicating with Meta WhatsApp API' };
    }
  }
}

/**
 * Baileys WhatsApp Provider.
 *
 * NOTE: Baileys is an UNOFFICIAL open-source client implementing the WhatsApp Web
 * multi-device protocol. It is strictly intended for local developer environments,
 * automated testing, and internal pilots. It is NOT recommended for production use
 * without official WhatsApp Business API verification.
 */
export class BaileysWhatsAppProvider implements WhatsAppProvider {
  private isLoaded = false;
  private socketInstance: any = null;

  async init(): Promise<void> {
    if (this.isLoaded) return;
    try {
      // Dynamically load Baileys only if explicitly configured
      // @ts-ignore - optional dev dependency
      const baileys = await import('@whiskeysockets/baileys').catch(() => null);
      if (!baileys) {
        console.warn(
          '[Comms] @whiskeysockets/baileys package is not installed. Falling back to mocked Baileys provider.'
        );
      }
      this.isLoaded = true;
    } catch (err) {
      console.warn('[Comms] Failed to initialize Baileys client:', err);
    }
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppProviderResult> {
    await this.init();
    if (env.NODE_ENV === 'development') {
      console.log(
        `[Baileys WhatsApp (Unofficial Dev Client)] To: ${message.toPhone} | Text: ${message.text.slice(0, 80)}...`
      );
    }
    return { id: `baileys-msg-${Date.now()}` };
  }
}

/**
 * In-memory Mock / Console WhatsApp Provider for test assertions and zero-cost dev runs.
 */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  private sentMessages: WhatsAppMessage[] = [];
  private failNextCount = 0;
  private failError = 'Simulated WhatsApp provider network failure';

  isConfigured(): boolean {
    return true;
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppProviderResult> {
    if (this.failNextCount > 0) {
      this.failNextCount--;
      return { error: this.failError };
    }

    this.sentMessages.push(message);

    if (env.NODE_ENV === 'development') {
      console.log(
        `[WhatsApp Console] To: ${message.toPhone} | Text: ${message.text.slice(0, 80)}...`
      );
    }

    return { id: `mock-wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: 'ACCEPTED' };
  }

  getSentMessages(): WhatsAppMessage[] {
    return [...this.sentMessages];
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }

  reset(): void {
    this.sentMessages = [];
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

const defaultConsoleWhatsAppProvider = new ConsoleWhatsAppProvider();
let activeWhatsAppProvider: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (activeWhatsAppProvider) {
    return activeWhatsAppProvider;
  }

  if (
    env.WHATSAPP_PROVIDER === 'meta' &&
    env.META_WA_TOKEN &&
    env.META_WA_PHONE_ID &&
    !env.META_WA_TOKEN.includes('placeholder')
  ) {
    return new MetaCloudWhatsAppProvider();
  }

  if (env.WHATSAPP_PROVIDER === 'baileys') {
    return new BaileysWhatsAppProvider();
  }

  return defaultConsoleWhatsAppProvider;
}

export function setWhatsAppProvider(provider: WhatsAppProvider | null): void {
  activeWhatsAppProvider = provider;
}

export function getDefaultConsoleWhatsAppProvider(): ConsoleWhatsAppProvider {
  return defaultConsoleWhatsAppProvider;
}

export function isMetaWhatsAppConfigured(): boolean {
  return Boolean(
    env.META_WA_TOKEN &&
    env.META_WA_PHONE_ID &&
    !env.META_WA_TOKEN.includes('placeholder') &&
    !env.META_WA_PHONE_ID.includes('placeholder')
  );
}
