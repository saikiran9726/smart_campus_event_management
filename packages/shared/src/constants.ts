import { UserRole } from './enums';

export const WAITLIST_OFFER_MINUTES = 20;

export const QR_TOKEN_PREFIX = 'ev_tok_';
export const QR_TOKEN_LENGTH = 32;

export const PASSKEY_PREFIX = 'SCAN-';
export const PASSKEY_DIGITS = 6;

export const TEAM_CODE_LENGTH = 8;
export const TEAM_INVITE_TOKEN_PREFIX = 'ev_inv_';
export const TEAM_INVITE_TOKEN_LENGTH = 32;

export const STRIKE_THRESHOLD = 2;
export const STRIKE_COOLDOWN_DAYS = 30;

export const MAGIC_LINK_TTL_HOURS = 72;

export const MAX_UPLOAD_BYTES = 10485760; // 10 MB in bytes

export const ALLOWED_UPLOAD_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME)[number];

export const ROLE_BADGE_COLORS: Record<
  UserRole,
  { bg: string; text: string; border: string }
> = {
  [UserRole.STUDENT]: {
    bg: '#EEF2FF',
    text: '#4338CA',
    border: '#C7D2FE',
  },
  [UserRole.ORGANIZER]: {
    bg: '#ECFDF5',
    text: '#059669',
    border: '#A7F3D0',
  },
  [UserRole.FACULTY]: {
    bg: '#FFFBEB',
    text: '#B45309',
    border: '#FDE68A',
  },
  [UserRole.ADMIN]: {
    bg: '#FFF1F2',
    text: '#E11D48',
    border: '#FECDD3',
  },
};

export const DESIGN_TOKENS = {
  colors: {
    indigo: '#4338CA',
    violet: '#6366F1',
    emerald: '#059669',
    rose: '#E11D48',
    amber: '#D97706',
    slate: '#0F172A',
    lightCanvas: '#f8fafc',
    lightSurface: '#ffffff',
    darkCanvas: '#0b0f19',
    darkSurface: '#131b2e',
  },
} as const;
