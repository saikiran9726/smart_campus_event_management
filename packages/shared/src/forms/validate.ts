import { z, ZodType } from 'zod';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from '../constants';
import { QuestionType } from '../enums';
import { FileAnswerValue, FormQuestionDef } from './types';

export const MAX_REGEX_PATTERN_LENGTH = 200;

export const PHONE_REGEX = /^\+?[0-9\s\-().]{7,25}$/;

/**
 * Safely compiles a regular expression with length bounds and syntax error guards.
 * Throws an Error if pattern exceeds MAX_REGEX_PATTERN_LENGTH or syntax is invalid.
 */
export function compileSafeRegex(pattern: string): RegExp {
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    throw new Error(
      `Regex pattern exceeds maximum allowed length of ${MAX_REGEX_PATTERN_LENGTH} characters (received ${pattern.length})`
    );
  }

  try {
    return new RegExp(pattern);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid regex pattern';
    throw new Error(`Failed to compile regular expression: ${message}`);
  }
}

/**
 * Builds a runtime Zod validator for a specific form question definition.
 */
export function buildQuestionValidator(question: FormQuestionDef): ZodType {
  let compiledRegex: RegExp | undefined;
  if (question.regexPattern !== undefined && question.regexPattern !== '') {
    compiledRegex = compileSafeRegex(question.regexPattern);
  }

  switch (question.type) {
    case QuestionType.SHORT_TEXT:
    case QuestionType.LONG_TEXT: {
      const isShort = question.type === QuestionType.SHORT_TEXT;
      const defaultMax = isShort ? 255 : 5000;
      const maxLen = question.maxLength ?? defaultMax;

      let stringSchema = z
        .string()
        .max(maxLen, `Must not exceed ${maxLen} characters`);

      if (question.minLength !== undefined && question.minLength > 0) {
        stringSchema = stringSchema.min(
          question.minLength,
          `Must be at least ${question.minLength} characters`
        );
      }

      if (compiledRegex) {
        stringSchema = stringSchema.regex(
          compiledRegex,
          question.regexErrorMessage ?? 'Value does not match required format'
        );
      }

      if (question.required) {
        return z
          .string({ required_error: `${question.label} is required` })
          .trim()
          .min(1, `${question.label} is required`)
          .pipe(stringSchema);
      }

      return z
        .union([
          z.string().trim().pipe(stringSchema),
          z.literal('').transform(() => undefined),
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.NUMBER: {
      let numSchema = z.number({
        required_error: `${question.label} is required`,
        invalid_type_error: `${question.label} must be a number`,
      });

      if (question.minNumber !== undefined) {
        numSchema = numSchema.min(
          question.minNumber,
          `Must be at least ${question.minNumber}`
        );
      }

      if (question.maxNumber !== undefined) {
        numSchema = numSchema.max(
          question.maxNumber,
          `Must not exceed ${question.maxNumber}`
        );
      }

      if (question.required) {
        return numSchema;
      }

      return z
        .union([numSchema, z.null().transform(() => undefined), z.undefined()])
        .optional();
    }

    case QuestionType.EMAIL: {
      let emailSchema = z
        .string({ required_error: `${question.label} is required` })
        .trim()
        .email('Invalid email address format');

      if (compiledRegex) {
        emailSchema = emailSchema.regex(
          compiledRegex,
          question.regexErrorMessage ?? 'Email does not match required pattern'
        );
      }

      if (question.required) {
        return emailSchema.min(1, `${question.label} is required`);
      }

      return z
        .union([
          emailSchema,
          z.literal('').transform(() => undefined),
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.PHONE: {
      let phoneSchema = z
        .string({ required_error: `${question.label} is required` })
        .trim()
        .regex(PHONE_REGEX, 'Invalid phone number format');

      if (compiledRegex) {
        phoneSchema = phoneSchema.regex(
          compiledRegex,
          question.regexErrorMessage ?? 'Phone does not match required pattern'
        );
      }

      if (question.required) {
        return phoneSchema.min(1, `${question.label} is required`);
      }

      return z
        .union([
          phoneSchema,
          z.literal('').transform(() => undefined),
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.SINGLE_SELECT:
    case QuestionType.DROPDOWN:
    case QuestionType.RADIO: {
      const allowed = question.options ?? [];

      const selectSchema = z
        .string({ required_error: `${question.label} is required` })
        .refine(
          (val) => allowed.includes(val),
          `Must be one of the allowed options: ${allowed.join(', ')}`
        );

      if (question.required) {
        return selectSchema;
      }

      return z
        .union([
          selectSchema,
          z.literal('').transform(() => undefined),
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.URL: {
      let urlSchema = z
        .string({ required_error: `${question.label} is required` })
        .trim()
        .url('Invalid URL format');

      if (compiledRegex) {
        urlSchema = urlSchema.regex(
          compiledRegex,
          question.regexErrorMessage ?? 'URL does not match required pattern'
        );
      }

      if (question.required) {
        return urlSchema.min(1, `${question.label} is required`);
      }

      return z
        .union([
          urlSchema,
          z.literal('').transform(() => undefined),
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.YES_NO: {
      const yesNoSchema = z.boolean({
        required_error: `${question.label} is required`,
        invalid_type_error: `${question.label} must be yes or no`,
      });

      if (question.required) {
        return yesNoSchema;
      }

      return z
        .union([
          yesNoSchema,
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.INSTRUCTION: {
      return z.any().optional().transform(() => undefined);
    }

    case QuestionType.MULTI_SELECT: {
      const allowed = question.options ?? [];

      let arraySchema = z
        .array(
          z
            .string()
            .refine(
              (val) => allowed.includes(val),
              `Option is not in allowed list: ${allowed.join(', ')}`
            )
        );

      if (question.minSelect !== undefined) {
        arraySchema = arraySchema.min(
          question.minSelect,
          `Please select at least ${question.minSelect} option(s)`
        );
      }

      if (question.maxSelect !== undefined) {
        arraySchema = arraySchema.max(
          question.maxSelect,
          `Please select at most ${question.maxSelect} option(s)`
        );
      }

      if (question.required) {
        const minItems = question.minSelect ?? 1;
        arraySchema = arraySchema.min(
          minItems,
          `Please select at least ${minItems} option(s)`
        );
      }

      const refinedArray = arraySchema.refine(
        (arr) => new Set(arr).size === arr.length,
        'Duplicate options are not permitted'
      );

      if (question.required) {
        return refinedArray;
      }

      return z
        .union([
          refinedArray,
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.CHECKBOX: {
      if (question.required) {
        return z
          .boolean({ required_error: `${question.label} must be checked` })
          .refine((val) => val === true, `${question.label} must be accepted`);
      }

      return z
        .union([
          z.boolean(),
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.DATE: {
      const dateSchema = z
        .string({ required_error: `${question.label} is required` })
        .trim()
        .refine((val) => {
          if (!val) return false;
          const timestamp = Date.parse(val);
          return !Number.isNaN(timestamp);
        }, 'Invalid ISO date string format');

      if (question.required) {
        return dateSchema;
      }

      return z
        .union([
          dateSchema,
          z.literal('').transform(() => undefined),
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    case QuestionType.FILE_UPLOAD: {
      const maxBytes = question.maxFileBytes ?? MAX_UPLOAD_BYTES;
      const allowedMimes: readonly string[] =
        question.allowedMimeTypes && question.allowedMimeTypes.length > 0
          ? question.allowedMimeTypes
          : ALLOWED_UPLOAD_MIME;

      const fileSchema = z
        .object({
          objectKey: z
            .string({ required_error: 'File objectKey is required' })
            .min(1, 'File objectKey cannot be empty'),
          sizeBytes: z
            .number({ required_error: 'File sizeBytes is required' })
            .int()
            .positive('File size must be positive')
            .max(
              maxBytes,
              `File size exceeds maximum allowed ${maxBytes} bytes`
            ),
          mimeType: z
            .string({ required_error: 'File mimeType is required' })
            .refine(
              (mime) => allowedMimes.includes(mime),
              `File MIME type must be one of: ${allowedMimes.join(', ')}`
            ),
        })
        .passthrough();

      if (question.required) {
        return fileSchema;
      }

      return z
        .union([
          fileSchema,
          z.null().transform(() => undefined),
          z.undefined(),
        ])
        .optional();
    }

    default: {
      const _exhaustiveCheck: never = question.type;
      throw new Error(`Unsupported question type: ${_exhaustiveCheck}`);
    }
  }
}

/**
 * Compiles a list of FormQuestionDef into a composite runtime Zod validator.
 */
export function buildAnswerValidator(
  questions: FormQuestionDef[]
): ZodType<Record<string, unknown>> {
  const shape: Record<string, ZodType> = {};

  for (const question of questions) {
    shape[question.id] = buildQuestionValidator(question);
  }

  return z.object(shape);
}
