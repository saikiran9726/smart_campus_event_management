import crypto from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { MAGIC_LINK_TTL_HOURS } from '@eventora/shared';
import { db } from '../db/client';
import { magicLinkJti } from '../db/schema';
import { env } from '../env';
import { AppError } from './app-error';

export interface SignApprovalTokenParams {
  proposalId: string;
  facultyId: string;
  action: 'APPROVE' | 'REJECT' | string;
  ttlSeconds?: number;
  dbOrTx?: any;
}

export interface VerifiedApprovalTokenPayload {
  jti: string;
  proposalId: string;
  facultyId: string;
  action: string;
  expiresAt: Date;
}

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(env.MAGIC_LINK_SECRET);
}

/**
 * Signs an HMAC-SHA256 JWT approval link for a faculty member and records
 * the unique JTI in the database for single-use consumption.
 */
export async function signApprovalToken(
  params: SignApprovalTokenParams
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = crypto.randomUUID();
  const ttlSeconds =
    params.ttlSeconds ?? MAGIC_LINK_TTL_HOURS * 60 * 60; // default 72 hours
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  // Persist JTI in database
  const client = params.dbOrTx ?? db;
  await client.insert(magicLinkJti).values({
    jti,
    proposalId: params.proposalId,
    action: params.action,
    expiresAt,
  });

  const token = await new SignJWT({
    proposalId: params.proposalId,
    facultyId: params.facultyId,
    action: params.action,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getJwtSecret());

  return { token, jti, expiresAt };
}

/**
 * Cryptographically verifies and validates an approval token against the database JTI store.
 */
export async function verifyApprovalToken(
  token: string
): Promise<VerifiedApprovalTokenPayload> {
  let verified;
  try {
    verified = await jwtVerify(token, getJwtSecret());
  } catch (err: any) {
    if (err?.code === 'ERR_JWT_EXPIRED') {
      throw new AppError('OFFER_EXPIRED', 'This approval link has expired.', 410);
    }
    throw new AppError('TOKEN_INVALID', 'Invalid or tampered magic link token.', 400);
  }

  const payload = verified.payload;
  const jti = payload.jti;
  const proposalId = payload.proposalId as string | undefined;
  const facultyId = payload.facultyId as string | undefined;
  const action = payload.action as string | undefined;

  if (!jti || !proposalId || !facultyId || !action) {
    throw new AppError('TOKEN_INVALID', 'Malformed token payload.', 400);
  }

  const [row] = await db
    .select()
    .from(magicLinkJti)
    .where(eq(magicLinkJti.jti, jti))
    .limit(1);

  if (!row) {
    throw new AppError('TOKEN_INVALID', 'Magic link record was not found.', 400);
  }

  if (row.usedAt !== null) {
    throw new AppError(
      'TOKEN_USED',
      'This decision link has already been used and cannot be submitted again.',
      409
    );
  }

  if (new Date() > new Date(row.expiresAt)) {
    throw new AppError('OFFER_EXPIRED', 'This approval link has expired.', 410);
  }

  return {
    jti,
    proposalId,
    facultyId,
    action,
    expiresAt: new Date(row.expiresAt),
  };
}

/**
 * Atomically marks the JTI as consumed (single-use) and invalidates any sibling
 * tokens (opposite actions) for the same proposal.
 */
export async function consumeJti(
  jti: string,
  tx = db
): Promise<void> {
  const [consumed] = await tx
    .update(magicLinkJti)
    .set({ usedAt: new Date() })
    .where(and(eq(magicLinkJti.jti, jti), isNull(magicLinkJti.usedAt)))
    .returning();

  if (!consumed) {
    throw new AppError(
      'TOKEN_USED',
      'This decision link has already been used.',
      409
    );
  }

  // Invalidate sibling tokens for this proposal
  await tx
    .update(magicLinkJti)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(magicLinkJti.proposalId, consumed.proposalId),
        ne(magicLinkJti.jti, jti),
        isNull(magicLinkJti.usedAt)
      )
    );
}
