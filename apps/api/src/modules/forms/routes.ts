import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db, withTx } from '../../db/client';
import {
  bookingAnswers,
  events,
  formQuestions,
  formVersions,
  payments,
  registrations,
  teamMembers,
  teams,
  tickets,
  users,
} from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireEventOrganizer } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import { FORM_TEMPLATES } from './templates';
import {
  extractValidation,
  getFormInsights,
  streamResponsesCsv,
  toFormQuestionDef,
} from './service';
import { buildAnswerValidator, TicketStatus } from '@eventora/shared';
import { presignGet, publicUrl } from '../../lib/r2';

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
          formVersion: events.formVersion,
          formPublished: events.formPublished,
          registrationMode: events.registrationMode,
          approvalRequired: events.approvalRequired,
          minTeamSize: events.minTeamSize,
          maxTeamSize: events.maxTeamSize,
          isCompetition: events.isCompetition,
          projectSubmissionConfig: events.projectSubmissionConfig,
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
        formVersion: event.formVersion ?? 1,
        formPublished: event.formPublished ?? true,
        registrationMode: event.registrationMode ?? 'INDIVIDUAL',
        approvalRequired: event.approvalRequired ?? false,
        minTeamSize: event.minTeamSize,
        maxTeamSize: event.maxTeamSize,
        isCompetition: event.isCompetition,
        projectSubmissionConfig: event.projectSubmissionConfig,
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
          placeholder: body.placeholder ?? null,
          defaultValue: body.defaultValue ?? null,
          visibility: body.visibility ?? 'ALWAYS',
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

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qid);
      if (!isUuid) {
        throw new AppError('NOT_FOUND', `Question '${qid}' was not found.`, 404);
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
      if (body.placeholder !== undefined) {
        updateData.placeholder = body.placeholder;
      }
      if (body.defaultValue !== undefined) {
        updateData.defaultValue = body.defaultValue;
      }
      if (body.visibility !== undefined) {
        updateData.visibility = body.visibility;
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

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qid);
      if (!isUuid) {
        throw new AppError('NOT_FOUND', `Question '${qid}' was not found.`, 404);
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

  // 5.5. POST /events/:eventId/form/questions/:qid/duplicate (organizer-only)
  server.post(
    '/events/:eventId/form/questions/:qid/duplicate',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId, qid } = request.params as { eventId: string; qid: string };

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

      const [maxResult] = await db
        .select({
          max: sql<number>`COALESCE(MAX(${formQuestions.position}), 0)`,
        })
        .from(formQuestions)
        .where(eq(formQuestions.eventId, eventId));

      const nextPosition = Number(maxResult?.max ?? 0) + 1;

      const [duplicated] = await db
        .insert(formQuestions)
        .values({
          eventId,
          position: nextPosition,
          type: question.type,
          label: `${question.label} (Copy)`,
          helpText: question.helpText,
          placeholder: question.placeholder,
          defaultValue: question.defaultValue,
          visibility: question.visibility,
          required: question.required,
          options: question.options,
          validation: question.validation,
          addedAfterFreeze: question.addedAfterFreeze,
          archived: false,
        })
        .returning();

      return reply.status(201).send({ question: duplicated });
    }
  );

  // 5.6. GET /events/:eventId/form/templates
  server.get(
    '/events/:eventId/form/templates',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const templateList = Object.values(FORM_TEMPLATES).map((t) => ({
        key: t.key,
        name: t.name,
        description: t.description,
        category: t.category,
        questionCount: t.questions.length,
        questions: t.questions,
      }));
      return reply.status(200).send({ templates: templateList });
    }
  );

  // 5.7. POST /events/:eventId/form/apply-template (organizer-only)
  server.post(
    '/events/:eventId/form/apply-template',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const body = request.body as any;
      const templateKey = String(body?.templateKey ?? '').toUpperCase();

      const template = FORM_TEMPLATES[templateKey];
      if (!template) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Template '${templateKey}' not found. Available: ${Object.keys(FORM_TEMPLATES).join(', ')}`,
          400
        );
      }

      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
      }

      const isFrozen = event.formFrozenAt !== null;

      if (body?.replaceExisting) {
        if (isFrozen) {
          throw new AppError(
            'FORM_FROZEN',
            'Cannot replace existing questions on a frozen form.',
            409
          );
        }
        await db
          .delete(formQuestions)
          .where(eq(formQuestions.eventId, eventId));
      }

      const [maxResult] = await db
        .select({
          max: sql<number>`COALESCE(MAX(${formQuestions.position}), 0)`,
        })
        .from(formQuestions)
        .where(eq(formQuestions.eventId, eventId));

      let currentPos = Number(maxResult?.max ?? 0);
      const insertedQuestions = [];

      for (const q of template.questions) {
        currentPos += 1;
        const [inserted] = await db
          .insert(formQuestions)
          .values({
            eventId,
            position: currentPos,
            type: q.type,
            label: q.label,
            helpText: q.helpText ?? null,
            placeholder: q.placeholder ?? null,
            required: isFrozen ? false : q.required,
            options: q.options ?? null,
            validation: q.validation ?? {},
            addedAfterFreeze: isFrozen,
            archived: false,
          })
          .returning();

        if (inserted) insertedQuestions.push(inserted);
      }

      return reply.status(201).send({
        success: true,
        template: template.name,
        questions: insertedQuestions,
      });
    }
  );

  // 5.8. POST /events/:eventId/form/publish (organizer-only)
  server.post(
    '/events/:eventId/form/publish',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };

      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
      }

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

      // Check if active registrations exist
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
      let newVersion = event.formVersion ?? 1;

      // If registrations already exist, bump version and freeze/snapshot previous schema
      if (registeredCount > 0) {
        newVersion += 1;
      }

      await db
        .insert(formVersions)
        .values({
          eventId,
          version: newVersion,
          schemaSnapshot: questions,
          createdBy: request.user!.id,
        })
        .onConflictDoNothing();

      const [updatedEvent] = await db
        .update(events)
        .set({
          formVersion: newVersion,
          formPublished: true,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();

      return reply.status(200).send({
        success: true,
        formVersion: newVersion,
        formPublished: true,
        event: updatedEvent,
      });
    }
  );

  // 5.9. POST /events/:eventId/form/unpublish (organizer-only)
  server.post(
    '/events/:eventId/form/unpublish',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };

      const [updated] = await db
        .update(events)
        .set({
          formPublished: false,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();

      if (!updated) {
        throw new AppError('NOT_FOUND', `Event '${eventId}' was not found.`, 404);
      }

      return reply.status(200).send({
        success: true,
        formPublished: false,
      });
    }
  );

  // 5.10. GET /events/:eventId/form/versions (organizer-only)
  server.get(
    '/events/:eventId/form/versions',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };

      const versions = await db
        .select()
        .from(formVersions)
        .where(eq(formVersions.eventId, eventId))
        .orderBy(desc(formVersions.version));

      return reply.status(200).send({ versions });
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
  const getResponsesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
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

    // Build filter conditions
    const conditions = [eq(registrations.eventId, eventId)];

    if (query?.status && query.status !== 'ALL') {
      conditions.push(eq(registrations.status, query.status));
    }
    if (query?.paymentStatus && query.paymentStatus !== 'ALL') {
      conditions.push(eq(registrations.paymentStatus, query.paymentStatus));
    }
    if (query?.approvalStatus && query.approvalStatus !== 'ALL') {
      conditions.push(eq(registrations.approvalStatus, query.approvalStatus));
    }
    if (query?.department && query.department !== 'ALL') {
      conditions.push(eq(users.department, query.department));
    }
    if (query?.year && query.year !== 'ALL') {
      conditions.push(eq(users.year, parseInt(query.year, 10)));
    }
    if (query?.team && query.team !== 'ALL') {
      if (query.team === 'WITH_TEAM') {
        conditions.push(sql`${teams.id} IS NOT NULL`);
      } else if (query.team === 'SOLO') {
        conditions.push(sql`${teams.id} IS NULL`);
      } else {
        conditions.push(
          or(eq(teams.id, query.team), ilike(teams.name, `%${query.team}%`))!
        );
      }
    }
    const searchPattern = (query?.search || query?.q || '').trim();
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
    if (query?.checkedIn !== undefined && query?.checkedIn !== 'ALL') {
      const isCheckedIn =
        String(query.checkedIn).toLowerCase() === 'true' ||
        query.checkedIn === true;
      if (isCheckedIn) {
        conditions.push(eq(tickets.status, TicketStatus.CHECKED_IN));
      } else {
        conditions.push(or(isNull(tickets.status), ne(tickets.status, TicketStatus.CHECKED_IN))!);
      }
    }

    // Authoritative event capacity and stats
    const [eventRow] = await db
      .select({
        capacity: events.capacity,
        remainingCapacity: events.remainingCapacity,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    const [statsRow] = await db
      .select({
        total: count(),
        confirmed: count(sql`CASE WHEN ${registrations.status} = 'CONFIRMED' THEN 1 END`),
        waitlisted: count(sql`CASE WHEN ${registrations.status} = 'WAITLISTED' THEN 1 END`),
        cancelled: count(sql`CASE WHEN ${registrations.status} = 'CANCELLED' THEN 1 END`),
        pendingPayments: count(sql`CASE WHEN ${registrations.paymentStatus} = 'PENDING' THEN 1 END`),
      })
      .from(registrations)
      .where(eq(registrations.eventId, eventId));

    const [checkedInRow] = await db
      .select({ count: count() })
      .from(tickets)
      .where(
        and(
          eq(tickets.eventId, eventId),
          eq(tickets.status, TicketStatus.CHECKED_IN)
        )
      );

    const [filterCountResult] = await db
      .select({ count: count() })
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
      .where(and(...conditions));

    const total = Number(filterCountResult?.count ?? 0);

    // Sorting
    let orderByClause = desc(registrations.createdAt);
    const sortOrder = query?.sortOrder === 'asc' ? asc : desc;
    if (query?.sortBy === 'fullName') {
      orderByClause = sortOrder(users.fullName);
    } else if (query?.sortBy === 'rollNumber') {
      orderByClause = sortOrder(users.rollNumber);
    } else if (query?.sortBy === 'status') {
      orderByClause = sortOrder(registrations.status);
    } else if (query?.sortBy === 'checkedInAt') {
      orderByClause = sortOrder(tickets.checkedInAt);
    } else if (query?.sortBy === 'registeredAt') {
      orderByClause = sortOrder(registrations.createdAt);
    }

    const regRows = await db
      .select({
        registrationId: registrations.id,
        status: registrations.status,
        approvalStatus: registrations.approvalStatus,
        formVersion: registrations.formVersion,
        paymentStatus: registrations.paymentStatus,
        registeredAt: registrations.createdAt,
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        rollNumber: users.rollNumber,
        collegeName: users.collegeName,
        department: users.department,
        year: users.year,
        program: users.program,
        phone: users.phone,
        ticketId: tickets.id,
        ticketToken: tickets.token,
        ticketStatus: tickets.status,
        checkedInAt: tickets.checkedInAt,
        checkedInVia: tickets.checkedInVia,
        teamId: teams.id,
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
      .orderBy(orderByClause)
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
      name: r.fullName,
      studentName: r.fullName,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone ?? '',
      rollNumber: r.rollNumber ?? '',
      department: r.department ?? '',
      academicYear: r.year,
      year: r.year,
      collegeName: r.collegeName,
      program: r.program,
      registrationDate: r.registeredAt,
      registeredAt: r.registeredAt,
      registrationStatus: r.status,
      status: r.status,
      approvalStatus: r.approvalStatus ?? 'APPROVED',
      formVersion: r.formVersion ?? 1,
      paymentStatus: r.paymentStatus ?? 'FREE',
      ticketStatus: r.ticketStatus ?? 'VALID',
      checkInStatus: r.ticketStatus === TicketStatus.CHECKED_IN ? 'CHECKED_IN' : 'NOT_CHECKED_IN',
      checkedInAt: r.checkedInAt,
      checkedInVia: r.checkedInVia,
      teamName: r.teamName ?? null,
      user: {
        id: r.userId,
        fullName: r.fullName,
        email: r.email,
        rollNumber: r.rollNumber,
        collegeName: r.collegeName,
        department: r.department,
        year: r.year,
        program: r.program,
        phone: r.phone,
      },
      ticket: r.ticketId
        ? {
            id: r.ticketId,
            token: r.ticketToken,
            ticketNumber: r.ticketToken,
            status: r.ticketStatus,
            checkedInAt: r.checkedInAt,
            checkedInVia: r.checkedInVia,
          }
        : null,
      team: r.teamId
        ? {
            id: r.teamId,
            name: r.teamName,
          }
        : null,
      answers: answersByRegId[r.registrationId] ?? {},
    }));

    const stats = {
      total: Number(statsRow?.total ?? 0),
      confirmed: Number(statsRow?.confirmed ?? 0),
      pendingPayments: Number(statsRow?.pendingPayments ?? 0),
      waitlisted: Number(statsRow?.waitlisted ?? 0),
      cancelled: Number(statsRow?.cancelled ?? 0),
      checkedIn: Number(checkedInRow?.count ?? 0),
      remainingCapacity: eventRow?.remainingCapacity ?? 0,
      remaining: eventRow?.remainingCapacity ?? 0,
      totalCapacity: eventRow?.capacity ?? 0,
    };

    return reply.status(200).send({
      items,
      columns,
      total,
      page,
      limit,
      stats,
    });
  };

  server.get(
    '/events/:eventId/form/responses',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    getResponsesHandler
  );

  server.get(
    '/events/:eventId/attendees',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    getResponsesHandler
  );

  // 8. GET /events/:eventId/form/responses.csv (organizer-only, denies volunteer scanner)
  const getCsvHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    denyScanner(request);
    const { eventId } = request.params as { eventId: string };
    const query = request.query as any;
    await streamResponsesCsv(eventId, reply, query);
  };

  server.get(
    '/events/:eventId/form/responses.csv',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    getCsvHandler
  );

  server.get(
    '/events/:eventId/attendees/csv',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    getCsvHandler
  );

  // 8.5. GET /events/:eventId/attendees/:registrationId (Deep Inspection Modal - 6 Sections)
  server.get(
    '/events/:eventId/attendees/:registrationId',
    { preHandler: [requireAuth, requireEventOrganizer('eventId')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      denyScanner(request);
      const { eventId, registrationId } = request.params as {
        eventId: string;
        registrationId: string;
      };

      const [reg] = await db
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.id, registrationId),
            eq(registrations.eventId, eventId)
          )
        )
        .limit(1);

      if (!reg) {
        throw new AppError('NOT_FOUND', `Registration '${registrationId}' was not found.`, 404);
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, reg.userId))
        .limit(1);

      if (!user) {
        throw new AppError('NOT_FOUND', 'User profile not found.', 404);
      }

      // 1. Form answers with file downloads where authorized
      const answers = await db
        .select()
        .from(bookingAnswers)
        .where(eq(bookingAnswers.registrationId, reg.id));

      const formResponses = await Promise.all(
        answers.map(async (a) => {
          let downloadUrl: string | null = null;
          let fileMetadata: Record<string, any> | null = null;
          const isFile = a.questionTypeSnapshot === 'FILE_UPLOAD';

          if (isFile && a.value && typeof a.value === 'object') {
            const valObj = a.value as Record<string, any>;
            fileMetadata = valObj;
            if (valObj.objectKey) {
              try {
                downloadUrl = await presignGet(valObj.objectKey, 3600);
              } catch {
                downloadUrl = publicUrl(valObj.objectKey);
              }
            }
          }

          return {
            questionId: a.questionId,
            label: a.questionLabelSnapshot,
            type: a.questionTypeSnapshot,
            value: a.value,
            isFile,
            downloadUrl,
            fileMetadata,
          };
        })
      );

      // 2. Ticket telemetry
      const [ticket] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.registrationId, reg.id))
        .limit(1);

      let volunteerInfo = null;
      if (ticket?.checkedInBy) {
        const [volunteer] = await db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, ticket.checkedInBy))
          .limit(1);
        if (volunteer) {
          volunteerInfo = volunteer;
        }
      }

      // 3. Team Details
      let teamInfo = null;
      const [teamMember] = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, reg.userId),
            eq(teamMembers.eventId, eventId)
          )
        )
        .limit(1);

      if (teamMember) {
        const [team] = await db
          .select()
          .from(teams)
          .where(eq(teams.id, teamMember.teamId))
          .limit(1);

        if (team) {
          const roster = await db
            .select({
              userId: teamMembers.userId,
              fullName: users.fullName,
              email: users.email,
              rollNumber: users.rollNumber,
              department: users.department,
              role: teamMembers.role,
              joinedAt: teamMembers.joinedAt,
            })
            .from(teamMembers)
            .innerJoin(users, eq(teamMembers.userId, users.id))
            .where(eq(teamMembers.teamId, team.id));

          const leaderMember = roster.find((m) => m.userId === team.leaderId);
          const leaderName = leaderMember
            ? leaderMember.fullName
            : team.leaderId === reg.userId
              ? user.fullName
              : null;

          teamInfo = {
            id: team.id,
            name: team.name,
            inviteCode: team.inviteCode,
            status: team.status,
            userRole: teamMember.role,
            isLeader: team.leaderId === reg.userId,
            leaderId: team.leaderId,
            leaderName,
            members: roster,
            roster,
          };
        }
      }

      // 4. Event Payment Policy and Records
      const [eventRow] = await db
        .select({
          teamPaymentPolicy: events.teamPaymentPolicy,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      const [paymentRecord] = await db
        .select()
        .from(payments)
        .where(eq(payments.registrationId, reg.id))
        .orderBy(desc(payments.createdAt))
        .limit(1);

      return reply.status(200).send({
        // Section 1: Personal Profile
        personalProfile: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone || 'N/A',
          rollNumber: user.rollNumber || 'N/A',
          collegeName: user.collegeName || 'N/A',
          department: user.department || 'N/A',
          year: user.year !== null && user.year !== undefined ? user.year : 'N/A',
          program: user.program || 'N/A',
          avatarUrl: user.avatarUrl ?? null,
        },
        // Section 2: Event Registration
        registration: {
          id: reg.id,
          status: reg.status,
          approvalStatus: reg.approvalStatus ?? 'APPROVED',
          formVersion: reg.formVersion ?? 1,
          registeredAt: reg.createdAt.toISOString(),
          cancelledAt: reg.cancelledAt?.toISOString() ?? null,
          reviewedBy: reg.reviewedBy ?? null,
          reviewedAt: reg.reviewedAt?.toISOString() ?? null,
          rejectionReason: reg.rejectionReason ?? null,
          cancellationReason: reg.cancellationReason ?? null,
        },
        // Section 3: Custom Form Responses
        formResponses,
        // Section 4: Historical Form Version
        formVersion: reg.formVersion ?? 1,
        // Section 5: Uploaded Documents (Authorized View)
        documents: formResponses
          .filter((f) => f.isFile)
          .map((f) => ({
            questionId: f.questionId,
            label: f.label,
            file: f.fileMetadata,
            downloadUrl: f.downloadUrl,
          })),
        // Section 6: Team Details
        team: teamInfo,
        // Section 7: Payment Information (Razorpay Test Mode)
        payment: {
          status: reg.paymentStatus,
          amountPaise: reg.amountPaise,
          amountRupees: (reg.amountPaise / 100).toFixed(2),
          orderId: paymentRecord?.providerRef ?? null,
          paymentId: paymentRecord?.id ?? null,
          provider: paymentRecord?.provider ?? 'SANDBOX',
          paymentMethod: paymentRecord ? 'RAZORPAY_TEST_MODE' : 'FREE',
          paymentPolicy: eventRow?.teamPaymentPolicy ?? 'INDIVIDUAL',
          testMode: true,
        },
        // Section 8: Ticket Telemetry
        ticket: ticket
          ? {
              id: ticket.id,
              token: ticket.token,
              ticketNumber: ticket.token,
              status: ticket.status,
              checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
              checkedInVia: ticket.checkedInVia ?? null,
            }
          : null,
        // Section 9: Check-in Timestamp
        checkInTimestamp: ticket?.checkedInAt?.toISOString() ?? null,
        // Section 10: Gate and Volunteer Information
        gateCheckIn: {
          ticketId: ticket?.id ?? null,
          ticketNumber: ticket?.token ?? null,
          ticketToken: ticket?.token ?? null,
          status: ticket?.status ?? 'N/A',
          checkedInAt: ticket?.checkedInAt?.toISOString() ?? null,
          checkedInVia: ticket?.checkedInVia ?? null,
          volunteer: volunteerInfo,
        },
      });
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
