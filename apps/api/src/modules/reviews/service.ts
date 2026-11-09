import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { clubs, events, registrations, reviewReports, reviews, tickets, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';

export interface SubmitReviewParams {
  userId: string;
  eventId: string;
  stars: number;
  comment?: string | null;
  clubStars?: number | null;
  clubComment?: string | null;
  showName?: boolean;
}

export async function submitOrUpdateReview(params: SubmitReviewParams) {
  const { userId, eventId, stars, showName = false } = params;

  if (stars < 1 || stars > 5) {
    throw new AppError('VALIDATION_FAILED', 'Event stars rating must be between 1 and 5.', 400);
  }

  let cleanComment: string | null = null;
  if (params.comment !== undefined && params.comment !== null) {
    const trimmed = params.comment.trim();
    if (params.comment.length > 0 && trimmed.length === 0) {
      throw new AppError('VALIDATION_FAILED', 'Comment cannot be whitespace only.', 400);
    }
    if (trimmed.length > 1000) {
      throw new AppError('VALIDATION_FAILED', 'Comment must not exceed 1000 characters.', 400);
    }
    cleanComment = trimmed || null;
  }

  let cleanClubStars: number | null = null;
  if (params.clubStars !== undefined && params.clubStars !== null) {
    if (params.clubStars < 1 || params.clubStars > 5) {
      throw new AppError('VALIDATION_FAILED', 'Club stars rating must be between 1 and 5.', 400);
    }
    cleanClubStars = params.clubStars;
  }

  let cleanClubComment: string | null = null;
  if (params.clubComment !== undefined && params.clubComment !== null) {
    const trimmed = params.clubComment.trim();
    if (params.clubComment.length > 0 && trimmed.length === 0) {
      throw new AppError('VALIDATION_FAILED', 'Club comment cannot be whitespace only.', 400);
    }
    if (trimmed.length > 1000) {
      throw new AppError('VALIDATION_FAILED', 'Club comment must not exceed 1000 characters.', 400);
    }
    cleanClubComment = trimmed || null;
  }

  // 1. Verify event exists and has ended
  const [event] = await db
    .select({
      id: events.id,
      endAt: events.endAt,
      title: events.title,
      status: events.status,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
  }

  const now = new Date();
  const isConcluded = event.endAt <= now || event.status === 'COMPLETED';
  if (!isConcluded) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Event must have concluded before submitting a verified review.',
      400
    );
  }

  // 2. Verify user was CHECKED_IN
  const [ticket] = await db
    .select({
      id: tickets.id,
      checkedInAt: tickets.checkedInAt,
      status: tickets.status,
    })
    .from(tickets)
    .innerJoin(registrations, eq(tickets.registrationId, registrations.id))
    .where(
      and(
        eq(registrations.eventId, eventId),
        eq(registrations.userId, userId)
      )
    )
    .limit(1);

  if (!ticket || !ticket.checkedInAt) {
    throw new AppError(
      'NOT_CHECKED_IN',
      'Only verified attendees who checked into the event can submit a review.',
      403
    );
  }

  // 3. Check for existing review
  const [existingReview] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.eventId, eventId), eq(reviews.userId, userId)))
    .limit(1);

  if (existingReview) {
    // Check 7 days update window
    const diffMs = now.getTime() - new Date(existingReview.createdAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (diffMs > sevenDaysMs) {
      throw new AppError(
        'CONFLICT',
        'Reviews can only be edited within 7 days of initial posting.',
        409
      );
    }

    const [updated] = await db
      .update(reviews)
      .set({
        stars,
        comment: cleanComment,
        clubStars: cleanClubStars,
        clubComment: cleanClubComment,
        showName: Boolean(showName),
      })
      .where(eq(reviews.id, existingReview.id))
      .returning();

    return { review: updated, updated: true };
  }

  // 4. Create fresh verified review
  const [created] = await db
    .insert(reviews)
    .values({
      eventId,
      userId,
      stars,
      comment: cleanComment,
      clubStars: cleanClubStars,
      clubComment: cleanClubComment,
      showName: Boolean(showName),
      verified: true,
    })
    .returning();

  return { review: created, updated: false };
}

export async function deleteOwnReview(userId: string, eventId: string) {
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.eventId, eventId), eq(reviews.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new AppError('NOT_FOUND', 'You have not submitted a review for this event.', 404);
  }

  await db.delete(reviews).where(eq(reviews.id, existing.id));
  return { success: true };
}

