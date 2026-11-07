import { describe, expect, it } from 'vitest';
import {
  PASSKEY_DIGITS,
  PASSKEY_PREFIX,
  QR_TOKEN_LENGTH,
  QR_TOKEN_PREFIX,
  TEAM_CODE_LENGTH,
} from '../constants';
import {
  BASE62_ALPHABET,
  DIGITS_ALPHABET,
  generateFullPasskey,
  generateOpaqueToken,
  generatePasskeyDigits,
  generateTeamCode,
  sampleRandomChars,
  TEAM_CODE_ALPHABET,
} from '../ids';

describe('ids generation and cryptographic sampling', () => {
  it('generates opaque token with length exactly 32 and correct prefix', () => {
    const token = generateOpaqueToken();
    expect(token).toHaveLength(QR_TOKEN_LENGTH);
    expect(token.length).toBe(32);
    expect(token.startsWith(QR_TOKEN_PREFIX)).toBe(true);

    const randomSuffix = token.slice(QR_TOKEN_PREFIX.length);
    expect(randomSuffix).toHaveLength(32 - QR_TOKEN_PREFIX.length);
    for (const char of randomSuffix) {
      expect(BASE62_ALPHABET).toContain(char);
    }
  });

  it('generates 10,000 opaque tokens that are all completely unique', () => {
    const tokenSet = new Set<string>();
    const count = 10000;

    for (let i = 0; i < count; i++) {
      const token = generateOpaqueToken();
      expect(token).toHaveLength(32);
      expect(token.startsWith(QR_TOKEN_PREFIX)).toBe(true);
      tokenSet.add(token);
    }

    expect(tokenSet.size).toBe(count);
  });

  it('generates team code with valid length and valid charset (excluding ambiguous chars 0, O, 1, I, L)', () => {
    const forbiddenChars = new Set(['0', 'O', '1', 'I', 'L']);
    const codes = Array.from({ length: 500 }, () => generateTeamCode());

    for (const code of codes) {
      expect(code).toHaveLength(TEAM_CODE_LENGTH);
      expect(code.length).toBe(TEAM_CODE_LENGTH);

      for (const char of code) {
        expect(TEAM_CODE_ALPHABET).toContain(char);
        expect(forbiddenChars.has(char)).toBe(false);
      }
    }
  });

  it('generates passkey digits and full passkey correctly', () => {
    const digits = generatePasskeyDigits();
    expect(digits).toHaveLength(PASSKEY_DIGITS);
    expect(digits.length).toBe(6);
    for (const char of digits) {
      expect(DIGITS_ALPHABET).toContain(char);
    }

    const fullPasskey = generateFullPasskey();
    expect(fullPasskey.startsWith(PASSKEY_PREFIX)).toBe(true);
    expect(fullPasskey).toHaveLength(PASSKEY_PREFIX.length + PASSKEY_DIGITS);
  });

  it('sampleRandomChars handles edge cases and invalid parameters', () => {
    expect(sampleRandomChars('ABC', 0)).toBe('');
    expect(() => sampleRandomChars('', 5)).toThrow();
  });
});
