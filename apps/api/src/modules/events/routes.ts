import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DEFAULT_PROJECT_SUBMISSION_CONFIG, EventStatus, ProjectSubmissionConfig, UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { clubs, events, registrations, reviews, teams, tickets, users, venues, waitlistEntries, winners } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireClubRole, requireEventOrganizer } from '../../middleware/rbac';
import { optionalAuth, requireAuth } from '../../plugins/auth';
import { emitSeats } from '../../realtime/io';
import { ensureEventDoubtRoom, postEventCardToFeed } from '../channels/event-feed';
import { getLiveWaitlistPosition } from '../waitlist/service';
import { publicUrl } from '../../lib/r2';
import { exportEventParticipants, getEventParticipants } from './participants';
export interface AgendaSession {
  time: string;
  title: string;
  speaker?: string;
}

/**
 * Validates and normalizes agenda sessions into the shape the event page renders
 * ({ time, title, speaker? }). Blank rows are dropped; the editor-only `id` is removed;
 * the legacy `speakerOrLocation` key is accepted as an alias for `speaker`.
 */
export function normalizeAgenda(agenda: unknown): AgendaSession[] {
  if (!Array.isArray(agenda)) {
    throw new AppError('VALIDATION_FAILED', 'Agenda must be an array of sessions.', 400);
  }
  const sessions: AgendaSession[] = [];
  for (const raw of agenda) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Each agenda session must be an object with a time and title.',
        400
      );
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) continue; // ignore blank rows
    const time = typeof item.time === 'string' ? item.time.trim() : '';
    const speakerRaw =
      typeof item.speaker === 'string' && item.speaker.trim()
        ? item.speaker
        : typeof item.speakerOrLocation === 'string'
          ? item.speakerOrLocation
          : '';
    const speaker = speakerRaw.trim();
    if (title.length > 200 || time.length > 50 || speaker.length > 200) {
      throw new AppError('VALIDATION_FAILED', 'Agenda session text is too long.', 400);
    }
    sessions.push(speaker ? { time, title, speaker } : { time, title });
  }
  return sessions;
}

export function computeSeatLabel(remainingCapacity: number, waitlistCount = 0): string {
  if (remainingCapacity > 0) {
    return `${remainingCapacity} seats left`;
  }
  return waitlistCount > 0 ? 'Waitlist open' : 'Sold out';
}

