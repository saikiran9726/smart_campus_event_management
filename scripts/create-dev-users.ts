import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

// Load environment variables before any client imports
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const clerkSecretKey = process.env.CLERK_SECRET_KEY;

// 1. Refusal checks
if (!clerkSecretKey || !clerkSecretKey.startsWith('sk_test_')) {
  console.error('REFUSED: CLERK_SECRET_KEY must be present and start with "sk_test_".');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSED: Cannot run create-dev-users when NODE_ENV is "production".');
  process.exit(1);
}

import { createClerkClient } from '@clerk/backend';
import { eq } from 'drizzle-orm';
import { ChannelKind, ClubMemberRole, UserRole } from '@eventora/shared';
import { db, pool } from '../apps/api/src/db/client';
import { clubChannels, clubMembers, clubs, users } from '../apps/api/src/db/schema';

const clerk = createClerkClient({ secretKey: clerkSecretKey });

interface DevUserSpec {
  key: string;
  email: string;
  role: UserRole;
  fullName: string;
  rollNumber: string | null;
  department: string;
  year: number;
}

const DEV_USERS: DevUserSpec[] = [
  {
    key: 'student1',
    email: 'student1+clerk_test@example.com',
    role: UserRole.STUDENT,
    fullName: 'Student One',
    rollNumber: 'STU26A001',
    department: 'Computer Science',
    year: 2,
  },
  {
    key: 'student2',
    email: 'student2+clerk_test@example.com',
    role: UserRole.STUDENT,
    fullName: 'Student Two',
    rollNumber: 'STU26A002',
    department: 'Electrical Engineering',
    year: 3,
  },
  {
    key: 'organizer',
    email: 'organizer+clerk_test@example.com',
    role: UserRole.ORGANIZER,
    fullName: 'Dev Organizer',
    rollNumber: 'ORG26A001',
    department: 'Information Technology',
    year: 3,
  },
  {
    key: 'clubowner',
    email: 'clubowner+clerk_test@example.com',
    role: UserRole.ORGANIZER,
    fullName: 'Club Owner',
    rollNumber: 'OWN26A001',
    department: 'Computer Science',
    year: 4,
  },
  {
    key: 'clubadmin',
    email: 'clubadmin+clerk_test@example.com',
    role: UserRole.ORGANIZER,
    fullName: 'Club Admin',
    rollNumber: 'CAD26A001',
    department: 'Computer Science',
    year: 3,
  },
  {
    key: 'faculty',
    email: 'faculty+clerk_test@example.com',
    role: UserRole.FACULTY,
    fullName: 'Dr. Dev Faculty',
    rollNumber: null,
    department: 'School of Computing',
    year: 0,
  },
  {
    key: 'admin',
    email: 'admin+clerk_test@example.com',
    role: UserRole.ADMIN,
    fullName: 'Dev Administrator',
    rollNumber: 'ADM26A001',
    department: 'Campus Administration',
    year: 0,
  },
];

function generateStrongPassword(key: string): string {
  const salt = crypto.randomBytes(6).toString('hex');
  return `Dev@2026!${key.charAt(0).toUpperCase() + key.slice(1)}_${salt}`;
}