export async function getEventReviewsBySlug(slug: string, cursor?: string, limitNum: number = 20) {
  const limit = Math.min(Math.max(limitNum, 1), 100);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

  const [event] = await db
    .select({ id: events.id, title: events.title, slug: events.slug })
    .from(events)
    .where(isUuid ? eq(events.id, slug) : eq(events.slug, slug))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event with slug '${slug}' not found.`, 404);
  }

  // 1. Aggregate statistics across all non-hidden reviews
  const [stats] = await db
    .select({
      count: sql<number>`count(${reviews.id})::int`,
      avgRating: sql<number>`round(avg(${reviews.stars})::numeric, 1)::float`,
      s1: sql<number>`count(${reviews.id}) filter (where ${reviews.stars} = 1)::int`,
      s2: sql<number>`count(${reviews.id}) filter (where ${reviews.stars} = 2)::int`,
      s3: sql<number>`count(${reviews.id}) filter (where ${reviews.stars} = 3)::int`,
      s4: sql<number>`count(${reviews.id}) filter (where ${reviews.stars} = 4)::int`,
      s5: sql<number>`count(${reviews.id}) filter (where ${reviews.stars} = 5)::int`,
    })
    .from(reviews)
    .where(and(eq(reviews.eventId, event.id), isNull(reviews.hiddenAt)));

  const count = stats?.count ?? 0;
  const average = count > 0 && stats?.avgRating ? Number(stats.avgRating) : 0;
  const histogram: Record<number, number> = {
    1: stats?.s1 ?? 0,
    2: stats?.s2 ?? 0,
    3: stats?.s3 ?? 0,
    4: stats?.s4 ?? 0,
    5: stats?.s5 ?? 0,
  };

  // 2. Paginated review rows
  const conditions = [eq(reviews.eventId, event.id), isNull(reviews.hiddenAt)];

  if (cursor) {
    const [cursorTime, cursorId] = cursor.split('_');
    if (cursorTime && cursorId) {
      const cursorDate = new Date(cursorTime);
      if (!isNaN(cursorDate.getTime())) {
        conditions.push(
          sql`(${reviews.createdAt}, ${reviews.id}) < (${cursorDate}, ${cursorId}::uuid)`
        );
      }
    }
  }

  const reviewRows = await db
    .select({
      id: reviews.id,
      stars: reviews.stars,
      comment: reviews.comment,
      clubStars: reviews.clubStars,
      clubComment: reviews.clubComment,
      showName: reviews.showName,
      verified: reviews.verified,
      createdAt: reviews.createdAt,
      userFullName: users.fullName,
      userDepartment: users.department,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(limit + 1);

  const hasMore = reviewRows.length > limit;
  const items = hasMore ? reviewRows.slice(0, limit) : reviewRows;

  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? `${lastItem.createdAt.toISOString()}_${lastItem.id}`
      : null;

  const formattedReviews = items.map((r) => ({
    id: r.id,
    stars: r.stars,
    comment: r.comment,
    clubStars: r.clubStars,
    clubComment: r.clubComment,
    verified: r.verified,
    authorName: r.showName ? r.userFullName : 'Anonymous Attendee',
    department: r.showName ? r.userDepartment : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    eventId: event.id,
    eventTitle: event.title,
    average,
    count,
    histogram,
    reviews: formattedReviews,
    nextCursor,
  };
}

export async function getClubReviewsBySlug(clubSlug: string, cursor?: string, limitNum: number = 20) {
  const limit = Math.min(Math.max(limitNum, 1), 100);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubSlug);

  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(isUuid ? eq(clubs.id, clubSlug) : eq(clubs.slug, clubSlug))
    .limit(1);

  if (!club) {
    throw new AppError('NOT_FOUND', `Club with slug '${clubSlug}' not found.`, 404);
  }

  // 1. Club statistics: aggregate club_stars across all events of this club
  const [stats] = await db
    .select({
      count: sql<number>`count(${reviews.id})::int`,
      avgRating: sql<number>`round(avg(${reviews.clubStars})::numeric, 1)::float`,
      s1: sql<number>`count(${reviews.id}) filter (where ${reviews.clubStars} = 1)::int`,
      s2: sql<number>`count(${reviews.id}) filter (where ${reviews.clubStars} = 2)::int`,
      s3: sql<number>`count(${reviews.id}) filter (where ${reviews.clubStars} = 3)::int`,
      s4: sql<number>`count(${reviews.id}) filter (where ${reviews.clubStars} = 4)::int`,
      s5: sql<number>`count(${reviews.id}) filter (where ${reviews.clubStars} = 5)::int`,
    })
    .from(reviews)
    .innerJoin(events, eq(reviews.eventId, events.id))
    .where(
      and(
        eq(events.clubId, club.id),
        sql`${reviews.clubStars} IS NOT NULL`,
        isNull(reviews.hiddenAt)
      )
    );

  const count = stats?.count ?? 0;
  const clubAverage = count > 0 && stats?.avgRating ? Number(stats.avgRating) : 0;
  const histogram: Record<number, number> = {
    1: stats?.s1 ?? 0,
    2: stats?.s2 ?? 0,
    3: stats?.s3 ?? 0,
    4: stats?.s4 ?? 0,
    5: stats?.s5 ?? 0,
  };

  // 2. Paginated review rows for the club
  const conditions = [
    eq(events.clubId, club.id),
    sql`${reviews.clubStars} IS NOT NULL`,
    isNull(reviews.hiddenAt),
  ];

  if (cursor) {
    const [cursorTime, cursorId] = cursor.split('_');
    if (cursorTime && cursorId) {
      const cursorDate = new Date(cursorTime);
      if (!isNaN(cursorDate.getTime())) {
        conditions.push(
          sql`(${reviews.createdAt}, ${reviews.id}) < (${cursorDate}, ${cursorId}::uuid)`
        );
      }
    }
  }

  const reviewRows = await db
    .select({
      id: reviews.id,
      eventId: events.id,
      eventTitle: events.title,
      eventSlug: events.slug,
      stars: reviews.stars,
      comment: reviews.comment,
      clubStars: reviews.clubStars,
      clubComment: reviews.clubComment,
      showName: reviews.showName,
      verified: reviews.verified,
      createdAt: reviews.createdAt,
      userFullName: users.fullName,
      userDepartment: users.department,
    })
    .from(reviews)
    .innerJoin(events, eq(reviews.eventId, events.id))
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(limit + 1);

  const hasMore = reviewRows.length > limit;
  const items = hasMore ? reviewRows.slice(0, limit) : reviewRows;

  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? `${lastItem.createdAt.toISOString()}_${lastItem.id}`
      : null;

  const formattedReviews = items.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    eventTitle: r.eventTitle,
    eventSlug: r.eventSlug,
    stars: r.stars,
    comment: r.comment,
    clubStars: r.clubStars,
    clubComment: r.clubComment,
    verified: r.verified,
    authorName: r.showName ? r.userFullName : 'Anonymous Attendee',
    department: r.showName ? r.userDepartment : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    clubId: club.id,
    clubName: club.name,
    clubAverage,
    count,
    histogram,
    reviews: formattedReviews,
    nextCursor,
  };
}

export async function reportReview(userId: string, reviewId: string, reason: string) {
  const [review] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  if (!review) {
    throw new AppError('NOT_FOUND', 'Review not found.', 404);
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3 || trimmedReason.length > 500) {
    throw new AppError('VALIDATION_FAILED', 'Reason must be between 3 and 500 characters.', 400);
  }

  try {
    await db.insert(reviewReports).values({
      reviewId,
      reporterUserId: userId,
      reason: trimmedReason,
    });
  } catch (err: any) {
    // Unique constraint violation: already reported by this user
    if (err?.code === '23505') {
      return { success: true, message: 'You have already reported this review.' };
    }
    throw err;
  }

  return { success: true, message: 'Review reported for moderation.' };
}

export async function getReportedReviewsForAdmin(limitNum: number = 50) {
  const limit = Math.min(Math.max(limitNum, 1), 100);

  const rows = await db
    .select({
      reportId: reviewReports.id,
      reviewId: reviews.id,
      eventId: reviews.eventId,
      eventTitle: events.title,
      stars: reviews.stars,
      comment: reviews.comment,
      clubStars: reviews.clubStars,
      clubComment: reviews.clubComment,
      hiddenAt: reviews.hiddenAt,
      authorId: users.id,
      authorName: users.fullName,
      reason: reviewReports.reason,
      reportedAt: reviewReports.createdAt,
    })
    .from(reviewReports)
    .innerJoin(reviews, eq(reviewReports.reviewId, reviews.id))
    .innerJoin(events, eq(reviews.eventId, events.id))
    .innerJoin(users, eq(reviews.userId, users.id))
    .orderBy(desc(reviewReports.createdAt))
    .limit(limit);

  return { reports: rows };
}

export async function hideOrUnhideReview(adminUserId: string, reviewId: string, hidden: boolean) {
  const [review] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  if (!review) {
    throw new AppError('NOT_FOUND', 'Review not found.', 404);
  }

  const [updated] = await db
    .update(reviews)
    .set({
      hiddenAt: hidden ? new Date() : null,
      hiddenBy: hidden ? adminUserId : null,
    })
    .where(eq(reviews.id, reviewId))
    .returning();

  if (!updated) {
    throw new AppError('NOT_FOUND', 'Review not found.', 404);
  }

  return {
    success: true,
    hidden: Boolean(updated.hiddenAt),
    reviewId: updated.id,
  };
}