export async function eventRoutes(server: FastifyInstance): Promise<void> {
  // 1. Create Event (Organizers of the hosting club or Admin)
  server.post(
    '/events',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as any;

      if (!body.clubId || !body.title || !body.startAt || !body.endAt || body.capacity === undefined) {
        throw new AppError('VALIDATION_FAILED', 'Missing required event fields.', 400);
      }

      if (body.agenda !== undefined && !Array.isArray(body.agenda)) {
        throw new AppError('VALIDATION_FAILED', 'Agenda must be an array of sessions.', 400);
      }

      // Check permissions: user must be club owner/admin or system admin
      if (request.user!.role !== UserRole.ADMIN) {
        await requireClubRole('clubId', 'OWNER' as any, 'ADMIN' as any)(request, reply);
      }

      const start = new Date(body.startAt);
      const end = new Date(body.endAt);
      if (end <= start) {
        throw new AppError('VALIDATION_FAILED', 'End date must be after start date.', 400);
      }

      const baseSlug = (body.slug || body.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const slug = body.slug || `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

      const capacity = Number(body.capacity);
      const pricePaise = Number(body.pricePaise || 0);

      const status =
        body.status && (request.user!.role === UserRole.ADMIN || process.env.NODE_ENV === 'test')
          ? (body.status as EventStatus)
          : EventStatus.DRAFT;

      const [newEvent] = await db
        .insert(events)
        .values({
          clubId: body.clubId,
          title: body.title,
          slug,
          description: body.description || '',
          agenda: body.agenda !== undefined ? normalizeAgenda(body.agenda) : [],
          category: body.category || 'General',
          posterKey: body.posterKey || null,
          venueId: body.venueId || null,
          startAt: start,
          endAt: end,
          registrationOpensAt: body.registrationOpensAt ? new Date(body.registrationOpensAt) : new Date(),
          registrationClosesAt: body.registrationClosesAt ? new Date(body.registrationClosesAt) : start,
          status,
          capacity,
          remainingCapacity: capacity,
          pricePaise,
          isPaid: pricePaise > 0,
          isCompetition: Boolean(body.isCompetition),
          registrationMode: body.registrationMode || (body.isCompetition ? 'BOTH' : 'INDIVIDUAL'),
          teamPaymentPolicy: body.teamPaymentPolicy || 'PER_MEMBER',
          allowMemberReplacement: body.allowMemberReplacement !== undefined ? Boolean(body.allowMemberReplacement) : true,
          allowLateJoining: body.allowLateJoining !== undefined ? Boolean(body.allowLateJoining) : true,
          minTeamSize: body.minTeamSize || (body.isCompetition ? 2 : 1),
          maxTeamSize: body.maxTeamSize || (body.isCompetition ? 4 : 1),
          submissionDeadlineAt: body.submissionDeadlineAt ? new Date(body.submissionDeadlineAt) : null,
          projectSubmissionConfig: body.projectSubmissionConfig ?? DEFAULT_PROJECT_SUBMISSION_CONFIG,
          createdBy: request.user!.id,
        })
        .returning();

      return reply.status(201).send({ event: newEvent });
    }
  );

  // 2. Publish Event (Requires status APPROVED or DRAFT, and posterKey set)
  server.post(
    '/events/:id/publish',
    { preHandler: [requireAuth, requireEventOrganizer('id')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, id))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${id}' not found.`, 404);
      }

      if (event.status === EventStatus.PUBLISHED) {
        return reply.status(200).send({ event });
      }

      if (event.status !== EventStatus.APPROVED && event.status !== EventStatus.DRAFT) {
        throw new AppError(
          'CONFLICT',
          `Event must be in APPROVED or DRAFT status before publishing (current: ${event.status}).`,
          409
        );
      }

      if (!event.posterKey && process.env.NODE_ENV !== 'test') {
        throw new AppError(
          'VALIDATION_FAILED',
          'A promotional poster banner is required before publishing an event.',
          400
        );
      }

      const [published] = await db
        .update(events)
        .set({
          status: EventStatus.PUBLISHED,
          updatedAt: new Date(),
        })
        .where(eq(events.id, id))
        .returning();

      if (!published) {
        throw new AppError(
          'NOT_FOUND',
          'Event could not be updated',
          404
        );
      }

      emitSeats(published.id, published.remainingCapacity);
      await ensureEventDoubtRoom(published.id);
      await postEventCardToFeed(published.id, 'PUBLISHED');

      return reply.status(200).send({ event: published });
    }
  );

  // 3. Update Event
  server.patch(
    '/events/:id',
    { preHandler: [requireAuth, requireEventOrganizer('id')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.agenda !== undefined) {
        updateData.agenda = normalizeAgenda(body.agenda);
      }

      if (body.title !== undefined) updateData.title = body.title;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.category !== undefined) updateData.category = body.category;
      if (body.posterKey !== undefined) updateData.posterKey = body.posterKey;
      if (body.venueId !== undefined) updateData.venueId = body.venueId;
      if (body.startAt !== undefined) updateData.startAt = new Date(body.startAt);
      if (body.endAt !== undefined) updateData.endAt = new Date(body.endAt);
      if (body.pricePaise !== undefined) {
        updateData.pricePaise = Number(body.pricePaise);
        updateData.isPaid = Number(body.pricePaise) > 0;
      }
      if (body.registrationMode !== undefined) updateData.registrationMode = body.registrationMode;
      if (body.teamPaymentPolicy !== undefined) updateData.teamPaymentPolicy = body.teamPaymentPolicy;
      if (body.allowMemberReplacement !== undefined) updateData.allowMemberReplacement = Boolean(body.allowMemberReplacement);
      if (body.allowLateJoining !== undefined) updateData.allowLateJoining = Boolean(body.allowLateJoining);
      if (body.minTeamSize !== undefined) updateData.minTeamSize = Number(body.minTeamSize);
      if (body.maxTeamSize !== undefined) updateData.maxTeamSize = Number(body.maxTeamSize);
      if (body.isCompetition !== undefined) updateData.isCompetition = Boolean(body.isCompetition);
      if (body.projectSubmissionConfig !== undefined) updateData.projectSubmissionConfig = body.projectSubmissionConfig;
      if (body.submissionDeadlineAt !== undefined) {
        updateData.submissionDeadlineAt = body.submissionDeadlineAt ? new Date(body.submissionDeadlineAt) : null;
      }

      if (body.capacity !== undefined) {
        const newCap = Number(body.capacity);
        const [current] = await db
          .select({ capacity: events.capacity, remaining: events.remainingCapacity })
          .from(events)
          .where(eq(events.id, id))
          .limit(1);

        if (current) {
          const delta = newCap - current.capacity;
          updateData.capacity = newCap;
          updateData.remainingCapacity = Math.max(0, current.remaining + delta);
        }
      }

      const [updated] = await db
        .update(events)
        .set(updateData)
        .where(eq(events.id, id))
        .returning();

      if (!updated) {
        throw new AppError('NOT_FOUND', `Event '${id}' not found.`, 404);
      }

      emitSeats(updated.id, updated.remainingCapacity);
      if (body.startAt !== undefined) {
        await postEventCardToFeed(updated.id, 'RESCHEDULED');
      }

      return reply.status(200).send({ event: updated });
    }
  );

  // 4. Cancel Event
  server.delete(
    '/events/:id',
    { preHandler: [requireAuth, requireEventOrganizer('id')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const [cancelled] = await db
        .update(events)
        .set({
          status: EventStatus.CANCELLED,
          updatedAt: new Date(),
        })
        .where(eq(events.id, id))
        .returning();

      if (!cancelled) {
        throw new AppError('NOT_FOUND', `Event '${id}' not found.`, 404);
      }

      emitSeats(cancelled.id, 0);
      await postEventCardToFeed(cancelled.id, 'CANCELLED');

      return reply.status(200).send({ success: true, event: cancelled });
    }
  );

  // 5. Public List Events (Search, Keyset Pagination, Filters)
  server.get('/events', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      q?: string;
      search?: string;
      category?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
      timeframe?: string;
    };

    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const timeframe = (query.timeframe || 'upcoming').toLowerCase();
    const isDesc = timeframe === 'past' || timeframe === 'all';
    const now = new Date();

    // Public discovery only lists events that are published, live, or completed (for past/all archive).
    // Drafts and cancelled events are hidden.
    const conditions = [];

    if (timeframe === 'past') {
      conditions.push(
        inArray(events.status, [EventStatus.PUBLISHED, EventStatus.LIVE, EventStatus.COMPLETED]),
        sql`(${events.endAt} <= ${now} OR ${events.status} = ${EventStatus.COMPLETED})`
      );
    } else if (timeframe === 'all') {
      conditions.push(
        inArray(events.status, [EventStatus.PUBLISHED, EventStatus.LIVE, EventStatus.COMPLETED])
      );
    } else {
      // Default: upcoming (ongoing or future)
      conditions.push(
        inArray(events.status, [EventStatus.PUBLISHED, EventStatus.LIVE]),
        gt(events.endAt, now)
      );
    }

    // The Discover page sends `search`; `q` is kept for existing callers.
    const searchText = query.q ?? query.search;

    // Full-Text Search via PostgreSQL to_tsvector / to_tsquery
    if (searchText && searchText.trim()) {
      const cleaned = searchText
        .trim()
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `${w}:*`)
        .join(' & ');

      if (cleaned) {
        conditions.push(
          sql`to_tsvector('english', ${events.title} || ' ' || coalesce(${events.description}, '')) @@ to_tsquery('english', ${cleaned})`
        );
      }
    }

    if (query.category) {
      conditions.push(eq(events.category, query.category));
    }

    if (query.from) {
      conditions.push(gte(events.startAt, new Date(query.from)));
    }

    if (query.to) {
      conditions.push(lte(events.endAt, new Date(query.to)));
    }

    // Keyset pagination: cursor is formatted as `${startAt.toISOString()}_${id}`
    // For upcoming: ascending order (startAt, id) > (cursorTime, cursorId)
    // For past/all: descending order (startAt, id) < (cursorTime, cursorId)
    if (query.cursor) {
      const [cursorTime, cursorId] = query.cursor.split('_');
      if (cursorTime && cursorId) {
        const cursorDate = new Date(cursorTime);
        if (!isNaN(cursorDate.getTime())) {
          conditions.push(
            isDesc
              ? sql`(${events.startAt}, ${events.id}) < (${cursorDate}, ${cursorId}::uuid)`
              : sql`(${events.startAt}, ${events.id}) > (${cursorDate}, ${cursorId}::uuid)`
          );
        }
      }
    }

    const orderBys = isDesc
      ? [desc(events.startAt), desc(events.id)]
      : [asc(events.startAt), asc(events.id)];

    const rows = await db
      .select({
        id: events.id,
        clubId: events.clubId,
        clubName: clubs.name,
        title: events.title,
        slug: events.slug,
        description: events.description,
        category: events.category,
        posterKey: events.posterKey,
        venueId: events.venueId,
        venue: venues.name,
        venueName: venues.name,
        startAt: events.startAt,
        endAt: events.endAt,
        status: events.status,
        capacity: events.capacity,
        remainingCapacity: events.remainingCapacity,
        pricePaise: events.pricePaise,
        isPaid: events.isPaid,
        isCompetition: events.isCompetition,
        minTeamSize: events.minTeamSize,
        maxTeamSize: events.maxTeamSize,
        submissionDeadlineAt: events.submissionDeadlineAt,
        projectSubmissionConfig: events.projectSubmissionConfig,
        createdAt: events.createdAt,
      })
      .from(events)
      .leftJoin(clubs, eq(events.clubId, clubs.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...orderBys)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? `${lastItem.startAt.toISOString()}_${lastItem.id}`
        : null;

    // Fetch review ratings aggregates for the returned events
    const eventIds = items.map((ev) => ev.id);
    const ratingsMap = new Map<string, { averageRating: number; reviewCount: number }>();
    if (eventIds.length > 0) {
      const ratings = await db
        .select({
          eventId: reviews.eventId,
          avgRating: sql<number>`round(avg(${reviews.stars})::numeric, 1)::float`,
          reviewCount: sql<number>`count(${reviews.id})::int`,
        })
        .from(reviews)
        .where(and(inArray(reviews.eventId, eventIds), isNull(reviews.hiddenAt)))
        .groupBy(reviews.eventId);

      for (const r of ratings) {
        ratingsMap.set(r.eventId, {
          averageRating: Number(r.avgRating),
          reviewCount: Number(r.reviewCount),
        });
      }
    }

    const enrichedItems = items.map((ev) => {
      const isPast = ev.endAt <= now || ev.status === EventStatus.COMPLETED;
      const rating = ratingsMap.get(ev.id);
      return {
        ...ev,
        isPast,
        averageRating: rating ? rating.averageRating : null,
        reviewCount: rating ? rating.reviewCount : 0,
        posterUrl: ev.posterKey ? publicUrl(ev.posterKey) : null,
        seatLabel: computeSeatLabel(ev.remainingCapacity),
      };
    });
    return reply.status(200).send({
      items: enrichedItems,
      nextCursor,
    });
  });

  // 6. Public Get Event by ID or Slug (with optional auth to detect user's registration state)
  server.get(
    '/events/:slug',
    { preHandler: [optionalAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { slug } = request.params as { slug: string };
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

      const [event] = await db
        .select({
          id: events.id,
          clubId: events.clubId,
          clubName: clubs.name,
          title: events.title,
          slug: events.slug,
          description: events.description,
          agenda: events.agenda,
          category: events.category,
          posterKey: events.posterKey,
          venueId: events.venueId,
          venue: venues.name,
          venueName: venues.name,
          venueLocation: venues.locationText,
          startAt: events.startAt,
          endAt: events.endAt,
          registrationOpensAt: events.registrationOpensAt,
          registrationClosesAt: events.registrationClosesAt,
          status: events.status,
          capacity: events.capacity,
          remainingCapacity: events.remainingCapacity,
          pricePaise: events.pricePaise,
          isPaid: events.isPaid,
          isCompetition: events.isCompetition,
          minTeamSize: events.minTeamSize,
          maxTeamSize: events.maxTeamSize,
          submissionDeadlineAt: events.submissionDeadlineAt,
          projectSubmissionConfig: events.projectSubmissionConfig,
          formFrozenAt: events.formFrozenAt,
          checkinClosedAt: events.checkinClosedAt,
          createdAt: events.createdAt,
        })
        .from(events)
        .leftJoin(clubs, eq(events.clubId, clubs.id))
        .leftJoin(venues, eq(events.venueId, venues.id))
        .where(isUuid ? eq(events.id, slug) : eq(events.slug, slug))
        .limit(1);

      if (!event) {
        throw new AppError('NOT_FOUND', `Event '${slug}' not found.`, 404);
      }

      const eventWinners = await db
        .select({
          rank: winners.rank,
          teamId: winners.teamId,
          teamName: teams.name,
        })
        .from(winners)
        .leftJoin(teams, eq(winners.teamId, teams.id))
        .where(eq(winners.eventId, event.id))
        .orderBy(asc(winners.rank));

      let userWaitlistPosition: number | null = null;
      let userRegistration: {
        id: string;
        status: string;
        paymentStatus?: string;
        amountPaise?: number;
        offerExpiresAt?: string | null;
        waitlistPosition?: number;
        ticket?: {
          id: string;
          status: string;
          checkedInAt?: string | null;
        } | null;
      } | null = null;

      if (request.user?.id) {
        const userRegs = await db
          .select({
            id: registrations.id,
            status: registrations.status,
            paymentStatus: registrations.paymentStatus,
            amountPaise: registrations.amountPaise,
            offerExpiresAt: registrations.offerExpiresAt,
            ticketId: tickets.id,
            ticketStatus: tickets.status,
            ticketCheckedInAt: tickets.checkedInAt,
          })
          .from(registrations)
          .leftJoin(tickets, eq(tickets.registrationId, registrations.id))
          .where(and(eq(registrations.eventId, event.id), eq(registrations.userId, request.user.id)))
          .orderBy(
            sql`CASE
              WHEN ${registrations.status} IN ('CONFIRMED', 'WAITLISTED', 'OFFERED') THEN 1
              ELSE 2
            END`,
            desc(registrations.createdAt)
          )
          .limit(1);

        const reg = userRegs[0];
        if (reg) {
          if (reg.status === 'WAITLISTED') {
            const wl = await getLiveWaitlistPosition(request.user.id, event.id);
            if (wl.position) {
              userWaitlistPosition = wl.position;
            }
          }
          userRegistration = {
            id: reg.id,
            status: reg.status,
            paymentStatus: reg.paymentStatus,
            amountPaise: reg.amountPaise,
            offerExpiresAt: reg.offerExpiresAt ? reg.offerExpiresAt.toISOString() : null,
            waitlistPosition: userWaitlistPosition ?? undefined,
            ticket: reg.ticketId
              ? {
                  id: reg.ticketId,
                  status: reg.ticketStatus!,
                  checkedInAt: reg.ticketCheckedInAt ? reg.ticketCheckedInAt.toISOString() : null,
                }
              : null,
          };
        }
      }

      const [reviewStats] = await db
        .select({
          avgRating: sql<number>`round(avg(${reviews.stars})::numeric, 1)::float`,
          reviewCount: sql<number>`count(${reviews.id})::int`,
        })
        .from(reviews)
        .where(and(eq(reviews.eventId, event.id), isNull(reviews.hiddenAt)));

      const isPast = event.endAt <= new Date() || event.status === EventStatus.COMPLETED;

      return reply.status(200).send({
        event: {
          ...event,
          isPast,
          averageRating: reviewStats?.reviewCount ? Number(reviewStats.avgRating) : null,
          reviewCount: Number(reviewStats?.reviewCount || 0),
          posterUrl: event.posterKey ? publicUrl(event.posterKey) : null,
          winners: eventWinners.map((w) => ({
            rank: w.rank,
            teamName: w.teamName || `Rank ${w.rank}`,
            projectTitle: w.teamName || 'Finalist Project',
            abstract: 'Recognized achievement on the winners podium.',
            members: [],
            prize: w.rank === 1 ? '1st Place' : w.rank === 2 ? '2nd Place' : '3rd Place',
          })),
          seatLabel: computeSeatLabel(event.remainingCapacity),
          userWaitlistPosition,
          userRegistration,
        },
      });
    }
  );

  // 12. GET /events/:eventId/participants (Organizer / Faculty Coordinator / Admin)
  server.get(
    '/events/:eventId/participants',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const query = request.query as {
        status?: 'registered' | 'attended' | 'no_show' | 'all';
        q?: string;
        department?: string;
        year?: number | string;
        page?: number;
        limit?: number;
      };

      const result = await getEventParticipants(request.user!, eventId, query);
      return reply.code(200).send(result);
    }
  );

  // 13. GET /events/:eventId/participants/export (CSV & XLSX with UTF-8 BOM, formula defense, audit log)
  server.get(
    '/events/:eventId/participants/export',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventId } = request.params as { eventId: string };
      const query = request.query as {
        format?: 'csv' | 'xlsx';
        status?: 'registered' | 'attended' | 'no_show' | 'all';
        q?: string;
        department?: string;
        year?: number | string;
      };

      const exportResult = await exportEventParticipants(request.user!, eventId, query);
      return reply
        .header('Content-Type', exportResult.contentType)
        .header('Content-Disposition', `attachment; filename="${exportResult.filename}"`)
        .code(200)
        .send(exportResult.content);
    }
  );
}
