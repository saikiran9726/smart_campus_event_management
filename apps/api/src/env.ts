import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: '../../.env' });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Clerk Authentication & Svix Webhooks
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_WEBHOOK_SECRET: z.string().min(1, 'CLERK_WEBHOOK_SECRET is required'),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().default('placeholder_r2_account_id'),
  R2_ACCESS_KEY_ID: z.string().default('placeholder_r2_access_key_id'),
  R2_SECRET_ACCESS_KEY: z.string().default('placeholder_r2_secret_access_key'),
  R2_BUCKET: z.string().default('eventora-assets'),
  R2_PUBLIC_BASE_URL: z.string().default('https://assets.eventora.campus.edu'),

  // Cloudflare Turnstile
  TURNSTILE_SECRET_KEY: z.string().default('0x4AAAAAAplaceholder_secret_key'),
  TURNSTILE_SITE_KEY: z.string().default('0x4AAAAAAplaceholder_site_key'),

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

  // URLs
  PUBLIC_WEB_URL: z.string().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),

  // Sandbox Mode
  PAYMENT_MODE: z.literal('sandbox').default('sandbox'),

  // Optional Admin Domain Allowlist
  ADMIN_EMAIL_DOMAIN_ALLOWLIST: z.string().optional(),
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
