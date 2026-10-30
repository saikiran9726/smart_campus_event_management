import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { budgetAllocations, clubs, expenseItems, users } from '../../db/schema';
import { env } from '../../env';
import { AppError } from '../../lib/app-error';
import { headObject } from '../../lib/r2';

export interface CreateAllocationParams {
  clubId: string;
  title?: string;
  category: string;
  allocatedPaise: number;
  eventId?: string;
  note?: string;
}

export async function createAllocation(params: CreateAllocationParams) {
  if (params.allocatedPaise <= 0) {
    throw new AppError('VALIDATION_FAILED', 'Allocated amount must be greater than zero paise.', 400);
  }

  // Ensure club exists
  const [club] = await db
    .select({ id: clubs.id })
    .from(clubs)
    .where(eq(clubs.id, params.clubId))
    .limit(1);

  if (!club) {
    throw new AppError('NOT_FOUND', `Club '${params.clubId}' not found.`, 404);
  }

  const [allocation] = await db
    .insert(budgetAllocations)
    .values({
      clubId: params.clubId,
      title: params.title || `${params.category} Budget`,
      category: params.category.toUpperCase(),
      allocatedPaise: params.allocatedPaise,
      spentPaise: 0,
      eventId: params.eventId || null,
      note: params.note || null,
    })
    .returning();

  return allocation;
}

