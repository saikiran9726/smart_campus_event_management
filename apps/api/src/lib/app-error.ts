import { ApiErrorBody, AppErrorCode } from '@eventora/shared';

export const ERROR_CODE_TO_HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  FORM_FROZEN: 409,
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
  TEAM_MIN_NOT_MET: 422,
  ROSTER_LOCKED: 409,
  DEADLINE_PASSED: 403,
  TEAM_FULL_WAITLISTED: 409,
  NOT_CHECKED_IN: 403,
  OVER_BUDGET: 422,
  TEAM_CAPACITY_EXCEEDED: 409,
  INVITATION_EXPIRED: 410,
  LATE_JOINING_DISALLOWED: 409,
  REPLACEMENT_DISALLOWED: 409,
  INVALID: 404,
  EXPIRED: 409,
  REVOKED: 409,
  ALREADY_MEMBER: 409,
  ALREADY_IN_OTHER_TEAM_FOR_EVENT: 409,
  REGISTRATION_CLOSED: 409,
  NOT_ELIGIBLE: 403,
  NOT_AUTHENTICATED: 401,
  SUBMISSIONS_DISABLED: 400,
  EDITING_NOT_ALLOWED: 403,
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
