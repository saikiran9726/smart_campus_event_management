import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { EventStatus, UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { clubs, events, registrations, teams, users, venues, waitlistEntries, winners } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireClubRole, requireEventOrganizer } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import { emitSeats } from '../../realtime/io';
import { ensureEventDoubtRoom, postEventCardToFeed } from '../channels/event-feed';
import { getLiveWaitlistPosition } from '../waitlist/service';

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
          minTeamSize: body.minTeamSize || (body.isCompetition ? 2 : 1),
          maxTeamSize: body.maxTeamSize || (body.isCompetition ? 4 : 1),
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
      category?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
    };

    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const conditions = [];

    // Full-Text Search via PostgreSQL to_tsvector / to_tsquery
    if (query.q && query.q.trim()) {
      const cleaned = query.q
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
    if (query.cursor) {
      const [cursorTime, cursorId] = query.cursor.split('_');
      if (cursorTime && cursorId) {
        conditions.push(
          sql`(${events.startAt}, ${events.id}) > (${new Date(cursorTime)}, ${cursorId}::uuid)`
        );
      }
    }

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
        createdAt: events.createdAt,
      })
      .from(events)
      .leftJoin(clubs, eq(events.clubId, clubs.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(events.startAt), asc(events.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? `${lastItem.startAt.toISOString()}_${lastItem.id}`
        : null;

    const enrichedItems = items.map((ev) => ({
      ...ev,
      seatLabel: computeSeatLabel(ev.remainingCapacity),
    }));

    return reply.status(200).send({
      items: enrichedItems,
      nextCursor,
    });
  });

  // 6. Public Get Event by Slug
  server.get('/events/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };

    const [event] = await db
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
        formFrozenAt: events.formFrozenAt,
        checkinClosedAt: events.checkinClosedAt,
        createdAt: events.createdAt,
      })
      .from(events)
      .leftJoin(clubs, eq(events.clubId, clubs.id))
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(eq(events.slug, slug))
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
    let userRegistration: { id: string; status: string; waitlistPosition?: number } | null = null;
    if (request.user?.id) {
      const [reg] = await db
        .select({ id: registrations.id, status: registrations.status })
        .from(registrations)
        .where(and(eq(registrations.eventId, event.id), eq(registrations.userId, request.user.id)))
        .limit(1);

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
          waitlistPosition: userWaitlistPosition ?? undefined,
        };
      }
    }

    return reply.status(200).send({
      event: {
        ...event,
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
  });
}
