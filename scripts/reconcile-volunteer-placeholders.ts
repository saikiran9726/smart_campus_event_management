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

async function main() {
  const isApply = process.argv.includes('--apply');

  console.log('====================================================');
  console.log('  EVENTORA: Volunteer Placeholder Reconciliation Tool');
  console.log(`  Execution Mode: ${isApply ? 'APPLY (Modifications WILL be written to DB)' : 'DRY-RUN (Read-only simulation)'}`);
  console.log('====================================================\n');

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

  let reconciledCount = 0;
  let unverifiedCount = 0;
  let notFoundInClerkCount = 0;
  let errorCount = 0;

  for (const placeholder of placeholders) {
    const normalizedEmail = placeholder.email.trim().toLowerCase();

    try {
      // Query Clerk API for users with matching email
      const clerkUsers = await clerk.users.getUserList({
        emailAddress: [normalizedEmail],
        limit: 5,
      });

      if (!clerkUsers.data || clerkUsers.data.length === 0) {
        console.log(`[SKIP - NOT REGISTERED] User ${placeholder.id} (${normalizedEmail}) has not created a Clerk account yet.`);
        notFoundInClerkCount++;
        continue;
      }

      const matchingClerkUser = clerkUsers.data[0];
      const primaryEmailObj =
        matchingClerkUser.emailAddresses.find((e) => e.id === matchingClerkUser.primaryEmailAddressId) ||
        matchingClerkUser.emailAddresses[0];

      const isVerified = primaryEmailObj?.verification?.status === 'verified';

      if (!isVerified) {
        console.log(`[SKIP - UNVERIFIED] User ${placeholder.id} (${normalizedEmail}) exists in Clerk (${matchingClerkUser.id}), but email is NOT verified.`);
        unverifiedCount++;
        continue;
      }

      const realClerkId = matchingClerkUser.id;

      if (isApply) {
        await db
          .update(users)
          .set({
            clerkId: realClerkId,
            fullName: placeholder.fullName || [matchingClerkUser.firstName, matchingClerkUser.lastName].filter(Boolean).join(' ') || 'Campus Member',
            avatarUrl: matchingClerkUser.imageUrl ?? null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, placeholder.id));

        console.log(`[APPLIED] Successfully reconciled user ${placeholder.id} (${normalizedEmail}): ${placeholder.clerkId} -> ${realClerkId}`);
      } else {
        console.log(`[DRY-RUN WOULD RECONCILE] User ${placeholder.id} (${normalizedEmail}): would update ${placeholder.clerkId} -> ${realClerkId}`);
      }

      reconciledCount++;
    } catch (err: any) {
      console.error(`[ERROR] Failed to inspect user ${placeholder.id} (${normalizedEmail}):`, err?.message || err);
      errorCount++;
    }
  }

  console.log('\n----------------- SUMMARY -----------------');
  console.log(`Total Placeholders Inspected: ${placeholders.length}`);
  console.log(`Ready to Reconcile / Reconciled: ${reconciledCount}`);
  console.log(`Skipped (Unverified in Clerk):   ${unverifiedCount}`);
  console.log(`Skipped (Not in Clerk yet):       ${notFoundInClerkCount}`);
  console.log(`Errors:                          ${errorCount}`);
  console.log('-------------------------------------------');

  if (!isApply) {
    console.log('\nNOTICE: This was a DRY-RUN. No changes were made to the database.');
    console.log('To apply these changes, rerun with the --apply flag:');
    console.log('  pnpm exec tsx scripts/reconcile-volunteer-placeholders.ts --apply\n');
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('Fatal error running reconciliation script:', err);
  await pool.end();
  process.exit(1);
});
