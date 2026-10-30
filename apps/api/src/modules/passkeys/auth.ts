import { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ClubMemberRole, UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { clubMembers, events } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { authenticateRequest } from '../../plugins/auth';
import { ScannerTokenPayload, verifyScannerToken } from './service';

export interface ScannerPrincipal {
  type: 'PASSKEY' | 'ORGANIZER';
  sessionId?: string;
  passkeyId?: string;
  userId?: string;
  volunteerName?: string;
  label?: string;
  eventId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    scanner?: ScannerPrincipal;
    isScanner?: boolean;
  }
}

/**
 * Fastify preHandler enforcing scanner authorization.
 * Accepts either a valid scanner session JWT or an authenticated event organizer/admin.
 */
export async function requireScanner(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const targetEventId =
    (request.params as any)?.eventId ||
    (request.query as any)?.eventId ||
    (request.body as any)?.eventId;

  // 1. Check if authHeader contains a scanner JWT
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1]!, 'base64url').toString('utf8');
        const parsed = JSON.parse(payloadJson);
        if (parsed.kind === 'scanner') {
          const verified = await verifyScannerToken(token);
          if (targetEventId && verified.eventId !== targetEventId) {
            throw new AppError(
              'FORBIDDEN',
              'Scanner token is not authorized for this event.',
              403
            );
          }
          request.scanner = {
            type: 'PASSKEY',
            sessionId: verified.sessionId,
            passkeyId: verified.passkeyId,
            volunteerName: verified.volunteerName,
            label: verified.passkeyLabel,
            eventId: verified.eventId,
          };
          request.isScanner = true;
          return;
        }
      }
    } catch (err: any) {
      if (err instanceof AppError) {
        throw err;
      }
      // Non-AppErrors (e.g. malformed JWT string) should throw 401
      throw new AppError('UNAUTHENTICATED', 'Invalid scanner token.', 401);
    }
  }

  // 2. Fall back to user authentication (organizer / admin)
  const user = await authenticateRequest(request);
  if (!user) {
    throw new AppError(
      'UNAUTHENTICATED',
      'Scanner authorization required. Please provide a valid scanner passkey token or sign in as an organizer.',
      401
    );
  }

  if (user.role === UserRole.ADMIN) {
    request.scanner = {
      type: 'ORGANIZER',
      userId: user.id,
      volunteerName: user.fullName,
      label: user.email,
      eventId: targetEventId || '',
    };
    request.isScanner = true;
    return;
  }

  if (targetEventId) {
    const [event] = await db
      .select({ clubId: events.clubId })
      .from(events)
      .where(eq(events.id, targetEventId))
      .limit(1);

    if (!event) {
      throw new AppError('NOT_FOUND', `Event '${targetEventId}' was not found.`, 404);
    }

    const [membership] = await db
      .select({ role: clubMembers.role })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, event.clubId),
          eq(clubMembers.userId, user.id)
        )
      )
      .limit(1);

    const isOrganizer =
      membership &&
      (membership.role === ClubMemberRole.OWNER ||
        membership.role === ClubMemberRole.ADMIN);

    if (!isOrganizer) {
      throw new AppError(
        'FORBIDDEN',
        'You do not have organizer permissions to scan tickets for this event.',
        403
      );
    }
  }

  request.scanner = {
    type: 'ORGANIZER',
    userId: user.id,
    volunteerName: user.fullName,
    label: user.email,
    eventId: targetEventId || '',
  };
  request.isScanner = true;
}
