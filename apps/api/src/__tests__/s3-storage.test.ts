import { describe, expect, it } from 'vitest';
import { env, getProductionEnvErrors } from '../env';
import {
  createStorageClient,
  presignGet,
  presignPut,
  publicUrl,
} from '../lib/r2';

describe('Configurable S3 / Supabase Storage & Presigning (Prompt 22)', () => {
  describe('1. Endpoint Selection With & Without S3_ENDPOINT', () => {
    it('creates an S3 client with custom endpoint, region, and forcePathStyle when S3_ENDPOINT is set', async () => {
      const customClient = createStorageClient({
        endpoint: 'https://myproject.supabase.co/storage/v1/s3',
        region: 'ap-south-1',
        accessKeyId: 'custom-key',
        secretAccessKey: 'custom-secret',
      });

      const endpoint = await customClient.config.endpoint!();
      expect(endpoint.hostname).toBe('myproject.supabase.co');
      expect(endpoint.path).toBe('/storage/v1/s3');
      expect(customClient.config.forcePathStyle).toBe(true);

      const region = await customClient.config.region!();
      expect(region).toBe('ap-south-1');
    });

    it('creates an R2 client using R2_ACCOUNT_ID without forcePathStyle when S3_ENDPOINT is not set', async () => {
      const r2Client = createStorageClient({
        endpoint: undefined,
        accountId: 'test-account-id',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      });

      const endpoint = await r2Client.config.endpoint!();
      expect(endpoint.hostname).toBe('test-account-id.r2.cloudflarestorage.com');
      expect(r2Client.config.forcePathStyle).toBe(false);

      const region = await r2Client.config.region!();
      expect(region).toBe('auto');
    });
  });

  describe('2. Presigned URLs with Custom S3 Endpoint (Supabase Path Style)', () => {
    it('generates a presigned PUT URL containing the custom host and the bucket in the path', async () => {
      const customEndpoint = 'https://supabase-storage.campus.edu/storage/v1/s3';
      const customClient = createStorageClient({
        endpoint: customEndpoint,
        region: 'auto',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      });

      const uploadKey = 'resumes/2026/10/test-resume.pdf';
      const presignedUrl = await presignPut(
        {
          key: uploadKey,
          mimeType: 'application/pdf',
          sizeBytes: 1048576,
          expiresInSeconds: 600,
        },
        customClient
      );

      expect(presignedUrl).toBeDefined();
      const parsed = new URL(presignedUrl);

      // Must contain custom host
      expect(parsed.hostname).toBe('supabase-storage.campus.edu');

      // forcePathStyle ensures the bucket is in the path
      expect(parsed.pathname).toContain(`/storage/v1/s3/${env.R2_BUCKET}/${uploadKey}`);

      // Must contain AWS SigV4 query authentication params
      expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
      expect(parsed.searchParams.get('X-Amz-Signature')).toBeDefined();
    });

    it('generates a presigned GET URL containing the custom host and the bucket in the path', async () => {
      const customEndpoint = 'https://supabase-storage.campus.edu/storage/v1/s3';
      const customClient = createStorageClient({
        endpoint: customEndpoint,
        region: 'auto',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      });

      const downloadKey = 'certificates/cert-12345.pdf';
      const presignedUrl = await presignGet(downloadKey, 3600, customClient);

      expect(presignedUrl).toBeDefined();
      const parsed = new URL(presignedUrl);

      expect(parsed.hostname).toBe('supabase-storage.campus.edu');
      expect(parsed.pathname).toContain(`/storage/v1/s3/${env.R2_BUCKET}/${downloadKey}`);
      expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    });

    it('preserves publicUrl mapping to R2_PUBLIC_BASE_URL', () => {
      const key = 'posters/2026/10/hackathon.png';
      const url = publicUrl(key);
      expect(url).toBe(`${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`);
    });
  });

  describe('3. Production Environment Checks with S3_ENDPOINT', () => {
    it('passes production env check with S3_ENDPOINT set and no R2_ACCOUNT_ID', () => {
      const validProdEnvWithSupabase = {
        PAYMENT_MODE: 'sandbox',
        TURNSTILE_SECRET_KEY: 'valid_prod_turnstile_secret_key',
        CLERK_SECRET_KEY: 'sk_live_valid_clerk_secret',
        MAGIC_LINK_SECRET: 'a'.repeat(32),
        OD_SEAL_SECRET: 'b'.repeat(32),
        DATABASE_URL: 'postgres://postgres:password@localhost:5432/eventora_prod',
        PUBLIC_WEB_URL: 'https://campus.example.com',
        WHATSAPP_PROVIDER: 'console',
        S3_ENDPOINT: 'https://xyzcompany.supabase.co/storage/v1/s3',
        // R2_ACCOUNT_ID is omitted!
      };

      const errors = getProductionEnvErrors(validProdEnvWithSupabase);
      expect(errors).toHaveLength(0);
    });

    it('fails production env check when both S3_ENDPOINT and R2_ACCOUNT_ID are omitted', () => {
      const prodEnvMissingStorage = {
        PAYMENT_MODE: 'sandbox',
        TURNSTILE_SECRET_KEY: 'valid_prod_turnstile_secret_key',
        CLERK_SECRET_KEY: 'sk_live_valid_clerk_secret',
        MAGIC_LINK_SECRET: 'a'.repeat(32),
        OD_SEAL_SECRET: 'b'.repeat(32),
        DATABASE_URL: 'postgres://postgres:password@localhost:5432/eventora_prod',
        PUBLIC_WEB_URL: 'https://campus.example.com',
        WHATSAPP_PROVIDER: 'console',
        // neither S3_ENDPOINT nor R2_ACCOUNT_ID provided
      };

      const errors = getProductionEnvErrors(prodEnvMissingStorage);
      expect(errors).toContain('R2_ACCOUNT_ID is required when S3_ENDPOINT is not set');
    });

    it('passes production env check when R2_ACCOUNT_ID is set and S3_ENDPOINT is omitted', () => {
      const prodEnvWithR2 = {
        PAYMENT_MODE: 'sandbox',
        TURNSTILE_SECRET_KEY: 'valid_prod_turnstile_secret_key',
        CLERK_SECRET_KEY: 'sk_live_valid_clerk_secret',
        MAGIC_LINK_SECRET: 'a'.repeat(32),
        OD_SEAL_SECRET: 'b'.repeat(32),
        DATABASE_URL: 'postgres://postgres:password@localhost:5432/eventora_prod',
        PUBLIC_WEB_URL: 'https://campus.example.com',
        WHATSAPP_PROVIDER: 'console',
        R2_ACCOUNT_ID: 'valid_r2_account_id',
      };

      const errors = getProductionEnvErrors(prodEnvWithR2);
      expect(errors).toHaveLength(0);
    });
  });
  describe('4. Credential Self-Healing & Inversion Handling', () => {
    it('automatically detects and inverts swapped 64-char secret and 32-char access key', async () => {
      const swappedClient = createStorageClient({
        endpoint: 'https://myproject.supabase.co/storage/v1/s3',
        region: 'ap-south-1',
        accessKeyId: '8516bb2fd1cc2f87b9d091d799905bbbf739b5c41fc7ac588321675adbb18217', // 64 hex
        secretAccessKey: '005a8130d02bfcb545c2d9d00bb09df2', // 32 hex
      });

      const creds = await swappedClient.config.credentials();
      expect(creds.accessKeyId).toBe('005a8130d02bfcb545c2d9d00bb09df2');
      expect(creds.secretAccessKey).toBe('8516bb2fd1cc2f87b9d091d799905bbbf739b5c41fc7ac588321675adbb18217');
    });
  });
});