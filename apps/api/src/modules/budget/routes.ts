import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ClubMemberRole, UserRole } from '@eventora/shared';
import { db } from '../../db/client';
import { budgetAllocations, clubMembers, expenseItems } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { requireFaculty } from '../../middleware/rbac';
import { requireAuth } from '../../plugins/auth';
import {
  addExpense,
  createAllocation,
  exportBudgetCsv,
  getClubBudget,
  signOffExpense,
} from './service';

async function requireClubBudgetAccess(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new AppError('UNAUTHENTICATED', 'Authentication required.', 401);
  }
  if (request.user.role === UserRole.ADMIN || request.user.role === UserRole.FACULTY) {
    return;
  }
  const params = request.params as Record<string, string | undefined>;
  const clubId = params.clubId;
  if (!clubId) {
    throw new AppError('VALIDATION_FAILED', 'Missing clubId parameter', 400);
  }
  const [membership] = await db
    .select({ role: clubMembers.role })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, request.user.id)))
    .limit(1);

  if (!membership || (membership.role !== ClubMemberRole.OWNER && membership.role !== ClubMemberRole.ADMIN)) {
    throw new AppError('FORBIDDEN', 'Insufficient permissions to access club budget.', 403);
  }
}

async function requireAllocationExpenseAccess(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new AppError('UNAUTHENTICATED', 'Authentication required.', 401);
  }
  if (request.user.role === UserRole.ADMIN || request.user.role === UserRole.FACULTY) {
    return;
  }
  const params = request.params as Record<string, string | undefined>;
  const allocationId = params.id;
  if (!allocationId) {
    throw new AppError('VALIDATION_FAILED', 'Missing allocation id parameter', 400);
  }
  const [allocation] = await db
    .select({ clubId: budgetAllocations.clubId })
    .from(budgetAllocations)
    .where(eq(budgetAllocations.id, allocationId))
    .limit(1);

  if (!allocation) {
    throw new AppError('NOT_FOUND', `Budget allocation '${allocationId}' not found.`, 404);
  }

  const [membership] = await db
    .select({ role: clubMembers.role })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, allocation.clubId), eq(clubMembers.userId, request.user.id)))
    .limit(1);

  if (!membership || (membership.role !== ClubMemberRole.OWNER && membership.role !== ClubMemberRole.ADMIN)) {
    throw new AppError('FORBIDDEN', 'Insufficient permissions to submit expenses for this club.', 403);
  }
}

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  // 1. Create budget allocation for a club (auth required)
  app.post(
    '/clubs/:clubId/allocations',
    {
      preHandler: [requireAuth, requireClubBudgetAccess],
      schema: {
        params: z.object({
          clubId: z.string().uuid(),
        }),
        body: z.object({
          title: z.string().optional(),
          category: z.string().min(1),
          allocatedPaise: z.number().int().positive(),
          eventId: z.string().uuid().optional(),
          note: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const body = request.body as {
        title?: string;
        category: string;
        allocatedPaise: number;
        eventId?: string;
        note?: string;
      };

      const allocation = await createAllocation({
        clubId,
        ...body,
      });

      return reply.code(201).send({ allocation });
    }
  );

  // 2. Get club budget overview and breakdown by category
  app.get(
    '/clubs/:clubId/budget',
    {
      preHandler: [requireAuth, requireClubBudgetAccess],
      schema: {
        params: z.object({
          clubId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const budgetData = await getClubBudget(clubId);
      return reply.code(200).send(budgetData);
    }
  );

  // 3. Add expense against an allocation (atomic budget overspend check)
  app.post(
    '/allocations/:id/expenses',
    {
      preHandler: [requireAuth, requireAllocationExpenseAccess],
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          amountPaise: z.number().int().positive(),
          category: z.string().min(1),
          description: z.string().min(1),
          receiptKey: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        amountPaise: number;
        category: string;
        description: string;
        receiptKey: string;
      };

      const result = await addExpense({
        allocationId: id,
        ...body,
      });

      return reply.code(201).send(result);
    }
  );

  // 4. Faculty sign-off on an expense (immutable once stamped)
  app.post(
    '/expenses/:id/sign-off',
    {
      preHandler: [requireAuth],
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.id;
      const userRole = request.user?.role;

      const signed = await signOffExpense(id, userId, userRole);
      return reply.code(200).send({ expense: signed });
    }
  );

  // 5. Export club budget ledger as CSV
  app.get(
    '/clubs/:clubId/budget/export.csv',
    {
      preHandler: [requireAuth, requireClubBudgetAccess],
      schema: {
        params: z.object({
          clubId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const csv = await exportBudgetCsv(clubId);

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="club-${clubId}-budget.csv"`);
      return reply.send(csv);
    }
  );

  // 6. Get pending expenses for faculty sign-off
  app.get(
    '/faculty/pending-expenses',
    { preHandler: [requireAuth, requireFaculty] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const pendingExpenses = await db
        .select({
          id: expenseItems.id,
          category: expenseItems.category,
          description: expenseItems.description,
          amountPaise: expenseItems.amountPaise,
          receiptKey: expenseItems.receiptKey,
          facultySignedAt: expenseItems.signedOffAt,
          createdAt: expenseItems.createdAt,
        })
        .from(expenseItems)
        .where(isNull(expenseItems.signedOffBy))
        .orderBy(desc(expenseItems.createdAt));

      return reply.code(200).send({
        items: pendingExpenses || [],
      });
    }
  );
}
