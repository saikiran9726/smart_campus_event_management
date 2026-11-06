/**
 * Phone number normalization and validation for Eventora communications.
 * Primary focus: Indian mobile numbers (+91) with robust E.164 normalization for Meta WhatsApp Cloud API.
 */

export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string; // E.164 digits without leading '+', required by Meta WhatsApp Graph API (e.g. 919876543210)
  e164?: string;       // Standard E.164 format with leading '+' (e.g. +919876543210)
  error?: string;
}

/**
 * Normalizes Indian and international phone numbers.
 * Validates 10-digit Indian mobile numbers (starts with 6, 7, 8, or 9),
 * and handles +91, 91, 0, whitespace, hyphens, and parentheses.
 */
export function normalizeIndianPhoneNumber(input: string | null | undefined): PhoneValidationResult {
  if (!input || typeof input !== 'string' || !input.trim()) {
    return { valid: false, error: 'Phone number is missing or empty' };
  }

  // Strip whitespace, hyphens, dots, parentheses
  const cleaned = input.trim().replace(/[\s\-.()]/g, '');
  const digitsOnly = cleaned.replace(/^\+/, '');

  // Case 1: 10-digit standard Indian mobile (starts with 6, 7, 8, 9)
  if (/^[6-9]\d{9}$/.test(digitsOnly)) {
    return {
      valid: true,
      normalized: `91${digitsOnly}`,
      e164: `+91${digitsOnly}`,
    };
  }

  // Case 2: 11-digit leading with 0 (e.g. 09876543210)
  if (/^0[6-9]\d{9}$/.test(digitsOnly)) {
    const raw10 = digitsOnly.slice(1);
    return {
      valid: true,
      normalized: `91${raw10}`,
      e164: `+91${raw10}`,
    };
  }

  // Case 3: 12-digit with 91 country code (e.g. 919876543210 or +919876543210)
  if (/^91[6-9]\d{9}$/.test(digitsOnly)) {
    return {
      valid: true,
      normalized: digitsOnly,
      e164: `+${digitsOnly}`,
    };
  }

  // If exactly 10 digits but didn't start with 6-9, it is an invalid Indian mobile number
  if (/^\d{10}$/.test(digitsOnly)) {
    return {
      valid: false,
      error: `Invalid 10-digit mobile number: '${input}'. Must begin with 6, 7, 8, or 9.`,
    };
  }

  // Case 4: General valid international E.164 numbers (11 to 15 digits, or explicitly prefixed with +)
  if (cleaned.startsWith('+') && /^\d{10,15}$/.test(digitsOnly)) {
    return {
      valid: true,
      normalized: digitsOnly,
      e164: `+${digitsOnly}`,
    };
  }

  if (/^\d{11,15}$/.test(digitsOnly)) {
    return {
      valid: true,
      normalized: digitsOnly,
      e164: `+${digitsOnly}`,
    };
  }

  return {
    valid: false,
    error: `Invalid mobile number: '${input}'. Please provide a valid 10-digit Indian mobile number.`,
  };
}
