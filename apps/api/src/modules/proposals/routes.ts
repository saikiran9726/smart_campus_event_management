import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ClubMemberRole,
  EventStatus,
  NotificationChannel,
  NotificationKind,
  ProposalStatus,
  UserRole,
} from '@eventora/shared';
import { db, withTx } from '../../db/client';
import {
  avResources,
  clubs,
  eventAvBookings,
  eventProposals,
  events,
  notifications,
  proposalAvRequests,
  users,
  venueBookings,
  venues,
} from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { consumeJti, signApprovalToken, verifyApprovalToken } from '../../lib/magic-link';
import { requireClubRole, requireFaculty } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';

interface AvRequestItem {
  avResourceId: string;
  quantity: number;
}

export async function proposalRoutes(server: FastifyInstance): Promise<void> {
  // 1. Submit Event Proposal (Club Owner/Admin)
  server.post(
    '/clubs/:clubId/proposals',
    {
      preHandler: [
        requireAuth,
        requireClubRole('clubId', ClubMemberRole.OWNER, ClubMemberRole.ADMIN),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clubId } = request.params as { clubId: string };
      const body = request.body as {
        title: string;
        description: string;
        expectedAttendance: number;
        venueId: string;
        startAt: string;
        endAt: string;
        avRequests?: AvRequestItem[];
      };

      if (!body.title || !body.description || !body.venueId || !body.startAt || !body.endAt) {
        throw new AppError('VALIDATION_FAILED', 'Missing required proposal fields.', 400);
      }

      const start = new Date(body.startAt);
      const end = new Date(body.endAt);
      if (end <= start) {
        throw new AppError('VALIDATION_FAILED', 'End time must be after start time.', 400);
      }

      // Check venue existence and capacity
      const [venue] = await db
        .select()
        .from(venues)
        .where(eq(venues.id, body.venueId))
        .limit(1);

      if (!venue) {
        throw new AppError('NOT_FOUND', `Venue '${body.venueId}' not found.`, 404);
      }

      if (body.expectedAttendance > venue.capacity) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Venue capacity (${venue.capacity}) is less than expected attendance (${body.expectedAttendance}).`,
          400,
          { venueCapacity: venue.capacity, expectedAttendance: body.expectedAttendance }
        );
      }

      // Execute collision checks and proposal creation in ONE atomic transaction
      const createdProposal = await withTx(async (tx) => {
        // (a) Venue Hold & Collision Check via EXCLUDE constraint
        try {
          await tx.insert(venueBookings).values({
            venueId: venue.id,
            during: sql`tstzrange(${body.startAt}::timestamptz, ${body.endAt}::timestamptz, '[)')` as any,
            status: 'PENDING_HOLD',
          });
        } catch (err: any) {
          if (err?.code === '23P01' || err?.cause?.code === '23P01') {
            // Exclusion constraint violation
            const [conflicting] = await db
              .select({
                venueId: venueBookings.venueId,
                status: venueBookings.status,
                eventTitle: events.title,
                proposalTitle: eventProposals.title,
              })
              .from(venueBookings)
              .leftJoin(events, eq(venueBookings.eventId, events.id))
              .leftJoin(eventProposals, eq(venueBookings.proposalId, eventProposals.id))
              .where(
                and(
                  eq(venueBookings.venueId, venue.id),
                  sql`venue_bookings.during && tstzrange(${body.startAt}::timestamptz, ${body.endAt}::timestamptz, '[)')`,
                  sql`venue_bookings.status IN ('ACTIVE', 'PENDING_HOLD')`
                )
              )
              .limit(1);

            throw new AppError(
              'VENUE_CONFLICT',
              `The selected venue '${venue.name}' is already reserved or held for another event during this window.`,
              409,
              {
                venueId: venue.id,
                venueName: venue.name,
                conflictingTitle: conflicting?.eventTitle ?? conflicting?.proposalTitle ?? 'Scheduled Event',
                window: `${body.startAt} - ${body.endAt}`,
              }
            );
          }
          throw err;
        }

        // (b) AV Resources Collision Check
        const avList = body.avRequests ?? [];
        if (avList.length > 0) {
          const resourceIds = avList.map((r) => r.avResourceId);

          // Lock AV resource rows
          const resources = await tx
            .select()
            .from(avResources)
            .where(inArray(avResources.id, resourceIds))
            .for('update');

          for (const reqItem of avList) {
            const resource = resources.find((r) => r.id === reqItem.avResourceId);
            if (!resource) {
              throw new AppError(
                'NOT_FOUND',
                `AV resource '${reqItem.avResourceId}' does not exist.`,
                404
              );
            }

            // Sum quantities from active event bookings
            const [eventResSum] = await tx
              .select({
                total: sql<number>`coalesce(sum(${eventAvBookings.quantity}), 0)`,
              })
              .from(eventAvBookings)
              .where(
                and(
                  eq(eventAvBookings.avResourceId, resource.id),
                  sql`${eventAvBookings.during} && tstzrange(${body.startAt}::timestamptz, ${body.endAt}::timestamptz, '[)')`
                )
              );

            // Sum quantities from pending proposal requests
            const [propResSum] = await tx
              .select({
                total: sql<number>`coalesce(sum(${proposalAvRequests.quantity}), 0)`,
              })
              .from(proposalAvRequests)
              .innerJoin(eventProposals, eq(proposalAvRequests.proposalId, eventProposals.id))
              .innerJoin(venueBookings, eq(venueBookings.proposalId, eventProposals.id))
              .where(
                and(
                  eq(proposalAvRequests.avResourceId, resource.id),
                  eq(eventProposals.status, ProposalStatus.PENDING),
                  sql`${venueBookings.during} && tstzrange(${body.startAt}::timestamptz, ${body.endAt}::timestamptz, '[)')`
                )
              );

            const totalReserved = Number(eventResSum?.total ?? 0) + Number(propResSum?.total ?? 0);
            if (reqItem.quantity + totalReserved > resource.quantity) {
              const available = Math.max(0, resource.quantity - totalReserved);
              throw new AppError(
                'AV_CONFLICT',
                `Insufficient equipment for AV resource '${resource.name}'. Available: ${available}, Requested: ${reqItem.quantity}`,
                409,
                {
                  avResourceId: resource.id,
                  name: resource.name,
                  available,
                  requested: reqItem.quantity,
                  totalCapacity: resource.quantity,
                }
              );
            }
          }
        }

        // (c) Resolve Faculty Coordinator for Club
        const [club] = await tx
          .select({ facultyCoordinatorId: clubs.facultyCoordinatorId })
          .from(clubs)
          .where(eq(clubs.id, clubId))
          .limit(1);

        let facultyId = club?.facultyCoordinatorId;
        if (!facultyId) {
          const [anyFaculty] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, UserRole.FACULTY))
            .limit(1);
          facultyId = anyFaculty?.id ?? request.user!.id;
        }

        // (d) Insert Proposal
        const [proposal] = await tx
          .insert(eventProposals)
          .values({
            clubId,
            proposedBy: request.user!.id,
            title: body.title,
            description: body.description,
            expectedAttendance: body.expectedAttendance,
            venueId: venue.id,
            startAt: start,
            endAt: end,
            status: ProposalStatus.PENDING,
            facultyId,
          })
          .returning();

        if (!proposal) {
          throw new AppError(
            'CONFLICT',
            'Failed to record proposal',
            500
          );
        }

        // (e) Link Venue Booking to Proposal
        await tx
          .update(venueBookings)
          .set({ proposalId: proposal.id })
          .where(
            and(
              eq(venueBookings.venueId, venue.id),
              eq(venueBookings.status, 'PENDING_HOLD'),
              isNull(venueBookings.proposalId)
            )
          );

        // (f) Record AV Requests
        if (avList.length > 0) {
          await tx.insert(proposalAvRequests).values(
            avList.map((reqItem) => ({
              proposalId: proposal.id,
              avResourceId: reqItem.avResourceId,
              quantity: reqItem.quantity,
            }))
          );
        }

        // (g) Generate Magic Link Tokens for Faculty Approval and Rejection
        const approveTokenData = await signApprovalToken({
          proposalId: proposal.id,
          facultyId,
          action: 'APPROVE',
          dbOrTx: tx,
        });

        const rejectTokenData = await signApprovalToken({
          proposalId: proposal.id,
          facultyId,
          action: 'REJECT',
          dbOrTx: tx,
        });

        const approveUrl = `${env.PUBLIC_WEB_URL}/faculty/decision?token=${approveTokenData.token}`;
        const rejectUrl = `${env.PUBLIC_WEB_URL}/faculty/decision?token=${rejectTokenData.token}`;

        // (h) Enqueue Notification for Faculty Coordinator
        await tx.insert(notifications).values({
          userId: facultyId,
          kind: NotificationKind.FACULTY_APPROVAL,
          channel: NotificationChannel.EMAIL,
          payload: {
            proposalId: proposal.id,
            title: proposal.title,
            clubId,
            approveUrl,
            rejectUrl,
          },
          status: 'QUEUED',
        });

        return {
          ...proposal,
          approveUrl,
          rejectUrl,
        };
      });

      return reply.status(201).send({ proposal: createdProposal });
    }
  );

  // 1.5. GET /public/faculty/preview (Zero login required via Magic Link Token)
  server.get(
    '/public/faculty/preview',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { token } = request.query as { token?: string };
        if (!token) {
          throw new AppError('VALIDATION_FAILED', 'Approval token is required.', 400);
        }

        // Verify token cryptographic signature, expiry, and JTI status without consuming
        const tokenData = await verifyApprovalToken(token);

        const [proposal] = await db
          .select()
          .from(eventProposals)
          .where(eq(eventProposals.id, tokenData.proposalId))
          .limit(1);

        if (!proposal) {
          throw new AppError('NOT_FOUND', 'Associated proposal not found.', 404);
        }

        const [club] = await db
          .select({
            id: clubs.id,
            name: clubs.name,
            slug: clubs.slug,
            description: clubs.description,
          })
          .from(clubs)
          .where(eq(clubs.id, proposal.clubId))
          .limit(1);

        let venue = null;
        if (proposal.venueId) {
          const [v] = await db
            .select({
              id: venues.id,
              name: venues.name,
              capacity: venues.capacity,
              locationText: venues.locationText,
              mapUrl: venues.mapUrl,
            })
            .from(venues)
            .where(eq(venues.id, proposal.venueId))
            .limit(1);
          venue = v ?? null;
        }

        const avRequests = await db
          .select({
            avResourceId: proposalAvRequests.avResourceId,
            quantity: proposalAvRequests.quantity,
            name: avResources.name,
            kind: avResources.kind,
            totalQuantity: avResources.quantity,
          })
          .from(proposalAvRequests)
          .innerJoin(avResources, eq(proposalAvRequests.avResourceId, avResources.id))
          .where(eq(proposalAvRequests.proposalId, proposal.id));

        const startIso = new Date(proposal.startAt).toISOString();
        const endIso = new Date(proposal.endAt).toISOString();

        // Conflict audit: check conflicting venue bookings
        let conflictingVenueBookings: any[] = [];
        if (proposal.venueId) {
          conflictingVenueBookings = await db
            .select({
              bookingId: venueBookings.id,
              status: venueBookings.status,
              eventTitle: events.title,
              proposalTitle: eventProposals.title,
            })
            .from(venueBookings)
            .leftJoin(events, eq(venueBookings.eventId, events.id))
            .leftJoin(eventProposals, eq(venueBookings.proposalId, eventProposals.id))
            .where(
              and(
                eq(venueBookings.venueId, proposal.venueId),
                sql`venue_bookings.during && tstzrange(${startIso}::timestamptz, ${endIso}::timestamptz, '[)')`,
                sql`venue_bookings.status IN ('ACTIVE', 'PENDING_HOLD')`,
                sql`(venue_bookings.proposal_id IS NULL OR venue_bookings.proposal_id != ${proposal.id})`
              )
            );
        }

        // Conflict audit: check AV requests
        const conflictingAv: any[] = [];
        for (const req of avRequests) {
          const [eventSum] = await db
            .select({ total: sql<number>`coalesce(sum(${eventAvBookings.quantity}), 0)` })
            .from(eventAvBookings)
            .where(
              and(
                eq(eventAvBookings.avResourceId, req.avResourceId),
                sql`${eventAvBookings.during} && tstzrange(${startIso}::timestamptz, ${endIso}::timestamptz, '[)')`
              )
            );
          const [propSum] = await db
            .select({ total: sql<number>`coalesce(sum(${proposalAvRequests.quantity}), 0)` })
            .from(proposalAvRequests)
            .innerJoin(eventProposals, eq(proposalAvRequests.proposalId, eventProposals.id))
            .innerJoin(venueBookings, eq(venueBookings.proposalId, eventProposals.id))
            .where(
              and(
                eq(proposalAvRequests.avResourceId, req.avResourceId),
                eq(eventProposals.status, ProposalStatus.PENDING),
                ne(eventProposals.id, proposal.id),
                sql`${venueBookings.during} && tstzrange(${startIso}::timestamptz, ${endIso}::timestamptz, '[)')`
              )
            );
          const totalOtherReserved = Number(eventSum?.total ?? 0) + Number(propSum?.total ?? 0);
          if (req.quantity + totalOtherReserved > req.totalQuantity) {
            conflictingAv.push({
              avResourceId: req.avResourceId,
              name: req.name,
              requested: req.quantity,
              available: Math.max(0, req.totalQuantity - totalOtherReserved),
            });
          }
        }

        const hasConflicts = conflictingVenueBookings.length > 0 || conflictingAv.length > 0;

        return reply.status(200).send({
          proposal: {
            id: proposal.id,
            title: proposal.title,
            description: proposal.description,
            expectedAttendance: proposal.expectedAttendance,
            startAt: startIso,
            endAt: endIso,
            status: proposal.status,
            createdAt: new Date(proposal.createdAt).toISOString(),
          },
          club: club ?? { id: proposal.clubId, name: 'Campus Club', slug: 'campus-club' },
          window: {
            startAt: startIso,
            endAt: endIso,
          },
          venue: venue ?? null,
          avRequests,
          conflictAudit: {
            hasConflicts,
            venueConflicts: conflictingVenueBookings.map((b) => ({
              title: b.eventTitle || b.proposalTitle || 'Conflicting Booking',
              status: b.status,
            })),
            avConflicts: conflictingAv,
          },
          tokenAction: tokenData.action,
        });
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        console.error('SERVER ERROR IN GET /public/faculty/preview:', err);
        throw err;
      }
    }
  );

  // 2. Public Faculty Decision (Zero Login Required via Magic Link Token)
  server.post(
    '/public/faculty/decision',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { token?: string; action?: 'APPROVE' | 'REJECT' };
      if (!body.token) {
        throw new AppError('VALIDATION_FAILED', 'Approval token is required.', 400);
      }

      // Verify token cryptographic signature, expiry, and JTI status
      const tokenData = await verifyApprovalToken(body.token);
      const actionToTake = body.action || tokenData.action;

      const result = await withTx(async (tx) => {
        // Atomically consume JTI and invalidate sibling token
        await consumeJti(tokenData.jti, tx as any);

        const [proposal] = await tx
          .select()
          .from(eventProposals)
          .where(eq(eventProposals.id, tokenData.proposalId))
          .limit(1);

        if (!proposal) {
          throw new AppError('NOT_FOUND', 'Associated proposal not found.', 404);
        }

        if (actionToTake === 'APPROVE') {
          // Update proposal status
          await tx
            .update(eventProposals)
            .set({
              status: ProposalStatus.APPROVED,
              decidedAt: new Date(),
              facultyId: tokenData.facultyId,
            })
            .where(eq(eventProposals.id, proposal.id));

          // Convert PENDING_HOLD venue booking to ACTIVE
          await tx
            .update(venueBookings)
            .set({ status: 'ACTIVE' })
            .where(eq(venueBookings.proposalId, proposal.id));

          // Fetch venue details
          let capacity = proposal.expectedAttendance;
          if (proposal.venueId) {
            const [venue] = await tx
              .select({ capacity: venues.capacity })
              .from(venues)
              .where(eq(venues.id, proposal.venueId))
              .limit(1);

            if (venue) {
              capacity =
                proposal.expectedAttendance > 0 &&
                proposal.expectedAttendance < venue.capacity
                  ? proposal.expectedAttendance
                  : venue.capacity;
            }
          }

          const baseSlug = proposal.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
          const slug = `${baseSlug}-${proposal.id.slice(0, 8)}`;

          // Create event record in APPROVED status
          const [newEvent] = await tx
            .insert(events)
            .values({
              clubId: proposal.clubId,
              proposalId: proposal.id,
              title: proposal.title,
              slug,
              description: proposal.description,
              category: 'Campus Event',
              venueId: proposal.venueId,
              startAt: proposal.startAt,
              endAt: proposal.endAt,
              registrationOpensAt: new Date(),
              registrationClosesAt: proposal.startAt,
              status: EventStatus.APPROVED,
              capacity,
              remainingCapacity: capacity,
              pricePaise: 0,
              isPaid: false,
              createdBy: proposal.proposedBy,
            })
            .returning();

          if (!newEvent) {
            throw new AppError(
              'CONFLICT',
              'Failed to create event from proposal',
              500
            );
          }

          // Link venue booking to event
          await tx
            .update(venueBookings)
            .set({ eventId: newEvent.id })
            .where(eq(venueBookings.proposalId, proposal.id));

          // Copy AV requests to event_av_bookings
          const avRequests = await tx
            .select()
            .from(proposalAvRequests)
            .where(eq(proposalAvRequests.proposalId, proposal.id));

          if (avRequests.length > 0) {
            await tx.insert(eventAvBookings).values(
              avRequests.map((req) => ({
                eventId: newEvent.id,
                avResourceId: req.avResourceId,
                quantity: req.quantity,
                during: sql`tstzrange(${proposal.startAt.toISOString()}::timestamptz, ${proposal.endAt.toISOString()}::timestamptz, '[)')` as any,
              }))
            );
          }

          return {
            outcome: 'APPROVED',
            proposalTitle: proposal.title,
            eventId: newEvent.id,
          };
        } else {
          // Reject action
          await tx
            .update(eventProposals)
            .set({
              status: ProposalStatus.REJECTED,
              decidedAt: new Date(),
              facultyId: tokenData.facultyId,
            })
            .where(eq(eventProposals.id, proposal.id));

          // Release hold
          await tx
            .delete(venueBookings)
            .where(eq(venueBookings.proposalId, proposal.id));

          return {
            outcome: 'REJECTED',
            proposalTitle: proposal.title,
          };
        }
      });

      return reply.status(200).send(result);
    }
  );

  // 3. Venue Availability Query
  server.get('/venues/availability', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { venueId?: string; from?: string; to?: string };
    if (!query.venueId || !query.from || !query.to) {
      throw new AppError('VALIDATION_FAILED', 'venueId, from, and to are required.', 400);
    }

    const bookings = await db
      .select({
        id: venueBookings.id,
        during: venueBookings.during,
        status: venueBookings.status,
      })
      .from(venueBookings)
      .where(
        and(
          eq(venueBookings.venueId, query.venueId),
          sql`venue_bookings.during && tstzrange(${query.from}::timestamptz, ${query.to}::timestamptz, '[)')`,
          sql`venue_bookings.status IN ('ACTIVE', 'PENDING_HOLD')`
        )
      );

    return reply.status(200).send({
      venueId: query.venueId,
      from: query.from,
      to: query.to,
      isAvailable: bookings.length === 0,
      overlappingBookings: bookings,
    });
  });

  // 4. AV Resources Availability Query
  server.get('/av/availability', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to) {
      throw new AppError('VALIDATION_FAILED', 'from and to parameters are required.', 400);
    }

    const resources = await db.select().from(avResources);

    const results = [];
    for (const res of resources) {
      const [eventSum] = await db
        .select({
          total: sql<number>`coalesce(sum(${eventAvBookings.quantity}), 0)`,
        })
        .from(eventAvBookings)
        .where(
          and(
            eq(eventAvBookings.avResourceId, res.id),
            sql`${eventAvBookings.during} && tstzrange(${query.from}::timestamptz, ${query.to}::timestamptz, '[)')`
          )
        );

      const [propSum] = await db
        .select({
          total: sql<number>`coalesce(sum(${proposalAvRequests.quantity}), 0)`,
        })
        .from(proposalAvRequests)
        .innerJoin(eventProposals, eq(proposalAvRequests.proposalId, eventProposals.id))
        .innerJoin(venueBookings, eq(venueBookings.proposalId, eventProposals.id))
        .where(
          and(
            eq(proposalAvRequests.avResourceId, res.id),
            eq(eventProposals.status, ProposalStatus.PENDING),
            sql`${venueBookings.during} && tstzrange(${query.from}::timestamptz, ${query.to}::timestamptz, '[)')`
          )
        );

      const reserved = Number(eventSum?.total ?? 0) + Number(propSum?.total ?? 0);
      const remaining = Math.max(0, res.quantity - reserved);

      results.push({
        id: res.id,
        name: res.name,
        kind: res.kind,
        totalQuantity: res.quantity,
        reservedQuantity: reserved,
        remainingQuantity: remaining,
      });
    }

    return reply.status(200).send({ items: results });
  });

  // 5. Faculty Proposals List
  server.get(
    '/faculty/proposals',
    { preHandler: [requireAuth, requireFaculty] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;

      const queryConditions =
        user.role === UserRole.ADMIN
          ? undefined
          : eq(eventProposals.facultyId, user.id);

      const proposals = await db
        .select({
          id: eventProposals.id,
          clubId: eventProposals.clubId,
          title: eventProposals.title,
          description: eventProposals.description,
          expectedAttendance: eventProposals.expectedAttendance,
          venueId: eventProposals.venueId,
          startAt: eventProposals.startAt,
          endAt: eventProposals.endAt,
          status: eventProposals.status,
          decidedAt: eventProposals.decidedAt,
          decisionNote: eventProposals.decisionNote,
          createdAt: eventProposals.createdAt,
        })
        .from(eventProposals)
        .where(queryConditions)
        .orderBy(desc(eventProposals.createdAt));

      return reply.status(200).send({ items: proposals });
    }
  );

  // 6. Authenticated Faculty Decision
  server.post(
    '/faculty/proposals/:id/decision',
    { preHandler: [requireAuth, requireFaculty] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        status: ProposalStatus.APPROVED | ProposalStatus.REJECTED;
        decisionNotes?: string;
      };

      if (body.status !== ProposalStatus.APPROVED && body.status !== ProposalStatus.REJECTED) {
        throw new AppError('VALIDATION_FAILED', 'Status must be APPROVED or REJECTED.', 400);
      }

      const [proposal] = await db
        .select()
        .from(eventProposals)
        .where(eq(eventProposals.id, id))
        .limit(1);

      if (!proposal) {
        throw new AppError('NOT_FOUND', `Proposal '${id}' not found.`, 404);
      }

      if (proposal.status !== ProposalStatus.PENDING) {
        throw new AppError(
          'CONFLICT',
          `Proposal has already been decided (${proposal.status}).`,
          409
        );
      }

      // Generate action token and invoke common logic
      const tokenData = await signApprovalToken({
        proposalId: proposal.id,
        facultyId: request.user!.id,
        action: body.status,
      });

      // Forward to decision processor
      const response = await server.inject({
        method: 'POST',
        url: '/public/faculty/decision',
        payload: { token: tokenData.token },
      });

      return reply.status(response.statusCode).send(JSON.parse(response.body));
    }
  );
}
