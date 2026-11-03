import {
  PASSKEY_DIGITS,
  PASSKEY_PREFIX,
  QR_TOKEN_LENGTH,
  QR_TOKEN_PREFIX,
  TEAM_CODE_LENGTH,
} from './constants';

export const BASE62_ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const TEAM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const DIGITS_ALPHABET = '0123456789';

/**
 * Generates unbiased random characters from the provided alphabet
 * using cryptographic rejection sampling to prevent modulo bias.
 */
export function sampleRandomChars(alphabet: string, length: number): string {
  if (length <= 0) {
    return '';
  }

  const alphabetLen = alphabet.length;
  if (alphabetLen <= 0 || alphabetLen > 256) {
    throw new Error(
      `Alphabet length must be between 1 and 256, received: ${alphabetLen}`
    );
  }

  // Rejection sampling threshold: highest multiple of alphabetLen <= 256
  const maxAcceptable = 256 - (256 % alphabetLen);

  let result = '';
  while (result.length < length) {
    const needed = length - result.length;
    // Over-sample slightly to minimize iterations
    const batchSize = Math.max(needed * 2, 32);
    const buffer = new Uint8Array(batchSize);
    globalThis.crypto.getRandomValues(buffer);
    for (let i = 0; i < buffer.length && result.length < length; i++) {
      const byte = buffer[i];
      if (byte !== undefined && byte < maxAcceptable) {
        result += alphabet[byte % alphabetLen];
      }
    }
  }

  return result;
}

/**
 * Generates an opaque QR token.
 * Total token length is exactly 32 chars: 'ev_tok_' (7 chars) + 25 base62 chars.
 */
export function generateOpaqueToken(): string {
  const randomLength = QR_TOKEN_LENGTH - QR_TOKEN_PREFIX.length;
  if (randomLength <= 0) {
    throw new Error('Invalid QR token configuration');
  }
  const randomPart = sampleRandomChars(BASE62_ALPHABET, randomLength);
  return `${QR_TOKEN_PREFIX}${randomPart}`;
}

/**
 * Generates numeric passkey digits (default 6 digits) using rejection sampling.
 */
export function generatePasskeyDigits(length = PASSKEY_DIGITS): string {
  return sampleRandomChars(DIGITS_ALPHABET, length);
}

/**
 * Generates a full formatted passkey with prefix, e.g. "SCAN-482910".
 */
export function generateFullPasskey(length = PASSKEY_DIGITS): string {
  return `${PASSKEY_PREFIX}${generatePasskeyDigits(length)}`;
}

/**
 * Generates a team invite code (default 6 chars) excluding ambiguous characters (0, O, 1, I, L).
 */
export function generateTeamCode(length = TEAM_CODE_LENGTH): string {
  return sampleRandomChars(TEAM_CODE_ALPHABET, length);
}
