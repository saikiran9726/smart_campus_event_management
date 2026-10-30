import crypto from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { generateFullPasskey } from '@eventora/shared';
import { db } from '../../db/client';
import {
  events,
  ScannerPasskey,
  scannerPasskeys,
  ScannerSession,
  scannerSessions,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';

// In-memory failed unlock attempt tracking per IP (ip -> timestamps[])
const failedAttemptsByIp = new Map<string, number[]>();

function checkAndRecordFailedAttempt(ip: string): void {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const attempts = (failedAttemptsByIp.get(ip) ?? []).filter(
    (t) => now - t < windowMs
  );

  attempts.push(now);
  failedAttemptsByIp.set(ip, attempts);

  if (attempts.length >= 10) {
    throw new AppError(
      'RATE_LIMITED',
      'IP locked out due to excessive failed unlock attempts (10 attempts). Please try again in 1 hour.',
      429,
      { ip, lockoutSeconds: 3600 }
    );
  }
}

export function resetFailedAttemptsForIp(ip: string): void {
  failedAttemptsByIp.delete(ip);
}

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(env.MAGIC_LINK_SECRET);
}

export interface ScannerTokenPayload {
  sessionId: string;
  passkeyId: string;
  eventId: string;
  volunteerName: string;
  passkeyLabel: string;
  kind: 'scanner';
}

/**
 * Creates a unique passkey for volunteers to unlock gate scanning capabilities for an event.
 */
export async function createPasskey(params: {
  eventId: string;
  label: string;
  ttlHours?: number;
  userId: string;
}): Promise<{
  id: string;
  code: string;
  label: string;
  expiresAt: Date;
  setupUrl: string;
  qrUrl: string;
}> {
  const { eventId, label, ttlHours = 12, userId } = params;

  // Verify event existence
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
  }

  let code = '';
  let passkeyHash = '';
  let attempts = 0;

  // Generate uniform code (SCAN-XXXXXX) avoiding collisions
  while (attempts < 5) {
    attempts++;
    code = generateFullPasskey();
    passkeyHash = crypto.createHash('sha256').update(code).digest('hex');

    const [collision] = await db
      .select({ id: scannerPasskeys.id })
      .from(scannerPasskeys)
      .where(
        and(
          eq(scannerPasskeys.eventId, eventId),
          eq(scannerPasskeys.passkeyHash, passkeyHash),
          isNull(scannerPasskeys.revokedAt),
          sql`${scannerPasskeys.expiresAt} > now()`
        )
      )
      .limit(1);

    if (!collision) {
      break;
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  const [passkey] = await db
    .insert(scannerPasskeys)
    .values({
      eventId,
      passkeyHash,
      label,
      expiresAt,
      createdBy: userId,
    })
    .returning();

  const setupUrl = `${env.PUBLIC_WEB_URL}/scanner/unlock?c=${code}`;
  const qrUrl = `/events/${eventId}/passkeys/${passkey!.id}/setup-qr.png`;

  return {
    id: passkey!.id,
    code, // Plaintext code returned only once upon creation
    label: passkey!.label,
    expiresAt: passkey!.expiresAt,
    setupUrl,
    qrUrl,
  };
}

/**
 * Revokes a passkey, instantly invalidating all active scanner sessions tied to it.
 */
export async function revokePasskey(
  eventId: string,
  passkeyId: string
): Promise<void> {
  const [revoked] = await db
    .update(scannerPasskeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(scannerPasskeys.id, passkeyId),
        eq(scannerPasskeys.eventId, eventId),
        isNull(scannerPasskeys.revokedAt)
      )
    )
    .returning();

  if (!revoked) {
    throw new AppError(
      'NOT_FOUND',
      'Passkey not found or already revoked.',
      404
    );
  }
}

/**
 * Unlocks a scanner session via plaintext code, producing a scoped 8h JWT.
 */
