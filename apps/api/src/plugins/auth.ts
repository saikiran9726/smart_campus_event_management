import { createClerkClient, verifyToken } from '@clerk/backend';
import { eq } from 'drizzle-orm';
import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { User, users } from '../db/schema';
import { env } from '../env';
import { AppError } from '../lib/app-error';
import { syncAndReconcileClerkUser } from '../lib/identity';
import { isTestAuthBypassEnabled } from '../lib/test-auth-guard';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

/**
 * Resolves a User record from Clerk ID, falling back to a bounded single-flight
 * Clerk API lookup if the user has not yet been synced by the webhook.
 */
async function resolveUserByClerkId(
  clerkId: string,
  logger?: FastifyRequest['log']
): Promise<User | null> {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  // Bounded lazy-fetch fallback: Call Clerk API once and reconcile
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    if (!clerkUser) {
      logger?.warn({ clerkId, reason: 'CLERK_USER_NOT_FOUND' }, 'Clerk user not found in Clerk API');
      return null;
    }

    const primaryEmailObj =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId) ||
      clerkUser.emailAddresses[0];

    const primaryEmail = primaryEmailObj?.emailAddress;
    const isEmailVerified = primaryEmailObj?.verification?.status === 'verified';

    if (!primaryEmail) {
      logger?.warn({ clerkId, reason: 'NO_PRIMARY_EMAIL' }, 'Clerk user has no primary email');
      return null;
    }

    const fullName =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
      primaryEmail.split('@')[0] ||
      'Campus Member';

    const syncResult = await syncAndReconcileClerkUser({
      clerkId,
      email: primaryEmail,
      isEmailVerified,
      fullName,
      avatarUrl: clerkUser.imageUrl ?? null,
    });

    if (syncResult.user) {
      logger?.info(
        { clerkId, reason: syncResult.reason },
        'Clerk user lazy-resolved and synchronized successfully'
      );
      return syncResult.user;
    }

    logger?.warn(
      { clerkId, reason: syncResult.reason, error: syncResult.error?.message },
      'Clerk user could not be resolved into database'
    );
    return null;
  } catch (error: any) {
    logger?.error(
      { clerkId, reason: 'CLERK_RESOLVE_EXCEPTION', error: error?.message },
      'Unexpected error resolving Clerk user'
    );
    return null;
  }
}

/**
 * Authenticates the incoming request via Clerk JWT or test-bypass header.
 */
export async function authenticateRequest(
  request: FastifyRequest
): Promise<User | null> {
  // Test/Development header bypass: active in test, or in dev with ALLOW_TEST_AUTH_BYPASS === 'true'
  if (isTestAuthBypassEnabled()) {
    const testUserId = request.headers['x-test-user-id'];
    if (typeof testUserId === 'string' && testUserId.trim().length > 0) {
      const cleanId = testUserId.trim();
      let testUser: User | undefined;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      if (isUuid) {
        try {
          const [found] = await db
            .select()
            .from(users)
            .where(eq(users.id, cleanId))
            .limit(1);
          testUser = found;
        } catch {
          // Ignore UUID query error
        }
      }

      // If not found by UUID or not a UUID, query by clerkId
      if (!testUser) {
        try {
          const [found] = await db
            .select()
            .from(users)
            .where(eq(users.clerkId, cleanId))
            .limit(1);
          testUser = found;
        } catch {
          // Ignore clerkId query error
        }
      }

      // In test mode, if user is not in DB yet, auto-provision test user
      if (!testUser && !isUuid) {
        try {
          const [created] = await db
            .insert(users)
            .values({
              clerkId: cleanId,
              email: `${cleanId.toLowerCase()}@campus.edu`,
              fullName: `Test ${cleanId}`,
              role: cleanId.includes('admin')
                ? UserRole.ADMIN
                : cleanId.includes('faculty')
                ? UserRole.FACULTY
                : cleanId.includes('organizer')
                ? UserRole.ORGANIZER
                : UserRole.STUDENT,
            })
            .onConflictDoNothing()
            .returning();
          testUser = created;
          if (!testUser) {
            const [found] = await db
              .select()
              .from(users)
              .where(eq(users.clerkId, cleanId))
              .limit(1);
            testUser = found;
          }
        } catch {
          // Ignore insertion error
        }
      }

      if (testUser) {
        request.user = testUser;
        return testUser;
      }
    }
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    request.log?.debug({ reason: 'AUTH_HEADER_MISSING_OR_NOT_BEARER' }, 'Authentication header missing or invalid');
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    request.log?.debug({ reason: 'AUTH_TOKEN_EMPTY' }, 'Authentication bearer token empty');
    return null;
  }

  // Check if token is a scanner JWT: scanner tokens are NEVER allowed to act as user sessions
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1]!, 'base64url').toString('utf8');
      const parsed = JSON.parse(payloadJson);
      if (parsed && parsed.kind === 'scanner') {
        request.log?.warn({ reason: 'SCANNER_TOKEN_ON_USER_ENDPOINT' }, 'Scanner token rejected on user endpoint');
        throw new AppError(
          'FORBIDDEN',
          'Scanner tokens are restricted to gate endpoints.',
          403
        );
      }
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
  }

  try {
    const verified = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    if (!verified || !verified.sub) {
      request.log?.warn({ reason: 'CLERK_TOKEN_VERIFICATION_FAILED' }, 'Clerk verifyToken returned invalid or missing subject');
      return null;
    }

    const user = await resolveUserByClerkId(verified.sub, request.log);
    if (user && !user.deletedAt) {
      request.user = user;
      return user;
    }

    if (user?.deletedAt) {
      request.log?.warn({ clerkId: verified.sub, reason: 'USER_ACCOUNT_SOFT_DELETED' }, 'User account has been deleted');
    } else {
      request.log?.warn({ clerkId: verified.sub, reason: 'USER_LOOKUP_OR_RECONCILIATION_FAILED' }, 'Unable to resolve user from Clerk ID');
    }

    return null;
  } catch (err: any) {
    request.log?.warn({ reason: 'CLERK_TOKEN_VERIFY_EXCEPTION', error: err?.message }, 'Exception during Clerk token verification');
    return null;
  }
}

/**
 * Fastify preHandler hook: requires authenticated user or throws 401 UNAUTHENTICATED.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = await authenticateRequest(request);
  if (!user) {
    throw new AppError(
      'UNAUTHENTICATED',
      'Authentication required. Please provide a valid Bearer token.',
      401
    );
  }
}

/**
 * Fastify preHandler hook: populates request.user if valid token present, otherwise continues.
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticateRequest(request);
}
