import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  console.log('[E2E Global Setup] Running database migrations and seeding demo dataset...');
  try {
    execSync('pnpm --filter api db:migrate', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
    execSync('pnpm --filter api db:seed', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
    console.log('[E2E Global Setup] Migrations and seed completed successfully.');
  } catch (err) {
    console.error('[E2E Global Setup] Error in DB setup:', err);
    throw err;
  }
}
