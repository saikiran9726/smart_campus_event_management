import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db, withTx } from '../../db/client';
import {
  bookingAnswers,
  events,
  formQuestions,
  registrations,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireEventOrganizer } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import {
  extractValidation,
  getFormInsights,
  streamResponsesCsv,
  toFormQuestionDef,
} from './service';
import { buildAnswerValidator } from '@eventora/shared';

/**
 * Ensures volunteer scanner sessions never access sensitive form responses.
 */
function denyScanner(request: FastifyRequest): void {
  const reqAny = request as any;
  if (
    reqAny.isScanner ||
    reqAny.principal === 'scanner' ||
    reqAny.user?.role === 'SCANNER' ||
    request.headers['x-scanner-session'] ||
    request.headers['x-scanner-token'] ||
    request.headers['x-principal'] === 'scanner'
  ) {
    throw new AppError(
      'FORBIDDEN',
      'Volunteer scanner sessions are strictly prohibited from accessing form responses.',
      403
    );
  }
}

export async function formRoutes(server: FastifyInstance): Promise<void> {
  // 1. GET /events/:eventId/form (public)
  server.get(
    '/events/:eventId/form',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };

      const [event] = await db
        .select({
          id: events.id,
          formFrozenAt: events.formFrozenAt,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
      }

      // Count registered attendees (status not cancelled/expired)
      const [regCountResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, eventId),
            sql`${registrations.status} NOT IN ('CANCELLED', 'EXPIRED')`
          )
        );

      const registeredCount = Number(regCountResult?.count ?? 0);
      const isFrozen = event.formFrozenAt !== null;

      // Select active questions ordered by position
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

      return reply.status(200).send({
        eventId: event.id,
        frozen: isFrozen,
        frozenAt: event.formFrozenAt ? event.formFrozenAt.toISOString() : null,
        registeredCount,
        questions,
      });
    }
  );

  // 2. POST /events/:eventId/form/questions (organizer-only)
  server.post(
    '/events/:eventId/form/questions',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const body = request.body as any;

      if (!body.type || !body.label) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Question type and label are required.',
          400
        );
      }

      const [event] = await db
        .select({
          id: events.id,
          formFrozenAt: events.formFrozenAt,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
      }

      const isFrozen = event.formFrozenAt !== null;

      // If form is frozen, ONLY optional questions can be added
      if (isFrozen) {
        if (body.required === true) {
          const [regCountResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(registrations)
            .where(
              and(
                eq(registrations.eventId, eventId),
                sql`${registrations.status} NOT IN ('CANCELLED', 'EXPIRED')`
              )
            );
          const registeredCount = Number(regCountResult?.count ?? 0);

          throw new AppError(
            'FORM_FROZEN',
            `Form frozen: ${registeredCount} attendees registered. Only new optional questions can be added.`,
            409,
            {
              registeredCount,
              frozenAt: event.formFrozenAt,
            }
          );
        }
      }

      // Calculate next position: max + 1
      const [maxResult] = await db
        .select({
          max: sql<number>`COALESCE(MAX(${formQuestions.position}), 0)`,
        })
        .from(formQuestions)
        .where(eq(formQuestions.eventId, eventId));

      const maxPosition = Number(maxResult?.max ?? 0);
      const nextPosition = maxPosition + 1;

      const [newQuestion] = await db
        .insert(formQuestions)
        .values({
          eventId,
          position: isFrozen ? nextPosition : (body.orderIndex ?? body.position ?? nextPosition),
          type: body.type,
          label: body.label,
          helpText: body.helpText ?? body.description ?? null,
          required: isFrozen ? false : (body.required ?? false),
          options: Array.isArray(body.options) ? body.options : null,
          validation: extractValidation(body),
          addedAfterFreeze: isFrozen,
          archived: false,
        })
        .returning();

      return reply.status(201).send({ question: newQuestion });
    }
  );

  // 3. PATCH /events/:eventId/form/questions/:qid (organizer-only)
  server.patch(
    '/events/:eventId/form/questions/:qid',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, qid } = request.params as {
        eventId: string;
        qid: string;
      };
      const body = request.body as any;

      const [event] = await db
        .select({
          id: events.id,
          formFrozenAt: events.formFrozenAt,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
      }

      const [question] = await db
        .select()
        .from(formQuestions)
        .where(
          and(
            eq(formQuestions.id, qid),
            eq(formQuestions.eventId, eventId)
          )
        )
        .limit(1);

      if (!question) {
        throw new AppError('NOT_FOUND', `Question '${qid}' was not found.`, 404);
      }

      const isFrozen = event.formFrozenAt !== null;

      // If form is frozen: reject any change to type, label, required, options, validation.
      // (Allow only help_text.)
      if (isFrozen) {
        const forbiddenFields = [
          'type',
          'label',
          'required',
          'options',
          'validation',
          'minLength',
          'maxLength',
          'minNumber',
          'maxNumber',
          'regexPattern',
          'regexErrorMessage',
          'minSelect',
          'maxSelect',
          'maxFileBytes',
          'allowedMimeTypes',
        ];

        const hasForbiddenChange = forbiddenFields.some(
          (field) => body[field] !== undefined
        );

        if (hasForbiddenChange) {
          throw new AppError(
            'FORM_FROZEN',
            'Form is frozen. Modifications to question definition (type, label, required, options, validation) are forbidden. Only help_text can be edited.',
            409,
            { questionId: qid, frozenAt: event.formFrozenAt }
          );
        }
      }

      const updateData: Record<string, unknown> = {};

      if (body.helpText !== undefined || body.description !== undefined) {
        updateData.helpText = body.helpText ?? body.description;
      }

      if (!isFrozen) {
        if (body.label !== undefined) updateData.label = body.label;
        if (body.type !== undefined) updateData.type = body.type;
        if (body.required !== undefined) updateData.required = body.required;
        if (body.options !== undefined) updateData.options = body.options;
        if (body.position !== undefined || body.orderIndex !== undefined) {
          updateData.position = body.position ?? body.orderIndex;
        }

        const validation = extractValidation(body);
        if (Object.keys(validation).length > 0) {
          updateData.validation = {
            ...(question.validation as Record<string, unknown> ?? {}),
            ...validation,
          };
        }
      }

      const [updated] = await db
        .update(formQuestions)
        .set(updateData)
        .where(eq(formQuestions.id, qid))
        .returning();

      return reply.status(200).send({ question: updated });
    }
  );

  // 4. DELETE /events/:eventId/form/questions/:qid (organizer-only)
  server.delete(
    '/events/:eventId/form/questions/:qid',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, qid } = request.params as {
        eventId: string;
        qid: string;
      };

      const [event] = await db
        .select({
          id: events.id,
          formFrozenAt: events.formFrozenAt,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
      }

      const [question] = await db
        .select()
        .from(formQuestions)
        .where(
          and(
            eq(formQuestions.id, qid),
            eq(formQuestions.eventId, eventId)
          )
        )
        .limit(1);

      if (!question) {
        throw new AppError('NOT_FOUND', `Question '${qid}' was not found.`, 404);
      }

      if (event.formFrozenAt !== null) {
        throw new AppError(
          'FORM_FROZEN',
          'Cannot delete questions from a frozen form.',
          409,
          { questionId: qid, frozenAt: event.formFrozenAt }
        );
      }

      await db
        .delete(formQuestions)
        .where(eq(formQuestions.id, qid));

      return reply.status(200).send({ success: true });
    }
  );

  // 5. PUT /events/:eventId/form/order (organizer-only)
  server.put(
    '/events/:eventId/form/order',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const body = request.body as any;

      let orderedIds: string[] = [];
      if (Array.isArray(body.orderedIds)) {
        orderedIds = body.orderedIds;
      } else if (Array.isArray(body.items)) {
        orderedIds = body.items.map((item: any) => item.id);
      }

      if (!orderedIds || orderedIds.length === 0) {
        throw new AppError('VALIDATION_FAILED', 'orderedIds array is required.', 400);
      }

      const [event] = await db
        .select({
          id: events.id,
          formFrozenAt: events.formFrozenAt,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
      }

      const isFrozen = event.formFrozenAt !== null;

      // Fetch all active questions for this event
      const allQuestions = await db
        .select()
        .from(formQuestions)
        .where(
          and(
            eq(formQuestions.eventId, eventId),
            eq(formQuestions.archived, false)
          )
        )
        .orderBy(asc(formQuestions.position));

      // If frozen, only reordering of questions with added_after_freeze = true among themselves is allowed
      if (isFrozen) {
        const preFreezeQuestions = allQuestions.filter((q) => !q.addedAfterFreeze);
        const preFreezeIds = preFreezeQuestions.map((q) => q.id);

        // Filter the requested order for pre-freeze questions
        const requestedPreFreezeIds = orderedIds.filter((id) =>
          preFreezeIds.includes(id)
        );

        // Check if pre-freeze questions were reordered
        const isPreFreezeOrderUnchanged =
          preFreezeIds.length === requestedPreFreezeIds.length &&
          preFreezeIds.every((id, idx) => requestedPreFreezeIds[idx] === id);

        // Also check that all pre-freeze questions occupy the first N slots in orderedIds
        const arePreFreezeInInitialSlots = preFreezeIds.every(
          (id, idx) => orderedIds[idx] === id
        );

        if (!isPreFreezeOrderUnchanged || !arePreFreezeInInitialSlots) {
          throw new AppError(
            'FORM_FROZEN',
            'Form is frozen. Reordering of questions created prior to freeze is strictly forbidden.',
            409,
            { frozenAt: event.formFrozenAt }
          );
        }
      }

      // Two-phase position update inside one tx to satisfy the unique constraint
      await withTx(async (tx) => {
        // Phase 1: Shift to negative positions
        for (let i = 0; i < orderedIds.length; i++) {
          const qid = orderedIds[i];
          if (!qid) continue;
          await tx
            .update(formQuestions)
            .set({ position: -(i + 1000) })
            .where(
              and(
                eq(formQuestions.id, qid),
                eq(formQuestions.eventId, eventId)
              )
            );
        }

        // Phase 2: Assign final positive positions (1-based)
        for (let i = 0; i < orderedIds.length; i++) {
          const qid = orderedIds[i];
          if (!qid) continue;
          await tx
            .update(formQuestions)
            .set({ position: i + 1 })
            .where(
              and(
                eq(formQuestions.id, qid),
                eq(formQuestions.eventId, eventId)
              )
            );
        }
      });

      const updatedQuestions = await db
        .select()
        .from(formQuestions)
        .where(
          and(
            eq(formQuestions.eventId, eventId),
            eq(formQuestions.archived, false)
          )
        )
        .orderBy(asc(formQuestions.position));

      return reply.status(200).send({ success: true, questions: updatedQuestions });
    }
  );

  // 6. POST /events/:eventId/form/preview-validate (builder instant preview)
  server.post(
    '/events/:eventId/form/preview-validate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const body = request.body as any;
      const answers = body?.answers ?? {};

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

      const questionDefs = questions.map(toFormQuestionDef);
      const validator = buildAnswerValidator(questionDefs);
      const result = validator.safeParse(answers);

      if (result.success) {
        return reply.status(200).send({ valid: true, errors: {} });
      }

      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const fieldKey = issue.path[0] ? String(issue.path[0]) : 'root';
        errors[fieldKey] = issue.message;
      }

      return reply.status(200).send({ valid: false, errors });
    }
  );

  // 7. GET /events/:eventId/form/responses (organizer-only, denies volunteer scanner)
  server.get(
    '/events/:eventId/form/responses',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      denyScanner(request);
      const { eventId } = request.params as { eventId: string };
      const query = request.query as any;

      const page = Math.max(1, parseInt(query?.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query?.limit || '50', 10)));
      const offset = (page - 1) * limit;

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

      const columns = questions.map((q) => ({
        id: q.id,
        label: q.label,
        type: q.type,
      }));

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(registrations)
        .where(eq(registrations.eventId, eventId));

      const total = Number(countResult?.count ?? 0);

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
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userId, users.id))
        .where(eq(registrations.eventId, eventId))
        .orderBy(desc(registrations.createdAt))
        .limit(limit)
        .offset(offset);

      const regIds = regRows.map((r) => r.registrationId);
      const answersRows =
        regIds.length > 0
          ? await db
              .select()
              .from(bookingAnswers)
              .where(inArray(bookingAnswers.registrationId, regIds))
          : [];

      const answersByRegId: Record<
        string,
        Record<string, { labelSnapshot: string; typeSnapshot: string; value: unknown }>
      > = {};

      for (const ans of answersRows) {
        const regAnswers = answersByRegId[ans.registrationId] ?? {};
        regAnswers[ans.questionId] = {
          labelSnapshot: ans.questionLabelSnapshot,
          typeSnapshot: ans.questionTypeSnapshot,
          value: ans.value,
        };
        answersByRegId[ans.registrationId] = regAnswers;
      }

      const items = regRows.map((r) => ({
        registrationId: r.registrationId,
        user: {
          id: r.userId,
          fullName: r.fullName,
          email: r.email,
          rollNumber: r.rollNumber,
          department: r.department,
          year: r.year,
          phone: r.phone,
        },
        status: r.status,
        paymentStatus: r.paymentStatus,
        registeredAt: r.registeredAt,
        answers: answersByRegId[r.registrationId] ?? {},
      }));

      return reply.status(200).send({
        items,
        columns,
        total,
        page,
        limit,
      });
    }
  );

  // 8. GET /events/:eventId/form/responses.csv (organizer-only, denies volunteer scanner)
  server.get(
    '/events/:eventId/form/responses.csv',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      denyScanner(request);
      const { eventId } = request.params as { eventId: string };
      await streamResponsesCsv(eventId, reply);
    }
  );

  // 9. GET /events/:eventId/form/insights (organizer-only)
  server.get(
    '/events/:eventId/form/insights',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const insights = await getFormInsights(eventId);
      return reply.status(200).send(insights);
    }
  );
}
