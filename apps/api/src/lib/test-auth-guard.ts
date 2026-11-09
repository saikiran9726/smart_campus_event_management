import { env } from '../env';

export function isTestAuthBypassEnabled(): boolean {
  if (env.NODE_ENV === 'test') return true;
  return env.NODE_ENV === 'development' && process.env.ALLOW_TEST_AUTH_BYPASS === 'true';
}

export function assertSafeAuthConfig(): void {
  if (!isTestAuthBypassEnabled() || env.NODE_ENV === 'test') return;
  const prodLike =
    (env.CLERK_SECRET_KEY ?? '').startsWith('sk_live_') ||
    !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '');
  if (prodLike) {
    throw new Error('Refusing to start: test auth bypass enabled in a production-like environment.');
  }
}
