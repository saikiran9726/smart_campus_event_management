import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  console.log('[E2E Global Setup] Running database migrations and seeding demo dataset...');
  const dbUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:sai09072006@localhost:5432/eventora_venue_test?sslmode=disable';
  console.log(`[E2E Global Setup] Using database: ${dbUrl.replace(/:[^:@]+@/, ':***@')}`);
  try {
    execSync('pnpm --filter api db:migrate', {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: dbUrl },
    });
    if (!process.env.SKIP_SEED) {
      execSync('pnpm --filter api db:seed', {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: dbUrl },
      });
    }
    console.log('[E2E Global Setup] Migrations and seed completed successfully.');
  } catch (err) {
    console.error('[E2E Global Setup] Error in DB setup:', err);
    throw err;
  }
}
