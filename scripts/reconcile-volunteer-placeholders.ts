import path from 'node:path';
import dotenv from 'dotenv';

// Load environment variables before client imports
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (!clerkSecretKey) {
  console.error('ERROR: CLERK_SECRET_KEY must be configured.');
  process.exit(1);
}

import { createClerkClient } from '@clerk/backend';
import { eq, like } from 'drizzle-orm';
import { db, pool } from '../apps/api/src/db/client';
import { users } from '../apps/api/src/db/schema';

const clerk = createClerkClient({ secretKey: clerkSecretKey });

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  return email.replace(/^(.)(.*)(@.*)$/, (_, first, _rest, domain) => `${first}***${domain}`);
}

interface ReconcileAction {
  placeholderId: string;
  maskedEmail: string;
  oldClerkId: string;
  newClerkId: string;
  fullName: string;
  avatarUrl: string | null;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const isConfirmed = process.argv.includes('--confirm');

  console.log('====================================================');
  console.log('  EVENTORA: Volunteer Placeholder Reconciliation Tool');
  console.log(`  Execution Mode: ${isApply ? 'APPLY (Modifications will be written to DB)' : 'DRY-RUN (Read-only simulation)'}`);
  console.log('====================================================\n');

  if (isApply && !isConfirmed) {
    console.error('SAFETY BLOCK: Applying modifications requires explicit confirmation.');
    console.error('Please verify that a fresh database backup/snapshot exists, then run with:');
    console.error('  pnpm reconcile:placeholders --apply --confirm\n');
    await pool.end();
    process.exit(1);
  }

  // Find all placeholder accounts created for volunteer invites
  const placeholders = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(like(users.clerkId, 'volunteer_%'));

  console.log(`Found ${placeholders.length} placeholder accounts with prefix "volunteer_".\n`);

  if (placeholders.length === 0) {
    console.log('No placeholder accounts found. Everything is synchronized.');
    await pool.end();
    return;
  }

  const actionsToApply: ReconcileAction[] = [];
  let unverifiedCount = 0;
  let notFoundInClerkCount = 0;
  let errorCount = 0;

  for (const placeholder of placeholders) {
    const normalizedEmail = placeholder.email.trim().toLowerCase();
    const masked = maskEmail(normalizedEmail);

    try {
      // Query Clerk API for users with matching email
      const clerkUsers = await clerk.users.getUserList({
        emailAddress: [normalizedEmail],
        limit: 5,
      });

      if (!clerkUsers.data || clerkUsers.data.length === 0) {
        console.log(`[SKIP - NOT REGISTERED] User ${placeholder.id} (${masked}) has not created a Clerk account yet.`);
        notFoundInClerkCount++;
        continue;
      }

      const matchingClerkUser = clerkUsers.data[0];
      const primaryEmailObj =
        matchingClerkUser.emailAddresses.find((e) => e.id === matchingClerkUser.primaryEmailAddressId) ||
        matchingClerkUser.emailAddresses[0];

      const isVerified = primaryEmailObj?.verification?.status === 'verified';

      if (!isVerified) {
        console.log(`[SKIP - UNVERIFIED] User ${placeholder.id} (${masked}) exists in Clerk, but email is NOT verified.`);
        unverifiedCount++;
        continue;
      }

      const realClerkId = matchingClerkUser.id;
      const resolvedName =
        placeholder.fullName ||
        [matchingClerkUser.firstName, matchingClerkUser.lastName].filter(Boolean).join(' ') ||
        'Campus Member';

      actionsToApply.push({
        placeholderId: placeholder.id,
        maskedEmail: masked,
        oldClerkId: placeholder.clerkId,
        newClerkId: realClerkId,
        fullName: resolvedName,
        avatarUrl: matchingClerkUser.imageUrl ?? null,
      });

      if (!isApply) {
        console.log(`[DRY-RUN WOULD RECONCILE] User ${placeholder.id} (${masked}): would update ${placeholder.clerkId} -> ${realClerkId}`);
      }
    } catch (err: any) {
      console.error(`[ERROR] Failed to inspect user ${placeholder.id} (${masked}):`, err?.message || err);
      errorCount++;
    }
  }

  // Execute inside a single atomic database transaction if --apply
  let appliedCount = 0;
  if (isApply && actionsToApply.length > 0) {
    console.log(`\nExecuting ${actionsToApply.length} reconciliation updates inside a single database transaction...`);
    await db.transaction(async (tx) => {
      for (const action of actionsToApply) {
        await tx
          .update(users)
          .set({
            clerkId: action.newClerkId,
            fullName: action.fullName,
            avatarUrl: action.avatarUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.id, action.placeholderId));

        console.log(`[APPLIED] Successfully reconciled user ${action.placeholderId} (${action.maskedEmail}): ${action.oldClerkId} -> ${action.newClerkId}`);
        appliedCount++;
      }
    });
    console.log(`Transaction successfully committed. Reconciled ${appliedCount} accounts.`);
  }

  console.log('\n----------------- SUMMARY -----------------');
  console.log(`Total Placeholders Inspected:   ${placeholders.length}`);
  console.log(`Ready to Reconcile / Reconciled: ${isApply ? appliedCount : actionsToApply.length}`);
  console.log(`Skipped (Unverified in Clerk):     ${unverifiedCount}`);
  console.log(`Skipped (Not in Clerk yet):         ${notFoundInClerkCount}`);
  console.log(`Errors:                            ${errorCount}`);
  console.log('-------------------------------------------');

  if (!isApply) {
    console.log('\nNOTICE: This was a DRY-RUN. No changes were made to the database.');
    console.log('To apply these changes after verifying database backup/snapshot, run:');
    console.log('  pnpm reconcile:placeholders --apply --confirm\n');
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('Fatal error running reconciliation script:', err);
  await pool.end();
  process.exit(1);
});