async function main(): Promise<void> {
  console.log('Connecting to Clerk backend & PostgreSQL to provision dev test accounts...');

  const tableData: Array<{
    role: string;
    email: string;
    password: string;
    userId: string;
    clubRole?: string;
  }> = [];

  const createdDbUsers: Record<string, any> = {};

  for (const spec of DEV_USERS) {
    const password = generateStrongPassword(spec.key);

    let clerkId: string;
    try {
      const existingList = await clerk.users.getUserList({ emailAddress: [spec.email] });
      let clerkUser = existingList.data?.[0];

      if (clerkUser) {
        clerkId = clerkUser.id;
        try {
          await clerk.users.updateUser(clerkId, {
            password,
            skipPasswordChecks: true,
          });
        } catch {
          // If password update fails, user still exists
        }
      } else {
        const created = await clerk.users.createUser({
          emailAddress: [spec.email],
          password,
          firstName: spec.fullName.split(' ')[0],
          lastName: spec.fullName.split(' ').slice(1).join(' ') || 'Dev',
          skipPasswordChecks: true,
        });
        clerkId = created.id;
      }
    } catch (err: any) {
      // In case of local/offline mode or Clerk limitation, generate deterministic synthetic ID
      console.warn(`Clerk API warning for ${spec.email}: ${err?.message || err}. Provisioning in local DB.`);
      clerkId = `clerk_dev_${spec.key}`;
    }

    // Upsert into local database
    const [upserted] = await db
      .insert(users)
      .values({
        clerkId,
        email: spec.email.toLowerCase(),
        fullName: spec.fullName,
        role: spec.role,
        rollNumber: spec.rollNumber,
        department: spec.department,
        year: spec.year > 0 ? spec.year : null,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          clerkId,
          fullName: spec.fullName,
          role: spec.role,
          rollNumber: spec.rollNumber,
          department: spec.department,
          year: spec.year > 0 ? spec.year : null,
          updatedAt: new Date(),
        },
      })
      .returning();

    createdDbUsers[spec.key] = upserted;
    tableData.push({
      role: spec.role,
      email: spec.email,
      password,
      userId: upserted.id,
      clubRole: spec.key === 'clubowner' ? 'OWNER' : spec.key === 'clubadmin' ? 'ADMIN' : undefined,
    });
  }

  // Real club creation in same transaction as POST /clubs
  const clubSlug = 'dev-innovators-club';
  const facultyUser = createdDbUsers['faculty'];
  const clubOwnerUser = createdDbUsers['clubowner'];
  const clubAdminUser = createdDbUsers['clubadmin'];
  const organizerUser = createdDbUsers['organizer'];

  const [existingClub] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.slug, clubSlug))
    .limit(1);

  if (!existingClub) {
    await db.transaction(async (tx) => {
      const [club] = await tx
        .insert(clubs)
        .values({
          name: 'Campus Innovators Club',
          slug: clubSlug,
          description: 'Official campus software innovation and developer collective.',
          facultyCoordinatorId: facultyUser.id,
          createdBy: clubOwnerUser.id,
        })
        .returning();

      // Creator becomes club OWNER
      await tx.insert(clubMembers).values({
        clubId: club.id,
        userId: clubOwnerUser.id,
        role: ClubMemberRole.OWNER,
      });

      // Default channels
      await tx.insert(clubChannels).values([
        {
          clubId: club.id,
          kind: ChannelKind.ANNOUNCEMENTS,
          name: 'Announcements',
          slug: 'announcements',
        },
        {
          clubId: club.id,
          kind: ChannelKind.GENERAL,
          name: 'General',
          slug: 'general',
        },
        {
          clubId: club.id,
          kind: ChannelKind.EVENTS,
          name: 'Events',
          slug: 'events',
        },
      ]);

      // Add clubadmin as club ADMIN
      await tx.insert(clubMembers).values({
        clubId: club.id,
        userId: clubAdminUser.id,
        role: ClubMemberRole.ADMIN,
      });
    });
  } else {
    // If club already exists, ensure owner, channels, and clubadmin are set up
    await db.transaction(async (tx) => {
      if (!existingClub.facultyCoordinatorId) {
        await tx
          .update(clubs)
          .set({ facultyCoordinatorId: facultyUser.id })
          .where(eq(clubs.id, existingClub.id));
      }

      await tx
        .insert(clubMembers)
        .values({
          clubId: existingClub.id,
          userId: clubOwnerUser.id,
          role: ClubMemberRole.OWNER,
        })
        .onConflictDoUpdate({
          target: [clubMembers.clubId, clubMembers.userId],
          set: { role: ClubMemberRole.OWNER },
        });

      await tx
        .insert(clubMembers)
        .values({
          clubId: existingClub.id,
          userId: clubAdminUser.id,
          role: ClubMemberRole.ADMIN,
        })
        .onConflictDoUpdate({
          target: [clubMembers.clubId, clubMembers.userId],
          set: { role: ClubMemberRole.ADMIN },
        });

      await tx
        .insert(clubChannels)
        .values([
          {
            clubId: existingClub.id,
            kind: ChannelKind.ANNOUNCEMENTS,
            name: 'Announcements',
            slug: 'announcements',
          },
          {
            clubId: existingClub.id,
            kind: ChannelKind.GENERAL,
            name: 'General',
            slug: 'general',
          },
          {
            clubId: existingClub.id,
            kind: ChannelKind.EVENTS,
            name: 'Events',
            slug: 'events',
          },
        ])
        .onConflictDoNothing();
    });
  }

  // Leave organizer with no club
  await db.delete(clubMembers).where(eq(clubMembers.userId, organizerUser.id));

  // Print email/password/role table to console only
  console.log('\n=================== DEV TEST ACCOUNTS ===================');
  console.table(
    tableData.map((d) => ({
      Role: d.role,
      Email: d.email,
      Password: d.password,
      ClubRole: d.clubRole || 'none',
    }))
  );
  console.log('=========================================================\n');

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error provisioning dev accounts:', err);
  process.exit(1);
});
