import { fileURLToPath } from 'node:url';
import { UserRole } from '@eventora/shared';
import { db, pool } from './client';
import { avResources, users, venues } from './schema';
import { env } from '../env';

export async function runBootstrap(): Promise<void> {
  console.log('Running Eventora minimal production bootstrap...');

  // 1. System Administrator Account
  const adminEmail =
    env.INITIAL_ADMIN_EMAILS?.split(',')[0]?.trim() ||
    process.env.BOOTSTRAP_ADMIN_EMAIL ||
    'admin@eventora.campus.edu';

  await db
    .insert(users)
    .values({
      clerkId: 'user_system_admin',
      email: adminEmail,
      fullName: 'System Administrator',
      role: UserRole.ADMIN,
      department: 'Campus Administration',
    })
    .onConflictDoNothing({ target: users.email });

  console.log(`[+] Initial System Admin provisioned (${adminEmail}).`);

  // 2. Venues Master Rows
  const defaultVenues = [
    {
      name: 'Main Auditorium',
      capacity: 800,
      locationText: 'Central Campus Block A, Ground Floor',
      mapUrl: 'https://maps.campus.edu/venues/main-auditorium',
    },
    {
      name: 'CS Seminar Hall',
      capacity: 250,
      locationText: 'Department of Computer Science & Engineering, 2nd Floor',
      mapUrl: 'https://maps.campus.edu/venues/cs-seminar-hall',
    },
    {
      name: 'Open Air Amphitheatre',
      capacity: 1200,
      locationText: 'Student Activity Centre Quadrangle',
      mapUrl: 'https://maps.campus.edu/venues/amphitheatre',
    },
    {
      name: 'Tech Hub Lab 3',
      capacity: 120,
      locationText: 'Innovation Complex, 3rd Floor',
      mapUrl: 'https://maps.campus.edu/venues/tech-hub-3',
    },
  ];

  for (const v of defaultVenues) {
    await db.insert(venues).values(v).onConflictDoNothing({ target: venues.name });
  }
  console.log(`[+] Master venues provisioned (${defaultVenues.length} locations).`);

  // 3. Audio/Visual Resources Master Rows
  const defaultAvResources = [
    {
      name: 'Projector (4K Laser Display)',
      kind: 'PROJECTOR',
      quantity: 8,
    },
    {
      name: 'Wireless Collar Mic Set',
      kind: 'MIC',
      quantity: 15,
    },
    {
      name: 'Handheld Stage Mic Set',
      kind: 'MIC',
      quantity: 20,
    },
    {
      name: 'Concert PA Speaker System',
      kind: 'SOUND_SYSTEM',
      quantity: 6,
    },
    {
      name: 'Streaming PTZ Camera Kit',
      kind: 'CAMERA',
      quantity: 4,
    },
  ];

  for (const av of defaultAvResources) {
    await db.insert(avResources).values(av).onConflictDoNothing({ target: avResources.name });
  }
  console.log(`[+] Master A/V equipment catalog provisioned (${defaultAvResources.length} resources).`);

  console.log('[✓] Eventora bootstrap complete.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBootstrap()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error('Bootstrap failed:', err);
      await pool.end();
      process.exit(1);
    });
}
