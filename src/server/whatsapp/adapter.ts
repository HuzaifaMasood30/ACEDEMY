import { createHmac } from 'node:crypto';
import { env, whatsappLiveMode } from '@/lib/env';

/**
 * WhatsApp delivery adapters.
 *
 * `cloud` talks to the official WhatsApp Business Platform (Cloud API) over
 * HTTPS using a permanent access token. `mock` never leaves the process: it
 * returns a synthetic provider id and is flagged `isMock: true` everywhere it
 * is recorded, so a simulated message can never be mistaken for a real one.
 */

export interface OutboundMessage {
  to: string;
  body: string;
  /** Name of an approved template, when the provider requires one. */
  templateName?: string | null;
  templateLanguage?: string | null;
  /** Ordered positional variables for the approved template. */
  templateVariables?: string[];
  /** Correlates the send with its queue row. */
  clientReference?: string;
}

export interface SendResult {
  ok: boolean;
  isMock: boolean;
  providerMessageId?: string;
  /** HTTP status from the provider, when a request was actually made. */
  statusCode?: number;
  /** True when retrying the identical request could plausibly succeed. */
  retryable: boolean;
  error?: string;
  raw?: unknown;
}

export interface WhatsAppAdapter {
  readonly mode: 'mock' | 'cloud';
  send(message: OutboundMessage): Promise<SendResult>;
  verifyWebhook(challenge: string, token: string): boolean;
  verifySignature(rawBody: string, signatureHeader: string | null): boolean;
}

/** Normalise a phone number to the digits-only form the Cloud API expects. */
export function normalisePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

/** Constant-time string comparison for short tokens and signatures. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Mock adapter — development and demonstration
// ---------------------------------------------------------------------------

class MockWhatsAppAdapter implements WhatsAppAdapter {
  readonly mode = 'mock' as const;

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!normalisePhone(message.to)) {
      return {
        ok: false,
        isMock: true,
        retryable: false,
        error: 'Recipient phone number is missing or invalid.',
      };
    }

    return {
      ok: true,
      isMock: true,
      providerMessageId: `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      statusCode: 200,
      retryable: false,
      raw: {
        simulated: true,
        note: 'Mock mode is active. No message left this server. Set WHATSAPP_MODE=cloud with real credentials to send for real.',
        to: normalisePhone(message.to),
        preview: message.body.slice(0, 160),
      },
    };
  }

  verifyWebhook(challenge: string, token: string): boolean {
    const expected = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!expected) return false;
    return safeEqual(token, expected) && Boolean(challenge);
  }

  verifySignature(): boolean {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Cloud API adapter — official WhatsApp Business Platform
// ---------------------------------------------------------------------------

class CloudWhatsAppAdapter implements WhatsAppAdapter {
  readonly mode = 'cloud' as const;

  private get endpoint(): string {
    return `${env.WHATSAPP_API_BASE}/${env.WHATSAPP_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const to = normalisePhone(message.to);

    if (!to) {
      return {
        ok: false,
        isMock: false,
        retryable: false,
        error: 'Recipient phone number is missing or invalid.',
      };
    }

    const payload = message.templateName
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: message.templateName,
            language: { code: message.templateLanguage ?? env.WHATSAPP_DEFAULT_LOCALE },
            components: message.templateVariables?.length
              ? [
                  {
                    type: 'body',
                    parameters: message.templateVariables.map((text) => ({
                      type: 'text',
                      text,
                    })),
                  },
                ]
              : undefined,
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: message.body },
        };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* provider returned a non-JSON body; keep the raw text */
      }

      if (response.ok) {
        const providerMessageId =
          (parsed as { messages?: { id?: string }[] })?.messages?.[0]?.id ?? undefined;

        return {
          ok: true,
          isMock: false,
          providerMessageId,
          statusCode: response.status,
          retryable: false,
          raw: parsed,
        };
      }

      const providerError =
        (parsed as { error?: { message?: string; code?: number } })?.error ?? {};

      // 429 and 5xx are transient; any other 4xx means the request itself is
      // wrong (bad token, unapproved template) and retrying will not help.
      const retryable = response.status === 429 || response.status >= 500;

      return {
        ok: false,
        isMock: false,
        statusCode: response.status,
        retryable,
        error: providerError.message ?? `Provider responded with HTTP ${response.status}.`,
        raw: parsed,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        isMock: false,
        retryable: true,
        error: aborted
          ? 'The WhatsApp API did not respond within 20 seconds.'
          : error instanceof Error
            ? error.message
            : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  verifyWebhook(challenge: string, token: string): boolean {
    const expected = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!expected || !token) return false;
    return safeEqual(token, expected) && Boolean(challenge);
  }

  /**
   * Verify `X-Hub-Signature-256`: HMAC-SHA256 of the raw request body keyed
   * with the app secret. Rejecting unsigned callbacks stops forged delivery
   * receipts from being written into the notification log.
   */
  verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    const secret = env.WHATSAPP_APP_SECRET;
    if (!secret) return false;
    if (!signatureHeader?.startsWith('sha256=')) return false;

    const provided = signatureHeader.slice('sha256='.length);
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

    return safeEqual(provided.toLowerCase(), expected);
  }
}

let cached: WhatsAppAdapter | null = null;

export function getWhatsAppAdapter(): WhatsAppAdapter {
  if (cached) return cached;
  cached = whatsappLiveMode ? new CloudWhatsAppAdapter() : new MockWhatsAppAdapter();
  return cached;
}

/** Status for the admin WhatsApp configuration screen. Never returns secrets. */
export function whatsappStatus() {
  return {
    mode: whatsappLiveMode ? ('cloud' as const) : ('mock' as const),
    configuredMode: env.WHATSAPP_MODE,
    live: whatsappLiveMode,
    hasPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID.length > 0,
    hasAccessToken: env.WHATSAPP_ACCESS_TOKEN.length > 0,
    hasAppSecret: env.WHATSAPP_APP_SECRET.length > 0,
    hasWebhookToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN.length > 0,
    graphVersion: env.WHATSAPP_GRAPH_API_VERSION,
    defaultLocale: env.WHATSAPP_DEFAULT_LOCALE,
    quietHours: {
      start: env.WHATSAPP_QUIET_HOURS_START,
      end: env.WHATSAPP_QUIET_HOURS_END,
    },
    rateLimitPerMinute: env.WHATSAPP_RATE_LIMIT_PER_MINUTE,
  };
}
