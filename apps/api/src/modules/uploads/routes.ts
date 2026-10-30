import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from '@eventora/shared';
import { AppError } from '../../lib/app-error';
import { buildKey, headObject, presignPut } from '../../lib/r2';
import { requireAuth } from '../../plugins/auth';

const ALLOWED_PURPOSES = [
  'POSTER',
  'RESUME',
  'DECK',
  'RECEIPT',
  'ATTACHMENT',
] as const;

type UploadPurpose = (typeof ALLOWED_PURPOSES)[number];

const EXTENDED_MIMES = [
  ...ALLOWED_UPLOAD_MIME,
  'image/webp',
] as const;

export async function uploadRoutes(server: FastifyInstance): Promise<void> {
  // 1. Presign Upload URL
  server.post(
    '/uploads/presign',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        purpose?: string;
        fileName?: string;
        mimeType?: string;
        sizeBytes?: number;
      };

      const purpose = (body.purpose || 'ATTACHMENT').toUpperCase() as UploadPurpose;
      if (!ALLOWED_PURPOSES.includes(purpose)) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Invalid upload purpose '${purpose}'. Allowed: ${ALLOWED_PURPOSES.join(', ')}`,
          400
        );
      }

      const fileName = body.fileName?.trim();
      if (!fileName) {
        throw new AppError('VALIDATION_FAILED', 'fileName is required.', 400);
      }

      // Guard against malicious executables
      const lowerFile = fileName.toLowerCase();
      if (
        lowerFile.endsWith('.exe') ||
        lowerFile.endsWith('.bat') ||
        lowerFile.endsWith('.sh') ||
        lowerFile.endsWith('.msi') ||
        lowerFile.endsWith('.com')
      ) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Executable files are strictly prohibited for uploads.',
          400
        );
      }

      const mimeType = body.mimeType?.toLowerCase().trim();
      if (!mimeType || !(EXTENDED_MIMES as readonly string[]).includes(mimeType)) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Disallowed MIME type '${mimeType}'. Allowed: ${EXTENDED_MIMES.join(', ')}`,
          400
        );
      }

      const sizeBytes = Number(body.sizeBytes);
      if (!sizeBytes || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
        throw new AppError(
          'VALIDATION_FAILED',
          `File size must be between 1 and ${MAX_UPLOAD_BYTES} bytes (10MB maximum).`,
          400
        );
      }

      const objectKey = buildKey(purpose, request.user!.id, fileName);
      const uploadUrl = await presignPut({
        key: objectKey,
        mimeType,
        sizeBytes,
      });

      const expiresAt = new Date(Date.now() + 600 * 1000).toISOString();

      return reply.status(200).send({
        uploadUrl,
        objectKey,
        expiresAt,
      });
    }
  );

  // 2. Confirm Upload
  server.post(
    '/uploads/confirm',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { objectKey?: string; expectedSizeBytes?: number };
      const objectKey = body.objectKey?.trim();

      if (!objectKey) {
        throw new AppError('VALIDATION_FAILED', 'objectKey is required.', 400);
      }

      const head = await headObject(objectKey);
      if (!head) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Uploaded object was not found in storage bucket.',
          },
        });
      }

      if (
        body.expectedSizeBytes !== undefined &&
        head.contentLength !== body.expectedSizeBytes
      ) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: `Uploaded object size (${head.contentLength}) does not match expected size (${body.expectedSizeBytes}).`,
          },
        });
      }

      return reply.status(200).send({
        confirmed: true,
        objectKey,
        sizeBytes: head.contentLength,
      });
    }
  );
}
