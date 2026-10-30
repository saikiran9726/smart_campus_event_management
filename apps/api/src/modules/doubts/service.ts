import { and, eq, sql } from 'drizzle-orm';
import { ChannelKind } from '@eventora/shared';
import { db } from '../../db/client';
import { clubChannels, events, messages } from '../../db/schema';
import { AppError } from '../../lib/app-error';
import { ensureEventDoubtRoom } from '../channels/event-feed';
import { checkChannelPostAccess, checkChannelReadAccess } from '../channels/service';

export async function getEventDoubtRoom(eventId: string, userId: string) {
  // 1. Verify event exists
  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      status: events.status,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError('NOT_FOUND', `Event '${eventId}' not found.`, 404);
  }

  // 2. Ensure channel exists
  const channelId = await ensureEventDoubtRoom(eventId);

  // 3. Verify user has read access
  const hasAccess = await checkChannelReadAccess(channelId, userId);
  if (!hasAccess) {
    throw new AppError(
      'FORBIDDEN',
      'Non-registrant blocked from reading doubt room. Registration or organizer status required.',
      403
    );
  }

  // 4. Compute user's post role badge
  const postAccess = await checkChannelPostAccess(channelId, userId);

  // 5. Query channel details and total message count
  const [channel] = await db
    .select({
      id: clubChannels.id,
      eventId: clubChannels.eventId,
      kind: clubChannels.kind,
      name: clubChannels.name,
      slug: clubChannels.slug,
    })
    .from(clubChannels)
    .where(eq(clubChannels.id, channelId))
    .limit(1);

  const [countResult] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(and(eq(messages.channelId, channelId), sql`${messages.deletedAt} IS NULL`));

  return {
    channel,
    userRoleBadge: postAccess.roleBadge,
    stats: {
      messageCount: countResult?.count || 0,
    },
  };
}
