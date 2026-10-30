import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../plugins/auth';
import {
  addExpense,
  createAllocation,
  exportBudgetCsv,
  getClubBudget,
  signOffExpense,
} from './service';

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  // 1. Create budget allocation for a club (auth required)
  app.post(
    '/clubs/:clubId/allocations',
    {
      preHandler: [requireAuth],
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
      preHandler: [requireAuth],
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
      preHandler: [requireAuth],
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
      preHandler: [requireAuth],
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
}