export async function unlockScanner(params: {
  ip: string;
  code: string;
  volunteerName: string;
  eventId?: string;
  userId?: string;
}): Promise<{
  token: string;
  eventId: string;
  eventTitle: string;
  volunteerName: string;
}> {
  const { ip, code, volunteerName, eventId, userId } = params;

  // Check IP lockout threshold (max 10 failed attempts per hour)
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const attempts = (failedAttemptsByIp.get(ip) ?? []).filter(
    (t) => now - t < windowMs
  );
  if (attempts.length >= 10) {
    throw new AppError(
      'RATE_LIMITED',
      'IP locked out due to excessive failed unlock attempts (10 attempts). Please try again in 1 hour.',
      429,
      { ip, lockoutSeconds: 3600 }
    );
  }

  const cleanCode = code.trim().toUpperCase();
  const passkeyHash = crypto.createHash('sha256').update(cleanCode).digest('hex');

  // Query passkey
  const conditions = [eq(scannerPasskeys.passkeyHash, passkeyHash)];
  if (eventId) {
    conditions.push(eq(scannerPasskeys.eventId, eventId));
  }

  const [passkey] = await db
    .select({
      passkey: scannerPasskeys,
      event: events,
    })
    .from(scannerPasskeys)
    .innerJoin(events, eq(scannerPasskeys.eventId, events.id))
    .where(and(...conditions))
    .limit(1);

  if (!passkey) {
    checkAndRecordFailedAttempt(ip);
    throw new AppError(
      'TOKEN_INVALID',
      'Invalid passkey code provided.',
      400
    );
  }

  if (passkey.passkey.revokedAt !== null) {
    throw new AppError(
      'TOKEN_INVALID',
      'Passkey has been revoked by the event organizer.',
      400
    );
  }

  if (new Date() > new Date(passkey.passkey.expiresAt)) {
    throw new AppError(
      'OFFER_EXPIRED',
      'This scanner passkey has expired.',
      410
    );
  }

  // Create scanner session row
  const [session] = await db
    .insert(scannerSessions)
    .values({
      passkeyId: passkey.passkey.id,
      volunteerName,
      userId: userId ?? null,
    })
    .returning();

  // Create 8-hour scoped JWT
  const token = await new SignJWT({
    sessionId: session!.id,
    passkeyId: passkey.passkey.id,
    eventId: passkey.event.id,
    volunteerName,
    passkeyLabel: passkey.passkey.label,
    kind: 'scanner',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getJwtSecret());

  // Successful unlock resets failed attempts
  resetFailedAttemptsForIp(ip);

  return {
    token,
    eventId: passkey.event.id,
    eventTitle: passkey.event.title,
    volunteerName,
  };
}

/**
 * Validates a scanner JWT and confirms the associated passkey remains active and unrevoked.
 */
export async function verifyScannerToken(
  token: string
): Promise<ScannerTokenPayload> {
  let verified;
  try {
    verified = await jwtVerify(token, getJwtSecret());
  } catch (err: any) {
    throw new AppError(
      'UNAUTHENTICATED',
      'Invalid or expired scanner token.',
      401
    );
  }

  const payload = verified.payload as unknown as ScannerTokenPayload;
  if (payload.kind !== 'scanner' || !payload.sessionId || !payload.passkeyId) {
    throw new AppError('FORBIDDEN', 'Malformed scanner token payload.', 403);
  }

  // Verify that the passkey has not been revoked in the DB
  const [passkey] = await db
    .select({
      id: scannerPasskeys.id,
      revokedAt: scannerPasskeys.revokedAt,
      expiresAt: scannerPasskeys.expiresAt,
    })
    .from(scannerPasskeys)
    .where(eq(scannerPasskeys.id, payload.passkeyId))
    .limit(1);

  if (!passkey || passkey.revokedAt !== null) {
    throw new AppError(
      'UNAUTHENTICATED',
      'Scanner passkey has been revoked.',
      401
    );
  }

  if (new Date() > new Date(passkey.expiresAt)) {
    throw new AppError(
      'UNAUTHENTICATED',
      'Scanner passkey has expired.',
      401
    );
  }

  // Touch lastSeenAt on session asynchronously
  db.update(scannerSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(scannerSessions.id, payload.sessionId))
    .catch(() => {});

  return payload;
}
