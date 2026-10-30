import { z } from 'zod';

export const APP_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'FORM_FROZEN',
  'SOLD_OUT',
  'WAITLISTED',
  'COOLDOWN_ACTIVE',
  'OFFER_EXPIRED',
  'VENUE_CONFLICT',
  'AV_CONFLICT',
  'TOKEN_INVALID',
  'TOKEN_USED',
  'TURNSTILE_FAILED',
  'RATE_LIMITED',
  'PAYMENT_FAILED',
  'TEAM_FULL',
  'TEAM_MIN_NOT_MET',
  'ROSTER_LOCKED',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export const appErrorCodeSchema = z.enum(APP_ERROR_CODES);

export interface ApiErrorBody {
  error: {
    code: AppErrorCode;
    message: string;
    details?: Record<string, unknown> | unknown[] | string;
  };
}

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: appErrorCodeSchema,
    message: z.string(),
    details: z.union([
      z.record(z.string(), z.unknown()),
      z.array(z.unknown()),
      z.string(),
    ]).optional(),
  }),
});

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown> | unknown[] | string;

  constructor(
    code: AppErrorCode,
    message: string,
    statusCode = 400,
    details?: Record<string, unknown> | unknown[] | string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toResponseBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}
