import { describe, expect, it } from 'vitest';
import { QuestionType } from '../enums';
import { FormQuestionDef } from '../forms/types';
import {
  buildAnswerValidator,
  buildQuestionValidator,
  compileSafeRegex,
  MAX_REGEX_PATTERN_LENGTH,
} from '../forms/validate';

describe('Form Validation Engine', () => {
  describe('regex safety guards', () => {
    it('rejects a 500-character regex pattern', () => {
      const longPattern = 'a'.repeat(500);
      expect(longPattern.length).toBe(500);

      expect(() => compileSafeRegex(longPattern)).toThrow(
        /exceeds maximum allowed length/
      );

      const question: FormQuestionDef = {
        id: 'q_regex_overflow',
        type: QuestionType.SHORT_TEXT,
        label: 'Enter code',
        required: true,
        orderIndex: 0,
        regexPattern: longPattern,
      };

      expect(() => buildQuestionValidator(question)).toThrow(
        /exceeds maximum allowed length/
      );
    });

    it('rejects invalid regex syntax gracefully', () => {
      const invalidPattern = '[a-z(';
      expect(() => compileSafeRegex(invalidPattern)).toThrow(
        /Failed to compile regular expression/
      );
    });

    it('accepts valid regex pattern within bounds', () => {
      const validPattern = '^[A-Z]{3}-[0-9]{4}$';
      const regex = compileSafeRegex(validPattern);
      expect(regex.test('ABC-1234')).toBe(true);
      expect(regex.test('abc-1234')).toBe(false);
    });
  });

  describe('validates every QuestionType with good and bad values', () => {
    it('validates SHORT_TEXT', () => {
      const question: FormQuestionDef = {
        id: 'short_name',
        type: QuestionType.SHORT_TEXT,
        label: 'Full Name',
        required: true,
        orderIndex: 0,
        minLength: 2,
        maxLength: 20,
      };
      const validator = buildAnswerValidator([question]);

      // Good value
      const goodResult = validator.safeParse({ short_name: 'John Doe' });
      expect(goodResult.success).toBe(true);

      // Bad value: empty string
      const emptyResult = validator.safeParse({ short_name: '' });
      expect(emptyResult.success).toBe(false);

      // Bad value: too short
      const shortResult = validator.safeParse({ short_name: 'J' });
      expect(shortResult.success).toBe(false);

      // Bad value: too long
      const longResult = validator.safeParse({ short_name: 'A'.repeat(25) });
      expect(longResult.success).toBe(false);
    });

    it('validates LONG_TEXT', () => {
      const question: FormQuestionDef = {
        id: 'statement',
        type: QuestionType.LONG_TEXT,
        label: 'Statement of Purpose',
        required: true,
        orderIndex: 1,
        minLength: 10,
        maxLength: 50,
      };
      const validator = buildAnswerValidator([question]);

      // Good value
      expect(
        validator.safeParse({
          statement: 'I am excited to participate in this event.',
        }).success
      ).toBe(true);

      // Bad value: too short
      expect(
        validator.safeParse({
          statement: 'Too short',
        }).success
      ).toBe(false);
    });

    it('validates NUMBER', () => {
      const question: FormQuestionDef = {
        id: 'age',
        type: QuestionType.NUMBER,
        label: 'Age',
        required: true,
        orderIndex: 2,
        minNumber: 16,
        maxNumber: 100,
      };
      const validator = buildAnswerValidator([question]);

      // Good value
      expect(validator.safeParse({ age: 21 }).success).toBe(true);

      // Bad value: string instead of number
      expect(validator.safeParse({ age: 'twenty' }).success).toBe(false);

      // Bad value: below minimum
      expect(validator.safeParse({ age: 14 }).success).toBe(false);

      // Bad value: above maximum
      expect(validator.safeParse({ age: 105 }).success).toBe(false);
    });

    it('validates EMAIL', () => {
      const question: FormQuestionDef = {
        id: 'contact_email',
        type: QuestionType.EMAIL,
        label: 'Campus Email',
        required: true,
        orderIndex: 3,
      };
      const validator = buildAnswerValidator([question]);

      // Good value
      expect(
        validator.safeParse({ contact_email: 'student@campus.edu' }).success
      ).toBe(true);

      // Bad value: invalid email
      expect(
        validator.safeParse({ contact_email: 'not-an-email' }).success
      ).toBe(false);
      expect(validator.safeParse({ contact_email: '@missing.user' }).success).toBe(
        false
      );
    });

    it('validates PHONE', () => {
      const question: FormQuestionDef = {
        id: 'phone_num',
        type: QuestionType.PHONE,
        label: 'Phone Number',
        required: true,
        orderIndex: 4,
      };
      const validator = buildAnswerValidator([question]);

      // Good values
      expect(
        validator.safeParse({ phone_num: '+91 9876543210' }).success
      ).toBe(true);
      expect(
        validator.safeParse({ phone_num: '123-456-7890' }).success
      ).toBe(true);

      // Bad value
      expect(
        validator.safeParse({ phone_num: 'invalid_alphabetic_phone' }).success
      ).toBe(false);
    });

    it('validates SINGLE_SELECT', () => {
      const question: FormQuestionDef = {
        id: 'tshirt_size',
        type: QuestionType.SINGLE_SELECT,
        label: 'T-Shirt Size',
        required: true,
        orderIndex: 5,
        options: ['S', 'M', 'L', 'XL'],
      };
      const validator = buildAnswerValidator([question]);

      // Good value
      expect(validator.safeParse({ tshirt_size: 'M' }).success).toBe(true);

      // Bad value: option not in list
      expect(validator.safeParse({ tshirt_size: 'XXL' }).success).toBe(false);
      expect(validator.safeParse({ tshirt_size: 'random' }).success).toBe(false);
    });

    it('validates MULTI_SELECT', () => {
      const question: FormQuestionDef = {
        id: 'tracks',
        type: QuestionType.MULTI_SELECT,
        label: 'Interested Tracks',
        required: true,
        orderIndex: 6,
        options: ['AI', 'Web3', 'Mobile', 'Cloud'],
        minSelect: 1,
        maxSelect: 2,
      };
      const validator = buildAnswerValidator([question]);

      // Good values
      expect(validator.safeParse({ tracks: ['AI'] }).success).toBe(true);
      expect(validator.safeParse({ tracks: ['AI', 'Cloud'] }).success).toBe(true);

      // Bad value: empty array when required
      expect(validator.safeParse({ tracks: [] }).success).toBe(false);

      // Bad value: exceeds maxSelect
      expect(
        validator.safeParse({ tracks: ['AI', 'Web3', 'Mobile'] }).success
      ).toBe(false);

      // Bad value: contains invalid option
      expect(validator.safeParse({ tracks: ['Quantum'] }).success).toBe(false);

      // Bad value: duplicate selections
      expect(validator.safeParse({ tracks: ['AI', 'AI'] }).success).toBe(false);
    });

    it('validates CHECKBOX', () => {
      const question: FormQuestionDef = {
        id: 'agree_code_of_conduct',
        type: QuestionType.CHECKBOX,
        label: 'I agree to the code of conduct',
        required: true,
        orderIndex: 7,
      };
      const validator = buildAnswerValidator([question]);

      // Good value: true
      expect(
        validator.safeParse({ agree_code_of_conduct: true }).success
      ).toBe(true);

      // Bad value: false when required
      expect(
        validator.safeParse({ agree_code_of_conduct: false }).success
      ).toBe(false);

      // Bad value: non-boolean
      expect(
        validator.safeParse({ agree_code_of_conduct: 'yes' }).success
      ).toBe(false);
    });

    it('validates DATE', () => {
      const question: FormQuestionDef = {
        id: 'dob',
        type: QuestionType.DATE,
        label: 'Date of Birth',
        required: true,
        orderIndex: 8,
      };
      const validator = buildAnswerValidator([question]);

      // Good values
      expect(validator.safeParse({ dob: '2002-05-14' }).success).toBe(true);
      expect(
        validator.safeParse({ dob: '2026-10-30T12:00:00.000Z' }).success
      ).toBe(true);

      // Bad value
      expect(validator.safeParse({ dob: 'not-a-valid-date' }).success).toBe(
        false
      );
    });

    it('validates FILE_UPLOAD', () => {
      const question: FormQuestionDef = {
        id: 'resume',
        type: QuestionType.FILE_UPLOAD,
        label: 'Resume PDF',
        required: true,
        orderIndex: 9,
        maxFileBytes: 5242880, // 5MB
        allowedMimeTypes: ['application/pdf'],
      };
      const validator = buildAnswerValidator([question]);

      // Good value
      expect(
        validator.safeParse({
          resume: {
            objectKey: 'resumes/applicant_1.pdf',
            sizeBytes: 1048576,
            mimeType: 'application/pdf',
          },
        }).success
      ).toBe(true);

      // Bad value: size exceeds maxFileBytes
      expect(
        validator.safeParse({
          resume: {
            objectKey: 'resumes/huge.pdf',
            sizeBytes: 6000000,
            mimeType: 'application/pdf',
          },
        }).success
      ).toBe(false);

      // Bad value: disallowed mime type
      expect(
        validator.safeParse({
          resume: {
            objectKey: 'resumes/doc.exe',
            sizeBytes: 1048576,
            mimeType: 'application/x-msdownload',
          },
        }).success
      ).toBe(false);

      // Bad value: empty objectKey
      expect(
        validator.safeParse({
          resume: {
            objectKey: '',
            sizeBytes: 1048576,
            mimeType: 'application/pdf',
          },
        }).success
      ).toBe(false);
    });
  });

  describe('optional fields behavior', () => {
    it('allows undefined or null for optional fields', () => {
      const questions: FormQuestionDef[] = [
        {
          id: 'optional_text',
          type: QuestionType.SHORT_TEXT,
          label: 'Optional Note',
          required: false,
          orderIndex: 0,
        },
        {
          id: 'optional_num',
          type: QuestionType.NUMBER,
          label: 'Optional Score',
          required: false,
          orderIndex: 1,
        },
      ];
      const validator = buildAnswerValidator(questions);

      expect(validator.safeParse({}).success).toBe(true);
      expect(
        validator.safeParse({
          optional_text: undefined,
          optional_num: null,
        }).success
      ).toBe(true);
      expect(
        validator.safeParse({
          optional_text: '',
          optional_num: 42,
        }).success
      ).toBe(true);
    });
  });
});
