import { env } from '@/env';
import { toast } from '@/components/ui/use-toast';
import type { ApiErrorBody, AppErrorCode } from '@eventora/shared';

export class ApiError extends Error {
  public readonly code: AppErrorCode | string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: AppErrorCode | string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}

export const ERROR_MESSAGES: Record<string, { title: string; defaultMessage: string }> = {
  UNAUTHENTICATED: {
    title: 'Authentication Required',
    defaultMessage: 'Please sign in to proceed.',
  },
  FORBIDDEN: {
    title: 'Access Restricted',
    defaultMessage: 'You do not have sufficient permissions.',
  },
  NOT_FOUND: {
    title: 'Not Found',
    defaultMessage: 'The requested resource could not be found.',
  },
  FORM_FROZEN: {
    title: 'Form Locked',
    defaultMessage: 'This form has registered attendees and questions are locked.',
  },
  SOLD_OUT: {
    title: 'Event Sold Out',
    defaultMessage: 'Capacity reached. You may join the waitlist if enabled.',
  },
  WAITLISTED: {
    title: 'Added to Waitlist',
    defaultMessage: 'You will receive an alert if a seat opens up.',
  },
  COOLDOWN_ACTIVE: {
    title: 'Cooldown Active',
    defaultMessage: 'Your account is currently in a cooldown period.',
  },
  OFFER_EXPIRED: {
    title: 'Offer Expired',
    defaultMessage: 'The waitlist claim window has lapsed.',
  },
  VENUE_CONFLICT: {
    title: 'Venue Conflict',
    defaultMessage: 'The selected venue is already booked for this timeframe.',
  },
  AV_CONFLICT: {
    title: 'A/V Conflict',
    defaultMessage: 'Requested equipment is allocated elsewhere.',
  },
  TOKEN_INVALID: {
    title: 'Invalid Ticket',
    defaultMessage: 'Ticket token is invalid or unrecognised.',
  },
  TOKEN_USED: {
    title: 'Already Scanned',
    defaultMessage: 'This pass has already been checked in.',
  },
  TURNSTILE_FAILED: {
    title: 'Verification Failed',
    defaultMessage: 'Cloudflare Turnstile challenge was unsuccessful.',
  },
  RATE_LIMITED: {
    title: 'Rate Limit Exceeded',
    defaultMessage: 'Please slow down and try again shortly.',
  },
  PAYMENT_FAILED: {
    title: 'Payment Incomplete',
    defaultMessage: 'Payment processing could not be completed.',
  },
  TEAM_FULL: {
    title: 'Team is Full',
    defaultMessage: 'This team has already reached its member cap.',
  },
  TEAM_MIN_NOT_MET: {
    title: 'Minimum Team Size Not Met',
    defaultMessage: 'More teammates are required before submitting.',
  },
  ROSTER_LOCKED: {
    title: 'Roster Locked',
    defaultMessage: 'Team changes are no longer allowed for this competition.',
  },
  DEADLINE_PASSED: {
    title: 'Deadline Passed',
    defaultMessage: 'Submission window is closed.',
  },
  NOT_CHECKED_IN: {
    title: 'Attendance Required',
    defaultMessage: 'Official OD letters require an active check-in scan.',
  },
};

export interface FetchOptions extends RequestInit {
  showToast?: boolean;
  token?: string | null;
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { showToast = true, token: explicitToken, headers: customHeaders, ...fetchInit } = options;

  let token = explicitToken;
  if (!token && tokenGetter) {
    try {
      token = await tokenGetter();
    } catch {
      token = null;
    }
  }

  // Support Clerk session object on window if available
  if (!token && typeof window !== 'undefined') {
    const win = window as unknown as { Clerk?: { session?: { getToken: () => Promise<string> } } };
    if (win.Clerk?.session?.getToken) {
      try {
        token = await win.Clerk.session.getToken();
      } catch {
        // ignore
      }
    }

    if (!token) {
      const scannerToken = sessionStorage.getItem('eventora_scanner_token');
      if (scannerToken) {
        token = scannerToken;
      }
    }
  }

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${env.VITE_API_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = new Headers(customHeaders);
  const testUserId =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('eventora_test_user_id') || localStorage.getItem('eventora_test_user_id')
      : null;
  if (testUserId) {
    headers.set('x-test-user-id', testUserId);
  }
  if (!headers.has('Content-Type') && !(fetchInit.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchInit,
      headers,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network error';
    if (showToast) {
      toast({
        variant: 'destructive',
        title: 'Connection Error',
        description: `Cannot reach API at ${env.VITE_API_URL}. Is the server running?`,
      });
    }
    throw new ApiError('NETWORK_ERROR', errorMsg, 0);
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody | null = null;
    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      // not JSON
    }

    const code = errorBody?.error?.code || `HTTP_${response.status}`;
    const message = errorBody?.error?.message || response.statusText || 'An unexpected error occurred';
    const details = errorBody?.error?.details;

    if (showToast) {
      const mapped = ERROR_MESSAGES[code];
      toast({
        variant: 'destructive',
        title: mapped?.title || 'Action Failed',
        description: message || mapped?.defaultMessage,
      });
    }

    throw new ApiError(code, message, response.status, details);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export const api = {
  get: <T = unknown>(endpoint: string, options?: FetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: FetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: <T = unknown>(endpoint: string, options?: FetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),
};
