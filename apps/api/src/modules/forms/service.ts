import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { FastifyReply } from 'fastify';
import {
  FormQuestionDef,
  MAX_UPLOAD_BYTES,
  QuestionType,
  TicketStatus,
  buildAnswerValidator,
} from '@eventora/shared';
import { db } from '../../db/client';
import {
  BookingAnswer,
  bookingAnswers,
  events,
  FormQuestion,
  formQuestions,
  registrations,
  teamMembers,
  teams,
  tickets,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { headObject } from '../../lib/r2';

/**
 * Extracts validation rules from request payload (accepts top-level or nested validation map).
 */
export function extractValidation(
  body: Record<string, any>
): Record<string, unknown> {
  const v = (body.validation ?? {}) as Record<string, any>;
  const result: Record<string, unknown> = {};

  if (body.minLength !== undefined || v.minLength !== undefined) {
    result.minLength = body.minLength ?? v.minLength;
  }
  if (body.maxLength !== undefined || v.maxLength !== undefined) {
    result.maxLength = body.maxLength ?? v.maxLength;
  }
  if (body.minNumber !== undefined || v.minNumber !== undefined) {
    result.minNumber = body.minNumber ?? v.minNumber;
  }
  if (body.maxNumber !== undefined || v.maxNumber !== undefined) {
    result.maxNumber = body.maxNumber ?? v.maxNumber;
  }
  if (body.regexPattern !== undefined || v.regexPattern !== undefined) {
    result.regexPattern = body.regexPattern ?? v.regexPattern;
  }
  if (body.regexErrorMessage !== undefined || v.regexErrorMessage !== undefined) {
    result.regexErrorMessage = body.regexErrorMessage ?? v.regexErrorMessage;
  }
  if (body.minSelect !== undefined || v.minSelect !== undefined) {
    result.minSelect = body.minSelect ?? v.minSelect;
  }
  if (body.maxSelect !== undefined || v.maxSelect !== undefined) {
    result.maxSelect = body.maxSelect ?? v.maxSelect;
  }
  if (body.maxFileBytes !== undefined || v.maxFileBytes !== undefined) {
    result.maxFileBytes = body.maxFileBytes ?? v.maxFileBytes;
  }
  if (body.allowedMimeTypes !== undefined || v.allowedMimeTypes !== undefined) {
    result.allowedMimeTypes = body.allowedMimeTypes ?? v.allowedMimeTypes;
  }

  return result;
}

/**
 * Converts a database formQuestions row into a typed FormQuestionDef.
 */
export function toFormQuestionDef(row: FormQuestion): FormQuestionDef {
  const val = (row.validation ?? {}) as Record<string, any>;
  return {
    id: row.id,
    type: row.type as QuestionType,
    label: row.label,
    description: row.helpText ?? undefined,
    required: row.required,
    orderIndex: row.position,
    options: (row.options as string[]) ?? undefined,
    minLength: typeof val.minLength === 'number' ? val.minLength : undefined,
    maxLength: typeof val.maxLength === 'number' ? val.maxLength : undefined,
    minNumber: typeof val.minNumber === 'number' ? val.minNumber : undefined,
    maxNumber: typeof val.maxNumber === 'number' ? val.maxNumber : undefined,
    regexPattern: typeof val.regexPattern === 'string' ? val.regexPattern : undefined,
    regexErrorMessage: typeof val.regexErrorMessage === 'string' ? val.regexErrorMessage : undefined,
    minSelect: typeof val.minSelect === 'number' ? val.minSelect : undefined,
    maxSelect: typeof val.maxSelect === 'number' ? val.maxSelect : undefined,
    maxFileBytes: typeof val.maxFileBytes === 'number' ? val.maxFileBytes : undefined,
    allowedMimeTypes: Array.isArray(val.allowedMimeTypes) ? val.allowedMimeTypes : undefined,
  };
}

/**
 * Freezes the form on the event row if it has not yet been frozen.
 * Atomic and idempotent: parallel calls will leave formFrozenAt unchanged after the first.
 */
export async function freezeFormIfNeeded(
  tx: any,
  eventId: string
): Promise<Date | null> {
  const [updated] = await tx
    .update(events)
    .set({ formFrozenAt: new Date() })
    .where(and(eq(events.id, eventId), isNull(events.formFrozenAt)))
    .returning({ formFrozenAt: events.formFrozenAt });

  if (updated?.formFrozenAt) {
    return new Date(updated.formFrozenAt);
  }

  const [existing] = await tx
    .select({ formFrozenAt: events.formFrozenAt })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  return existing?.formFrozenAt ? new Date(existing.formFrozenAt) : null;
}

/**
 * Loads all active questions for an event with a FOR SHARE lock on the event row
 * ensuring a concurrent organizer edit cannot interleave with a registration.
 */
export async function loadQuestionsForUpdate(
  tx: any,
  eventId: string
): Promise<FormQuestion[]> {
  // 1. Acquire FOR SHARE lock on the event row
  await tx
    .select({ id: events.id, formFrozenAt: events.formFrozenAt })
    .from(events)
    .where(eq(events.id, eventId))
    .for('share');

  // 2. Load active questions ordered by position
  const questions = await tx
    .select()
    .from(formQuestions)
    .where(
      and(
        eq(formQuestions.eventId, eventId),
        eq(formQuestions.archived, false)
      )
    )
    .orderBy(asc(formQuestions.position));

  return questions;
}

export interface SubmitAnswersParams {
  registrationId: string;
  eventId: string;
  answers: Record<string, unknown>;
}

/**
 * Validates and records answers into booking_answers with immutable label/type snapshots.
 * Validates with the compiled Zod validator, verifies FILE_UPLOAD via R2 HEAD,
 * and skips unanswered questions added after freeze.
 */
export async function submitAnswers(
  tx: any,
  params: SubmitAnswersParams
): Promise<BookingAnswer[]> {
  const { registrationId, eventId, answers } = params;

  // 1. Load active questions inside transaction
  const questions = await loadQuestionsForUpdate(tx, eventId);
  const questionDefs = questions.map(toFormQuestionDef);

  // 2. Build validator & parse answers
  const validator = buildAnswerValidator(questionDefs);
  const parseResult = validator.safeParse(answers ?? {});

  if (!parseResult.success) {
    const details: Record<string, string> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join('.') || 'root';
      details[field] = issue.message;
    }
    throw new AppError(
      'VALIDATION_FAILED',
      'Form answers failed validation',
      400,
      details
    );
  }

  const validatedAnswers = parseResult.data;
  const insertedAnswers: BookingAnswer[] = [];

  // 3. For every answered question write booking_answers row
  for (const question of questions) {
    const val = validatedAnswers[question.id];

    // Questions unanswered by registrants are simply absent
    if (val === undefined || val === null || val === '') {
      continue;
    }

    // 4. File upload size verification via R2 headObject
    if (question.type === QuestionType.FILE_UPLOAD) {
      const fileVal = val as { objectKey: string; sizeBytes: number; mimeType: string };
      const valConfig = (question.validation ?? {}) as Record<string, any>;
      const maxBytes = valConfig.maxFileBytes ?? MAX_UPLOAD_BYTES;

      const head = await headObject(fileVal.objectKey);
      if (!head) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Uploaded file '${fileVal.objectKey}' does not exist on storage.`,
          422
        );
      }
      if (head.contentLength > maxBytes) {
        throw new AppError(
          'VALIDATION_FAILED',
          `File size ${head.contentLength} bytes exceeds allowed maximum of ${maxBytes} bytes.`,
          422
        );
      }
    }

    // 5. Insert immutable snapshot
    const [inserted] = await tx
      .insert(bookingAnswers)
      .values({
        registrationId,
        questionId: question.id,
        questionLabelSnapshot: question.label,
        questionTypeSnapshot: question.type,
        value: val,
      })
      .returning();

    if (inserted) {
      insertedAnswers.push(inserted);
    }
  }

  return insertedAnswers;
}

/**
 * Escapes a cell value according to RFC 4180 CSV standard and neutralizes
 * CSV Formula Injection (CWE-1236) by prepending a single quote to cells
 * starting with formula trigger characters (=, +, -, @, \t, \r).
 */
export function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);

  // Neutralize CSV Formula Injection (CWE-1236), including leading whitespace bypasses
  if (/^\s*[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Streams responses for an event as an RFC 4180 compliant CSV with formula injection protection.
 */
export async function streamResponsesCsv(
  eventId: string,
  reply: FastifyReply,
  filters?: {
    q?: string;
    search?: string;
    status?: string;
    paymentStatus?: string;
    checkedIn?: string | boolean;
    department?: string;
    year?: string | number;
    team?: string;
  }
): Promise<void> {
  const questions = await db
    .select()
    .from(formQuestions)
    .where(
      and(
        eq(formQuestions.eventId, eventId),
        eq(formQuestions.archived, false)
      )
    )
    .orderBy(asc(formQuestions.position));

  const conditions = [eq(registrations.eventId, eventId)];

  if (filters?.status && filters.status !== 'ALL') {
    conditions.push(eq(registrations.status, filters.status as any));
  }
  if (filters?.paymentStatus && filters.paymentStatus !== 'ALL') {
    conditions.push(eq(registrations.paymentStatus, filters.paymentStatus as any));
  }
  const searchPattern = (filters?.search || filters?.q || '').trim();
  if (searchPattern.length > 0) {
    const pattern = `%${searchPattern}%`;
    conditions.push(
      or(
        ilike(users.fullName, pattern),
        ilike(users.email, pattern),
        ilike(users.rollNumber, pattern),
        ilike(users.phone, pattern)
      )!
    );
  }
  if (filters?.department && filters.department !== 'ALL') {
    conditions.push(eq(users.department, filters.department));
  }
  if (filters?.year && filters.year !== 'ALL') {
    conditions.push(eq(users.year, parseInt(String(filters.year), 10)));
  }
  if (filters?.team && filters.team !== 'ALL') {
    if (filters.team === 'WITH_TEAM') {
      conditions.push(sql`${teams.id} IS NOT NULL`);
    } else if (filters.team === 'SOLO') {
      conditions.push(sql`${teams.id} IS NULL`);
    } else {
      conditions.push(
        or(eq(teams.id, filters.team), ilike(teams.name, `%${filters.team}%`))!
      );
    }
  }
  if (filters?.checkedIn !== undefined && filters?.checkedIn !== 'ALL') {
    const isCheckedIn =
      String(filters.checkedIn).toLowerCase() === 'true' ||
      filters.checkedIn === true;
    if (isCheckedIn) {
      conditions.push(eq(tickets.status, TicketStatus.CHECKED_IN));
    } else {
      conditions.push(or(isNull(tickets.status), ne(tickets.status, TicketStatus.CHECKED_IN))!);
    }
  }

  const regRows = await db
    .select({
      registrationId: registrations.id,
      status: registrations.status,
      paymentStatus: registrations.paymentStatus,
      registeredAt: registrations.createdAt,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      rollNumber: users.rollNumber,
      department: users.department,
      year: users.year,
      phone: users.phone,
      ticketStatus: tickets.status,
      checkedInAt: tickets.checkedInAt,
      checkedInVia: tickets.checkedInVia,
      teamName: teams.name,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .leftJoin(tickets, eq(tickets.registrationId, registrations.id))
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.userId, registrations.userId),
        eq(teamMembers.eventId, registrations.eventId)
      )
    )
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(...conditions))
    .orderBy(desc(registrations.createdAt));

  const regIds = regRows.map((r) => r.registrationId);
  const answersRows =
    regIds.length > 0
      ? await db
          .select()
          .from(bookingAnswers)
          .where(inArray(bookingAnswers.registrationId, regIds))
      : [];

  const answersByRegId: Record<string, Record<string, any>> = {};
  for (const ans of answersRows) {
    const userAns = answersByRegId[ans.registrationId] ?? {};
    userAns[ans.questionId] = ans.value;
    answersByRegId[ans.registrationId] = userAns;
  }

  const baseHeaders = [
    'Registration ID',
    'Full Name',
    'Email',
    'Phone',
    'Roll Number',
    'Department',
    'Academic Year',
    'Registration Date',
    'Registration Status',
    'Payment Status',
    'Check-in Status',
    'Ticket Status',
    'Checked In At',
    'Checked In Via',
    'Team Name',
  ];

  const questionHeaders = questions.map((q) => q.label);
  const headerLine = [...baseHeaders, ...questionHeaders]
    .map(escapeCsv)
    .join(',');

  const rows = [headerLine];

  for (const r of regRows) {
    const userAnswers = answersByRegId[r.registrationId] ?? {};
    const rowValues = [
      r.registrationId,
      r.fullName,
      r.email,
      r.phone ?? '',
      r.rollNumber ?? '',
      r.department ?? '',
      r.year !== null && r.year !== undefined ? String(r.year) : '',
      r.registeredAt.toISOString(),
      r.status,
      r.paymentStatus ?? '',
      r.ticketStatus === TicketStatus.CHECKED_IN ? 'CHECKED_IN' : 'NOT_CHECKED_IN',
      r.ticketStatus ?? 'VALID',
      r.checkedInAt ? r.checkedInAt.toISOString() : '',
      r.checkedInVia ?? '',
      r.teamName ?? '',
      ...questions.map((q) => {
        const aVal = userAnswers[q.id];
        if (aVal === null || aVal === undefined) return '';
        if (typeof aVal === 'object') {
          if (aVal.filename || aVal.objectKey) return aVal.filename || aVal.objectKey;
          return JSON.stringify(aVal);
        }
        return String(aVal);
      }),
    ];
    rows.push(rowValues.map(escapeCsv).join(','));
  }

  const csvContent = rows.join('\r\n');

  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header(
      'Content-Disposition',
      `attachment; filename="event-${eventId}-responses.csv"`
    )
    .status(200)
    .send(csvContent);
}

/**
 * Aggregates responses to generate statistical insights for organizers.
 */
export async function getFormInsights(eventId: string) {
  const questions = await db
    .select()
    .from(formQuestions)
    .where(
      and(
        eq(formQuestions.eventId, eventId),
        eq(formQuestions.archived, false)
      )
    )
    .orderBy(asc(formQuestions.position));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(registrations)
    .where(eq(registrations.eventId, eventId));

  const totalRegistrations = Number(countResult?.count ?? 0);

  const questionIds = questions.map((q) => q.id);
  const answers =
    questionIds.length > 0
      ? await db
          .select()
          .from(bookingAnswers)
          .where(inArray(bookingAnswers.questionId, questionIds))
      : [];

  const answersByQuestionId: Record<string, typeof answers> = {};
  for (const q of questions) {
    answersByQuestionId[q.id] = [];
  }
  for (const a of answers) {
    const list = answersByQuestionId[a.questionId];
    if (list) {
      list.push(a);
    }
  }

  const insights = questions.map((q) => {
    const qAnswers = answersByQuestionId[q.id] ?? [];
    const responseCount = qAnswers.length;
    const responseRate =
      totalRegistrations > 0
        ? Number((responseCount / totalRegistrations).toFixed(4))
        : 0;

    const baseInsight: Record<string, unknown> = {
      questionId: q.id,
      label: q.label,
      type: q.type,
      responseCount,
      responseRate,
    };

    // Aggregate select/checkbox option counts
    if (
      q.type === QuestionType.SINGLE_SELECT ||
      q.type === QuestionType.MULTI_SELECT ||
      q.type === QuestionType.CHECKBOX
    ) {
      const optionCounts: Record<string, number> = {};
      if (Array.isArray(q.options)) {
        for (const opt of q.options) {
          optionCounts[String(opt)] = 0;
        }
      }

      for (const a of qAnswers) {
        if (Array.isArray(a.value)) {
          for (const item of a.value) {
            const k = String(item);
            optionCounts[k] = (optionCounts[k] ?? 0) + 1;
          }
        } else if (a.value !== null && a.value !== undefined && a.value !== '') {
          const k = String(a.value);
          optionCounts[k] = (optionCounts[k] ?? 0) + 1;
        }
      }
      baseInsight.optionCounts = optionCounts;
    }

    // Aggregate number min/max/avg
    if (q.type === QuestionType.NUMBER) {
      const numbers: number[] = [];
      for (const a of qAnswers) {
        const num = Number(a.value);
        if (!Number.isNaN(num)) {
          numbers.push(num);
        }
      }

      if (numbers.length > 0) {
        const sum = numbers.reduce((acc, curr) => acc + curr, 0);
        baseInsight.stats = {
          count: numbers.length,
          min: Math.min(...numbers),
          max: Math.max(...numbers),
          avg: Number((sum / numbers.length).toFixed(2)),
        };
      } else {
        baseInsight.stats = {
          count: 0,
          min: null,
          max: null,
          avg: null,
        };
      }
    }

    return baseInsight;
  });

  return {
    eventId,
    totalRegistrations,
    insights,
  };
}
