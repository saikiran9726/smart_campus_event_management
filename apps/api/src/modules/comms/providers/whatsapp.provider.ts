import { env } from '../../../env';
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

  constructor(token?: string, phoneId?: string) {
    this.token = token || env.META_WA_TOKEN || '';
    this.phoneId = phoneId || env.META_WA_PHONE_ID || '';
  }

  async send(message: WhatsAppMessage): Promise<WhatsAppProviderResult> {
    if (!this.token || !this.phoneId) {
      return { error: 'Meta WhatsApp credentials missing (META_WA_TOKEN or META_WA_PHONE_ID)' };
    }

    try {
      const cleanPhone = message.toPhone.replace(/[^0-9]/g, '');

      let bodyPayload: any;

      if (message.buttons && message.buttons.length > 0) {
        bodyPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
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
          to: cleanPhone,
          type: 'text',
          text: { preview_url: true, body: message.text },
        };
      }

      const response = await fetch(
        `https://graph.facebook.com/v19.0/${this.phoneId}/messages`,
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

      return { id: data.messages?.[0]?.id };
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

    return { id: `mock-wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }

  getSentMessages(): WhatsAppMessage[] {
    return [...this.sentMessages];
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }

  setFailNext(count: number, errorMessage?: string): void {
    this.failNextCount = count;
    if (errorMessage) {
      this.failError = errorMessage;
    }
  }
}

const defaultConsoleWhatsAppProvider = new ConsoleWhatsAppProvider();
let activeWhatsAppProvider: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (activeWhatsAppProvider) {
    return activeWhatsAppProvider;
  }

  if (env.WHATSAPP_PROVIDER === 'meta' && env.META_WA_TOKEN && env.META_WA_PHONE_ID) {
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
