import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClubMemberRole, EventStatus, UserRole } from '@eventora/shared';
import { db } from '../db/client';
import { clubMembers, clubs, events, users } from '../db/schema';
import { env, getProductionEnvErrors } from '../env';
import {
  createStorageClient,
  presignGet,
  presignPut,
  publicUrl,
} from '../lib/r2';
import { buildServer } from '../server';

describe('Configurable S3 / Supabase Storage & Presigning (Prompt 22 & Production Storage Repair)', () => {
  const server = buildServer();
  let organizerUser: any;
  let testClub: any;

  beforeAll(async () => {
    await server.ready();

    const ts = Date.now();
    const [org] = await db
      .insert(users)
      .values({
        clerkId: `clerk_storage_org_${ts}`,
        email: `storage_org_${ts}@campus.edu`,
        fullName: 'Storage Organizer',
        role: UserRole.ORGANIZER,
      })
      .returning();
    organizerUser = org;

    const [club] = await db
      .insert(clubs)
      .values({
        name: `Storage Test Club ${ts}`,
        slug: `storage-club-${ts}`,
        description: 'Storage test club description',
        createdBy: organizerUser.id,
      })
      .returning();
    testClub = club;

    await db.insert(clubMembers).values({
      clubId: testClub.id,
      userId: organizerUser.id,
      role: ClubMemberRole.ADMIN,
    });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('1. Endpoint Selection With & Without S3_ENDPOINT', () => {
    it('creates an S3 client with custom endpoint, region, and forcePathStyle when S3_ENDPOINT is set', async () => {
      const customClient = createStorageClient({
        endpoint: 'https://myproject.supabase.co/storage/v1/s3',
        region: 'ap-south-1',
        accessKeyId: '005a8130d02bfcb545c2d9d00bb09df2',
        secretAccessKey: '17aa5aa428e4c0ff1a3ce95694d04148210b17f73c30ddd8cdd310cc490ee358',
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
    it('generates a presigned PUT URL containing the custom host and bucket without signing ContentLength', async () => {
      const customEndpoint = 'https://supabase-storage.campus.edu/storage/v1/s3';
      const customClient = createStorageClient({
        endpoint: customEndpoint,
        region: 'ap-south-1',
        accessKeyId: '005a8130d02bfcb545c2d9d00bb09df2',
        secretAccessKey: '17aa5aa428e4c0ff1a3ce95694d04148210b17f73c30ddd8cdd310cc490ee358',
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

      // Signed headers must only be 'host', NOT 'content-length' (protects against browser chunking & HTTP/2 mismatch)
      expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    });

    it('generates a presigned GET URL containing the custom host and bucket in path', async () => {
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

  describe('3. Production Environment Checks & Credential Safety', () => {
    it('passes production env check with S3_ENDPOINT set and valid 32-char access key', () => {
      const validProdEnvWithSupabase = {
        PAYMENT_MODE: 'sandbox',
        TURNSTILE_SECRET_KEY: 'valid_prod_turnstile_secret_key',
        CLERK_SECRET_KEY: 'sk_live_valid_clerk_secret',
        MAGIC_LINK_SECRET: 'a'.repeat(32),
        OD_SEAL_SECRET: 'b'.repeat(32),
        DATABASE_URL: 'postgres://postgres:password@localhost:5432/eventora_prod',
        PUBLIC_WEB_URL: 'https://campus.example.com',
        WHATSAPP_PROVIDER: 'console',
        S3_ENDPOINT: 'https://xsmbjjnhzrbvzhirdbwr.storage.supabase.co/storage/v1/s3',
        R2_ACCESS_KEY_ID: '005a8130d02bfcb545c2d9d00bb09df2',
        R2_SECRET_ACCESS_KEY: '17aa5aa428e4c0ff1a3ce95694d04148210b17f73c30ddd8cdd310cc490ee358',
      };

      const errors = getProductionEnvErrors(validProdEnvWithSupabase);
      expect(errors).toHaveLength(0);
    });

    it('fails production env check when 64-char secret key is erroneously assigned to R2_ACCESS_KEY_ID', () => {
      const prodEnvWithSwappedKey = {
        PAYMENT_MODE: 'sandbox',
        TURNSTILE_SECRET_KEY: 'valid_prod_turnstile_secret_key',
        CLERK_SECRET_KEY: 'sk_live_valid_clerk_secret',
        MAGIC_LINK_SECRET: 'a'.repeat(32),
        OD_SEAL_SECRET: 'b'.repeat(32),
        DATABASE_URL: 'postgres://postgres:password@localhost:5432/eventora_prod',
        PUBLIC_WEB_URL: 'https://campus.example.com',
        WHATSAPP_PROVIDER: 'console',
        S3_ENDPOINT: 'https://xsmbjjnhzrbvzhirdbwr.storage.supabase.co/storage/v1/s3',
        R2_ACCESS_KEY_ID: '8516bb2fd1cc2f87b9d091d799905bbbf739b5c41fc7ac588321675adbb18217', // 64 hex characters
        R2_SECRET_ACCESS_KEY: '005a8130d02bfcb545c2d9d00bb09df2',
      };

      const errors = getProductionEnvErrors(prodEnvWithSwappedKey);
      expect(errors).toContain(
        'R2_ACCESS_KEY_ID is 64 characters long, which is a Secret Access Key. Supabase S3 Access Key ID must be 32 characters'
      );
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
      };

      const errors = getProductionEnvErrors(prodEnvMissingStorage);
      expect(errors).toContain('R2_ACCOUNT_ID is required when S3_ENDPOINT is not set');
    });
  });

  describe('4. Uploads Presign & Confirm API Integration & Error Handling', () => {
    it('rejects unauthenticated callers with 401', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/uploads/presign',
        payload: {
          purpose: 'POSTER',
          fileName: 'poster.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects invalid upload purpose with 400', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/uploads/presign',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          purpose: 'MALICIOUS_PURPOSE',
          fileName: 'file.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.message).toContain('Invalid upload purpose');
    });

    it('rejects executable file extensions with 400', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/uploads/presign',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          purpose: 'POSTER',
          fileName: 'malware.exe',
          mimeType: 'image/png',
          sizeBytes: 1024,
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.message).toContain('Executable files are strictly prohibited');
    });

    it('rejects file sizes exceeding MAX_UPLOAD_BYTES (10MB) with 400', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/uploads/presign',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          purpose: 'POSTER',
          fileName: 'huge-poster.png',
          mimeType: 'image/png',
          sizeBytes: 15 * 1024 * 1024, // 15MB
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.message).toContain('File size must be between 1 and 10485760 bytes');
    });

    it('generates a valid presigned PUT URL and returns objectKey and key alias for poster uploads', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/uploads/presign',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          purpose: 'POSTER',
          fileName: 'event-poster.png',
          mimeType: 'image/png',
          sizeBytes: 2048,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.uploadUrl).toBeDefined();
      expect(json.objectKey).toBeDefined();
      expect(json.key).toBe(json.objectKey); // Alias guarantee
      expect(json.objectKey).toMatch(/^poster\/\d{4}\/\d{2}\/[a-f0-9-]+-event-poster\.png$/);

      const parsedUrl = new URL(json.uploadUrl);
      expect(parsedUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
      expect(parsedUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    });

    it('confirms upload using either objectKey or key alias', async () => {
      const res1 = await server.inject({
        method: 'POST',
        url: '/uploads/confirm',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: { objectKey: 'test-uploaded-file.pdf' },
      });
      expect(res1.statusCode).toBe(200);
      expect(JSON.parse(res1.body).confirmed).toBe(true);

      const res2 = await server.inject({
        method: 'POST',
        url: '/uploads/confirm',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: { key: 'test-uploaded-file.pdf' },
      });
      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).confirmed).toBe(true);
    });
  });

  describe('5. Event Creation and Poster Persistence', () => {
    it('persists posterKey during event creation and resolves posterUrl on GET', async () => {
      const posterKey = 'poster/2026/11/abc-123-poster.png';

      const createRes = await server.inject({
        method: 'POST',
        url: '/events',
        headers: { 'x-test-user-id': organizerUser.id },
        payload: {
          clubId: testClub.id,
          title: 'Campus Hackathon 2026',
          description: 'Annual campus hackathon with poster attached.',
          category: 'Tech',
          capacity: 100,
          posterKey,
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 172800000).toISOString(),
        },
      });

      expect(createRes.statusCode).toBe(201);
      const createdEvent = JSON.parse(createRes.body).event;
      expect(createdEvent.posterKey).toBe(posterKey);

      // Verify GET returns posterUrl
      const getRes = await server.inject({
        method: 'GET',
        url: `/events/${createdEvent.id}`,
      });

      expect(getRes.statusCode).toBe(200);
      const fetchedEvent = JSON.parse(getRes.body).event;
      expect(fetchedEvent.posterKey).toBe(posterKey);
      expect(fetchedEvent.posterUrl).toBe(publicUrl(posterKey));
    });
  });
});
