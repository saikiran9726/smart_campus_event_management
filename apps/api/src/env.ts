import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: '../../.env' });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .default(false),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // Clerk Authentication & Svix Webhooks
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_WEBHOOK_SECRET: z.string().min(1, 'CLERK_WEBHOOK_SECRET is required'),

  // Storage: Cloudflare R2 or S3-Compatible (e.g. Supabase Storage)
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().default('placeholder_r2_access_key_id'),
  R2_SECRET_ACCESS_KEY: z.string().default('placeholder_r2_secret_access_key'),
  R2_BUCKET: z.string().default('eventora-assets'),
  R2_PUBLIC_BASE_URL: z.string().default('https://assets.eventora.campus.edu'),

  // Cloudflare Turnstile
  TURNSTILE_SECRET_KEY: z.string().default('1x0000000000000000000000000000000AA'),
  TURNSTILE_SITE_KEY: z.string().default('1x00000000000000000000AA'),

  // Resend Email
  EMAIL_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().default('re_placeholder_resend_api_key'),
  MAIL_FROM: z.string().default('Eventora <events@eventora.campus.edu>'),

  // WhatsApp
  WHATSAPP_PROVIDER: z.enum(['meta', 'baileys', 'console']).default('console'),
  META_WA_TOKEN: z.string().optional(),
  META_WA_PHONE_ID: z.string().optional(),

  // Secrets
  MAGIC_LINK_SECRET: z.string().default('placeholder_magic_link_secret_at_least_32_chars_long'),
  OD_SEAL_SECRET: z.string().default('placeholder_od_seal_secret_at_least_32_chars_long'),
  OD_SEAL_SECRET_PREVIOUS: z.string().optional().default(''),

  // URLs
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),

  // Sandbox Mode
  PAYMENT_MODE: z.literal('sandbox').default('sandbox'),

  // Initial Admin Emails
  INITIAL_ADMIN_EMAILS: z.string().optional().default(''),

  // Optional Admin Domain Allowlist
  ADMIN_EMAIL_DOMAIN_ALLOWLIST: z.string().optional(),

  // Versioning and Seed Guards
  GIT_SHA: z.string().default('dev'),
  ALLOW_DEMO_SEED: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .default(false),
  ALLOW_HTTP_WEB_URL: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .default(false),
}).superRefine((data, ctx) => {
  if (!data.S3_ENDPOINT && (!data.R2_ACCOUNT_ID || data.R2_ACCOUNT_ID.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'R2_ACCOUNT_ID is required when S3_ENDPOINT is not set',
      path: ['R2_ACCOUNT_ID'],
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formattedErrors = parsed.error.issues
    .map((issue) => `  - [${issue.path.join('.')}] ${issue.message}`)
    .join('\n');

  console.error(`\n❌ Missing or invalid environment variables:\n${formattedErrors}\n`);
  throw new Error(`Environment validation failed:\n${formattedErrors}`);
}

export const env = parsed.data;
export type Env = typeof env;

/**
 * Returns a list of invariant validation failures if running in production mode.
 */
export function getProductionEnvErrors(e: Record<string, any>): string[] {
  const errors: string[] = [];
  if (e.PAYMENT_MODE !== 'sandbox') {
    errors.push('PAYMENT_MODE must be "sandbox" (live real-money payments strictly prohibited)');
  }
  const turnstileSecret = String(e.TURNSTILE_SECRET_KEY || '');
  if (
    turnstileSecret.startsWith('1x0000') ||
    turnstileSecret.startsWith('2x0000') ||
    turnstileSecret.startsWith('3x0000')
  ) {
    errors.push('TURNSTILE_SECRET_KEY cannot use Cloudflare dummy keys (1x0000, 2x0000, 3x0000) in production');
  }
  const clerkSecret = String(e.CLERK_SECRET_KEY || '');
  if (!clerkSecret.startsWith('sk_')) {
    errors.push('CLERK_SECRET_KEY must start with "sk_"');
  }
  if (!e.MAGIC_LINK_SECRET || String(e.MAGIC_LINK_SECRET).length < 32) {
    errors.push('MAGIC_LINK_SECRET must be at least 32 characters long');
  }
  if (!e.OD_SEAL_SECRET || String(e.OD_SEAL_SECRET).length < 32) {
    errors.push('OD_SEAL_SECRET must be at least 32 characters long');
  }
  if (!e.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }
  if (!e.PUBLIC_WEB_URL) {
    errors.push('PUBLIC_WEB_URL is required');
  } else if (!String(e.PUBLIC_WEB_URL).startsWith('https://') && e.ALLOW_HTTP_WEB_URL !== true && e.ALLOW_HTTP_WEB_URL !== 'true') {
    errors.push('PUBLIC_WEB_URL must use https:// in production');
  }
  if (e.WHATSAPP_PROVIDER === 'baileys') {
    errors.push('WHATSAPP_PROVIDER cannot be "baileys" in production');
  }
  if (!e.S3_ENDPOINT && (!e.R2_ACCOUNT_ID || String(e.R2_ACCOUNT_ID).trim() === '')) {
    errors.push('R2_ACCOUNT_ID is required when S3_ENDPOINT is not set');
  }
  return errors;
}

// In production runtime, refuse to start if invariants fail
if (env.NODE_ENV === 'production') {
  const prodErrors = getProductionEnvErrors(env);
  if (prodErrors.length > 0) {
    console.error('\n❌ Production startup invariant checks failed:');
    for (const err of prodErrors) {
      console.error(`  - ${err}`);
    }
    console.error('\nRefusing to start Eventora API in production mode.\n');
    process.exit(1);
  }
}
