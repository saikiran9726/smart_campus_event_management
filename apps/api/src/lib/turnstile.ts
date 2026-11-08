import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';
import { AppError } from './app-error';

export type TurnstileFailureReason =
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'EXPIRED_OR_USED'
  | 'SERVER_MISCONFIGURED'
  | 'UPSTREAM_UNAVAILABLE';

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
  hostname?: string;
}

export interface TurnstileResult {
  success: boolean;
  reason?: TurnstileFailureReason;
  errorCodes?: string[];
  hostname?: string;
}

const REASON_MESSAGES: Record<TurnstileFailureReason, string> = {
  MISSING_TOKEN:
    'Security check was not completed. Please complete the verification and try again.',
  INVALID_TOKEN:
    'Security check could not be validated. Please refresh the page and complete it again.',
  EXPIRED_OR_USED:
    'Security check expired or was already used. A fresh check has been loaded; please complete it and submit again.',
  SERVER_MISCONFIGURED:
    'Security verification is temporarily unavailable due to a server configuration problem. Please contact the organizers.',
  UPSTREAM_UNAVAILABLE:
    'Security verification service could not be reached. Please try again in a moment.',
};

function classifyErrorCodes(codes: string[]): TurnstileFailureReason {
  if (codes.includes('timeout-or-duplicate')) return 'EXPIRED_OR_USED';
  if (codes.includes('missing-input-secret') || codes.includes('invalid-input-secret')) {
    return 'SERVER_MISCONFIGURED';
  }
  if (codes.includes('internal-error')) return 'UPSTREAM_UNAVAILABLE';
  // invalid-input-response, bad-request, anything else
  return 'INVALID_TOKEN';
}

/**
 * Validates a Cloudflare Turnstile token via Cloudflare's siteverify endpoint
 * and returns a structured, secret-free result.
 * In test environment, bypasses network and validates token directly.
 */
export async function verifyTurnstileDetailed(
  token?: string | null
): Promise<TurnstileResult> {
  if (!token) {
    return { success: false, reason: 'MISSING_TOKEN' };
  }

  // Never accept test tokens in production runtime
  if (env.NODE_ENV === 'production') {
    if (token === 'test-pass' || token === 'test-fail') {
      return { success: false, reason: 'INVALID_TOKEN' };
    }
  }

  // Fast test-mode bypass
  if (env.NODE_ENV === 'test') {
    if (token === 'test-pass') return { success: true };
    if (token === 'test-fail') return { success: false, reason: 'INVALID_TOKEN' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', env.TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    // Note: We intentionally omit remoteip because the backend runs behind reverse proxies
    // (Render load balancers / Envoy) while the client interacts via Cloudflare Pages edge.
    // Cloudflare siteverify rejects mismatched remoteip with 'invalid-remoteip'.

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(6000),
      }
    );

    // Siteverify returns a JSON body (with error-codes) even on 4xx, so try to read it.
    const data: SiteverifyResponse | null = await response
      .json()
      .then((j) => j as SiteverifyResponse)
      .catch(() => null);

    if (!data) {
      console.warn('[Turnstile] Siteverify returned an unreadable response:', {
        httpStatus: response.status,
      });
      return { success: false, reason: 'UPSTREAM_UNAVAILABLE' };
    }

    if (!data.success) {
      const errorCodes = data['error-codes'] ?? [];
      const reason = classifyErrorCodes(errorCodes);
      // Safe diagnostics only: never log the secret or any part of the token.
      console.warn('[Turnstile] Verification failed:', {
        httpStatus: response.status,
        errorCodes,
        hostname: data.hostname,
        reason,
      });
      return { success: false, reason, errorCodes, hostname: data.hostname };
    }

    return { success: true, hostname: data.hostname };
  } catch (error) {
    console.error(
      '[Turnstile] Network error or timeout during verification:',
      error instanceof Error ? error.message : error
    );
    return { success: false, reason: 'UPSTREAM_UNAVAILABLE' };
  }
}

/**
 * Boolean convenience wrapper kept for existing callers.
 */
export async function verifyTurnstile(
  token?: string | null,
  _ip?: string
): Promise<boolean> {
  return (await verifyTurnstileDetailed(token)).success;
}

/**
 * Fastify preHandler hook enforcing Cloudflare Turnstile bot verification.
 * Reads token from body or header 'cf-turnstile-response' / 'turnstileToken'.
 */
export async function requireTurnstile(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const body = request.body as Record<string, unknown> | undefined;
  const token =
    (request.headers['cf-turnstile-response'] as string | undefined) ??
    (body?.['cf-turnstile-response'] as string | undefined) ??
    (body?.turnstileToken as string | undefined);

  const result = await verifyTurnstileDetailed(token);

  if (!result.success) {
    const reason = result.reason ?? 'INVALID_TOKEN';
    throw new AppError('TURNSTILE_FAILED', REASON_MESSAGES[reason], 403, { reason });
  }
}
