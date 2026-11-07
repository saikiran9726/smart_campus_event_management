import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';
import { AppError } from './app-error';

/**
 * Validates a Cloudflare Turnstile token via Cloudflare's siteverify endpoint.
 * In test environment, bypasses network and validates token directly.
 */
export async function verifyTurnstile(
  token?: string | null,
  ip?: string
): Promise<boolean> {
  if (!token) {
    return false;
  }

  // Never accept test tokens in production runtime
  if (env.NODE_ENV === 'production') {
    if (token === 'test-pass' || token === 'test-fail') {
      return false;
    }
  }

  // Fast test-mode bypass
  if (env.NODE_ENV === 'test') {
    if (token === 'test-pass') {
      return true;
    }
    if (token === 'test-fail') {
      return false;
    }
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

    if (!response.ok) {
      console.warn('[Turnstile] Cloudflare siteverify HTTP error:', response.status);
      return false;
    }

    const data = (await response.json()) as {
      success: boolean;
      'error-codes'?: string[];
      challenge_ts?: string;
      hostname?: string;
      action?: string;
      cdata?: string;
    };

    if (!data.success) {
      console.warn('[Turnstile] Verification failed:', {
        errorCodes: data['error-codes'],
        hostname: data.hostname,
        tokenPrefix: token.substring(0, 10),
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      '[Turnstile] Network error or timeout during verification:',
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

/**
 * Fastify preHandler hook enforcing Cloudflare Turnstile bot verification.
 * Reads token from body or header 'cf-turnstile-response' / 'turnstileToken'.
 */
export async function requireTurnstile(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = request.body as Record<string, unknown> | undefined;
  const token =
    (request.headers['cf-turnstile-response'] as string | undefined) ??
    (body?.['cf-turnstile-response'] as string | undefined) ??
    (body?.turnstileToken as string | undefined);

  const isValid = await verifyTurnstile(token);

  if (!isValid) {
    throw new AppError(
      'TURNSTILE_FAILED',
      'Turnstile verification failed. Please complete the security check and try again.',
      403
    );
  }
}
