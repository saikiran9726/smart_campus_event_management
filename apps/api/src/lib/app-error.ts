import { ApiErrorBody, AppErrorCode } from '@eventora/shared';

export const ERROR_CODE_TO_HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  FORM_FROZEN: 400,
  SOLD_OUT: 409,
  WAITLISTED: 409,
  COOLDOWN_ACTIVE: 403,
  OFFER_EXPIRED: 410,
  VENUE_CONFLICT: 409,
  AV_CONFLICT: 409,
  TOKEN_INVALID: 400,
  TOKEN_USED: 409,
  TURNSTILE_FAILED: 403,
  RATE_LIMITED: 429,
  PAYMENT_FAILED: 402,
  TEAM_FULL: 409,
  TEAM_MIN_NOT_MET: 400,
  ROSTER_LOCKED: 409,
};

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown> | unknown[] | string;

  constructor(
    code: AppErrorCode,
    message: string,
    httpStatus?: number,
    details?: Record<string, unknown> | unknown[] | string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = httpStatus ?? ERROR_CODE_TO_HTTP_STATUS[code] ?? 400;
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
