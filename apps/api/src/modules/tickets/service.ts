import crypto from 'node:crypto';
import { eq, or } from 'drizzle-orm';
import QRCode from 'qrcode';
import {
  generateOpaqueToken,
  QR_TOKEN_LENGTH,
  QR_TOKEN_PREFIX,
  TicketStatus,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  events,
  Registration,
  registrations,
  Ticket,
  tickets,
  users,
  venues,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';

/**
 * Masks a ticket token for safe logging, exposing only the first 10 characters.
 */
export function maskToken(token: string): string {
  if (!token) return 'null';
  if (token.length <= 10) return token;
  return `${token.slice(0, 10)}...`;
}

/**
 * Computes a deterministic SHA-256 hash of the token prefix (first 10 chars)
 * for audit logging without persisting plaintext tokens.
 */
export function hashTokenPrefix(token: string): string {
  const prefix = token.slice(0, 10);
  return crypto.createHash('sha256').update(prefix).digest('hex');
}

/**
 * Issues an opaque QR ticket for a registration with retry loop up to 5 times on token collisions.
 */
export async function issueTicket(
  tx: any,
  registration: { id: string; eventId: string; userId: string }
): Promise<Ticket> {
  // Check if ticket already exists for registration
  const [existing] = await tx
    .select()
    .from(tickets)
    .where(eq(tickets.registrationId, registration.id))
    .limit(1);

  if (existing) {
    return existing;
  }

  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    const token = generateOpaqueToken();

    try {
      const [ticket] = await tx
        .insert(tickets)
        .values({
          registrationId: registration.id,
          eventId: registration.eventId,
          userId: registration.userId,
          token,
          status: TicketStatus.VALID,
        })
        .returning();

      return ticket!;
    } catch (err: any) {
      // 23505 = unique_violation in Postgres
      if (
        (err?.code === '23505' || err?.cause?.code === '23505') &&
        attempts < 5
      ) {
        continue;
      }
      throw err;
    }
  }

  throw new AppError(
    'CONFLICT',
    'Failed to generate unique ticket token after multiple attempts.',
    409
  );
}

/**
 * Generates high-contrast QR PNG binary buffer (width 600, errorCorrectionLevel 'M', margin 4).
 */
export async function renderQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, {
    type: 'png',
    width: 600,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Generates clean QR SVG markup.
 */
export async function renderQrSvg(token: string): Promise<string> {
  return QRCode.toString(token, {
    type: 'svg',
    width: 600,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Retrieves ticket and associated event metadata by registration ID.
 */
export async function getTicketDetailsByRegistrationId(
  registrationId: string
) {
  const [row] = await db
    .select({
      ticket: tickets,
      registration: registrations,
      event: events,
      venue: venues,
    })
    .from(tickets)
    .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
    .innerJoin(events, eq(tickets.eventId, events.id))
    .leftJoin(venues, eq(events.venueId, venues.id))
    .where(or(eq(tickets.registrationId, registrationId), eq(tickets.id, registrationId)))
    .limit(1);

  if (!row) {
    throw new AppError('NOT_FOUND', 'Ticket not found for this registration.', 404);
  }

  return row;
}