export async function getClubBudget(clubId: string) {
  const [club] = await db
    .select({ id: clubs.id, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);

  if (!club) {
    throw new AppError('NOT_FOUND', `Club '${clubId}' not found.`, 404);
  }

  const allocations = await db
    .select()
    .from(budgetAllocations)
    .where(eq(budgetAllocations.clubId, clubId));

  let totalAllocatedPaise = 0;
  let totalSpentPaise = 0;

  const categories: Record<
    string,
    { allocatedPaise: number; spentPaise: number; remainingPaise: number }
  > = {};

  for (const alloc of allocations) {
    totalAllocatedPaise += alloc.allocatedPaise;
    totalSpentPaise += alloc.spentPaise;

    const cat = alloc.category;
    if (!categories[cat]) {
      categories[cat] = { allocatedPaise: 0, spentPaise: 0, remainingPaise: 0 };
    }
    categories[cat].allocatedPaise += alloc.allocatedPaise;
    categories[cat].spentPaise += alloc.spentPaise;
    categories[cat].remainingPaise =
      categories[cat].allocatedPaise - categories[cat].spentPaise;
  }

  const totalRemainingPaise = totalAllocatedPaise - totalSpentPaise;

  return {
    clubId,
    clubName: club.name,
    totalAllocatedPaise,
    totalSpentPaise,
    totalRemainingPaise,
    categories,
    allocations,
  };
}

export interface AddExpenseParams {
  allocationId: string;
  category: string;
  description: string;
  amountPaise: number;
  receiptKey: string;
}

export async function addExpense(params: AddExpenseParams) {
  const { allocationId, category, description, amountPaise, receiptKey } = params;

  if (amountPaise <= 0) {
    throw new AppError('VALIDATION_FAILED', 'Expense amount must be a positive integer in paise.', 400);
  }

  if (!receiptKey) {
    throw new AppError('VALIDATION_FAILED', 'Receipt key is required.', 400);
  }

  // 1. Verify receipt exists in R2 (skipped in test mode if non-existent)
  if (env.NODE_ENV !== 'test') {
    try {
      const head = await headObject(receiptKey);
      if (!head) {
        throw new AppError('VALIDATION_FAILED', 'Receipt object not found in storage.', 400);
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError('VALIDATION_FAILED', `Receipt verification failed: ${err.message}`, 400);
    }
  }

  // 2. Verify allocation exists
  const [allocation] = await db
    .select()
    .from(budgetAllocations)
    .where(eq(budgetAllocations.id, allocationId))
    .limit(1);

  if (!allocation) {
    throw new AppError('NOT_FOUND', `Budget allocation '${allocationId}' not found.`, 404);
  }

  // 3. Atomic budget deduction and overspend prevention
  // UPDATE budget_allocations SET spent_paise = spent_paise + $1 WHERE id=$2 AND spent_paise + $1 <= allocated_paise RETURNING *
  const [updatedAllocation] = await db
    .update(budgetAllocations)
    .set({
      spentPaise: sql`${budgetAllocations.spentPaise} + ${amountPaise}`,
    })
    .where(
      and(
        eq(budgetAllocations.id, allocationId),
        sql`${budgetAllocations.spentPaise} + ${amountPaise} <= ${budgetAllocations.allocatedPaise}`
      )
    )
    .returning();

  if (!updatedAllocation) {
    throw new AppError(
      'OVER_BUDGET',
      `Expense of ${amountPaise} paise exceeds available budget of ${allocation.allocatedPaise - allocation.spentPaise} paise.`,
      422
    );
  }

  // 4. Record expense item
  const [expense] = await db
    .insert(expenseItems)
    .values({
      allocationId,
      category,
      description,
      amountPaise,
      receiptKey,
    })
    .returning();

  return {
    expense,
    allocation: updatedAllocation,
  };
}

export async function signOffExpense(expenseId: string, userId: string, userRole?: string) {
  // 1. Load expense with its allocation and club
  const [expense] = await db
    .select({
      id: expenseItems.id,
      allocationId: expenseItems.allocationId,
      amountPaise: expenseItems.amountPaise,
      signedOffBy: expenseItems.signedOffBy,
      signedOffAt: expenseItems.signedOffAt,
      clubId: budgetAllocations.clubId,
    })
    .from(expenseItems)
    .innerJoin(budgetAllocations, eq(expenseItems.allocationId, budgetAllocations.id))
    .where(eq(expenseItems.id, expenseId))
    .limit(1);

  if (!expense) {
    throw new AppError('NOT_FOUND', `Expense '${expenseId}' not found.`, 404);
  }

  // Immutability check: if already signed off, reject any edits or re-sign
  if (expense.signedOffAt) {
    throw new AppError('CONFLICT', 'Expense has already been signed off and is immutable.', 409);
  }

  // 2. Verify faculty permissions
  const [club] = await db
    .select({
      id: clubs.id,
      facultyCoordinatorId: clubs.facultyCoordinatorId,
    })
    .from(clubs)
    .where(eq(clubs.id, expense.clubId))
    .limit(1);

  const isClubFaculty = club?.facultyCoordinatorId === userId;
  const isSuperOrCampusAdmin = userRole === 'ADMIN';

  if (!isClubFaculty && !isSuperOrCampusAdmin) {
    throw new AppError(
      'FORBIDDEN',
      'Only the assigned faculty coordinator of this club can sign off on expenses.',
      403
    );
  }

  const now = new Date();
  const [signed] = await db
    .update(expenseItems)
    .set({
      signedOffBy: userId,
      signedOffAt: now,
    })
    .where(
      and(
        eq(expenseItems.id, expenseId),
        sql`${expenseItems.signedOffAt} IS NULL`
      )
    )
    .returning();

  if (!signed) {
    throw new AppError('CONFLICT', 'Expense could not be signed off or is already locked.', 409);
  }

  return signed;
}

export async function exportBudgetCsv(clubId: string): Promise<string> {
  const [club] = await db
    .select({ id: clubs.id, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);

  if (!club) {
    throw new AppError('NOT_FOUND', `Club '${clubId}' not found.`, 404);
  }

  const allocations = await db
    .select()
    .from(budgetAllocations)
    .where(eq(budgetAllocations.clubId, clubId));

  const headers = [
    'Allocation ID',
    'Allocation Title',
    'Category',
    'Allocated (INR)',
    'Spent (INR)',
    'Remaining (INR)',
    'Expense ID',
    'Expense Category',
    'Description',
    'Expense Amount (INR)',
    'Receipt Key',
    'Signed Off By',
    'Signed Off At',
    'Created At',
  ];

  const lines: string[] = [headers.join(',')];

  for (const alloc of allocations) {
    const expenses = await db
      .select({
        id: expenseItems.id,
        category: expenseItems.category,
        description: expenseItems.description,
        amountPaise: expenseItems.amountPaise,
        receiptKey: expenseItems.receiptKey,
        signedOffBy: users.fullName,
        signedOffAt: expenseItems.signedOffAt,
        createdAt: expenseItems.createdAt,
      })
      .from(expenseItems)
      .leftJoin(users, eq(expenseItems.signedOffBy, users.id))
      .where(eq(expenseItems.allocationId, alloc.id));

    const allocInr = (alloc.allocatedPaise / 100).toFixed(2);
    const spentInr = (alloc.spentPaise / 100).toFixed(2);
    const remainingInr = ((alloc.allocatedPaise - alloc.spentPaise) / 100).toFixed(2);

    if (expenses.length === 0) {
      lines.push(
        [
          alloc.id,
          `"${alloc.title.replace(/"/g, '""')}"`,
          alloc.category,
          allocInr,
          spentInr,
          remainingInr,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          alloc.createdAt.toISOString(),
        ].join(',')
      );
    } else {
      for (const exp of expenses) {
        const expInr = (exp.amountPaise / 100).toFixed(2);
        lines.push(
          [
            alloc.id,
            `"${alloc.title.replace(/"/g, '""')}"`,
            alloc.category,
            allocInr,
            spentInr,
            remainingInr,
            exp.id,
            exp.category,
            `"${exp.description.replace(/"/g, '""')}"`,
            expInr,
            exp.receiptKey,
            exp.signedOffBy ? `"${exp.signedOffBy.replace(/"/g, '""')}"` : '',
            exp.signedOffAt ? exp.signedOffAt.toISOString() : '',
            exp.createdAt.toISOString(),
          ].join(',')
        );
      }
    }
  }

  return lines.join('\n');
}
