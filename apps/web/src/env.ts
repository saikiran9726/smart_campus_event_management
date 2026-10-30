import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.string().default('http://localhost:3001'),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().default('pk_test_eventora_dummy_publishable_key'),
  VITE_TURNSTILE_SITE_KEY: z.string().default('1x00000000000000000000AA'),
  MODE: z.string().default('development'),
  DEV: z.boolean().default(true),
  PROD: z.boolean().default(false),
});

export const env = envSchema.parse({
  VITE_API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  VITE_CLERK_PUBLISHABLE_KEY:
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    'pk_test_eventora_dummy_publishable_key',
  VITE_TURNSTILE_SITE_KEY:
    import.meta.env.VITE_TURNSTILE_SITE_KEY ||
    '1x00000000000000000000AA',
  MODE: import.meta.env.MODE,
  DEV: import.meta.env.DEV,
  PROD: import.meta.env.PROD,
});
