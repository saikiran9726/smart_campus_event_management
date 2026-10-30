import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.join(__dirname, 'migrations');
  console.log(`Running database migrations from ${migrationsFolder}...`);
  try {
    await migrate(db, { migrationsFolder });
    console.log('Database migrations completed successfully.');
  } catch (error) {
    console.error('Failed to run database migrations:', error);
    throw error;
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
