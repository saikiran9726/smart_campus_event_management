import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { events, registrations, reviews, tickets, users } from '../../db/schema';
import { AppError } from '../../lib/app-error';

export interface SubmitReviewParams {
  userId: string;
  eventId: string;
  stars: number;
  comment: string;
  showName?: boolean;
}

export async function submitOrUpdateReview(params: SubmitReviewParams) {
  const { userId, eventId, stars, comment, showName = false } = params;

  if (stars < 1 || stars > 5) {
    throw new AppError('VALIDATION_FAILED', 'Stars rating must be between 1 and 5.', 400);
  }

  if (comment.length > 1000) {
    throw new AppError('VALIDATION_FAILED', 'Comment must not exceed 1000 characters.', 400);
  }

  // 1. Verify event exists and has ended
  const [event] = await db
    .select({
      id: events.id,
      endAt: events.endAt,
      title: events.title,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
  }

  const now = new Date();
  if (event.endAt > now) {
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
    // Check 7 days update window: 7 * 24 * 60 * 60 * 1000 ms
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
        comment,
        showName,
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
      comment,
      showName,
      verified: true,
    })
    .returning();

  return { review: created, updated: false };
}

export async function getEventReviewsBySlug(slug: string) {
  // 1. Find event
  const [event] = await db
    .select({ id: events.id, title: events.title, slug: events.slug })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event with slug '${slug}' not found.`, 404);
  }

  // 2. Fetch all reviews joined with user info
  const reviewRows = await db
    .select({
      id: reviews.id,
      stars: reviews.stars,
      comment: reviews.comment,
      showName: reviews.showName,
      verified: reviews.verified,
      createdAt: reviews.createdAt,
      userFullName: users.fullName,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(eq(reviews.eventId, event.id))
    .orderBy(desc(reviews.createdAt));

  const count = reviewRows.length;
  const histogram: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sumStars = 0;

  const comments = reviewRows.map((r) => {
    histogram[r.stars] = (histogram[r.stars] || 0) + 1;
    sumStars += r.stars;

    return {
      id: r.id,
      stars: r.stars,
      comment: r.comment,
      verified: r.verified,
      authorName: r.showName ? r.userFullName : 'Anonymous Attendee',
      createdAt: r.createdAt.toISOString(),
    };
  });

  const average = count > 0 ? Number((sumStars / count).toFixed(1)) : 0;

  return {
    eventId: event.id,
    eventTitle: event.title,
    average,
    count,
    histogram,
    reviews: comments,
  };
}
