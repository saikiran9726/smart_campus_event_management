import { eq } from 'drizzle-orm';
import { UserRole } from '@eventora/shared';
import { db, DatabaseInstance, DatabaseTransaction, withTx } from '../db/client';
import { User, users } from '../db/schema';
import { env } from '../env';

export type IdentityReconciliationReason =
  | 'USER_FOUND_BY_CLERK_ID'
  | 'USER_RECONCILED_FROM_PLACEHOLDER'
  | 'NEW_USER_CREATED'
  | 'EMAIL_COLLISION_NON_PLACEHOLDER'
  | 'EMAIL_UNVERIFIED_CANNOT_RECONCILE'
  | 'DATABASE_ERROR';

export interface SyncClerkUserInput {
  clerkId: string;
  email: string;
  isEmailVerified: boolean;
  fullName: string;
  avatarUrl?: string | null;
}

export interface SyncClerkUserResult {
  user: User | null;
  reason: IdentityReconciliationReason;
  error?: Error;
}

export function determineInitialRole(email: string, isEmailVerified: boolean): UserRole {
  // ADMIN role may be granted ONLY when the Clerk email is verified
  if (!isEmailVerified) {
    return UserRole.STUDENT;
  }
  let initialRole: UserRole = UserRole.STUDENT;
  const normalized = email.toLowerCase().trim();
  if (env.INITIAL_ADMIN_EMAILS) {
    const adminEmails = env.INITIAL_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase());
    if (adminEmails.includes(normalized)) {
      initialRole = UserRole.ADMIN;
    }
  } else if (env.ADMIN_EMAIL_DOMAIN_ALLOWLIST) {
    const domains = env.ADMIN_EMAIL_DOMAIN_ALLOWLIST.split(',').map((d) => d.trim().toLowerCase());
    const userDomain = normalized.split('@')[1];
    if (userDomain && domains.includes(userDomain)) {
      initialRole = UserRole.ADMIN;
    }
  }
  return initialRole;
}

/**
 * Transactionally synchronizes a Clerk user into the database.
 * Reconciles placeholder accounts (clerk_id with exact "volunteer_" prefix)
 * ONLY if the email is verified by Clerk.
 * Never merges into another real user account.
 */
export async function syncAndReconcileClerkUser(
  input: SyncClerkUserInput,
  existingTx?: DatabaseTransaction
): Promise<SyncClerkUserResult> {
  const runner = async (tx: DatabaseTransaction | DatabaseInstance) => {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Check if user already exists by clerkId
    const [existingByClerkId] = await tx
      .select()
      .from(users)
      .where(eq(users.clerkId, input.clerkId))
      .limit(1);

    if (existingByClerkId) {
      // Update basic profile details idempotently
      const [updated] = await tx
        .update(users)
        .set({
          fullName: input.fullName || existingByClerkId.fullName,
          avatarUrl: input.avatarUrl ?? existingByClerkId.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByClerkId.id))
        .returning();

      return {
        user: updated ?? existingByClerkId ?? null,
        reason: 'USER_FOUND_BY_CLERK_ID' as IdentityReconciliationReason,
      };
    }

    // 2. Check if a user with the same normalized email already exists
    const [existingByEmail] = await tx
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingByEmail) {
      // Reconcile ONLY if existing clerkId has the exact "volunteer_" prefix
      const isPlaceholder = existingByEmail.clerkId.startsWith('volunteer_');

      if (!isPlaceholder) {
        // Collision with an existing non-placeholder account: DO NOT MERGE!
        return {
          user: null,
          reason: 'EMAIL_COLLISION_NON_PLACEHOLDER' as IdentityReconciliationReason,
        };
      }

      if (!input.isEmailVerified) {
        // Email must be verified by Clerk to claim a placeholder account
        return {
          user: null,
          reason: 'EMAIL_UNVERIFIED_CANNOT_RECONCILE' as IdentityReconciliationReason,
        };
      }

      // Reconcile placeholder: update clerkId to the real Clerk ID
      const initialRole = determineInitialRole(normalizedEmail, input.isEmailVerified);
      const roleToSet =
        initialRole === UserRole.ADMIN ? UserRole.ADMIN : existingByEmail.role;

      const [reconciled] = await tx
        .update(users)
        .set({
          clerkId: input.clerkId,
          fullName: input.fullName || existingByEmail.fullName,
          avatarUrl: input.avatarUrl ?? existingByEmail.avatarUrl,
          role: roleToSet,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail.id))
        .returning();

      return {
        user: reconciled ?? null,
        reason: 'USER_RECONCILED_FROM_PLACEHOLDER' as IdentityReconciliationReason,
      };
    }

    // 3. Brand new user: insert
    const initialRole = determineInitialRole(normalizedEmail, input.isEmailVerified);
    const [newUser] = await tx
      .insert(users)
      .values({
        clerkId: input.clerkId,
        email: normalizedEmail,
        fullName: input.fullName,
        avatarUrl: input.avatarUrl ?? null,
        role: initialRole,
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          email: normalizedEmail,
          fullName: input.fullName,
          avatarUrl: input.avatarUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      user: newUser ?? null,
      reason: 'NEW_USER_CREATED' as IdentityReconciliationReason,
    };
  };

  try {
    if (existingTx) {
      return await runner(existingTx);
    }
    return await withTx(runner);
  } catch (error: any) {
    return {
      user: null,
      reason: 'DATABASE_ERROR',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
