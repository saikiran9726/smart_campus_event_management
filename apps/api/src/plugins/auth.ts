import { createClerkClient, verifyToken } from '@clerk/backend';
import { eq } from 'drizzle-orm';
import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { User, users } from '../db/schema';
import { env } from '../env';
import { AppError } from '../lib/app-error';

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
async function resolveUserByClerkId(clerkId: string): Promise<User | null> {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  // Bounded lazy-fetch fallback: Call Clerk API once and upsert
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    if (!clerkUser) {
      return null;
    }

    const primaryEmail =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!primaryEmail) {
      return null;
    }

    const fullName =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
      primaryEmail.split('@')[0] ||
      'Campus Member';

    // Check optional admin email allowlist
    let initialRole: UserRole = UserRole.STUDENT;
    if (env.ADMIN_EMAIL_DOMAIN_ALLOWLIST) {
      const domains = env.ADMIN_EMAIL_DOMAIN_ALLOWLIST.split(',').map((d) => d.trim());
      const userDomain = primaryEmail.split('@')[1];
      if (userDomain && domains.includes(userDomain)) {
        initialRole = UserRole.ADMIN;
      }
    }

    const [createdUser] = await db
      .insert(users)
      .values({
        clerkId,
        email: primaryEmail,
        fullName,
        avatarUrl: clerkUser.imageUrl ?? null,
        role: initialRole,
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          email: primaryEmail,
          fullName,
          avatarUrl: clerkUser.imageUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return createdUser ?? null;
  } catch (error) {
    // If Clerk API fails or rate limits, don't crash; return null
    return null;
  }
}

/**
 * Authenticates the incoming request via Clerk JWT or test-bypass header.
 */
export async function authenticateRequest(
  request: FastifyRequest
): Promise<User | null> {
  // Test-only bypass: active ONLY in NODE_ENV === 'test'
  if (env.NODE_ENV === 'test') {
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
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  // Check if token is a scanner JWT: scanner tokens are NEVER allowed to act as user sessions
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1]!, 'base64url').toString('utf8');
      const parsed = JSON.parse(payloadJson);
      if (parsed && parsed.kind === 'scanner') {
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
      return null;
    }

    const user = await resolveUserByClerkId(verified.sub);
    if (user && !user.deletedAt) {
      request.user = user;
      return user;
    }

    return null;
  } catch (err) {
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
