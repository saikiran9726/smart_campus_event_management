import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Advisory lock identifier for Eventora DB migrations
const MIGRATION_ADVISORY_LOCK_ID = 74839201;

function resolveMigrationsFolder(): string {
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(__dirname, '../../src/db/migrations'),
    path.join(process.cwd(), 'apps/api/src/db/migrations'),
    path.join(process.cwd(), 'src/db/migrations'),
    path.join(process.cwd(), 'apps/api/dist/db/migrations'),
    path.join(process.cwd(), 'dist/db/migrations'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'meta', '_journal.json'))) {
      return candidate;
    }
  }

  throw new Error(
    `Cannot find valid migrations folder with meta/_journal.json. Searched:\n${candidates.join('\n')}`
  );
}

export async function runMigrations(): Promise<void> {
  const migrationsFolder = resolveMigrationsFolder();
  console.log(`Running database migrations from ${migrationsFolder}...`);

  const client = await pool.connect();
  try {
    // Acquire PostgreSQL session-level advisory lock to ensure single-flight execution
    console.log('Acquiring PostgreSQL migration advisory lock...');
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
    console.log('Migration advisory lock acquired.');

    await migrate(db, { migrationsFolder });
    console.log('Database migrations completed successfully.');
  } catch (error) {
    console.error('Failed to run database migrations:', error);
    throw error;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
      console.log('Migration advisory lock released.');
    } catch (unlockErr) {
      console.warn('Warning: Failed to release advisory lock cleanly:', unlockErr);
    }
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
